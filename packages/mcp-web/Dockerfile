FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/mcp-web/package.json ./packages/mcp-web/

RUN pnpm install --frozen-lockfile

COPY packages/mcp-web ./packages/mcp-web

RUN pnpm --filter @agentic/mcp-web build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable pnpm

# Copy workspace configuration files
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy mcp-web built files and package.json
COPY --from=builder /app/packages/mcp-web/dist ./packages/mcp-web/dist
COPY --from=builder /app/packages/mcp-web/package.json ./packages/mcp-web/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @agentic/mcp-web

WORKDIR /app/packages/mcp-web
EXPOSE 3002
CMD ["node", "dist/server.js"]
