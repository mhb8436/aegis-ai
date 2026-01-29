# ---------- builder ----------
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 1) workspace + lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./

# 2) package.json for each workspace
COPY packages/aegis-common/package.json  packages/aegis-common/
COPY packages/aegis-console/package.json packages/aegis-console/

# 3) install dependencies
RUN pnpm install --frozen-lockfile

# 4) copy source
COPY packages/aegis-common/  packages/aegis-common/
COPY packages/aegis-console/ packages/aegis-console/

# 5) build (common first, then console via vite)
RUN pnpm --filter @aegis/common build && pnpm --filter @aegis/console build

# ---------- runner ----------
FROM nginx:1.25-alpine AS runner

COPY --from=builder /app/packages/aegis-console/dist /usr/share/nginx/html
COPY packages/aegis-console/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
