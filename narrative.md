Let's build an agentic chatbot application. UI layer is a web-based chatbot - usual chat window in a web page, there are some other components in this page like crypto wallet which provides user's identity, and perhaps some buttons to select an activity what we use to identify what the user wants to do, so that the chatbot can hold the hand while steering user towards the goal. Chat window might return images (ie, user wants to buy something and then agent gets an image from a tool or MCP server). Or multiple choice questions; or present a confirmation data for crypto payment (executed fully by the wallet at this page but it is implemented separately).

This page may be styled based on chosen 'activity'.

We'll base the first user prompt and tool/MCP list based on the chosen activity.

Backend is the 'agent' which executes its LLM loop and calls available tools. Let's make the LLM choice open, we choose it based on economics and the chosen activity.

Tools are packaged as MCP agents, but we might add local tools if optimal. System prompt depends on chosen activity, and we might return text immediately to greet the user and steer towards right questions and to present available options.

MCP servers are implemented separately. Some might activate crypto payments which will be confirmed by the wallet running in the same web page, but it is separate task.

Example activity might be sports betting. There is MCP returning services like topics, races next 12 hours, statistics etc. , and then to place a bet and claim winnings. Probably we'll do different stuff and it can be configured by prompting and available tool/MCP set. One useful tool is per-user history, so that user's previous sessions and actions are remembered and used to provide more personalized experience.

We need to create a modern, idiomatic, and security-ready architecture, implement tools and libraries and services and base language. Language of choice is typescript, but we're not stuck with it on good reasons, or just because the world prefers to use something different.

Let's work by layers:

1. ui (chatbot interface web component), keep the ui simple for user but customizable with code;

2. agent loop; a server-side component

  - basic tools (e.g. user specific memory), at least at example or wireframe level to use as basis for building other tools

  - basic MCP connectivity for the agent loop

  - configuration for the agent loop: like prompts, tools, chat templates, LLM connection details, etc.

3. example MCP server (remote)

We want to reach a working POC with rather trivial activity (e.g. sports betting or a trivia game)

-----------
- ignore the wallet, it is a custom development we'll fill in later. A mockup is even better.
- Target is traditional: docker containers etc on our own dedicated server.
- LLM Priorities: external own LLM accessible over OpenAI compatible protocol, Google. (gemini flash.latest is the default choice). Streaming is required for best UX.
- Wallet will provide ID; we can mock it initially.
- Let's assume for generality that there can be multiple remote MCP servers.
- Trivia game is okay, when we have all components populated (package the game as MCP)
- Until user resets his browser local storage; memory is per activity (agent has same personality, but activities are different)
- Keep the chat UI simple. Point is that if we are based on existing component then it should not have too much user exposed complexity.

-------
## Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **UI** | React 18 + TypeScript + Vite + Tailwind | Minimal deps |
| **UI State** | Zustand + localStorage | Chat persisted client-side |
| **Agent Server** | Node.js 20 + Hono | Lightweight, SSE-native |
| **LLM SDK** | Vercel AI SDK (`ai`) | Supports Gemini + OpenAI-compatible |
| **MCP Client** | `@modelcontextprotocol/sdk` | Official SDK |
| **Database** | PostgreSQL + Drizzle ORM | User memory only |
| **MCP Servers** | Node.js + MCP SDK | HTTP/SSE transport |
| **Deployment** | Docker Compose | All services |
| **Monorepo** | pnpm workspaces | Shared types |
