import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSplitStorageProvider, isDurableKey } from '../src/split-storage.js';

const PUB = '02aa'.padEnd(66, 'b');
const key = (store: string) => `pv2g2:testnet2:${PUB}:${store}`;

describe('isDurableKey', () => {
  it('routes the money-critical payments-v2 stores to disk', () => {
    // Losing any of these strands a payout: open send intents, the delivery and
    // mint journals, split checkpoints and the double-spend guards.
    for (const store of [
      'intents',
      'delivery-journal',
      'mint-journal',
      'checkpoints',
      'shortfalls',
      'settling',
      'epoch-latch',
      'suspected-spent',
      'known-spends',
    ]) {
      assert.equal(isDurableKey(key(store)), true, `${store} must be durable`);
    }
  });

  it('leaves the hot stream cursor on the fast tier', () => {
    // Rewritten on every inbound event, and re-syncable from the server — this
    // is the write-amplification the tmpfs mount exists to absorb.
    assert.equal(isDurableKey(key('cursor:inbox')), false);
    assert.equal(isDurableKey(key('cursor:')), false);
  });

  it('leaves non-payments keys on the fast tier', () => {
    assert.equal(isDurableKey('wallet'), false);
    assert.equal(isDurableKey('last_dm_event_ts'), false);
    assert.equal(isDurableKey('handled-game-ids'), false);
  });

  it('routes the superseded pv2: prefix durably so the SDK sweep reaches it', () => {
    assert.equal(isDurableKey('pv2:testnet2:whatever'), true);
  });

  it('does not mistake a pv2g2 store whose name merely contains "cursor"', () => {
    assert.equal(isDurableKey(key('cursor-backlog')), true);
  });
});

describe('createSplitStorageProvider', () => {
  let fastDir: string;
  let durableDir: string;
  let storage: ReturnType<typeof createSplitStorageProvider>;

  before(async () => {
    fastDir = await mkdtemp(join(tmpdir(), 'chess-fast-'));
    durableDir = await mkdtemp(join(tmpdir(), 'chess-durable-'));
    storage = createSplitStorageProvider({ fastDir, durableDir, network: 'testnet2' });
    await storage.connect();
  });

  after(async () => {
    await rm(fastDir, { recursive: true, force: true });
    await rm(durableDir, { recursive: true, force: true });
  });

  it('persists an open intent to the durable dir, not the tmpfs one', async () => {
    await storage.set(key('intents'), JSON.stringify({ tx1: 'open' }));

    const durableFiles = await readdir(durableDir);
    assert.ok(durableFiles.length > 0, 'durable dir should have been written');

    const dumped = (
      await Promise.all(durableFiles.map((f) => readFile(join(durableDir, f), 'utf8')))
    ).join('');
    assert.match(dumped, /tx1/, 'the intent must land on the durable tier');

    const fastFiles = await readdir(fastDir);
    const fastDump = (
      await Promise.all(fastFiles.map((f) => readFile(join(fastDir, f), 'utf8')))
    ).join('');
    assert.doesNotMatch(fastDump, /tx1/, 'the intent must NOT be on the tmpfs tier');
  });

  it('reads back what it wrote, on both tiers', async () => {
    await storage.set(key('intents'), 'durable-value');
    await storage.set('last_dm_event_ts', 'fast-value');

    assert.equal(await storage.get(key('intents')), 'durable-value');
    assert.equal(await storage.get('last_dm_event_ts'), 'fast-value');
  });

  it('reports has()/remove() against the correct tier', async () => {
    await storage.set(key('delivery-journal'), 'j');
    assert.equal(await storage.has(key('delivery-journal')), true);

    await storage.remove(key('delivery-journal'));
    assert.equal(await storage.has(key('delivery-journal')), false);
  });

  it('fans keys() out across both tiers', async () => {
    await storage.set(key('intents'), 'a');
    await storage.set('last_dm_event_ts', 'b');

    const all = await storage.keys();
    assert.ok(
      all.some((k) => k.includes('intents')),
      'durable keys must appear',
    );
    assert.ok(
      all.some((k) => k.includes('last_dm_event_ts')),
      'fast keys must appear',
    );
  });

  it('fans clear() out across both tiers', async () => {
    await storage.set(key('intents'), 'a');
    await storage.set('last_dm_event_ts', 'b');

    await storage.clear();

    assert.equal(await storage.get(key('intents')), null);
    assert.equal(await storage.get('last_dm_event_ts'), null);
  });
});
