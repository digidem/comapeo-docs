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

# Count validation variables (populated by get_expected_page_count)
EXPECTED_TOTAL=""
EXPECTED_PARENTS=""
EXPECTED_SUBPAGES=""
EXPECTED_BY_STATUS=""
EXPECTED_DOCS=""
COUNT_VALIDATION_AVAILABLE=false

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
      echo "The test validates that the number of generated markdown files"
      echo "matches the expected count from Notion (queried before fetching)."
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
API_PORT="3001"
REPO_ROOT="$(pwd -P)"
DOCS_DIR="$REPO_ROOT/docs"
STATIC_IMAGES_DIR="$REPO_ROOT/static/images"
DOCKER_USER="${TEST_DOCKER_USER:-$(id -u):$(id -g)}"

is_non_negative_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

check_port_available() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :$port )" | grep -q ":$port"; then
      echo -e "${YELLOW}Error: port $port is already in use.${NC}"
      return 1
    fi
    return 0
  fi

  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP -sTCP:LISTEN -P -n | grep -q ":$port"; then
      echo -e "${YELLOW}Error: port $port is already in use.${NC}"
      return 1
    fi
  fi

  return 0
}

api_request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local tmp
  tmp=$(mktemp)

  local status
  if [ -n "$body" ]; then
    status=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$body")
  else
    status=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url")
  fi

  local response
  response=$(cat "$tmp")
  rm -f "$tmp"

  if [[ ! "$status" =~ ^2 ]]; then
    echo -e "${YELLOW}API request failed: $method $url (HTTP $status)${NC}" >&2
    echo "$response" >&2
    return 1
  fi

  echo "$response"
}

wait_for_server() {
  local attempts=0
  local max_attempts=8
  local delay=1

  while [ "$attempts" -lt "$max_attempts" ]; do
    if HEALTH_RESPONSE=$(api_request "GET" "$API_BASE_URL/health"); then
      if echo "$HEALTH_RESPONSE" | jq -e '.data.status == "healthy"' >/dev/null 2>&1; then
        echo "$HEALTH_RESPONSE"
        return 0
      fi
    fi

    attempts=$((attempts + 1))
    sleep "$delay"
    if [ "$delay" -lt 8 ]; then
      delay=$((delay * 2))
    fi
  done

  echo -e "${YELLOW}Error: API server did not become healthy in time.${NC}" >&2
  return 1
}

cancel_job() {
  local job_id="$1"
  if [ -z "$job_id" ] || [ "$job_id" = "null" ]; then
    return 0
  fi

  api_request "DELETE" "$API_BASE_URL/jobs/$job_id" >/dev/null || true
}

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

# Get expected page count from Notion via count-pages job
get_expected_page_count() {
  echo -e "${BLUE}📊 Querying expected page count from Notion...${NC}"

  # Build count job options - same filters as the fetch job
  # but without maxPages (we want the total available)
  local COUNT_OPTIONS="{}"
  if [ "$INCLUDE_REMOVED" = true ]; then
    COUNT_OPTIONS=$(echo "$COUNT_OPTIONS" | jq '. + {"includeRemoved": true}')
  fi
  # Create count-pages job
  local COUNT_RESPONSE
  local COUNT_PAYLOAD
  COUNT_PAYLOAD=$(jq -cn --argjson options "$COUNT_OPTIONS" '{type:"notion:count-pages", options:$options}')
  COUNT_RESPONSE=$(api_request "POST" "$API_BASE_URL/jobs" "$COUNT_PAYLOAD") || return 1

  local COUNT_JOB_ID
  COUNT_JOB_ID=$(echo "$COUNT_RESPONSE" | jq -r '.data.jobId')

  if [ "$COUNT_JOB_ID" = "null" ] || [ -z "$COUNT_JOB_ID" ]; then
    echo -e "${YELLOW}⚠️  Failed to create count job. Skipping count validation.${NC}"
    echo "$COUNT_RESPONSE" | jq '.' 2>/dev/null || echo "$COUNT_RESPONSE"
    return 1
  fi

  echo "  Count job created: $COUNT_JOB_ID"

  # Poll for completion (count should be fast, 120s timeout)
  local COUNT_ELAPSED=0
  local COUNT_TIMEOUT=120
  while [ $COUNT_ELAPSED -lt $COUNT_TIMEOUT ]; do
    local COUNT_STATUS
    COUNT_STATUS=$(api_request "GET" "$API_BASE_URL/jobs/$COUNT_JOB_ID") || return 1
    local COUNT_STATE
    COUNT_STATE=$(echo "$COUNT_STATUS" | jq -r '.data.status')

    [ "$COUNT_STATE" != "pending" ] && [ "$COUNT_STATE" != "running" ] && break

    sleep 2
    COUNT_ELAPSED=$((COUNT_ELAPSED + 2))
    echo "  [count] $COUNT_STATE... (${COUNT_ELAPSED}s/${COUNT_TIMEOUT}s)"
  done

  # Extract result
  local COUNT_RESULT
  COUNT_RESULT=$(api_request "GET" "$API_BASE_URL/jobs/$COUNT_JOB_ID") || return 1
  local COUNT_STATE
  COUNT_STATE=$(echo "$COUNT_RESULT" | jq -r '.data.status')

  if [ "$COUNT_STATE" != "completed" ]; then
    if [ "$COUNT_STATE" = "pending" ] || [ "$COUNT_STATE" = "running" ]; then
      cancel_job "$COUNT_JOB_ID"
    fi
    echo -e "${YELLOW}⚠️  Count job did not complete (status: $COUNT_STATE). Skipping validation.${NC}"
    return 1
  fi

  # The job output contains the JSON from our count script
  # Extract it from the job result's output field (last JSON line)
  local JOB_OUTPUT
  JOB_OUTPUT=$(echo "$COUNT_RESULT" | jq -r '.data.result.data.output // .data.result.output // empty')

  if [ -z "$JOB_OUTPUT" ]; then
    echo -e "${YELLOW}⚠️  Count job produced no output. Skipping validation.${NC}"
    return 1
  fi

  # Parse the last JSON line from the output (our script's stdout)
  local COUNT_JSON
  COUNT_JSON=$(echo "$JOB_OUTPUT" | jq -Rs 'split("\n") | map(select(length > 0) | try fromjson catch empty) | map(select(type=="object" and has("total"))) | last // empty')

  if [ -z "$COUNT_JSON" ]; then
    echo -e "${YELLOW}⚠️  Could not parse count result from job output. Skipping validation.${NC}"
    echo "  Raw output (last 5 lines):"
    echo "$JOB_OUTPUT" | tail -5 | sed 's/^/    /'
    return 1
  fi

  EXPECTED_TOTAL=$(echo "$COUNT_JSON" | jq -r '.total')
  EXPECTED_PARENTS=$(echo "$COUNT_JSON" | jq -r '.parents')
  EXPECTED_SUBPAGES=$(echo "$COUNT_JSON" | jq -r '.subPages')
  EXPECTED_BY_STATUS=$(echo "$COUNT_JSON" | jq -r '.byStatus')
  EXPECTED_DOCS=$(echo "$COUNT_JSON" | jq -r '.expectedDocs // empty')

  echo -e "${GREEN}📊 Expected page count:${NC}"
  echo "  Total Notion pages (parents + sub-pages, after filtering): $EXPECTED_TOTAL"
  echo "  Parents: $EXPECTED_PARENTS"
  echo "  Sub-pages: $EXPECTED_SUBPAGES"
  if [ -n "$EXPECTED_DOCS" ] && [ "$EXPECTED_DOCS" != "null" ]; then
    echo "  Expected English markdown files (elementType=Page): $EXPECTED_DOCS"
  fi
  echo "  By status:"
  echo "$EXPECTED_BY_STATUS" | jq -r 'to_entries[] | "    \(.key): \(.value)"'

  return 0
}

# Validate fetched page count against expected count
# NOTE: The count-pages script returns unique page count (not multiplied by languages).
# The fetch pipeline generates files in docs/ (en), i18n/pt/, i18n/es/.
# We compare against docs/ (English) count since that represents unique pages.
# Now uses expectedDocs field (elementType=Page count) instead of total (all pages).
validate_page_count() {
  local EXPECTED="$1"

  # Count actual English markdown files generated (docs/ only)
  # The pipeline also generates i18n/pt/ and i18n/es/ but those are translations
  # of the same unique pages, so we compare against English count only.
  local ACTUAL=0
  if [ -d "docs" ]; then
    ACTUAL=$(find "docs" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi

  echo ""
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo -e "${BLUE}  PAGE COUNT VALIDATION${NC}"
  echo -e "${BLUE}═══════════════════════════════════════${NC}"

  # Use expectedDocs if available (represents actual markdown files), otherwise fall back to total
  local COMPARISON_VALUE="$EXPECTED"
  if [ -n "$EXPECTED_DOCS" ] && [ "$EXPECTED_DOCS" != "null" ] && [ "$EXPECTED_DOCS" != "0" ]; then
    COMPARISON_VALUE="$EXPECTED_DOCS"
    echo "  Total Notion pages (all types): $EXPECTED_TOTAL"
    echo "  Expected markdown files (elementType=Page): $EXPECTED_DOCS"
    echo "  Actual markdown files: $ACTUAL"
  else
    # Fallback to old behavior if expectedDocs not available
    echo "  Expected pages (fallback to total): $EXPECTED"
    echo "  Actual markdown files: $ACTUAL"
    echo "  (Note: expectedDocs field not available, using total)"
  fi

  # For --max-pages N, expected count is min(N, comparison_value)
  if [ "$FETCH_ALL" = false ] && [ -n "$COMPARISON_VALUE" ]; then
    local EFFECTIVE_EXPECTED
    if ! is_non_negative_integer "$MAX_PAGES" || ! is_non_negative_integer "$COMPARISON_VALUE"; then
      echo -e "${YELLOW}  ❌ FAIL: Non-numeric value in page-count comparison${NC}"
      return 1
    fi

    if [ "$MAX_PAGES" -lt "$COMPARISON_VALUE" ]; then
      EFFECTIVE_EXPECTED="$MAX_PAGES"
      echo "  (--max-pages $MAX_PAGES limits expected to $EFFECTIVE_EXPECTED)"
    else
      EFFECTIVE_EXPECTED="$COMPARISON_VALUE"
    fi
    COMPARISON_VALUE="$EFFECTIVE_EXPECTED"
    echo "  Adjusted expected: $COMPARISON_VALUE"
  fi

  if [ "$ACTUAL" -eq "$COMPARISON_VALUE" ]; then
    echo -e "${GREEN}  ✅ PASS: Page counts match!${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    return 0
  else
    local DIFF=$((COMPARISON_VALUE - ACTUAL))
    echo -e "${YELLOW}  ❌ FAIL: Page count mismatch (off by $DIFF)${NC}"
    echo ""
    echo "  Diagnostics:"
    echo "    - Total Notion pages (all types): $EXPECTED_TOTAL"
    if [ -n "$EXPECTED_DOCS" ] && [ "$EXPECTED_DOCS" != "null" ]; then
      echo "    - Expected markdown files (elementType=Page): $EXPECTED_DOCS"
    fi
    echo "    - Parent pages: $EXPECTED_PARENTS"
    echo "    - Sub-pages: $EXPECTED_SUBPAGES"
    echo "    - Fetch mode: $([ "$FETCH_ALL" = true ] && echo '--all' || echo "--max-pages $MAX_PAGES")"
    echo "    - Include removed: $INCLUDE_REMOVED"
    if [ "$ACTUAL" -lt "$COMPARISON_VALUE" ]; then
      echo ""
      echo "  Possible causes:"
      echo "    - Notion API pagination may have stalled (check for anomaly warnings in logs)"
      echo "    - Sub-page fetch may have timed out (check for 'Skipping sub-page' warnings)"
      echo "    - Status filtering may be more aggressive than expected"
      echo "    - Element type filtering (only 'Page' types generate markdown)"
      echo ""
      echo "  To debug, re-run with --no-cleanup and check container logs:"
      echo "    docker logs comapeo-fetch-test 2>&1 | grep -E '(DEBUG|anomaly|Skipping|Status Summary)'"
    fi
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    return 1
  fi
}

echo -e "${BLUE}=== Notion Fetch API Test ===${NC}"
echo "Configuration:"
echo "  Job type: $JOB_TYPE"
echo "  Options: $JOB_OPTIONS"
echo "  Fetch all: $FETCH_ALL"
echo "  Include removed: $INCLUDE_REMOVED"
echo ""

# Build Docker image
echo -e "${BLUE}🔨 Building Docker image...${NC}"
if ! docker build -t "$IMAGE_NAME" -f Dockerfile --target runner . -q; then
  echo -e "${YELLOW}Docker build failed.${NC}"
  exit 1
fi

# Start container
echo -e "${BLUE}🚀 Starting API server...${NC}"

if ! check_port_available "$API_PORT"; then
  exit 1
fi

# Create directories for volume mounts
if ! mkdir -p "$DOCS_DIR" "$STATIC_IMAGES_DIR"; then
  echo -e "${YELLOW}Failed to create output directories.${NC}"
  exit 1
fi

# Run with volume mounts to save generated files to host
# - $DOCS_DIR:/app/docs - saves generated markdown to host
# - $STATIC_IMAGES_DIR:/app/static/images - saves downloaded images to host
docker run --rm -d --user "$DOCKER_USER" -p "$API_PORT:3001" \
  --name "$CONTAINER_NAME" \
  --env-file .env \
  -e API_HOST=0.0.0.0 \
  -e API_PORT=3001 \
  -e DEFAULT_DOCS_PAGE=introduction \
  -v "$DOCS_DIR:/app/docs" \
  -v "$STATIC_IMAGES_DIR:/app/static/images" \
  "$IMAGE_NAME"

echo -e "${BLUE}⏳ Waiting for server...${NC}"
HEALTH=$(wait_for_server)

# Health check
echo -e "${BLUE}✅ Health check:${NC}"
echo "$HEALTH" | jq '.data.status, .data.auth'

# List job types
echo -e "${BLUE}✅ Available job types:${NC}"
JOB_TYPES=$(api_request "GET" "$API_BASE_URL/jobs/types")
echo "$JOB_TYPES" | jq '.data.types[].id'

# Get expected page count (before fetch)
if get_expected_page_count; then
  COUNT_VALIDATION_AVAILABLE=true
else
  echo -e "${YELLOW}⚠️  Count validation will be skipped${NC}"
fi

# Create job
echo -e "${BLUE}📝 Creating job ($JOB_TYPE):${NC}"
JOB_PAYLOAD=$(jq -cn --arg jobType "$JOB_TYPE" --argjson options "$JOB_OPTIONS" '{type:$jobType, options:$options}')
RESPONSE=$(api_request "POST" "$API_BASE_URL/jobs" "$JOB_PAYLOAD")

JOB_ID=$(echo "$RESPONSE" | jq -r '.data.jobId')
echo "Job created: $JOB_ID"

# Poll job status
echo -e "${BLUE}⏳ Polling job status:${NC}"
# Use longer timeout for full fetches
if [ "$FETCH_ALL" = true ]; then
  TIMEOUT=3600
else
  TIMEOUT=120
fi
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(api_request "GET" "$API_BASE_URL/jobs/$JOB_ID")
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

if [ "$ELAPSED" -ge "$TIMEOUT" ] && [ "$STATE" = "running" -o "$STATE" = "pending" ]; then
  echo -e "${YELLOW}Timeout reached; cancelling job $JOB_ID...${NC}"
  cancel_job "$JOB_ID"
fi

# Final status
echo -e "${BLUE}✅ Final job status:${NC}"
FINAL_STATUS=$(api_request "GET" "$API_BASE_URL/jobs/$JOB_ID")
echo "$FINAL_STATUS" | jq '.data | {status, result}'

# Extract final state for validation
STATE=$(echo "$FINAL_STATUS" | jq -r '.data.status')

# Check if job completed successfully
if [ "$STATE" != "completed" ]; then
  if [ "$STATE" = "running" ]; then
    echo -e "${YELLOW}❌ TIMEOUT: Fetch job still running after ${TIMEOUT}s${NC}"
    echo "  The job needs more time to process all pages."
    echo "  Re-run with --no-cleanup and wait, or check:"
    echo "    docker logs $CONTAINER_NAME --tail 50"
  else
    echo -e "${YELLOW}❌ FAILED: Fetch job status: $STATE${NC}"
    # Try to show error details
    ERROR_DETAILS=$(echo "$FINAL_STATUS" | jq '.data.result.error // .data.result' 2>/dev/null)
    if [ -n "$ERROR_DETAILS" ] && [ "$ERROR_DETAILS" != "null" ]; then
      echo "  Error details:"
      echo "$ERROR_DETAILS" | jq '.' 2>/dev/null || echo "$ERROR_DETAILS"
    fi
  fi
  echo ""
  # Continue to show generated files for debugging, but mark for exit
  VALIDATION_EXIT_CODE=1
fi

# List all jobs
echo -e "${BLUE}✅ All jobs:${NC}"
api_request "GET" "$API_BASE_URL/jobs" | jq '.data | {count, items: [.items[] | {id, type, status}]}'

echo -e "${GREEN}✅ Test complete!${NC}"

# Show generated files
echo -e "${BLUE}📁 Generated files:${NC}"
if [ -d "docs" ]; then
  DOC_COUNT=$(find "docs" -name "*.md" 2>/dev/null | wc -l)
  echo "  - docs/: $DOC_COUNT markdown files"
  if [ "$DOC_COUNT" -gt 0 ]; then
    echo "    Sample files:"
    find "docs" -name "*.md" 2>/dev/null | head -5 | sed 's|^|    |'
  fi
else
  echo "  - docs/: (empty or not created)"
fi

if [ -d "static/images" ]; then
  IMG_COUNT=$(find "static/images" -type f 2>/dev/null | wc -l)
  echo "  - static/images/: $IMG_COUNT image files"
else
  echo "  - static/images/: (empty or not created)"
fi

echo ""
echo "Files are saved to your host machine via Docker volume mounts."

# Validate page count (only if job completed successfully)
# Initialize VALIDATION_EXIT_CODE if not already set (from job state check)
if [ -z "${VALIDATION_EXIT_CODE+x}" ]; then
  VALIDATION_EXIT_CODE=0
fi

if [ "$VALIDATION_EXIT_CODE" -eq 0 ] && [ "$COUNT_VALIDATION_AVAILABLE" = true ]; then
  # Pass expectedDocs if available, otherwise fall back to total
  if [ -n "$EXPECTED_DOCS" ] && [ "$EXPECTED_DOCS" != "null" ] && [ "$EXPECTED_DOCS" != "0" ]; then
    VALIDATION_EXPECTED="$EXPECTED_DOCS"
  else
    VALIDATION_EXPECTED="$EXPECTED_TOTAL"
  fi
  if ! validate_page_count "$VALIDATION_EXPECTED"; then
    VALIDATION_EXIT_CODE=1
  fi
elif [ "$VALIDATION_EXIT_CODE" -ne 0 ]; then
  echo -e "${YELLOW}⚠️  Skipping page count validation (job did not complete successfully)${NC}"
else
  echo -e "${YELLOW}⚠️  Skipping page count validation (count job was unavailable)${NC}"
fi

# Exit with validation result
if [ "$VALIDATION_EXIT_CODE" -ne 0 ]; then
  echo -e "${YELLOW}❌ Test FAILED: Page count validation failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All checks passed!${NC}"
