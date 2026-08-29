import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Sphere } from '@unicitylabs/sphere-sdk';
import { BotWallet } from '../src/wallet.js';

/**
 * Minimal stand-in for the bits of Sphere that BotWallet touches. Under
 * sphere-sdk >= 0.15 the balance read is `payments.assets()` — async and
 * network-backed — where it used to be the synchronous, infallible
 * `payments.getBalance()`. These tests pin the contract that a failing balance
 * read must not turn into a rejected sendReward().
 */
function fakeSphere(overrides: {
  assets?: () => Promise<unknown[]>;
  send?: () => Promise<{ id: string; status: string }>;
  mint?: () => Promise<{ success: boolean; error?: string }>;
}): Sphere {
  return {
    payments: {
      assets: overrides.assets ?? (async () => []),
      send: overrides.send ?? (async () => ({ id: 'tx1', status: 'ok' })),
      mint: overrides.mint ?? (async () => ({ success: true })),
    },
  } as unknown as Sphere;
}

function makeWallet(sphere: Sphere): BotWallet {
  return new BotWallet({
    sphere,
    nametag: 'chess-bot',
    coinSymbol: 'UCT',
    targetBalance: 100,
    minBalance: 10,
    tag: '[test-wallet]',
  });
}

describe('BotWallet.sendReward', () => {
  it('still sends when the pre-flight balance read fails', async () => {
    let sent = 0;
    const wallet = makeWallet(
      fakeSphere({
        assets: async () => {
          throw new Error('transport blip');
        },
        send: async () => {
          sent++;
          return { id: 'tx1', status: 'ok' };
        },
      }),
    );

    // Must resolve (not reject) and must not swallow the payout: an async
    // assets() failure previously propagated out of sendReward(), skipping the
    // caller's paidGameIds rollback and stranding the reward permanently.
    const result = await wallet.sendReward('@winner', 5, 'unichess reward g1');

    assert.equal(result.ok, true, 'sendReward should report success');
    assert.equal(sent, 1, 'send() must still be attempted after a failed balance read');
  });

  it('reports {ok:false} rather than throwing when the send itself fails', async () => {
    const wallet = makeWallet(
      fakeSphere({
        assets: async () => {
          throw new Error('transport blip');
        },
        send: async () => {
          throw new Error('aggregator down');
        },
      }),
    );

    const result = await wallet.sendReward('@winner', 5);

    assert.equal(result.ok, false, 'a failed send must be reported, not thrown');
    assert.match(result.error ?? '', /aggregator down/);
  });

  it('rejects an empty recipient without touching the network', async () => {
    let sent = 0;
    const wallet = makeWallet(
      fakeSphere({
        send: async () => {
          sent++;
          return { id: 'tx1', status: 'ok' };
        },
      }),
    );

    const result = await wallet.sendReward('', 5);

    assert.equal(result.ok, false);
    assert.equal(sent, 0);
  });
});
