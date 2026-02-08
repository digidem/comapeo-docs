#!/usr/bin/env bash
# Real-world API testing script for Comapeo Docs API Server
# Tests all endpoints with Docker, simulating production use
#
# Usage:
#   ./scripts/test-api-docker.sh [--no-cleanup] [--keep-logs]
#
# Environment (set in .env or export):
#   NOTION_API_KEY, DATABASE_ID, DATA_SOURCE_ID, OPENAI_API_KEY
#   API_KEY_DEPLOYMENT (optional - for auth testing)

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
CONTAINER_NAME="comapeo-api-server-test"
NO_CLEANUP="${NO_CLEANUP:-false}"
KEEP_LOGS="${KEEP_LOGS:-false}"
TEST_RESULTS_DIR="${TEST_RESULTS_DIR:-./test-results}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Setup test results directory
mkdir -p "$TEST_RESULTS_DIR"
LOG_FILE="$TEST_RESULTS_DIR/api-test-$(date +%Y%m%d-%H%M%S).log"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*" | tee -a "$LOG_FILE"; }
log_error() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "$LOG_FILE"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"; }
log_section() { echo -e "\n${BLUE}=== $* ===${NC}" | tee -a "$LOG_FILE"; }

# Cleanup function
cleanup() {
  if [ "$NO_CLEANUP" = "false" ]; then
    log_info "Cleaning up Docker container..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    log_info "Cleanup complete"
  else
    log_warn "Skipping cleanup (container '$CONTAINER_NAME' left running)"
    log_info "To stop manually: docker rm -f $CONTAINER_NAME"
  fi
}

# Trap for cleanup
trap cleanup EXIT INT TERM

# HTTP helpers
http_get() {
  local endpoint="$1"
  local headers="${2:-}"
  curl -s -w "\n%{http_code}" "$API_BASE_URL$endpoint" $headers
}

http_post() {
  local endpoint="$1"
  local data="$2"
  local headers="${3:-}"
  curl -s -w "\n%{http_code}" "$API_BASE_URL$endpoint" \
    -H "Content-Type: application/json" $headers \
    -d "$data"
}

http_delete() {
  local endpoint="$1"
  local headers="${2:-}"
  curl -s -w "\n%{http_code}" -X DELETE "$API_BASE_URL$endpoint" $headers
}

# Test assertion helpers
assert_http_code() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  ((TESTS_TOTAL++))

  if [ "$actual" = "$expected" ]; then
    log_success "$test_name (HTTP $actual)"
    ((TESTS_PASSED++))
    return 0
  else
    log_error "$test_name (expected: $expected, got: $actual)"
    ((TESTS_FAILED++))
    return 1
  fi
}

assert_json_has_key() {
  local json="$1"
  local key="$2"
  local test_name="$3"

  ((TESTS_TOTAL++))

  if echo "$json" | jq -e ".${key}" >/dev/null 2>&1; then
    log_success "$test_name (has key: $key)"
    ((TESTS_PASSED++))
    return 0
  else
    log_error "$test_name (missing key: $key)"
    ((TESTS_FAILED++))
    return 1
  fi
}

assert_json_value() {
  local json="$1"
  local key="$2"
  local expected="$3"
  local test_name="$4"

  ((TESTS_TOTAL++))

  local actual
  actual=$(echo "$json" | jq -r ".${key}")

  if [ "$actual" = "$expected" ]; then
    log_success "$test_name ($key = $expected)"
    ((TESTS_PASSED++))
    return 0
  else
    log_error "$test_name (expected: $expected, got: $actual)"
    ((TESTS_FAILED++))
    return 1
  fi
}

# ===== SETUP =====
log_section "API Docker Integration Tests"

log_info "Test configuration:"
log_info "  - API URL: $API_BASE_URL"
log_info "  - Container: $CONTAINER_NAME"
log_info "  - Log file: $LOG_FILE"
log_info "  - No cleanup: $NO_CLEANUP"

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
  log_error "Docker not found. Please install Docker."
  exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
  log_warn ".env file not found. Creating from .env.example..."
  cp .env.example .env
  log_warn "Please edit .env with your API keys before running actual job tests."
fi

# Build and start container
log_section "Building and Starting Docker Container"

log_info "Building Docker image..."
if ! docker build -t comapeo-docs-api:test -f Dockerfile --target runner .; then
  log_error "Failed to build Docker image"
  exit 1
fi
log_success "Docker image built successfully"

log_info "Starting container (port 3001)..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 3001:3001 \
  --env-file .env \
  -e API_HOST=0.0.0.0 \
  -e API_PORT=3001 \
  -e NODE_ENV=production \
  --restart unless-stopped \
  comapeo-docs-api:test

log_info "Waiting for server to be healthy..."
MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  response=$(http_get "/health" 2>&1) || true
  http_code=$(echo "$response" | tail -n1)
  if [ "$http_code" = "200" ]; then
    log_success "Server is healthy!"
    break
  fi
  ((WAIT_COUNT++)) || true
  sleep 1
  echo -n "."
done
echo

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
  log_error "Server failed to become healthy within $MAX_WAIT seconds"
  docker logs "$CONTAINER_NAME" | tail -20
  exit 1
fi

# ===== TESTS =====
log_section "Running API Tests"

# Variables for auth testing
AUTH_HEADER=""
if grep -q "^API_KEY_" .env 2>/dev/null; then
  # Extract first API key for testing
  API_KEY=$(grep "^API_KEY_" .env | head -1 | cut -d= -f2)
  if [ -n "$API_KEY" ] && [ "$API_KEY" != "your_secure_api_key_here" ]; then
    AUTH_HEADER="-H 'Authorization: Bearer $API_KEY'"
    log_info "Authentication enabled (using API key)"
  fi
fi

# Save job ID for later tests
JOB_ID=""

# Test 1: Health check (public)
log_section "Test 1: Health Check (Public)"
log_info "Fetching /health endpoint..."
response=$(http_get "/health")
log_info "Response received"
http_code=$(echo "$response" | tail -n1)
log_info "HTTP code: $http_code"
body=$(echo "$response" | head -n -1)
log_info "Body captured"

assert_http_code "200" "$http_code" "Health check returns 200"
if [ "$http_code" = "200" ]; then
  echo "$body" | jq '.' >"$TEST_RESULTS_DIR/health.json"
  assert_json_has_key "$body" "data.status" "Health response has status"
  assert_json_value "$body" "data.status" "ok" "Server status is ok"
  assert_json_has_key "$body" "data.auth" "Health response has auth info"
fi

# Test 2: API documentation (public)
log_section "Test 2: API Documentation (Public)"
response=$(http_get "/docs")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

assert_http_code "200" "$http_code" "Docs endpoint returns 200"
if [ "$http_code" = "200" ]; then
  echo "$body" | jq '.' >"$TEST_RESULTS_DIR/docs.json"
  assert_json_has_key "$body" "openapi" "Docs has OpenAPI version"
  assert_json_has_key "$body" "paths" "Docs has paths defined"
fi

# Test 3: List job types (public)
log_section "Test 3: List Job Types (Public)"
response=$(http_get "/jobs/types")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

assert_http_code "200" "$http_code" "Job types endpoint returns 200"
if [ "$http_code" = "200" ]; then
  echo "$body" | jq '.' >"$TEST_RESULTS_DIR/job-types.json"
  assert_json_has_key "$body" "data.types" "Job types response has types array"
  type_count=$(echo "$body" | jq '.data.types | length')
  log_info "Available job types: $type_count"
fi

# Test 4: List all jobs (no auth = empty list)
log_section "Test 4: List All Jobs"
if [ -n "$AUTH_HEADER" ]; then
  response=$(eval "http_get '/jobs' \"$AUTH_HEADER\"")
else
  response=$(http_get "/jobs")
fi
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

# Should be 200 if no auth, 401 if auth enabled but not provided
if [ -n "$AUTH_HEADER" ]; then
  assert_http_code "200" "$http_code" "List jobs with auth returns 200"
else
  assert_http_code "200" "$http_code" "List jobs without auth returns 200"
fi

if [ "$http_code" = "200" ]; then
  echo "$body" | jq '.' >"$TEST_RESULTS_DIR/jobs-list.json"
  assert_json_has_key "$body" "data.count" "Jobs response has count"
  count=$(echo "$body" | jq '.data.count')
  log_info "Current job count: $count"
fi

# Test 5: Create a job (dry run to avoid actual Notion call)
log_section "Test 5: Create Job (Dry Run)"
if [ -n "$AUTH_HEADER" ]; then
  response=$(eval "http_post '/jobs' '{\"type\":\"notion:fetch\",\"options\":{\"dryRun\":true,\"maxPages\":1}}' \"$AUTH_HEADER\"")
else
  response=$(http_post "/jobs" '{"type":"notion:fetch","options":{"dryRun":true,"maxPages":1}}')
fi
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

if [ -n "$AUTH_HEADER" ]; then
  assert_http_code "201" "$http_code" "Create job with auth returns 201"
else
  # Without auth configured, server might accept or reject
  if [ "$http_code" = "201" ] || [ "$http_code" = "401" ]; then
    log_success "Create job behaves correctly (HTTP $http_code)"
    ((TESTS_PASSED++))
  else
    log_error "Create job unexpected status (got: $http_code)"
    ((TESTS_FAILED++))
  fi
fi

if [ "$http_code" = "201" ]; then
  echo "$body" | jq '.' >"$TEST_RESULTS_DIR/job-created.json"
  assert_json_has_key "$body" "data.jobId" "Create job response has jobId"
  assert_json_value "$body" "data.type" "notion:fetch" "Created job type is correct"
  assert_json_value "$body" "data.status" "pending" "Created job status is pending"
  JOB_ID=$(echo "$body" | jq -r '.data.jobId')
  log_info "Created job ID: $JOB_ID"
fi

# Test 6: Get job status by ID
if [ -n "$JOB_ID" ]; then
  log_section "Test 6: Get Job Status"
  if [ -n "$AUTH_HEADER" ]; then
    response=$(eval "http_get '/jobs/$JOB_ID' \"$AUTH_HEADER\"")
  else
    response=$(http_get "/jobs/$JOB_ID")
  fi
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)

  assert_http_code "200" "$http_code" "Get job status returns 200"
  if [ "$http_code" = "200" ]; then
    echo "$body" | jq '.' >"$TEST_RESULTS_DIR/job-status.json"
    assert_json_value "$body" "data.id" "$JOB_ID" "Job ID matches"
  fi
fi

# Test 7: List jobs with filter
log_section "Test 7: List Jobs with Filter"
if [ -n "$AUTH_HEADER" ]; then
  response=$(eval "http_get '/jobs?status=pending' \"$AUTH_HEADER\"")
else
  response=$(http_get "/jobs?status=pending")
fi
http_code=$(echo "$response" | tail -n1)

assert_http_code "200" "$http_code" "List jobs with filter returns 200"

# Test 8: Invalid job type validation
log_section "Test 8: Validation - Invalid Job Type"
if [ -n "$AUTH_HEADER" ]; then
  response=$(eval "http_post '/jobs' '{\"type\":\"invalid:type\"}' \"$AUTH_HEADER\"")
else
  response=$(http_post "/jobs" '{"type":"invalid:type"}')
fi
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

assert_http_code "400" "$http_code" "Invalid job type returns 400"
if [ "$http_code" = "400" ]; then
  assert_json_has_key "$body" "code" "Error response has error code"
fi

# Test 9: Invalid JSON
log_section "Test 9: Validation - Invalid JSON"
response=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/jobs" \
  -H "Content-Type: application/json" \
  -d "invalid json")
http_code=$(echo "$response" | tail -n1)

assert_http_code "400" "$http_code" "Invalid JSON returns 400"

# Test 10: Unknown endpoint (404)
log_section "Test 10: Unknown Endpoint (404)"
response=$(http_get "/unknown/endpoint")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

assert_http_code "404" "$http_code" "Unknown endpoint returns 404"
if [ "$http_code" = "404" ]; then
  assert_json_has_key "$body" "code" "404 response has error code"
fi

# Test 11: CORS preflight
log_section "Test 11: CORS Preflight"
response=$(curl -s -w "\n%{http_code}" -X OPTIONS "$API_BASE_URL/jobs" \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: POST")
http_code=$(echo "$response" | tail -n1)
headers=$(curl -s -I -X OPTIONS "$API_BASE_URL/jobs" \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: POST")

assert_http_code "204" "$http_code" "CORS preflight returns 204"
if echo "$headers" | grep -qi "access-control-allow-origin"; then
  log_success "CORS headers present"
  ((TESTS_PASSED++))
  ((TESTS_TOTAL++))
else
  log_error "CORS headers missing"
  ((TESTS_FAILED++))
  ((TESTS_TOTAL++))
fi

# Test 12: Request ID header
log_section "Test 12: Request ID Header"
request_id=$(curl -s -I "$API_BASE_URL/health" | grep -i "x-request-id" | cut -d' ' -f2 | tr -d '\r')
if [ -n "$request_id" ]; then
  log_success "Request ID header present: $request_id"
  ((TESTS_PASSED++))
  ((TESTS_TOTAL++))
else
  log_error "Request ID header missing"
  ((TESTS_FAILED++))
  ((TESTS_TOTAL++))
fi

# Test 13: Cancel job (if we have one)
if [ -n "$JOB_ID" ]; then
  log_section "Test 13: Cancel Job"
  if [ -n "$AUTH_HEADER" ]; then
    response=$(eval "http_delete '/jobs/$JOB_ID' \"$AUTH_HEADER\"")
  else
    response=$(http_delete "/jobs/$JOB_ID")
  fi
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)

  # Should be 200 or 409 (if already running/completed)
  if [ "$http_code" = "200" ] || [ "$http_code" = "409" ]; then
    log_success "Cancel job behaves correctly (HTTP $http_code)"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
  else
    log_error "Cancel job unexpected status (got: $http_code)"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
  fi
fi

# Test 14: Get non-existent job (404)
log_section "Test 14: Get Non-existent Job (404)"
fake_job_id="job_does_not_exist_12345"
if [ -n "$AUTH_HEADER" ]; then
  response=$(eval "http_get '/jobs/$fake_job_id' \"$AUTH_HEADER\"")
else
  response=$(http_get "/jobs/$fake_job_id")
fi
http_code=$(echo "$response" | tail -n1)

assert_http_code "404" "$http_code" "Non-existent job returns 404"

# ===== RESULTS =====
log_section "Test Results Summary"
echo "Total tests:  $TESTS_TOTAL"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  log_success "All tests passed!"
  exit_code=0
else
  log_error "Some tests failed!"
  exit_code=1
fi

# Save test summary
cat >"$TEST_RESULTS_DIR/test-summary.txt" <<EOF
API Docker Integration Test Summary
Date: $(date)
Total Tests: $TESTS_TOTAL
Passed: $TESTS_PASSED
Failed: $TESTS_FAILED

Test Results Directory: $TEST_RESULTS_DIR
Files Generated:
  - health.json
  - docs.json
  - job-types.json
  - jobs-list.json
  - job-created.json
  - job-status.json
  - test-summary.txt
  - api-test-*.log
EOF

log_info "Test results saved to: $TEST_RESULTS_DIR"

if [ "$KEEP_LOGS" = "true" ]; then
  log_info "Docker logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tee "$TEST_RESULTS_DIR/docker.log"
fi

exit $exit_code
