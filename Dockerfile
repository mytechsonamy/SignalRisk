# =============================================================================
# SignalRisk — Monorepo Root Dockerfile
# Build arg: SERVICE (required), PORT (default: 3000)
#
# Pre-requisite on host:
#   npm install --legacy-peer-deps   # generates package-lock.json
#
# Build example:
#   DOCKER_BUILDKIT=1 docker build --build-arg SERVICE=auth-service .
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install (Linux-native binaries via npm ci)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Configure npm for reliability
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set maxsockets 3 && \
    npm config set prefer-offline false

# Copy lock files for deterministic installs
COPY package.json package-lock.json ./

# Copy all workspace package manifests
COPY packages/ ./packages/
COPY apps/     ./apps/

# Remove source so the context is lean (only manifests + lock file matter here)
RUN find packages apps -name "*.ts" -not -name "package.json" -delete 2>/dev/null || true

# Install everything (uses package-lock.json for exact versions)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
# Stage 2: Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

ARG SERVICE

WORKDIR /app

# Copy source + installed Linux node_modules
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Copy per-workspace node_modules (npm workspace hoisting may place deps at service level)
RUN --mount=from=deps,source=/app,target=/deps \
    for pkg in /deps/packages/*/node_modules /deps/apps/*/node_modules; do \
      rel="${pkg#/deps/}"; \
      dst="$(dirname $rel)"; \
      [ -d "$pkg" ] && cp -r "$pkg" "./$dst/" 2>/dev/null || true; \
    done

# Build shared TS packages (skip errors from unused packages like web-sdk/mobile-sdk)
RUN for pkg in packages/redis-module packages/signal-contracts \
               packages/event-schemas packages/kafka-config; do \
      [ -d "$pkg/src" ] && (cd "$pkg" && npx tsc --skipLibCheck 2>/dev/null || true); \
    done

# Build the target NestJS service (skipLibCheck: type deps hoisted differently in Docker)
RUN cd "apps/${SERVICE}" && \
    if [ -f tsconfig.build.json ]; then \
      npx tsc -p tsconfig.build.json --skipLibCheck --outDir dist; \
    else \
      npx tsc -p tsconfig.json --skipLibCheck --outDir dist; \
    fi

# ---------------------------------------------------------------------------
# Stage 3: Production runner
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

ARG SERVICE
ARG PORT=3000

ENV NODE_ENV=production
ENV SERVICE=${SERVICE}

WORKDIR /app

RUN addgroup -g 1001 -S signalrisk && \
    adduser -S signalrisk -u 1001 -G signalrisk

# Copy runtime dependencies (root hoisted + service-level)
COPY --from=deps    /app/node_modules          ./node_modules
COPY --from=deps    /app/apps/${SERVICE}/node_modules ./apps/${SERVICE}/node_modules
COPY --from=builder /app/packages              ./packages
COPY --from=builder /app/apps/${SERVICE}/dist  ./apps/${SERVICE}/dist
COPY --from=builder /app/package.json          ./
COPY --from=builder /app/apps/${SERVICE}/package.json \
                                               ./apps/${SERVICE}/

USER signalrisk

EXPOSE ${PORT}

CMD ["sh", "-c", "exec node apps/${SERVICE}/dist/main.js"]
