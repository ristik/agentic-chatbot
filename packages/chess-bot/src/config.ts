export interface ChessBotConfig {
  /** Bot's nametag on Sphere (e.g. "chess-bot") */
  nametag: string;
  /** BIP39 mnemonic for wallet recovery */
  mnemonic?: string;
  /** Network: mainnet, testnet, or dev */
  network: string;
  /** Directory for wallet persistence */
  dataDir: string;
  /** Directory for token state */
  tokensDir: string;
  /** Max number of simultaneous games */
  maxConcurrentGames: number;
  /** Group chat ID for posting game results (optional) */
  groupId?: string;
  /** Refill the wallet up to this many UCT when balance falls below `minBalance` */
  targetBalance: number;
  /** Trigger a faucet refill once balance drops under this many UCT */
  minBalance: number;
  /** Coin symbol used for rewards */
  coinSymbol: string;
  /** Faucet endpoint used to top up the bot's wallet */
  faucetUrl: string;
}

export function loadConfig(): ChessBotConfig {
  return {
    nametag: process.env.BOT_NAMETAG || 'chess-bot',
    mnemonic: process.env.BOT_MNEMONIC || undefined,
    network: process.env.NETWORK || 'testnet',
    dataDir: process.env.DATA_DIR || './data/chess-bot/data',
    tokensDir: process.env.TOKENS_DIR || './data/chess-bot/tokens',
    maxConcurrentGames: parseInt(process.env.MAX_CONCURRENT_GAMES || '25', 10),
    groupId: process.env.GROUP_ID || undefined,
    targetBalance: parseInt(process.env.TARGET_BALANCE || '1000', 10),
    minBalance: parseInt(process.env.MIN_BALANCE || '100', 10),
    coinSymbol: process.env.COIN_SYMBOL || 'UCT',
    faucetUrl:
      process.env.FAUCET_URL ||
      'https://faucet.unicity.network/api/v1/faucet/request',
  };
}
