#!/bin/bash
# Test notion:fetch-all via docker compose API service
#
# Usage:
#   ./scripts/test-docker/test-compose-fetch.sh [--all] [--max-pages N] [--dry-run] [--include-removed] [--no-cleanup]

set -euo pipefail

readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

FETCH_ALL=false
MAX_PAGES=5
DRY_RUN=false
INCLUDE_REMOVED=false
NO_CLEANUP=false

API_PORT="${API_PORT:-3001}"
API_BASE_URL="http://localhost:${API_PORT}"
COMPOSE_FILE_PATH="${COMPOSE_FILE_PATH:-docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-comapeo-docs-compose-test}"
SERVICE_NAME="api"

usage() {
  cat <<USAGE
Usage: $0 [--all] [--max-pages N] [--dry-run] [--include-removed] [--no-cleanup]

Options:
  --all              Fetch all pages (no maxPages limit)
  --max-pages N      Limit fetch to N pages (default: 5)
  --dry-run          Run in dry-run mode (no actual content changes)
  --include-removed  Include pages with "Remove" status
  --no-cleanup       Leave docker compose services running
  -h, --help         Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --include-removed)
      INCLUDE_REMOVED=true
      shift
      ;;
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo -e "${YELLOW}Unknown option: $1${NC}"
      usage
      exit 1
      ;;
  esac
done

is_non_negative_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

check_required_env() {
  local missing=0
  local required_vars=(
    NOTION_API_KEY
    DATABASE_ID
    DATA_SOURCE_ID
    GITHUB_REPO_URL
    GITHUB_TOKEN
    GIT_AUTHOR_NAME
    GIT_AUTHOR_EMAIL
  )

  for var_name in "${required_vars[@]}"; do
    if [[ -z "${!var_name:-}" ]]; then
      echo -e "${YELLOW}Missing required environment variable: ${var_name}${NC}"
      missing=1
    fi
  done

  if [[ "$missing" -eq 1 ]]; then
    echo -e "${YELLOW}Set required variables in your shell or .env, then rerun.${NC}"
    return 1
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
  if [[ -n "$body" ]]; then
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
  local max_attempts=12
  local delay=1

  while [[ "$attempts" -lt "$max_attempts" ]]; do
    if HEALTH_RESPONSE=$(api_request "GET" "$API_BASE_URL/health"); then
      if echo "$HEALTH_RESPONSE" | jq -e '.data.status == "ok" or .data.status == "healthy"' >/dev/null 2>&1; then
        echo "$HEALTH_RESPONSE"
        return 0
      fi
    fi

    attempts=$((attempts + 1))
    sleep "$delay"
    if [[ "$delay" -lt 8 ]]; then
      delay=$((delay * 2))
    fi
  done

  echo -e "${YELLOW}Error: API server did not become healthy in time.${NC}" >&2
  return 1
}

cleanup() {
  if [[ "$NO_CLEANUP" == true ]]; then
    echo -e "${YELLOW}Compose services left running.${NC}"
    return 0
  fi

  echo -e "${BLUE}Cleaning up docker compose stack...${NC}"
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    -f "$COMPOSE_FILE_PATH" \
    down --remove-orphans >/dev/null 2>&1 || true
}

for cmd in docker curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${YELLOW}Error: '${cmd}' is required but not installed.${NC}"
    exit 1
  fi
done

if ! is_non_negative_integer "$MAX_PAGES"; then
  echo -e "${YELLOW}Error: --max-pages must be a non-negative integer.${NC}"
  exit 1
fi

check_required_env

trap cleanup EXIT

echo -e "${BLUE}Starting docker compose API service...${NC}"
if [[ -f .env ]]; then
  docker compose \
    --env-file .env \
    --project-name "$COMPOSE_PROJECT_NAME" \
    -f "$COMPOSE_FILE_PATH" \
    up -d --build "$SERVICE_NAME"
else
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    -f "$COMPOSE_FILE_PATH" \
    up -d --build "$SERVICE_NAME"
fi

echo -e "${BLUE}Waiting for API health...${NC}"
HEALTH_RESPONSE=$(wait_for_server)
echo -e "${GREEN}API healthy:${NC} $(echo "$HEALTH_RESPONSE" | jq -c '.data')"

JOB_OPTIONS="{}"
if [[ "$DRY_RUN" == true ]]; then
  JOB_OPTIONS=$(echo "$JOB_OPTIONS" | jq '. + {"dryRun": true}')
fi
if [[ "$FETCH_ALL" == false ]]; then
  JOB_OPTIONS=$(echo "$JOB_OPTIONS" | jq --argjson n "$MAX_PAGES" '. + {"maxPages": $n}')
fi
if [[ "$INCLUDE_REMOVED" == true ]]; then
  JOB_OPTIONS=$(echo "$JOB_OPTIONS" | jq '. + {"includeRemoved": true}')
fi

PAYLOAD=$(jq -cn --arg type "notion:fetch-all" --argjson options "$JOB_OPTIONS" '{type: $type, options: $options}')

echo -e "${BLUE}Creating job...${NC}"
CREATE_RESPONSE=$(api_request "POST" "$API_BASE_URL/jobs" "$PAYLOAD")
JOB_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.jobId')

if [[ -z "$JOB_ID" || "$JOB_ID" == "null" ]]; then
  echo -e "${YELLOW}Failed to parse job id from response:${NC}"
  echo "$CREATE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}Job started:${NC} $JOB_ID"

MAX_POLLS=1800
POLL_INTERVAL=2
poll=0

while [[ "$poll" -lt "$MAX_POLLS" ]]; do
  STATUS_RESPONSE=$(api_request "GET" "$API_BASE_URL/jobs/$JOB_ID")
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')

  case "$STATUS" in
    completed)
      echo -e "${GREEN}Job completed successfully.${NC}"
      echo "$STATUS_RESPONSE" | jq -c '.data.result // {}'
      exit 0
      ;;
    failed|cancelled)
      echo -e "${YELLOW}Job ended with status: $STATUS${NC}"
      echo "$STATUS_RESPONSE" | jq -c '.data.result // {}'
      exit 1
      ;;
    pending|running)
      CURRENT=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress.current // 0')
      TOTAL=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress.total // 0')
      MSG=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress.message // "processing"')
      echo "[$poll/$MAX_POLLS] status=$STATUS progress=$CURRENT/$TOTAL message=$MSG"
      ;;
    *)
      echo -e "${YELLOW}Unexpected job status: $STATUS${NC}"
      ;;
  esac

  poll=$((poll + 1))
  sleep "$POLL_INTERVAL"
done

echo -e "${YELLOW}Timed out waiting for job completion.${NC}"
api_request "DELETE" "$API_BASE_URL/jobs/$JOB_ID" >/dev/null || true
exit 1
