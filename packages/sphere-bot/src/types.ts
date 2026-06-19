export interface SphereBotConfig {
  /** Bot name used for log prefixes, e.g. 'kbbot', 'viktor' */
  name: string;
  /** Sphere network */
  network: 'mainnet' | 'testnet' | 'testnet2' | 'dev';
  /** Sphere wallet data directory */
  dataDir: string;
  /** Sphere token storage directory */
  tokensDir: string;
  /** Bot's Sphere @nametag */
  nametag: string;
  /** BIP39 mnemonic for wallet recovery. If provided, used to restore the wallet identity. */
  mnemonic?: string;
  /** LLM system prompt */
  systemPrompt: string;
  /** Welcome DM message. If undefined, no welcome DMs are sent. */
  welcomeMessage?: string;
  /** Content string that triggers canned welcome response instead of LLM */
  welcomeTrigger?: string;
  /** Max conversation history entries per user */
  maxHistoryMessages: number;
  /** Max tool-call steps before forcing text generation */
  maxSteps: number;
  /** LLM provider configuration */
  llm: {
    provider: 'google' | 'openai-compatible';
    model: string;
    apiKey: string;
    baseUrl?: string;
    temperature?: number;
  };
  /** Max characters per individual MCP tool result (default: 16000) */
  maxToolResultChars?: number;
  /** Max total context characters (system + history) sent to LLM (default: 100000) */
  maxContextChars?: number;
  /** MCP servers to connect to */
  mcpServers: Array<{ name: string; url: string }>;
  /** Cache DM messages in the SDK store. Default `true` (caching on); set `false`
   *  to disable — messages still flow through handlers, they're just not persisted. */
  cacheMessages?: boolean;
  /** Optional oracle/aggregator overrides */
  oracle?: {
    /** Optional path to a trust base JSON file. Omit to use the SDK's baked-in
     *  testnet2 trustbase (networkId 4). */
    trustBasePath?: string;
    /** Enable debug logging for oracle/aggregator operations */
    debug?: boolean;
  };
}
