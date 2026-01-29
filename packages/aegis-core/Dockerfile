# ---------- builder ----------
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 1) workspace + lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./

# 2) package.json for each workspace
COPY packages/aegis-common/package.json packages/aegis-common/
COPY packages/aegis-core/package.json   packages/aegis-core/

# 3) install dependencies
RUN pnpm install --frozen-lockfile

# 4) copy source
COPY packages/aegis-common/ packages/aegis-common/
COPY packages/aegis-core/   packages/aegis-core/

# 5) build
RUN pnpm --filter @aegis/common build && pnpm --filter @aegis/core build

# ---------- runner ----------
FROM node:20-slim AS runner

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/aegis-common/package.json packages/aegis-common/
COPY packages/aegis-core/package.json   packages/aegis-core/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/aegis-common/dist packages/aegis-common/dist
COPY --from=builder /app/packages/aegis-core/dist   packages/aegis-core/dist

# Policy YAML rules are needed at runtime
COPY packages/aegis-core/src/policy/rules/ packages/aegis-core/dist/policy/rules/

ENV NODE_ENV=production
EXPOSE 8081

CMD ["node", "packages/aegis-core/dist/main.js"]
