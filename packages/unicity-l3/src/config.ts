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
  };
}
