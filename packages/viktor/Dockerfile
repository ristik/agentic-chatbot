FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/sphere-bot/package.json ./packages/sphere-bot/
COPY packages/viktor/package.json ./packages/viktor/

RUN pnpm install --frozen-lockfile

COPY packages/sphere-bot ./packages/sphere-bot
RUN pnpm --filter @agentic/sphere-bot build

COPY packages/viktor ./packages/viktor
RUN pnpm --filter @agentic/viktor build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm

# Copy workspace configuration files
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy sphere-bot built files
COPY --from=builder /app/packages/sphere-bot/dist ./packages/sphere-bot/dist
COPY --from=builder /app/packages/sphere-bot/package.json ./packages/sphere-bot/package.json

# Copy viktor built files
COPY --from=builder /app/packages/viktor/dist ./packages/viktor/dist
COPY --from=builder /app/packages/viktor/package.json ./packages/viktor/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @agentic/viktor...

WORKDIR /app/packages/viktor
CMD ["pnpm", "start"]
