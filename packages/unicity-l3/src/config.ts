export interface L3Config {
  network: 'mainnet' | 'testnet' | 'dev';
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

export function loadConfig(): L3Config {
  return {
    network: (process.env.NETWORK || 'testnet') as L3Config['network'],
    nametag: process.env.BOT_NAMETAG || 'unicity-l3',
    mnemonic: process.env.BOT_MNEMONIC || undefined,
    dataDir: process.env.DATA_DIR || '/app/data',
    tokensDir: process.env.TOKENS_DIR || '/app/tokens',
    aggregatorUrl: process.env.AGGREGATOR_URL || 'https://goggregator-test.unicity.network/',
    explorerBaseUrl: process.env.EXPLORER_BASE_URL || 'https://unicitynetwork.github.io/smt-explorer/',
    groupId: process.env.GROUP_ID || undefined,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),
    showEmptyBlocks: process.env.SHOW_EMPTY_BLOCKS === 'true',
    // Cap blocks announced per shard per round. When the bot falls behind
    // (e.g. slow publishing under host load) this bounds the work — and the
    // outbound message backlog — per round instead of looping over an
    // ever-growing range. Older blocks beyond the cap are skipped, not
    // queued, since announcing a stale backlog to the chat is pointless.
    maxBlocksPerRound: parseInt(process.env.L3_MAX_BLOCKS_PER_ROUND || '100', 10),
  };
}
