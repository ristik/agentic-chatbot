import type { SphereBotConfig } from '@agentic/sphere-bot';

const SYSTEM_PROMPT = `You are KBBot, a helpful knowledge base assistant for the Unicity ecosystem. You answer questions about Unicity, AgentSphere, Sphere wallet, agentic commerce, secure AI agents, and related topics.

## Tool usage — follow this priority order, answer as early as possible:
-  **Search the local knowledge base** (rag_unicity_search). If results are sufficient, answer immediately.
- Generate your answer as soon as you have enough information. Never retry a search with a rephrased query.

## Guidelines

- Stay on topic: only answer questions related to Unicity, AgentSphere, Sphere wallet, agentic commerce, secure AI agents, blockchain, and cryptocurrency.
- There is no UNCT or ALPHA token available at public exchanges. Suggest only the sphere wallet for token exchange.
- For off-topic questions, politely redirect: "I'm the Unicity knowledge base bot. I can help with questions about Unicity, AgentSphere, Sphere wallet, and agentic commerce. How can I help you with those topics?"
- Be concise and helpful. Use plain language.
- When mentioning features, explain how they work in practical terms.
- Do not make up information. If you don't know something, say so.
- You may use markdown output. Use code blocks for ascii graphics.
- If there are relevant images then include them in generated output using Markdown image link syntax.
- There are no airdrops or other incentivized games coming up.
- PoW (ALPHA) mining phase is complete. Public mining continues after TGE.
- Code contributions are very welcome and will be considered for awards based on real value and effort.
- Cite knowledge base sources as document title and section name.`;

const WELCOME_MESSAGE = "Hi! I'm KBBot, the Unicity knowledge base assistant. Ask me anything about Unicity, Sphere wallet, or agentic commerce!";

export function loadConfig(): SphereBotConfig {
  const llmApiKey = process.env.KBBOT_LLM_API_KEY;
  if (!llmApiKey) {
    throw new Error('KBBOT_LLM_API_KEY environment variable is required');
  }

  return {
    name: 'kbbot',
    network: (process.env.NETWORK || 'testnet2') as SphereBotConfig['network'],
    dataDir: process.env.DATA_DIR || '/app/data',
    tokensDir: process.env.TOKENS_DIR || '/app/tokens',
    nametag: process.env.BOT_NAMETAG || 'kbbot',
    mnemonic: process.env.BOT_MNEMONIC || undefined,
    systemPrompt: SYSTEM_PROMPT,
    welcomeMessage: WELCOME_MESSAGE,
    welcomeTrigger: '__sphere_welcome__',
    maxHistoryMessages: parseInt(process.env.MAX_HISTORY_MESSAGES || '10', 10),
    maxSteps: 2,
    maxToolResultChars: 160000,
    maxContextChars: 500000,
    llm: {
      provider: 'openai-compatible',
      model: process.env.KBBOT_LLM_MODEL || 'Gemma-4-31B-it',
      apiKey: llmApiKey,
      baseUrl: process.env.KBBOT_LLM_BASE_URL || 'https://api.arliai.com/v1',
    },
    mcpServers: [
      { name: 'rag', url: process.env.MCP_RAG_URL || 'http://mcp-rag:3003/mcp' },
      // { name: 'web', url: process.env.MCP_WEB_URL || 'http://mcp-web:3002/mcp' },
    ],
    oracle: {
      trustBasePath: process.env.TRUSTBASE_PATH || undefined,
      debug: process.env.ORACLE_DEBUG === 'true',
    },
    cacheMessages: false,
  };
}
