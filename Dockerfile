# =============================================================================
# SignalRisk — Optimized Monorepo Dockerfile
# Build arg: SERVICE (required), PORT (default: 3000)
#
# Strategy:
#   Stage 1 (deps)        — npm ci, cached until package*.json changes
#   Stage 2 (pkg-builder) — build shared packages, cached until packages/ changes
#   Stage 3 (builder)     — build ONLY the target service (~20-30s)
#   Stage 4 (runner)      — minimal production image
#
# Build example:
#   docker compose -f docker-compose.full.yml build auth-service
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install all workspace dependencies (shared across all services)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set maxsockets 3

COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY apps/     ./apps/

# Remove source files — only package.json + lock file matter for npm ci
RUN find packages apps -name "*.ts" -delete 2>/dev/null || true

RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
# Stage 2: Build shared TS packages (shared across all services)
# Cached until packages/ source changes — NOT invalidated by app changes.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS pkg-builder

WORKDIR /app

RUN npm install -g tsc-alias

# Copy root node_modules (hoisted deps)
COPY --from=deps /app/node_modules ./node_modules

# Copy package source + their node_modules
COPY packages/ ./packages/
RUN --mount=from=deps,source=/app,target=/deps \
    for pkg in /deps/packages/*/node_modules; do \
      [ -d "$pkg" ] || continue; \
      dst="./packages/$(basename $(dirname $pkg))/node_modules"; \
      cp -r "$pkg" "$dst" 2>/dev/null || true; \
    done

# Build shared packages once
RUN for pkg in packages/redis-module packages/signal-contracts \
               packages/event-schemas packages/kafka-config \
               packages/kafka-health; do \
      [ -d "$pkg/src" ] && (cd "$pkg" && npx tsc --skipLibCheck 2>/dev/null || true); \
    done

# ---------------------------------------------------------------------------
# Stage 3: Build ONLY the target service (fast — just tsc for one service)
# ---------------------------------------------------------------------------
FROM pkg-builder AS builder

ARG SERVICE

# Copy root package.json (needed for workspace resolution)
COPY package.json ./

# Copy only this service's source (NOT all apps/)
COPY apps/${SERVICE}/ ./apps/${SERVICE}/

# Copy only this service's node_modules from deps
RUN --mount=from=deps,source=/app,target=/deps \
    if [ -d "/deps/apps/${SERVICE}/node_modules" ]; then \
      cp -r "/deps/apps/${SERVICE}/node_modules" "./apps/${SERVICE}/"; \
    fi

# Compile: tsc + tsc-alias
RUN cd "apps/${SERVICE}" && \
    if [ -f tsconfig.build.json ]; then \
      npx tsc -p tsconfig.build.json --skipLibCheck && \
      tsc-alias -p tsconfig.build.json; \
    else \
      npx tsc -p tsconfig.json --skipLibCheck && \
      tsc-alias -p tsconfig.json; \
    fi

# ---------------------------------------------------------------------------
# Stage 4: Minimal production runner
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

ARG SERVICE
ARG PORT=3000

ENV NODE_ENV=production
ENV SERVICE=${SERVICE}

WORKDIR /app

RUN addgroup -g 1001 -S signalrisk && \
    adduser -S signalrisk -u 1001 -G signalrisk

# Runtime dependencies
COPY --from=deps    /app/node_modules                    ./node_modules
COPY --from=deps    /app/apps/${SERVICE}/node_modules     ./apps/${SERVICE}/node_modules

# Shared packages (built .js + their runtime deps)
COPY --from=builder /app/packages                         ./packages

# Compiled service
COPY --from=builder /app/apps/${SERVICE}/dist             ./apps/${SERVICE}/dist
COPY --from=builder /app/package.json                     ./
COPY --from=builder /app/apps/${SERVICE}/package.json     ./apps/${SERVICE}/

USER signalrisk

EXPOSE ${PORT}

CMD ["sh", "-c", "exec node apps/${SERVICE}/dist/main.js"]
