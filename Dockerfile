# Dockerfile for Comapeo Docs API Service
# Multi-stage build for optimal image size and security

# Use BuildKit syntax for cache mounting and multi-platform support
# syntax=docker/dockerfile:1.6

# Build arguments for configurability
ARG BUN_VERSION=1
ARG NODE_ENV=production

FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

# Install all dependencies needed for production
FROM base AS deps
COPY package.json bun.lockb* ./
# Use --frozen-lockfile for reproducible builds
# Skip lifecycle scripts (lefthook prepare) since dev tools aren't installed
# Install all dependencies (not just production) since notion-fetch needs dotenv
RUN bun install --frozen-lockfile --ignore-scripts && \
    bun pm cache rm

# Production stage - minimal runtime image
FROM base AS runner
ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

# Install system dependencies for image processing and privilege escalation
# pngquant: PNG optimization (used by imagemin-pngquant)
# libjpeg-turbo-progs: JPEG optimization, provides /usr/bin/jpegtran (used by imagemin-jpegtran)
# gosu: run commands as root while preserving the USER setting
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates pngquant libjpeg-turbo-progs gosu && \
    rm -rf /var/lib/apt/lists/*

# Set proper permissions (oven/bun image already has 'bun' user)
RUN chown -R bun:bun /app && \
    chmod -R 750 /app

# Copy only production dependencies from deps stage
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules

# Create symlinks from system binaries to expected npm package paths
# The imageCompressor uses pngquant-bin and jpegtran-bin packages which expect
# binaries at these paths. These MUST be after the node_modules COPY to avoid
# being overwritten.
RUN mkdir -p /app/node_modules/pngquant-bin/vendor && \
    ln -sf /usr/bin/pngquant /app/node_modules/pngquant-bin/vendor/pngquant && \
    mkdir -p /app/node_modules/jpegtran-bin/vendor && \
    ln -sf /usr/bin/jpegtran /app/node_modules/jpegtran-bin/vendor/jpegtran

# Copy only essential runtime files (exclude dev tools, tests, docs)
COPY --chown=bun:bun package.json bun.lockb* ./
# Copy entire scripts directory for job execution (all dependencies included)
COPY --chown=bun:bun scripts ./scripts
# Copy config files needed by scripts
COPY --chown=bun:bun docusaurus.config.ts ./docusaurus.config.ts
COPY --chown=bun:bun tsconfig.json ./
# Copy client modules needed by docusaurus.config.ts
COPY --chown=bun:bun src/client ./src/client

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh


ENTRYPOINT ["/docker-entrypoint.sh"]

# Expose API port (configurable via docker-compose)
EXPOSE 3001

# Note: Healthcheck is defined in docker-compose.yml for better configurability
# with environment variable support. Docker HEALTHCHECK instruction doesn't
# support variable expansion in parameters like --interval, --timeout, etc.

# Run the API server
CMD ["bun", "run", "api:server"]
