# =============================================================================
# SignalRisk — Monorepo Root Dockerfile
# Build arg: SERVICE (required), PORT (default: 3000)
#
# Strategy: tsc --skipLibCheck + tsc-alias (resolves @/* path aliases)
# Pre-requisite: npm install --legacy-peer-deps on host (generates lock file)
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
    npm config set maxsockets 3

# Copy lock files for deterministic installs
COPY package.json package-lock.json ./

# Copy all workspace package manifests (source removed below, only manifests matter)
COPY packages/ ./packages/
COPY apps/     ./apps/

# Remove source files — only package.json + lock file matter for npm ci
RUN find packages apps -name "*.ts" -delete 2>/dev/null || true

# Install everything (uses package-lock.json for exact versions)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
# Stage 2: Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

ARG SERVICE

WORKDIR /app

# Install tsc-alias for resolving @/* path aliases in compiled output
RUN npm install -g tsc-alias

# Copy source + installed Linux node_modules (root hoisted)
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Copy app-level node_modules. Shared packages should resolve against hoisted
# root dependencies to avoid duplicate type trees during package compilation.
RUN --mount=from=deps,source=/app,target=/deps \
    for pkg in /deps/apps/*/node_modules; do \
      rel="${pkg#/deps/}"; \
      dst="$(dirname $rel)"; \
      [ -d "$pkg" ] && cp -r "$pkg" "./$dst/" 2>/dev/null || true; \
    done

# Build shared TS packages (skip errors from unused packages)
RUN for pkg in packages/redis-module packages/signal-contracts \
               packages/event-schemas packages/kafka-config \
               packages/kafka-health; do \
      [ -d "$pkg/src" ] && (cd "$pkg" && npx tsc --skipLibCheck 2>/dev/null || true); \
    done

# Build the target service: tsc (compile) + tsc-alias (resolve @/* paths)
RUN cd "apps/${SERVICE}" && \
    if [ -f tsconfig.build.json ]; then \
      npx tsc -p tsconfig.build.json --skipLibCheck && \
      tsc-alias -p tsconfig.build.json; \
    else \
      npx tsc -p tsconfig.json --skipLibCheck && \
      tsc-alias -p tsconfig.json; \
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
# Shared packages (built .js files needed at runtime)
COPY --from=builder /app/packages              ./packages
# Compiled service
COPY --from=builder /app/apps/${SERVICE}/dist  ./apps/${SERVICE}/dist
COPY --from=builder /app/package.json          ./
COPY --from=builder /app/apps/${SERVICE}/package.json \
                                               ./apps/${SERVICE}/

USER signalrisk

EXPOSE ${PORT}

CMD ["sh", "-c", "exec node apps/${SERVICE}/dist/main.js"]
