#!/bin/bash
# Real-world Notion fetch testing via API server
# Tests Notion data fetching with Docker, simulating production use
#
# Usage:
#   ./scripts/test-docker/test-fetch.sh [--all] [--max-pages N] [--dry-run]
#
# Options:
#   --all         Fetch all pages (no maxPages limit)
#   --max-pages N Limit fetch to N pages (default: 5)
#   --dry-run     Run in dry-run mode (no actual changes)
#   --no-cleanup  Leave container running after test
#
# Environment (set in .env):
#   NOTION_API_KEY, DATABASE_ID, DATA_SOURCE_ID

set -euo pipefail

# Colors for output
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Defaults
FETCH_ALL=false
MAX_PAGES=5
DRY_RUN=false
NO_CLEANUP=false
INCLUDE_REMOVED=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      FETCH_ALL=true
      shift
      ;;
    --max-pages)
      MAX_PAGES="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
    --include-removed)
      INCLUDE_REMOVED=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--all] [--max-pages N] [--dry-run] [--no-cleanup] [--include-removed]"
      echo ""
      echo "Options:"
      echo "  --all              Fetch all pages (no maxPages limit)"
      echo "  --max-pages N       Limit fetch to N pages (default: 5)"
      echo "  --dry-run          Run in dry-run mode (no actual changes)"
      echo "  --no-cleanup       Leave container running after test"
      echo "  --include-removed  Include pages with 'Remove' status"
      echo ""
      echo "Note: By default, pages with 'Remove' status are excluded."
      echo "      Use --include-removed to fetch ALL pages regardless of status."
      exit 0
      ;;
    *)
      echo -e "${YELLOW}Unknown option: $1${NC}"
      echo "Use --help for usage"
      exit 1
      ;;
  esac
done

# Verify required tools
for cmd in docker curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${YELLOW}Error: '$cmd' is required but not installed.${NC}"
    exit 1
  fi
done

# Configuration
IMAGE_NAME="comapeo-docs-api:test"
CONTAINER_NAME="comapeo-fetch-test"
API_BASE_URL="http://localhost:3001"

# Build job options using jq for reliable JSON construction
JOB_TYPE="notion:fetch-all"
JOB_OPTIONS="{}"

if [ "$DRY_RUN" = true ]; then
  JOB_OPTIONS=$(echo "$JOB_OPTIONS" | jq '. + {"dryRun": true}')
fi

if [ "$FETCH_ALL" = false ]; then
  JOB_OPTIONS=$(echo "$JOB_OPTIONS" | jq --argjson n "$MAX_PAGES" '. + {"maxPages": $n}')
fi

if [ "$INCLUDE_REMOVED" = true ]; then
  JOB_OPTIONS=$(echo "$JOB_OPTIONS" | jq '. + {"includeRemoved": true}')
fi

# Cleanup function
cleanup() {
  if [ "$NO_CLEANUP" = false ]; then
    echo -e "${BLUE}Cleaning up...${NC}"
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
  else
    echo -e "${YELLOW}Container '$CONTAINER_NAME' left running${NC}"
    echo "Stop manually: docker rm -f $CONTAINER_NAME"
  fi
}

trap cleanup EXIT INT TERM

echo -e "${BLUE}=== Notion Fetch API Test ===${NC}"
echo "Configuration:"
echo "  Job type: $JOB_TYPE"
echo "  Options: $JOB_OPTIONS"
echo "  Fetch all: $FETCH_ALL"
echo "  Include removed: $INCLUDE_REMOVED"
echo ""

# Build Docker image
echo -e "${BLUE}🔨 Building Docker image...${NC}"
docker build -t "$IMAGE_NAME" -f Dockerfile --target runner . -q

# Start container
echo -e "${BLUE}🚀 Starting API server...${NC}"

# Create directories for volume mounts
# Docker container runs as root to avoid permission issues with volume-mounted directories
mkdir -p docs static/images

# Run with volume mounts to save generated files to host
# - $(pwd)/docs:/app/docs - saves generated markdown to host
# - $(pwd)/static/images:/app/static/images - saves downloaded images to host
docker run --rm -d --user root -p 3001:3001 \
  --name "$CONTAINER_NAME" \
  --env-file .env \
  -e API_HOST=0.0.0.0 \
  -e API_PORT=3001 \
  -e DEFAULT_DOCS_PAGE=introduction \
  -v "$(pwd)/docs:/app/docs" \
  -v "$(pwd)/static/images:/app/static/images" \
  "$IMAGE_NAME"

echo -e "${BLUE}⏳ Waiting for server...${NC}"
sleep 3

# Health check
echo -e "${BLUE}✅ Health check:${NC}"
HEALTH=$(curl -s "$API_BASE_URL/health")
echo "$HEALTH" | jq '.data.status, .data.auth'

# List job types
echo -e "${BLUE}✅ Available job types:${NC}"
curl -s "$API_BASE_URL/jobs/types" | jq '.data.types[].id'

# Create job
echo -e "${BLUE}📝 Creating job ($JOB_TYPE):${NC}"
RESPONSE=$(curl -s -X POST "$API_BASE_URL/jobs" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"$JOB_TYPE\",\"options\":$JOB_OPTIONS}")

JOB_ID=$(echo "$RESPONSE" | jq -r '.data.jobId')
echo "Job created: $JOB_ID"

# Poll job status
echo -e "${BLUE}⏳ Polling job status:${NC}"
# Use longer timeout for full fetches
if [ "$FETCH_ALL" = true ]; then
  TIMEOUT=900
else
  TIMEOUT=120
fi
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(curl -s "$API_BASE_URL/jobs/$JOB_ID")
  STATE=$(echo "$STATUS" | jq -r '.data.status')
  PROGRESS=$(echo "$STATUS" | jq -r '.data.progress // empty')

  if [ "$PROGRESS" != "null" ] && [ -n "$PROGRESS" ]; then
    CURRENT=$(echo "$PROGRESS" | jq -r '.current // 0')
    TOTAL=$(echo "$PROGRESS" | jq -r '.total // 0')
    MESSAGE=$(echo "$PROGRESS" | jq -r '.message // empty')
    echo "  [$STATE] $CURRENT/$TOTAL - $MESSAGE (${ELAPSED}s/${TIMEOUT}s)"
  else
    echo "  [$STATE] Polling... (${ELAPSED}s/${TIMEOUT}s)"
  fi

  [ "$STATE" != "pending" ] && [ "$STATE" != "running" ] && break

  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

# Final status
echo -e "${BLUE}✅ Final job status:${NC}"
curl -s "$API_BASE_URL/jobs/$JOB_ID" | jq '.data | {status, result}'

# List all jobs
echo -e "${BLUE}✅ All jobs:${NC}"
curl -s "$API_BASE_URL/jobs" | jq '.data | {count, items: [.items[] | {id, type, status}]}'

echo -e "${GREEN}✅ Test complete!${NC}"

# Show generated files
echo -e "${BLUE}📁 Generated files:${NC}"
if [ -d "docs" ]; then
  DOC_COUNT=$(find docs -name "*.md" 2>/dev/null | wc -l)
  echo "  - docs/: $DOC_COUNT markdown files"
  if [ "$DOC_COUNT" -gt 0 ]; then
    echo "    Sample files:"
    find docs -name "*.md" 2>/dev/null | head -5 | sed 's|^|    |'
  fi
else
  echo "  - docs/: (empty or not created)"
fi

if [ -d "static/images" ]; then
  IMG_COUNT=$(find static/images -type f 2>/dev/null | wc -l)
  echo "  - static/images/: $IMG_COUNT image files"
else
  echo "  - static/images/: (empty or not created)"
fi

echo ""
echo "Files are saved to your host machine via Docker volume mounts."
