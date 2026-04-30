# Agentic Chatbot

A pnpm monorepo of Sphere DM bots — Node.js services that own a Sphere
blockchain wallet, listen for Nostr DMs (or post to NIP-29 group chats),
and respond using an LLM plus tools exposed over the Model Context
Protocol (MCP).

## Bots

| Bot | Role | Surface | LLM |
|---|---|---|---|
| `kbbot` | Knowledge-base assistant | DM | Google Gemini |
| `viktor` | Anonymous research assistant | DM | OpenAI-compatible |
| `chess-bot` | Plays chess via Stockfish | Group chat | — |
| `unicity-l3` | Posts new aggregator block info | Group chat | — |

`kbbot` and `viktor` share the `@agentic/sphere-bot` library (agent loop,
MCP tool manager, model factory). `chess-bot` and `unicity-l3` use the
Sphere SDK directly.

## Architecture

```
   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐
   │   kbbot   │ │  viktor   │ │ chess-bot │ │ unicity-l3 │
   │ (DM bot)  │ │ (DM bot)  │ │ (group)   │ │ (group)    │
   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬──────┘
         │             │             │             │
         │  Sphere SDK │ Sphere SDK  │ Sphere SDK  │ Sphere SDK
         │  (Nostr DM, NIP-17, NIP-29 group chat)  │
         ▼             ▼             ▼             ▼
   ┌─────────────────────────────────────────────────────┐
   │              Nostr relays (testnet/mainnet)         │
   └─────────────────────────────────────────────────────┘

         ┌─────────┐         ┌─────────┐
   MCP   │ mcp-rag │         │ mcp-web │ ──HTTP──► searxng
  ─────► │ (Python)│         │(Python) │           (search)
         │ Chroma  │         │ search+ │
         │  /rag   │         │  fetch  │
         └─────────┘         └─────────┘
                  ▲              ▲
                  └──── kbbot, viktor (MCP/HTTP)
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- Python 3.10+ (only if running the MCP servers outside Docker)

### Setup

```bash
git clone <repository>
cd agentic-chatbot
pnpm install
cp .env.example .env          # fill in API keys + bot mnemonics
docker compose up --build
```

### Running a single bot in dev

```bash
pnpm --filter kbbot dev
pnpm --filter viktor dev
pnpm --filter chess-bot dev
pnpm --filter unicity-l3 dev
```

### Python MCP servers locally

```bash
cd packages/mcp-rag && python -m venv venv && source venv/bin/activate \
  && pip install -e . && python -m src.server

cd packages/mcp-web-py && python -m venv venv && source venv/bin/activate \
  && pip install -e . && python -m src.server
```

## Wallet & Mnemonic Handling

Each bot owns a Sphere wallet persisted under `data/<bot>/data/wallet.json`
(bind-mounted into the container). On startup the bot calls
`Sphere.init({ autoGenerate: false, mnemonic: ... })`:

- **If `wallet.json` exists** — it's loaded and the env var is ignored.
- **If `wallet.json` is missing** — the matching `*_MNEMONIC` env var must
  be set, otherwise the SDK throws `"No wallet exists and no mnemonic
  provided"` and the bot refuses to start.

The mnemonic env vars are:

| Bot | Mnemonic var |
|---|---|
| kbbot | `KBBOT_MNEMONIC` |
| viktor | `VIKTOR_MNEMONIC` |
| chess-bot | `CHESS_BOT_MNEMONIC` |
| unicity-l3 | `L3_MNEMONIC` |

`autoGenerate` is intentionally off so a corrupt `wallet.json` cannot
silently cause an identity swap on restart. To bootstrap a fresh
deployment, set the corresponding `*_MNEMONIC` once; you can leave it set
afterwards as a recovery fallback or remove it.

## Bot Data & Backup

```
data/
├── kbbot/{data,tokens}/
├── viktor/{data,tokens}/
├── chess-bot/{data,tokens}/
├── unicity-l3/{data,tokens}/
├── mcp-rag/chromadb/
└── searxng/
```

The `data/` directory is gitignored. Use the backup script to migrate:

```bash
./scripts/bot-backup.sh backup kbbot          # creates kbbot-backup.tar.gz
./scripts/bot-backup.sh restore kbbot         # extracts into data/kbbot/
```

Same for `viktor`, `chess-bot`, `unicity-l3`.

## Environment Variables

See `.env.example` for the full list. Highlights:

### kbbot

| Variable | Default | Description |
|---|---|---|
| `KBBOT_LLM_API_KEY` | *required* | Gemini API key |
| `KBBOT_LLM_MODEL` | `gemini-3-flash-preview` | Model name |
| `KBBOT_LLM_BASE_URL` | — | Optional custom endpoint |
| `KBBOT_NAMETAG` | `kbbot` | Sphere nametag |
| `KBBOT_NETWORK` | `testnet` | `mainnet` / `testnet` / `dev` |
| `KBBOT_MNEMONIC` | — | Wallet mnemonic (see above) |
| `KBBOT_MAX_HISTORY_MESSAGES` | `20` | Per-sender history depth |

### viktor

| Variable | Default | Description |
|---|---|---|
| `VIKTOR_LLM_API_KEY` | *required* | OpenAI-compatible API key |
| `VIKTOR_LLM_MODEL` | `gpt-oss` | Model name |
| `VIKTOR_LLM_BASE_URL` | `https://api.openai.com/v1` | Endpoint |
| `VIKTOR_NAMETAG` | `viktor` | Sphere nametag |
| `VIKTOR_NETWORK` | `testnet` | Network |
| `VIKTOR_MNEMONIC` | — | Wallet mnemonic |

### chess-bot

| Variable | Default | Description |
|---|---|---|
| `CHESS_BOT_NAMETAG` | `chess-bot` | Sphere nametag |
| `CHESS_BOT_GROUP_ID` | `chess` | Group chat ID |
| `CHESS_BOT_MNEMONIC` | — | Wallet mnemonic |
| `MAX_CONCURRENT_GAMES` | `10` | Game concurrency limit |

### unicity-l3

| Variable | Default | Description |
|---|---|---|
| `L3_GROUP_ID` | *required* | Sphere group chat ID |
| `L3_NAMETAG` | `unicity-l3` | Sphere nametag |
| `L3_NETWORK` | `testnet` | Network |
| `L3_MNEMONIC` | — | Wallet mnemonic |
| `L3_AGGREGATOR_URL` | `https://goggregator-test.unicity.network/` | Aggregator endpoint |
| `L3_EXPLORER_BASE_URL` | `https://unicitynetwork.github.io/smt-explorer/` | Explorer for posted links |
| `L3_POLL_INTERVAL_MS` | `1500` | Aggregator poll cadence |
| `L3_SHOW_EMPTY_BLOCKS` | `false` | Whether to post empty blocks |

### Shared

| Variable | Description |
|---|---|
| `SEARXNG_URL` | SearXNG endpoint for `mcp-web` (default: internal Docker URL) |
| `ORACLE_DEBUG` | Verbose aggregator/oracle logging |
| `TRUSTBASE_PATH` | Path to a trust-base JSON for oracle ops |

## SphereBotConfig (kbbot, viktor)

The `@agentic/sphere-bot` library is configured per-bot via
`packages/<bot>/src/config.ts`. Key fields:

- `llm.provider` — `'google'` or `'openai-compatible'`
- `mcpServers` — array of `{ name, url }`
- `maxSteps` — max tool-call rounds before forcing text generation
- `maxToolResultChars` / `maxContextChars` — truncation limits
- `tokenTransferPrompt` — system prompt for replying to incoming token
  transfers
- `cacheMessages` — set `false` to disable SDK-side DM caching (default
  `true`)
- `oracle.trustBasePath` / `oracle.debug` — optional aggregator overrides

## RAG Knowledge Base

`mcp-rag` does semantic search over Markdown files in `rag/`:

- Index is rebuilt on every container start (Chroma DB is persisted at
  `data/mcp-rag/chromadb/`).
- Section-aware chunking preserves header context.

To update:

```bash
# edit rag/*.md
docker compose restart mcp-rag
```

## Creating a new MCP Server

```bash
mkdir -p packages/mcp-myservice/src
```

```typescript
// packages/mcp-myservice/src/server.ts
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'myservice', version: '1.0.0' });

server.tool(
  'my_tool',
  'Description of what this tool does',
  { input: z.string().describe('Input parameter') },
  async ({ input }) => ({
    content: [{ type: 'text', text: JSON.stringify({ result: input }) }],
  }),
);

const port = parseInt(process.env.PORT || '3004');
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});
await server.connect(transport);

createServer((req, res) => {
  if (req.url === '/mcp') transport.handleRequest(req, res);
  else { res.writeHead(404); res.end('Not Found'); }
}).listen(port, () => console.log(`MCP server on port ${port}`));
```

Add the service to `docker-compose.yml` (see `mcp-web` / `mcp-rag` for
patterns) and reference its URL in the relevant bot's `mcpServers`
config.

## Notes & Conventions

- TypeScript ES modules (`"type": "module"`, `NodeNext` resolution); use
  `.js` extensions in imports.
- Bots default to `testnet`; flip with the `*_NETWORK` env var.
- MCP connections are persistent — restart the bot container if a
  connection issue surfaces.
- No tests currently. Test infrastructure was removed alongside the old
  agent-server frontend.

## Additional Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Vercel AI SDK v6](https://sdk.vercel.ai/docs)
- [Sphere SDK](https://github.com/unicity-sphere/sphere-sdk)
