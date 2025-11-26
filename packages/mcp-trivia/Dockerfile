FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/mcp-trivia/package.json ./packages/mcp-trivia/

RUN pnpm install --frozen-lockfile

COPY packages/mcp-trivia ./packages/mcp-trivia

RUN pnpm --filter @agentic/mcp-trivia build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable pnpm

# Copy workspace configuration files
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy mcp-trivia built files and package.json
COPY --from=builder /app/packages/mcp-trivia/dist ./packages/mcp-trivia/dist
COPY --from=builder /app/packages/mcp-trivia/package.json ./packages/mcp-trivia/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @agentic/mcp-trivia

WORKDIR /app/packages/mcp-trivia
EXPOSE 3001
CMD ["node", "dist/server.js"]
