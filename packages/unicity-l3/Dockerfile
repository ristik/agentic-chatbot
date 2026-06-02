FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/unicity-l3/package.json ./packages/unicity-l3/

RUN pnpm install --frozen-lockfile --filter @agentic/unicity-l3...

COPY packages/unicity-l3 ./packages/unicity-l3
RUN pnpm --filter @agentic/unicity-l3 build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm

COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

COPY --from=builder /app/packages/unicity-l3/dist ./packages/unicity-l3/dist
COPY --from=builder /app/packages/unicity-l3/package.json ./packages/unicity-l3/package.json

RUN pnpm install --frozen-lockfile --prod --filter @agentic/unicity-l3...

WORKDIR /app/packages/unicity-l3
CMD ["pnpm", "start"]
