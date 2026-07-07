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
  /** Trigger a self-mint top-up once balance drops under this many UCT */
  minBalance: number;
  /** Coin symbol used for rewards */
  coinSymbol: string;
  /**
   * Time (ms) to wait for active games to finish naturally on shutdown.
   * When this expires the bot resigns each remaining game (opponents win
   * by resign, normal reward payout fires), then exits — so users get
   * a clean game-over and their reward, not a disconnect.
   */
  shutdownGraceMs: number;
  /**
   * Additional time (ms) after forced resignation to wait for in-flight
   * reward payouts (Sphere transfers) and group-result posts to settle.
   * Bounded so a stuck transfer can't keep the process alive forever.
   */
  shutdownPayoutWaitMs: number;
  /**
   * How often (ms) to reconcile OPEN payment intents via
   * `sphere.payments.resumeOpenIntents()`. A reward whose on-chain
   * certification was inconclusive (CERTIFICATION_UNCONFIRMED) or whose
   * mailbox delivery was deferred stays open under its original transferId;
   * this finishes it (idempotent — never a second spend) without waiting for
   * the next restart's automatic resume at Sphere.init. Set `0` to disable.
   */
  resumeIntervalMs: number;
}

export function loadConfig(): ChessBotConfig {
  return {
    nametag: process.env.BOT_NAMETAG || 'chess-bot',
    mnemonic: process.env.BOT_MNEMONIC || undefined,
    network: process.env.NETWORK || 'testnet2',
    dataDir: process.env.DATA_DIR || './data/chess-bot/data',
    tokensDir: process.env.TOKENS_DIR || './data/chess-bot/tokens',
    maxConcurrentGames: parseInt(process.env.MAX_CONCURRENT_GAMES || '25', 10),
    groupId: process.env.GROUP_ID || undefined,
    targetBalance: parseInt(process.env.TARGET_BALANCE || '1000', 10),
    minBalance: parseInt(process.env.MIN_BALANCE || '100', 10),
    coinSymbol: process.env.COIN_SYMBOL || 'UCT',
    shutdownGraceMs: parseInt(process.env.SHUTDOWN_GRACE_MS || '60000', 10),
    shutdownPayoutWaitMs: parseInt(process.env.SHUTDOWN_PAYOUT_WAIT_MS || '60000', 10),
    resumeIntervalMs: parseInt(process.env.RESUME_INTERVAL_MS || '300000', 10),
  };
}
