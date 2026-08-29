import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStorageProvider } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createSplitStorageProvider } from '../src/split-storage.js';

/**
 * The bug this pins: DATA_DIR is tmpfs, so a container restart wipes it. The
 * payments-v2 open-intent backstop lived there, and a reward send that returns
 * CERTIFICATION_UNCONFIRMED is reported as SENT (deliberately — a retry would
 * double-pay) and only completed later by resumeNow() reading that backstop.
 * Wipe it and the reward is stranded silently, forever.
 *
 * These tests simulate the restart directly: write an intent, delete the tmpfs
 * directory, rebuild the provider over the same paths, and check what survived.
 */

const PUB = '02aa'.padEnd(66, 'b');
const INTENT_KEY = `pv2g2:testnet2:${PUB}:intents`;
const CURSOR_KEY = `pv2g2:testnet2:${PUB}:cursor:inbox`;
const OPEN_INTENT = JSON.stringify({ transferId: 'tx-abc', state: 'open', amount: '5' });

let fastDir: string;
let durableDir: string;

beforeEach(async () => {
  fastDir = await mkdtemp(join(tmpdir(), 'restart-fast-'));
  durableDir = await mkdtemp(join(tmpdir(), 'restart-durable-'));
});

afterEach(async () => {
  await rm(fastDir, { recursive: true, force: true });
  await rm(durableDir, { recursive: true, force: true });
});

/** Simulate the tmpfs mount going away and coming back empty. */
async function wipeTmpfs(): Promise<void> {
  await rm(fastDir, { recursive: true, force: true });
  await mkdir(fastDir, { recursive: true });
}

describe('restart durability', () => {
  it('CONTROL: a single tmpfs-backed store loses the open intent — the original bug', async () => {
    const before = createFileStorageProvider({ dataDir: fastDir, network: 'testnet2' });
    await before.connect();
    await before.set(INTENT_KEY, OPEN_INTENT);
    assert.equal(await before.get(INTENT_KEY), OPEN_INTENT, 'precondition: intent was written');

    await wipeTmpfs();

    const after = createFileStorageProvider({ dataDir: fastDir, network: 'testnet2' });
    await after.connect();

    // This is exactly the silent reward loss: resumeNow() finds nothing to
    // resume, and the game is still in paidGameIds so nothing retries.
    assert.equal(
      await after.get(INTENT_KEY),
      null,
      'demonstrates the bug: the intent is gone after a restart',
    );
  });

  it('the split store keeps the open intent across a restart', async () => {
    const before = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await before.connect();
    await before.set(INTENT_KEY, OPEN_INTENT);

    await wipeTmpfs();

    const after = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await after.connect();

    assert.equal(
      await after.get(INTENT_KEY),
      OPEN_INTENT,
      'the open intent must survive so resumeNow() can finish the payout',
    );
  });

  it('still discards the hot cursor on restart, so the tmpfs win is intact', async () => {
    const before = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await before.connect();
    await before.set(CURSOR_KEY, 'event-12345');
    await before.set(INTENT_KEY, OPEN_INTENT);

    await wipeTmpfs();

    const after = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await after.connect();

    // The cursor is re-synced from the server, which is the source of truth —
    // it must NOT have been promoted to the durable tier, or we'd have moved
    // the write amplification the tmpfs mount exists to absorb.
    assert.equal(await after.get(CURSOR_KEY), null, 'cursor should stay on the fast tier');
    assert.equal(await after.get(INTENT_KEY), OPEN_INTENT, 'intent should still survive');
  });

  it('survives several restarts in a row', async () => {
    for (let i = 0; i < 3; i++) {
      const s = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
      await s.connect();
      if (i === 0) await s.set(INTENT_KEY, OPEN_INTENT);
      assert.equal(await s.get(INTENT_KEY), OPEN_INTENT, `intent lost on restart #${i}`);
      await wipeTmpfs();
    }
  });

  it('a completed intent stays removed after a restart (no zombie resurrection)', async () => {
    const before = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await before.connect();
    await before.set(INTENT_KEY, OPEN_INTENT);
    // resumeNow() completing the intent clears it.
    await before.remove(INTENT_KEY);

    await wipeTmpfs();

    const after = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await after.connect();

    assert.equal(
      await after.get(INTENT_KEY),
      null,
      'a settled intent must not come back and re-trigger a send',
    );
  });
});
