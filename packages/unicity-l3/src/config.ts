export interface L3Config {
  network: 'mainnet' | 'testnet' | 'testnet2' | 'dev';
  nametag: string;
  mnemonic?: string;
  dataDir: string;
  tokensDir: string;
  aggregatorUrl: string;
  explorerBaseUrl: string;
  groupId: string | undefined;
  pollIntervalMs: number;
  showEmptyBlocks: boolean;
  maxBlocksPerRound: number;
}

/** Parse a positive integer env var, falling back when unset/empty/invalid
 *  (NaN, ≤0) so a bad value can't silently disable a bound. */
function posIntEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadConfig(): L3Config {
  return {
    network: (process.env.NETWORK || 'testnet2') as L3Config['network'],
    nametag: process.env.BOT_NAMETAG || 'unicity-l3',
    mnemonic: process.env.BOT_MNEMONIC || undefined,
    dataDir: process.env.DATA_DIR || '/app/data',
    tokensDir: process.env.TOKENS_DIR || '/app/tokens',
    // testnet2 block-info aggregator for the raw block-polling client (NOT the
    // SDK oracle). NOTE: testnet2 is a fresh chain — block heights reset and
    // this host must serve /config/shards + JSON-RPC get_block_height/get_block.
    // Reads AGGREGATOR_URL (docker-compose maps L3_AGGREGATOR_URL -> AGGREGATOR_URL);
    // override it if the testnet2 block aggregator differs from the gateway host.
    aggregatorUrl: process.env.AGGREGATOR_URL || 'https://gateway.testnet2.unicity.network/',
    explorerBaseUrl: process.env.EXPLORER_BASE_URL || 'https://unicitynetwork.github.io/smt-explorer/',
    groupId: process.env.GROUP_ID || undefined,
    pollIntervalMs: posIntEnv(process.env.POLL_INTERVAL_MS, 60000),
    showEmptyBlocks: process.env.SHOW_EMPTY_BLOCKS === 'true',
    // Cap blocks announced per shard per round. When the bot falls behind
    // (e.g. slow publishing under host load) this bounds the work — and the
    // outbound message backlog — per round instead of looping over an
    // ever-growing range. Older blocks beyond the cap are skipped, not
    // queued, since announcing a stale backlog to the chat is pointless.
    maxBlocksPerRound: posIntEnv(process.env.L3_MAX_BLOCKS_PER_ROUND, 100),
  };
}
