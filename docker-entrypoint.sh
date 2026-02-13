#!/bin/bash
set -e

# Fix permissions on the mounted volume (run as root)
if [ -d "/app/workspace" ]; then
    chown -R bun:bun /app/workspace 2>/dev/null || true
fi

# Fix git safe.directory for the workspace (needed in Docker)
git config --global --add safe.directory /app/workspace/repo 2>/dev/null || true

# Switch to bun user and exec the command
exec gosu bun "$@"
