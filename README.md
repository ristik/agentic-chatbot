# Agentic Chatbot

A modular, agentic chatbot platform built with React, Node.js, and the Model Context Protocol (MCP). Features multiple AI-powered "activities" (personalities/agents) that can use custom tools via MCP servers.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Adding New Activities](#adding-new-activities)
- [Activity System Prompt Templating](#activity-system-prompt-templating)
- [Adding Trivia Questions](#adding-trivia-questions)
- [Creating MCP Servers](#creating-mcp-servers)
- [Environment Configuration](#environment-configuration)
- [Deployment](#deployment)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                    │
│  - Activity Selector                                        │
│  - Chat Interface with streaming                            │
│  - Message rendering (markdown, tables, HTML)               │
│  - Thinking/reasoning display                               │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP/SSE
┌─────────────────▼───────────────────────────────────────────┐
│                    Agent Server (Node.js)                   │
│  - Activity routing                                         │
│  - LLM orchestration (Gemini, OpenAI-compatible)            │
│  - Agent loop with streaming                                │
│  - Local tools (memory)                                     │
│  - MCP client manager                                       │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCP over HTTP
         ┌────────┴────────┐
         │                 │
┌────────▼──────┐  ┌──────▼────────┐
│ MCP Server    │  │ MCP Server    │
│  (Trivia)     │  │  (Web Fetch)  │
│               │  │               │
│ - Questions   │  │ - Web search  │
│ - Scoring     │  │ - Fetch pages │
└───────────────┘  └───────────────┘
```

### Key Technologies

- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Zustand (state management)
- **Backend**: Hono (web framework), Vercel AI SDK, MCP SDK, Drizzle ORM (PostgreSQL)
- **LLM Providers**: Google Gemini, OpenAI-compatible APIs (local or remote)
- **MCP**: Model Context Protocol for modular tool servers

### Core Concepts

**Activities**: Each activity represents a distinct agent/personality with:
- Unique system prompt and personality
- Specific LLM model and configuration
- Access to specific MCP servers (tools)
- Optional local tools (e.g., memory)
- Theme and UI customization
- Chat history persistence settings

**MCP Servers**: Standalone HTTP services that expose tools:
- Built using `@modelcontextprotocol/sdk`
- Provide tools via JSON schema
- Run as separate Docker containers
- Stateless or stateful (using userId from metadata)

**Agent Loop**: The main execution flow in `agent-server/src/agent/loop.ts`:
1. Receives user message and chat history
2. Converts to LLM-compatible format
3. Streams LLM response with tool calls
4. Executes tools via MCP or local handlers
5. Yields text deltas, reasoning, and tool-call events to frontend
6. Continues loop until LLM completes response

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### Local Development

1. **Clone and install dependencies**:
```bash
git clone <repository>
cd agentic-chatbot
pnpm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your API keys
```

Required environment variables:
```env
# LLM API Keys
GOOGLE_API_KEY=your_gemini_api_key_here
AMA_API_KEY=optional_for_ama_activity

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/agentic_chatbot

# CORS (comma-separated for multiple origins)
CORS_ORIGIN=http://localhost:5173

# MCP Server URLs (defaults work with docker-compose)
MCP_TRIVIA_URL=http://localhost:3001/mcp
MCP_WEB_URL=http://localhost:3002/mcp
```

3. **Run with Docker Compose**:
```bash
docker-compose up --build
```

Services will be available at:
- Frontend: http://localhost:5173
- Agent Server: http://localhost:3000
- Trivia MCP: http://localhost:3001
- Web MCP: http://localhost:3002

### Without Docker

1. **Start the database** (PostgreSQL)

2. **Run migrations**:
```bash
cd packages/agent-server
pnpm db:migrate
```

3. **Start services** (in separate terminals):
```bash
# MCP Trivia Server (TypeScript)
cd packages/mcp-trivia
pnpm dev

# MCP Web Server (Python)
cd packages/mcp-web-py
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e .
python -m src.server

# Agent Server
cd packages/agent-server
pnpm dev

# Frontend
cd packages/ui
pnpm dev
```

## Project Structure

```
agentic-chatbot/
├── packages/
│   ├── agent-server/          # Main backend server
│   │   ├── src/
│   │   │   ├── agent/
│   │   │   │   ├── loop.ts           # Main agent execution loop
│   │   │   │   ├── llm/
│   │   │   │   │   └── providers.ts  # LLM provider configs (Gemini, OpenAI)
│   │   │   │   ├── mcp/
│   │   │   │   │   └── manager.ts    # MCP client manager (global singleton)
│   │   │   │   └── tools/
│   │   │   │       └── memory.ts     # Local memory tool (DB storage)
│   │   │   ├── config/
│   │   │   │   └── activities/
│   │   │   │       ├── index.ts      # Activity registry
│   │   │   │       ├── trivia.ts     # Trivia activity config
│   │   │   │       └── ama.ts        # AMA activity config
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # Drizzle schema
│   │   │   │   ├── client.ts         # DB client
│   │   │   │   └── migrate.ts        # Migration runner
│   │   │   ├── routes/
│   │   │   │   ├── chat.ts           # Chat streaming endpoint
│   │   │   │   └── activities.ts     # Activity list endpoint
│   │   │   └── index.ts              # Server entry point (CORS, routing)
│   │   └── drizzle/                   # Migration files
│   │
│   ├── mcp-trivia/                    # Trivia MCP server
│   │   └── src/
│   │       ├── server.ts              # MCP server implementation
│   │       └── data/
│   │           └── questions.ts       # Trivia questions database
│   │
│   ├── mcp-web/                       # Web fetch MCP server
│   │   └── src/
│   │       └── server.ts              # Web fetching tools
│   │
│   ├── ui/                            # React frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── ActivitySelector.tsx
│   │       │   ├── MockWallet.tsx     # User ID management
│   │       │   └── Chat/
│   │       │       ├── ChatContainer.tsx
│   │       │       ├── MessageBubble.tsx  # Markdown rendering
│   │       │       └── ChatInput.tsx
│   │       ├── stores/
│   │       │   └── chatStore.ts       # Zustand state management
│   │       ├── hooks/
│   │       │   └── useChat.ts         # Chat hook with streaming
│   │       └── utils/
│   │           └── uuid.ts            # UUID polyfill
│   │
│   └── shared/                        # Shared TypeScript types
│       └── src/
│           └── types/
│               ├── activities.ts      # ActivityConfig, LLMConfig, McpServerConfig
│               └── messages.ts        # ChatMessage types
│
├── docker-compose.yml                 # Docker orchestration
├── .env.example                       # Environment variable template
└── README.md                          # This file
```

## Adding New Activities

Activities are AI agents with specific personalities, tools, and configurations.

### Step 1: Create Activity Configuration

Create a new file in `packages/agent-server/src/config/activities/`:

```typescript
// packages/agent-server/src/config/activities/my-activity.ts
import type { ActivityConfig } from '@agentic/shared';

export const myActivity: ActivityConfig = {
    id: 'my-activity',
    name: 'My Custom Agent',
    description: 'A helpful agent that does X',
    greetingMessage: "Hello! I can help you with X. What would you like to do?",

    systemPrompt: `You are a helpful AI assistant specialized in X.

Your capabilities:
- Task A
- Task B
- Task C

Guidelines:
- Be concise and clear
- Use the available tools when needed
- Format responses using markdown

Available tools:
- tool_name: Description of what it does`,

    llm: {
        provider: 'gemini',              // or 'openai-compatible'
        model: 'gemini-2.5-flash',       // or your model name
        temperature: 0.7,                 // 0.0 = deterministic, 1.0 = creative
    },

    // MCP servers this activity can access
    mcpServers: [
        {
            name: 'my-mcp-server',
            url: process.env.MY_MCP_URL || 'http://localhost:3003/mcp',
        },
    ],

    // Local tools (currently only 'memory' available)
    localTools: ['memory'],

    // UI theming
    theme: {
        primaryColor: '#3b82f6',          // Tailwind blue-500
        name: 'my-activity',
    },

    // Whether to persist chat history between sessions
    persistChatHistory: true,             // true = remember, false = fresh each time
};
```

### Step 2: Register Activity

Add your activity to the registry:

```typescript
// packages/agent-server/src/config/activities/index.ts
import type { ActivityConfig } from '@agentic/shared';
import { triviaActivity } from './trivia.js';
import { amaActivity } from './ama.js';
import { myActivity } from './my-activity.js';  // Add this

const activities: Record<string, ActivityConfig> = {
    trivia: triviaActivity,
    ama: amaActivity,
    'my-activity': myActivity,  // Add this
};

export function getActivityConfig(id: string): ActivityConfig | undefined {
    return activities[id];
}

export function getAllActivities(): ActivityConfig[] {
    return Object.values(activities);
}
```

### Step 3: Test Your Activity

Rebuild and restart:
```bash
docker-compose down
docker-compose up --build
```

Your new activity will appear in the activity selector.

### LLM Provider Options

**Gemini**:
```typescript
llm: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',  // or 'gemini-2.0-flash-thinking-exp'
    temperature: 0.7,
}
```

**OpenAI-compatible** (local or remote):
```typescript
llm: {
    provider: 'openai-compatible',
    model: 'gpt-4',  // or local model name
    baseUrl: 'http://localhost:8000/v1',  // or OpenAI API
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.7,
}
```

## Activity System Prompt Templating

Activities support dynamic template tags in system prompts to inject user context at runtime. This enables personalization based on user ID, timezone, locale, and other metadata.

### Available Template Variables

| Variable | Example | Description | Source |
|----------|---------|-------------|--------|
| `{{userId}}` | `user_abc12345` | Unique user identifier | Request body (localStorage) |
| `{{serverTime}}` | `2025-12-02T14:30:00.123Z` | Current server time in UTC ISO format | Server |
| `{{userIp}}` | `192.168.1.1` | User's IP address (for geolocation) | HTTP headers (x-forwarded-for) |
| `{{userCountry}}` | `EE` | User's country code | HTTP headers (cf-ipcountry - Cloudflare only) |
| `{{userTimezone}}` | `Europe/Tallinn` | User's timezone | Frontend Intl API |
| `{{userLocale}}` | `et-EE` | User's locale/language setting | Frontend navigator.language |
| `{{userLanguage}}` | `et` | Language code (parsed from locale) | Derived from userLocale |
| `{{userRegion}}` | `EE` | Region code (parsed from locale) | Derived from userLocale |
| `{{localTime}}` | `12/02/2025, 16:30:00` | Current time in user's timezone | Server time + userTimezone |

### Template Syntax

**Simple Variables**:
```typescript
systemPrompt: `You are a helpful assistant.

User ID: {{userId}}
Current Time: {{serverTime}}
`
```

**Conditional Blocks** (only show if variable exists):
```typescript
systemPrompt: `You are a helpful assistant.

{{#if userCountry}}User is from {{userCountry}}.
{{/if}}
`
```

**If-Else Blocks**:
```typescript
systemPrompt: `You are a helpful assistant.

{{#if userTimezone}}
User's timezone: {{userTimezone}}
Local time: {{localTime}}
{{else}}
User's timezone unknown - using UTC.
{{/if}}
`
```

### Example: Personalized Activity

```typescript
// packages/agent-server/src/config/activities/my-activity.ts
export const myActivity: ActivityConfig = {
    id: 'my-activity',
    name: 'Personal Assistant',
    description: 'A timezone and locale-aware assistant',

    systemPrompt: `You are a helpful personal assistant.

USER CONTEXT:
- User ID: {{userId}}
- Current Time (UTC): {{serverTime}}
{{#if userTimezone}}- User Timezone: {{userTimezone}}
- Local Time: {{localTime}}
{{/if}}{{#if userCountry}}- User Country: {{userCountry}}
{{/if}}{{#if userLocale}}- User Locale: {{userLocale}} (Language: {{userLanguage}})
{{/if}}

Your role:
- Be aware of the user's timezone when discussing time
- Adapt your language formality based on their locale
- Remember the user across sessions using their userId
- Use the memory tool to store user preferences

Available tools:
- memory: Store and retrieve user-specific information
`,

    llm: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.7,
    },

    mcpServers: [],
    localTools: ['memory'],

    theme: {
        primaryColor: '#8b5cf6',
        name: 'my-activity',
    },

    persistChatHistory: true,
};
```

### How Template Processing Works

1. **Frontend Capture**: The UI automatically detects user's timezone and locale using browser APIs:
   ```typescript
   {
       userId: 'user_abc12345',
       timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
       locale: navigator.language
   }
   ```

2. **Request Transmission**: userContext is sent with each chat message

3. **Server Processing**: The agent-server processes templates before sending to LLM:
   ```typescript
   // Build context from available data
   const templateContext = {
       userId: 'user_abc12345',
       serverTime: '2025-12-02T14:30:00.123Z',
       userTimezone: 'Europe/Tallinn',
       userLocale: 'et-EE',
       userLanguage: 'et',
       userRegion: 'EE',
       localTime: '12/02/2025, 16:30:00'
   };

   // Process template tags
   const processedPrompt = processTemplate(systemPrompt, templateContext);
   ```

4. **LLM Receives**: Final system prompt with all values substituted

### Template Implementation Details

- **Location**: Template processor in `/packages/agent-server/src/agent/llm/prompt-templates.ts`
- **Integration**: Applied in `/packages/agent-server/src/agent/loop.ts` before LLM call
- **Backward Compatible**: Activities without template tags work unchanged
- **Graceful Fallback**: Missing variables keep original syntax (e.g., `{{userCountry}}`)

### Debugging Templates

Enable template debugging to see raw and processed prompts:

```bash
# Set environment variable
export DEBUG_PROMPTS=true

# Restart agent-server
docker-compose restart agent-server

# Check logs
docker-compose logs -f agent-server
```

Debug output includes:
```
[Template] Raw system prompt: You are Viktor...{{userId}}...
[Template] Context: {
  userId: 'user_abc123',
  serverTime: '2025-12-02T14:30:00.000Z',
  userTimezone: 'Europe/Tallinn',
  ...
}
[Template] Processed system prompt: You are Viktor...user_abc123...
```

### Best Practices

1. **Use Conditionals for Optional Data**: Wrap optional variables like `{{userCountry}}` in `{{#if}}` blocks
2. **Include userId**: Helps LLM understand user continuity and memory tool usage
3. **Time Awareness**: Use `{{localTime}}` when discussing schedules or time-sensitive topics
4. **Language Adaptation**: Use `{{userLanguage}}` to adjust formality or idioms
5. **Document in System Prompt**: Mention what user context is available
6. **Test Without Variables**: Ensure prompts work even if userContext fails to populate

### Security Considerations

- **No PII Exposure**: userId is a random identifier, not personal information
- **IP Privacy**: userIp not shown to LLM by default (available via template if needed)
- **Country Detection**: Requires Cloudflare deployment or custom IP-to-country service
- **Client-Side Trust**: Timezone/locale come from browser, can be spoofed (not security critical)

## Adding Trivia Questions

The trivia questions are stored in `packages/mcp-trivia/src/data/questions.ts`.

### Question Format

```typescript
export interface TriviaQuestion {
    id: string;              // Unique identifier
    category: string;        // One of: Science, History, Geography, Entertainment, Sports
    question: string;        // The question text
    correctAnswer: string;   // The correct answer
    incorrectAnswers: string[];  // Array of 3 wrong answers
}
```

### Adding New Questions

1. Open `packages/mcp-trivia/src/data/questions.ts`

2. Add your questions to the `questions` array:

```typescript
export const questions: TriviaQuestion[] = [
    // ... existing questions ...
    {
        id: '256',  // Use next available ID
        category: 'Science',
        question: 'What is the speed of light in a vacuum?',
        correctAnswer: '299,792,458 m/s',
        incorrectAnswers: ['300,000,000 m/s', '186,000 m/s', '3 × 10^8 km/s'],
    },
    // Add more...
];
```

3. Add new categories if needed:

```typescript
export const categories = [
    'Science',
    'History',
    'Geography',
    'Entertainment',
    'Sports',
    'Technology',  // New category
];
```

4. Rebuild the MCP server:

```bash
docker-compose build mcp-trivia
docker-compose up -d mcp-trivia
```

## Creating MCP Servers

MCP servers are standalone services that provide tools to the agent. Here's how to create one.

### Step 1: Create New Package

```bash
mkdir -p packages/mcp-myservice/src
cd packages/mcp-myservice
```

### Step 2: Initialize Package

```json
// packages/mcp-myservice/package.json
{
  "name": "@agentic/mcp-myservice",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.20.6",
    "typescript": "^5.7.2"
  }
}
```

### Step 3: Implement MCP Server

```typescript
// packages/mcp-myservice/src/server.ts
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const server = new McpServer({
    name: 'myservice',
    version: '1.0.0',
});

// Tool 1: Simple operation
server.tool(
    'my_tool_name',
    'Description of what this tool does',
    {
        // Input schema using Zod
        input: z.string().describe('Input parameter description'),
        count: z.number().optional().describe('Optional count parameter'),
    },
    async ({ input, count }) => {
        // Tool implementation
        const result = performOperation(input, count);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result),
            }],
        };
    }
);

// Tool 2: Stateful operation (uses userId)
server.tool(
    'stateful_tool',
    'A tool that remembers user state',
    {
        action: z.enum(['get', 'set', 'delete']),
        value: z.string().optional(),
    },
    async ({ action, value }, extra) => {
        // Access userId from metadata
        const userId = (extra as any)?.meta?.userId || 'anonymous';

        // Your stateful logic here
        // ...

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ success: true }),
            }],
        };
    }
);

// Start HTTP server
async function main() {
    const port = parseInt(process.env.PORT || '3003');

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
    });

    await server.connect(transport);

    const httpServer = createServer((req, res) => {
        if (req.url === '/mcp') {
            transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    httpServer.listen(port, () => {
        console.log(`My MCP server running on port ${port}`);
    });
}

main().catch(console.error);
```

### Step 4: Add to Docker Compose

```yaml
# docker-compose.yml
services:
  # ... existing services ...

  mcp-myservice:
    build:
      context: .
      dockerfile: packages/mcp-myservice/Dockerfile
    ports:
      - "3003:3003"
    environment:
      PORT: 3003
    restart: unless-stopped
```

### Step 5: Create Dockerfile

```dockerfile
# packages/mcp-myservice/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/mcp-myservice/package.json ./packages/mcp-myservice/
RUN pnpm install --frozen-lockfile

COPY packages/mcp-myservice ./packages/mcp-myservice
RUN pnpm --filter @agentic/mcp-myservice build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable pnpm

COPY --from=builder /app/packages/mcp-myservice/dist ./dist
COPY --from=builder /app/packages/mcp-myservice/package.json ./
COPY --from=builder /app/packages/mcp-myservice/node_modules ./node_modules

EXPOSE 3003
CMD ["node", "dist/server.js"]
```

### Step 6: Register with Activity

Add the MCP server to your activity configuration:

```typescript
// packages/agent-server/src/config/activities/my-activity.ts
mcpServers: [
    {
        name: 'myservice',
        url: process.env.MY_SERVICE_MCP_URL || 'http://mcp-myservice:3003/mcp',
    },
],
```

### MCP Tool Best Practices

1. **Clear descriptions**: LLM uses these to decide when to call tools
2. **Structured output**: Return JSON for complex data
3. **Error handling**: Return error objects, don't throw
4. **Schema validation**: Use Zod for input validation
5. **Stateless when possible**: Use userId only if state is needed
6. **Idempotent**: Same input should produce same output
7. **Documentation**: Add tool usage to activity systemPrompt

## Environment Configuration

### Development (.env)

```env
# LLM Configuration
GOOGLE_API_KEY=your_gemini_api_key
AMA_API_KEY=optional_openai_compatible_key

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_chatbot

# CORS (comma-separated)
CORS_ORIGIN=http://localhost:5173

# MCP Server URLs (adjust if not using docker-compose)
MCP_TRIVIA_URL=http://localhost:3001/mcp
MCP_WEB_URL=http://localhost:3002/mcp

# Server Port
PORT=3000

# Debug Flags (optional, for development)
DEBUG_PROMPTS=false  # Set to 'true' to log system prompts and template processing
DEBUG_MCP=false      # Set to 'true' to log MCP tool calls and responses
```

### Production (.env)

```env
# LLM Configuration
GOOGLE_API_KEY=your_production_api_key
AMA_API_KEY=your_production_api_key

# Database (use managed PostgreSQL)
DATABASE_URL=postgresql://user:pass@production-host:5432/dbname?sslmode=require

# CORS - IMPORTANT: List all allowed origins
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# MCP Server URLs (internal Docker network names)
MCP_TRIVIA_URL=http://mcp-trivia:3001/mcp
MCP_WEB_URL=http://mcp-web:3002/mcp

# Server Port
PORT=3000
```

### Build-Time Variables

**VITE_API_URL** is a build-time variable for the frontend:

```bash
# Local development (default)
VITE_API_URL=http://localhost:3000

# Production - set before building
VITE_API_URL=https://api.yourdomain.com

# Build with custom API URL
docker-compose build --build-arg VITE_API_URL=https://api.yourdomain.com ui
```

**Important**: After changing `VITE_API_URL`, you must rebuild the UI:
```bash
docker-compose build ui
docker-compose up -d ui
```

## Deployment

### Docker Compose Deployment (Recommended)

1. **Set up server**:
```bash
# Clone repository
git clone <repository>
cd agentic-chatbot

# Copy and configure environment
cp .env.example .env
nano .env  # Edit with production values
```

2. **Configure environment variables**:
```env
# Production URLs
VITE_API_URL=http://your-server-ip:3000
CORS_ORIGIN=http://your-server-ip:5173
```

3. **Build and start services**:
```bash
docker-compose build
docker-compose up -d
```

4. **Check logs**:
```bash
docker-compose logs -f
```

5. **Run database migrations** (first time only):
```bash
docker-compose exec agent-server pnpm db:migrate
```

### HTTPS Setup with Nginx

```nginx
# /etc/nginx/sites-available/agentic-chatbot
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /chat {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    location /activities {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

Update your .env:
```env
VITE_API_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
```

Rebuild UI:
```bash
docker-compose build ui
docker-compose up -d
```

## Development

### Monorepo Structure

This is a pnpm workspace monorepo. All packages share dependencies via the workspace root.

### Running Individual Services

```bash
# Install dependencies (run from root)
pnpm install

# Run specific package
pnpm --filter @agentic/agent-server dev
pnpm --filter @agentic/ui dev
pnpm --filter @agentic/mcp-trivia dev

# Build specific package
pnpm --filter @agentic/agent-server build
```

### Database Migrations

**Create migration**:
```bash
cd packages/agent-server
pnpm db:generate  # After schema changes
```

**Run migrations**:
```bash
cd packages/agent-server
pnpm db:migrate
```

**Push schema** (dev only):
```bash
cd packages/agent-server
pnpm db:push
```

### Debugging

The agent-server supports detailed debug logging for development and troubleshooting.

#### DEBUG_PROMPTS

Logs system prompt processing and template variable substitution.

**Enable**:
```bash
# In .env or docker-compose.yml
DEBUG_PROMPTS=true
```

**Output includes**:
- Raw system prompt (with template tags like `{{userId}}`)
- Template context (all available variables)
- Processed system prompt (with values substituted)
- Final enhanced system prompt sent to LLM
- Complete message array

**Example output**:
```
[Template] Raw system prompt: You are Viktor...User ID: {{userId}}...
[Template] Context: {
  userId: 'user_abc123',
  serverTime: '2025-12-02T14:30:00.000Z',
  userTimezone: 'Europe/Tallinn',
  userLocale: 'et-EE',
  userLanguage: 'et',
  userRegion: 'EE',
  localTime: '12/02/2025, 16:30:00'
}
[Template] Processed system prompt: You are Viktor...User ID: user_abc123...

FINAL SYSTEM PROMPT:
[Full prompt with all enhancements]
```

**Use case**: Debug activity template tags, verify user context is being captured

#### DEBUG_MCP

Logs all MCP tool discovery, calls, and responses.

**Enable**:
```bash
# In .env or docker-compose.yml
DEBUG_MCP=true
```

**Output includes**:
- Tool discovery (list of tools from each MCP server)
- Tool schemas (input parameters and descriptions)
- Tool call arguments
- Metadata passed to tools (userId, userIp, userCountry)
- Full tool response content
- Error flags

**Example output**:
```
[MCP] Loading 3 tools from web
[MCP Debug] Tools from web:
[MCP Debug]   1. web_search
[MCP Debug]      Description: Search the web using DuckDuckGo
[MCP Debug]      Input Schema: {
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Search query" },
    "max_results": { "type": "number", "description": "Max results" }
  }
}

[MCP Debug] Calling tool: web_search
[MCP Debug]   Arguments: {
  "query": "latest AI news",
  "max_results": 5
}
[MCP Debug]   Metadata: {
  "userId": "user_abc123",
  "userIp": "192.168.1.1",
  "userCountry": "EE"
}

[MCP Debug] Response from web_search:
[MCP Debug]   Content: [
  {
    "type": "text",
    "text": "{\"results\": [...]}"
  }
]
```

**Use case**: Debug MCP tool integrations, verify tools are being called correctly, inspect tool responses

#### Enabling Both Flags

For comprehensive debugging:

```bash
# In .env
DEBUG_PROMPTS=true
DEBUG_MCP=true

# Restart agent-server
docker-compose restart agent-server

# Watch logs with filtering
docker-compose logs -f agent-server | grep -E '\[MCP|Template\]'
```

#### Production Warning

⚠️ **Never enable debug flags in production**:
- Logs may contain sensitive user data
- Performance impact from verbose logging
- Large log files can fill disk space

### Code Style

- TypeScript strict mode enabled
- ESM modules (`.js` imports even for `.ts` files)
- Use shared types from `@agentic/shared`
- Follow existing patterns for consistency

### Adding Dependencies

```bash
# Add to specific package
pnpm --filter @agentic/agent-server add express

# Add to workspace root
pnpm add -w typescript

# Add dev dependency
pnpm --filter @agentic/ui add -D vite
```

## Troubleshooting

### docker-compose errors

If docker-compose is too old (ver 1.x) then try
`docker compose` instead. Or upgrade.

### MCP Connection Errors

**Error**: "Server already initialized"

**Solution**: The MCP manager uses a global singleton with persistent connections. If you see this error:
1. Restart the agent-server container
2. Check MCP server logs for errors
3. Verify MCP URLs in .env are correct

### CORS Errors

**Error**: "CORS header 'Access-Control-Allow-Origin' does not match"

**Solution**:
1. Verify `CORS_ORIGIN` in .env matches your frontend URL exactly
2. For multiple origins: `CORS_ORIGIN=http://localhost:5173,http://192.168.1.100:5173`
3. Check agent-server logs for CORS debug output
4. Remember: no wildcard '*' for security reasons

### Build Errors

**Error**: "VITE_API_URL not defined"

**Solution**: VITE_API_URL is a build-time variable:
```bash
export VITE_API_URL=http://your-server:3000
docker-compose build ui
```

**Error**: "pnpm lockfile out of date"

**Solution**:
```bash
pnpm install
docker-compose build
```

### Database Connection Issues

**Error**: "relation does not exist"

**Solution**: Run migrations:
```bash
docker-compose exec agent-server pnpm db:migrate
```

**Error**: "password authentication failed"

**Solution**: Check DATABASE_URL format:
```env
postgresql://user:password@host:port/database
```

### Streaming Not Working

**Error**: Chat messages not streaming

**Solution**:
1. Check browser console for errors
2. Verify SSE connection in Network tab
3. Check agent-server logs for streaming errors
4. Ensure LLM provider is configured correctly

### UUID Errors in Browser

**Error**: "crypto.randomUUID is not a function"

**Solution**: This happens on non-HTTPS connections. The code already includes a polyfill in `packages/ui/src/utils/uuid.ts`, but ensure you're importing from there:

```typescript
import { generateUUID } from '../utils/uuid';
// Not: crypto.randomUUID()
```

### Memory Tool Not Working

**Error**: Memory tool returns empty results

**Solution**:
1. Check database connection
2. Verify migrations ran: `docker-compose exec agent-server pnpm db:migrate`
3. Check userId is being passed correctly (see Mock Wallet component)

### LLM API Errors

**Error**: "API key not valid"

**Solution**: Verify API keys in .env:
- Gemini: Get key from https://aistudio.google.com/apikey
- OpenAI-compatible: Check your provider's documentation

**Error**: "Rate limit exceeded"

**Solution**:
- Use a less frequent model (e.g., gemini-2.5-flash instead of pro)
- Implement request throttling
- Upgrade API tier

## Additional Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Hono Documentation](https://hono.dev/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)

