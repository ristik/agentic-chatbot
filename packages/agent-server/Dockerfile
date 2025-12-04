FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-server/package.json ./packages/agent-server/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/agent-server ./packages/agent-server

RUN pnpm --filter @agentic/shared build
RUN pnpm --filter @agentic/agent-server build
RUN pnpm --filter @agentic/agent-server db:generate

FROM node:20-alpine
WORKDIR /app
RUN corepack enable pnpm

# Copy workspace configuration files
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy shared package (built files)
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

# Copy agent-server built files, migrations, and package.json
COPY --from=builder /app/packages/agent-server/dist ./packages/agent-server/dist
COPY --from=builder /app/packages/agent-server/package.json ./packages/agent-server/package.json

# Install production dependencies only
# Use --filter with ... to include workspace dependencies
RUN pnpm install --frozen-lockfile --prod --filter @agentic/agent-server...

WORKDIR /app/packages/agent-server
EXPOSE 3000
CMD ["pnpm", "start"]
