# ---------- builder ----------
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 1) workspace + lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./

# 2) package.json for each workspace (for dependency resolution)
COPY packages/aegis-common/package.json packages/aegis-common/
COPY packages/aegis-edge/package.json   packages/aegis-edge/

# 3) install dependencies
RUN pnpm install --frozen-lockfile

# 4) copy source
COPY packages/aegis-common/ packages/aegis-common/
COPY packages/aegis-edge/   packages/aegis-edge/

# 5) build
RUN pnpm --filter @aegis/common build && pnpm --filter @aegis/edge build

# ---------- runner ----------
FROM node:20-slim AS runner

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/aegis-common/package.json packages/aegis-common/
COPY packages/aegis-edge/package.json   packages/aegis-edge/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/aegis-common/dist packages/aegis-common/dist
COPY --from=builder /app/packages/aegis-edge/dist   packages/aegis-edge/dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "packages/aegis-edge/dist/main.js"]
