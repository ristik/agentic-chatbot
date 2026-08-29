import type { StorageProvider, FullIdentity, TrackedAddressEntry } from '@unicitylabs/sphere-sdk';
import { createFileStorageProvider } from '@unicitylabs/sphere-sdk/impl/nodejs';

/**
 * Key prefix under which sphere-sdk's payments-v2 engine keeps ALL of its
 * durable state (`modules/payments-v2/stores.ts`: `KV_PREFIX = 'pv2g2:'`).
 * Full shape: `pv2g2:<network>:<chainPubkey>:<storeKey>`.
 */
const PAYMENTS_V2_PREFIX = 'pv2g2:';

/**
 * Superseded payments-v2 prefix the SDK sweeps with `storage.clear('pv2:')` on
 * init. Routed durably too, so the sweep reaches the copy that actually has it.
 */
const PAYMENTS_V2_SUPERSEDED_PREFIX = 'pv2:';

/**
 * The one payments-v2 store that is HOT and cheaply rebuilt: the inbound stream
 * cursor, rewritten on every inbound event. It stays on the fast tier — losing
 * it costs a re-sync from the server, which is the source of truth. Everything
 * else under `pv2g2:` is money-critical: open send intents (`intents`), the
 * delivery and mint journals, split checkpoints and the double-spend guards.
 */
const HOT_STORE_KEY = 'cursor:';

/**
 * True when `key` must survive a process restart.
 *
 * chess-bot runs DATA_DIR on tmpfs on purpose: the SDK rewrites the whole
 * wallet.json (writeFileSync + fsync + rename) on every inbound event, and on
 * EBS that starves the WS reader. But that also discarded the payments-v2
 * intent backstop and delivery journal on every restart — and a reward left in
 * CERTIFICATION_UNCONFIRMED is reported as sent (deliberately, so it is never
 * double-paid) and completed later by `resumeNow()`. With the journal gone
 * there was nothing left to resume, so the payout vanished silently.
 */
export function isDurableKey(key: string): boolean {
  if (key.startsWith(PAYMENTS_V2_SUPERSEDED_PREFIX) && !key.startsWith(PAYMENTS_V2_PREFIX)) {
    return true;
  }
  if (!key.startsWith(PAYMENTS_V2_PREFIX)) return false;
  // `pv2g2:<network>:<chainPubkey>:<storeKey>` — the store key is the remainder
  // after the third colon-delimited segment.
  const storeKey = key.split(':').slice(3).join(':');
  return !storeKey.startsWith(HOT_STORE_KEY);
}

export interface SplitStorageConfig {
  /** Fast tier (tmpfs): wallet.json and everything not money-critical. */
  fastDir: string;
  /** Durable tier (real disk): the payments-v2 journals. */
  durableDir: string;
  network?: 'mainnet' | 'testnet' | 'testnet2' | 'dev';
}

/**
 * A StorageProvider that routes money-critical payments-v2 keys to a durable
 * directory and everything else to the fast (tmpfs) one, so the perf win of
 * tmpfs is kept without trading away payout durability.
 */
export function createSplitStorageProvider(config: SplitStorageConfig): StorageProvider {
  const fast = createFileStorageProvider({
    dataDir: config.fastDir,
    ...(config.network ? { network: config.network } : {}),
  });
  const durable = createFileStorageProvider({
    dataDir: config.durableDir,
    fileName: 'payments-journal.json',
    ...(config.network ? { network: config.network } : {}),
  });

  const pick = (key: string): StorageProvider => (isDurableKey(key) ? durable : fast);

  return {
    id: 'split-file-storage',
    name: 'Split File Storage',
    type: 'local',
    description: 'tmpfs for hot wallet state, disk for payments-v2 journals',

    async connect(): Promise<void> {
      await Promise.all([fast.connect(), durable.connect()]);
    },
    async disconnect(): Promise<void> {
      await Promise.all([fast.disconnect(), durable.disconnect()]);
    },
    isConnected: () => fast.isConnected() && durable.isConnected(),
    getStatus: () => (fast.getStatus() === 'connected' ? durable.getStatus() : fast.getStatus()),

    setIdentity(identity: FullIdentity): void {
      fast.setIdentity(identity);
      durable.setIdentity(identity);
    },

    get: (key) => pick(key).get(key),
    set: (key, value) => pick(key).set(key, value),
    remove: (key) => pick(key).remove(key),
    has: (key) => pick(key).has(key),

    // keys()/clear() take a PREFIX, which may span both tiers — fan out.
    async keys(prefix?: string): Promise<string[]> {
      const [a, b] = await Promise.all([fast.keys(prefix), durable.keys(prefix)]);
      return [...new Set([...a, ...b])];
    },
    async clear(prefix?: string): Promise<void> {
      await Promise.all([fast.clear(prefix), durable.clear(prefix)]);
    },

    // Tracked addresses are identity state, not payment state — fast tier.
    saveTrackedAddresses: (entries: TrackedAddressEntry[]) => fast.saveTrackedAddresses(entries),
    loadTrackedAddresses: () => fast.loadTrackedAddresses(),
  };
}
