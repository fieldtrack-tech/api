# Build context: monorepo root (docker build -f apps/api/Dockerfile .)
# ---- Stage 1: Build ----
FROM node:24-alpine AS builder

WORKDIR /workspace

# Install API dependencies first (for layer caching)
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
WORKDIR /workspace/apps/api
RUN npm ci

# Copy shared types source and compile to .d.ts using api's TypeScript install.
# dist/ is gitignored so it must be generated here.
WORKDIR /workspace
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY packages/types/src/ ./packages/types/src/
RUN apps/api/node_modules/.bin/tsc -p packages/types/tsconfig.json

WORKDIR /workspace/apps/api
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src

RUN npm run build

# ---- Stage 2: Production ----
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /workspace/apps/api/dist ./dist

# Phase 11: curl required for Docker HEALTHCHECK
RUN apk add --no-cache curl

EXPOSE 3000

# Phase 11: Docker healthcheck — probes /health every 30s.
# start-period gives the Node process time to connect to Redis and boot.
# CI/CD pipelines and orchestrators (ECS, Kubernetes) use this to gate traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER node

CMD ["node", "dist/server.js"]
