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
# Skip lifecycle scripts (lefthook prepare) since dev tools aren't installed
RUN bun install --frozen-lockfile --production --ignore-scripts && \
    bun pm cache rm

# Production stage - minimal runtime image
FROM base AS runner
ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

# Set proper permissions (oven/bun image already has 'bun' user)
RUN chown -R bun:bun /app && \
    chmod -R 750 /app

# Copy only production dependencies from deps stage
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules

# Copy only essential runtime files (exclude dev tools, tests, docs)
COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun scripts/api-server ./scripts/api-server
COPY --chown=bun:bun scripts/shared ./scripts/shared
COPY --chown=bun:bun tsconfig.json ./

# Switch to non-root user
USER bun

# Expose API port (configurable via docker-compose)
EXPOSE 3001

# Note: Healthcheck is defined in docker-compose.yml for better configurability
# with environment variable support. Docker HEALTHCHECK instruction doesn't
# support variable expansion in parameters like --interval, --timeout, etc.

# Run the API server
CMD ["bun", "run", "api:server"]
