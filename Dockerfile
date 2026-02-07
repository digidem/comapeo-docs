# Dockerfile for Comapeo Docs API Service
# Multi-stage build for optimal image size

FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies stage
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Builder stage (for TypeScript compilation if needed)
FROM base AS builder
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .
# No compilation needed - Bun runs TypeScript directly

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 bun && \
    adduser --system --uid 1001 --ingroup bun bun

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY --chown=bun . .

# Switch to non-root user
USER bun

# Expose API port
EXPOSE 3001

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --silent -e "fetch('http://localhost:3001/health').then(r => r.ok ? 0 : 1)" || exit 1

# Run the API server
CMD ["bun", "run", "api:server"]
