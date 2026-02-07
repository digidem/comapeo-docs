# Dockerfile for Comapeo Docs API Service
# Multi-stage build for optimal image size and security

# Use BuildKit syntax for cache mounting and multi-platform support
# syntax=docker/dockerfile:1.6

# Build arguments for configurability
ARG BUN_VERSION=1
ARG NODE_ENV=production

FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

# Install only production dependencies (no devDependencies)
FROM base AS deps
COPY package.json bun.lockb* ./
# Use --frozen-lockfile for reproducible builds
RUN bun install --frozen-lockfile --production && \
    bun pm cache rm

# Production stage - minimal runtime image
FROM base AS runner
ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

# Create non-root user for security (run as unprivileged user)
RUN addgroup --system --gid 1001 bun && \
    adduser --system --uid 1001 --ingroup bun bun && \
    chmod -R 750 /app

# Copy only production dependencies from deps stage
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules

# Copy only essential runtime files (exclude dev tools, tests, docs)
COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun scripts/api-server ./scripts/api-server
COPY --chown=bun:bun scripts/shared ./scripts/shared 2>/dev/null || true
COPY --chown=bun:bun tsconfig.json ./

# Switch to non-root user
USER bun

# Expose API port (configurable via docker-compose)
EXPOSE 3001

# Health check with configurable interval via build arg
ARG HEALTHCHECK_INTERVAL=30s
ARG HEALTHCHECK_TIMEOUT=10s
ARG HEALTHCHECK_START_PERIOD=5s
ARG HEALTHCHECK_RETRIES=3
HEALTHCHECK --interval=${HEALTHCHECK_INTERVAL} --timeout=${HEALTHCHECK_TIMEOUT} --start-period=${HEALTHCHECK_START_PERIOD} --retries=${HEALTHCHECK_RETRIES} \
    CMD bun --silent -e "fetch('http://localhost:3001/health').then(r => r.ok ? 0 : 1)" || exit 1

# Run the API server
CMD ["bun", "run", "api:server"]
