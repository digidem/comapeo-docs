#!/bin/bash
# Comprehensive API Integration Tests
# Tests authentication, error handling, job cancellation, and concurrent jobs
#
# Usage:
#   ./scripts/test-docker/test-api-integration.sh [--no-cleanup]
#
# Options:
#   --no-cleanup  Leave container running after test
#
# This test suite covers scenarios NOT tested by test-fetch.sh:
# 1. Authentication flow (with/without API keys)
# 2. Job cancellation (DELETE /jobs/:id)
# 3. Error handling (invalid inputs, malformed JSON, 404s)
# 4. Concurrent job execution
# 5. Dry-run mode verification

set -euo pipefail

# Colors for output
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

# Configuration
NO_CLEANUP=false
IMAGE_NAME="comapeo-docs-api:test"
CONTAINER_NAME="comapeo-api-integration-test"
API_BASE_URL="http://localhost:3002"
TEST_API_KEY="test-integration-key-1234567890"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--no-cleanup]"
      echo ""
      echo "Options:"
      echo "  --no-cleanup  Leave container running after test"
      echo ""
      echo "Comprehensive API integration tests covering:"
      echo "  - Authentication flow"
      echo "  - Job cancellation"
      echo "  - Error handling"
      echo "  - Concurrent jobs"
      echo "  - Dry-run mode"
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
    echo -e "${RED}Error: '$cmd' is required but not installed.${NC}"
    exit 1
  fi
done

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

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

# Test helper functions
test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo -e "${BLUE}▶ Test $TESTS_RUN: $1${NC}"
}

test_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}  ✅ PASS${NC}"
  echo ""
}

test_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}  ❌ FAIL: $1${NC}"
  echo ""
}

# Test 1: Authentication - Disabled by default
test_auth_disabled() {
  test_start "Authentication disabled (no API keys configured)"

  # GET /jobs should work without auth when no keys configured
  RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/jobs")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" != "200" ]; then
    test_fail "Expected 200, got $HTTP_CODE"
    echo "  Response: $BODY" | head -3
    return 1
  fi

  # Verify response structure
  if ! echo "$BODY" | jq -e '.data.items' >/dev/null 2>&1; then
    test_fail "Response missing .data.items field"
    return 1
  fi

  test_pass
}

# Test 2: Authentication - Enabled with API key
test_auth_enabled() {
  test_start "Authentication enabled (with API key)"

  # Stop current container
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

  # Start with API key authentication
  docker run --rm -d --user root -p 3002:3002 \
    --name "$CONTAINER_NAME" \
    --env-file .env \
    -e API_HOST=0.0.0.0 \
    -e API_PORT=3002 \
    -e "API_KEY_TEST=$TEST_API_KEY" \
    -v "$(pwd)/docs:/app/docs" \
    -v "$(pwd)/static/images:/app/static/images" \
    "$IMAGE_NAME" >/dev/null 2>&1

  sleep 3

  # Test 2a: Request without auth header should fail
  RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/jobs")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" != "401" ]; then
    test_fail "Expected 401 without auth header, got $HTTP_CODE"
    echo "  Response: $BODY"
    return 1
  fi

  # Test 2b: Request with invalid API key should fail
  RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer invalid-key-12345678" "$API_BASE_URL/jobs")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" != "401" ]; then
    test_fail "Expected 401 with invalid key, got $HTTP_CODE"
    return 1
  fi

  # Test 2c: Request with valid API key should succeed
  RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TEST_API_KEY" "$API_BASE_URL/jobs")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" != "200" ]; then
    test_fail "Expected 200 with valid key, got $HTTP_CODE"
    return 1
  fi

  test_pass

  # Restart container without auth for remaining tests
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

  docker run --rm -d --user root -p 3002:3002 \
    --name "$CONTAINER_NAME" \
    --env-file .env \
    -e API_HOST=0.0.0.0 \
    -e API_PORT=3002 \
    -v "$(pwd)/docs:/app/docs" \
    -v "$(pwd)/static/images:/app/static/images" \
    "$IMAGE_NAME" >/dev/null 2>&1

  sleep 3
}

# Test 3: Job Cancellation
test_job_cancellation() {
  test_start "Job cancellation (DELETE /jobs/:id)"

  # Create a long-running job (fetch-all without maxPages)
  CREATE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d '{"type":"notion:fetch-all"}')

  JOB_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.jobId')

  if [ "$JOB_ID" = "null" ] || [ -z "$JOB_ID" ]; then
    test_fail "Failed to create job"
    echo "$CREATE_RESPONSE" | jq '.'
    return 1
  fi

  echo "  Created job: $JOB_ID"

  # Wait a moment for job to start
  sleep 2

  # Cancel the job
  CANCEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$API_BASE_URL/jobs/$JOB_ID")
  HTTP_CODE=$(echo "$CANCEL_RESPONSE" | tail -1)
  BODY=$(echo "$CANCEL_RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" != "200" ]; then
    test_fail "Expected 200, got $HTTP_CODE"
    echo "  Response: $BODY"
    return 1
  fi

  # Verify job is marked as failed with cancellation reason
  # The API contract stores cancelled jobs as status="failed" with error message
  STATUS_RESPONSE=$(curl -s "$API_BASE_URL/jobs/$JOB_ID")
  JOB_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')
  JOB_ERROR=$(echo "$STATUS_RESPONSE" | jq -r '.data.result.error // empty')

  if [ "$JOB_STATUS" != "failed" ]; then
    test_fail "Expected status 'failed', got '$JOB_STATUS'"
    echo "$STATUS_RESPONSE" | jq '.data'
    return 1
  fi

  if [[ ! "$JOB_ERROR" =~ cancelled ]]; then
    test_fail "Expected error message to contain 'cancelled', got '$JOB_ERROR'"
    echo "$STATUS_RESPONSE" | jq '.data'
    return 1
  fi

  echo "  Job successfully cancelled (status: $JOB_STATUS, error: $JOB_ERROR)"
  test_pass
}

# Test 4: Error Handling - Invalid Job Type
test_error_invalid_job_type() {
  test_start "Error handling - Invalid job type"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d '{"type":"invalid:job-type"}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" != "400" ]; then
    test_fail "Expected 400, got $HTTP_CODE"
    echo "  Response: $BODY"
    return 1
  fi

  # Verify error code in response
  ERROR_CODE=$(echo "$BODY" | jq -r '.code')
  if [ "$ERROR_CODE" != "INVALID_ENUM_VALUE" ]; then
    test_fail "Expected error code 'INVALID_ENUM_VALUE', got '$ERROR_CODE'"
    return 1
  fi

  test_pass
}

# Test 5: Error Handling - Missing Required Fields
test_error_missing_fields() {
  test_start "Error handling - Missing required fields"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d '{"options":{}}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" != "400" ]; then
    test_fail "Expected 400, got $HTTP_CODE"
    return 1
  fi

  test_pass
}

# Test 6: Error Handling - Malformed JSON
test_error_malformed_json() {
  test_start "Error handling - Malformed JSON"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d '{invalid json')

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" != "400" ]; then
    test_fail "Expected 400, got $HTTP_CODE"
    return 1
  fi

  test_pass
}

# Test 7: Error Handling - 404 Not Found
test_error_404() {
  test_start "Error handling - 404 for unknown endpoint"

  RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/nonexistent-endpoint")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" != "404" ]; then
    test_fail "Expected 404, got $HTTP_CODE"
    return 1
  fi

  # Verify error response includes available endpoints
  if ! echo "$BODY" | jq -e '.meta.availableEndpoints' >/dev/null 2>&1; then
    test_fail "404 response should include availableEndpoints"
    return 1
  fi

  test_pass
}

# Test 8: Concurrent Jobs
test_concurrent_jobs() {
  test_start "Concurrent job execution"

  echo "  Creating 3 jobs simultaneously..."

  # Create 3 jobs in parallel using background processes
  JOB_OPTIONS='{"maxPages":2,"dryRun":true}'

  curl -s -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"notion:fetch-all\",\"options\":$JOB_OPTIONS}" \
    > /tmp/job1.json &
  PID1=$!

  curl -s -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"notion:count-pages\"}" \
    > /tmp/job2.json &
  PID2=$!

  curl -s -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"notion:fetch-all\",\"options\":$JOB_OPTIONS}" \
    > /tmp/job3.json &
  PID3=$!

  # Wait for all job creations to complete
  wait $PID1 $PID2 $PID3

  # Extract job IDs
  JOB1_ID=$(jq -r '.data.jobId' /tmp/job1.json)
  JOB2_ID=$(jq -r '.data.jobId' /tmp/job2.json)
  JOB3_ID=$(jq -r '.data.jobId' /tmp/job3.json)

  if [ "$JOB1_ID" = "null" ] || [ "$JOB2_ID" = "null" ] || [ "$JOB3_ID" = "null" ]; then
    test_fail "Failed to create concurrent jobs"
    cat /tmp/job1.json /tmp/job2.json /tmp/job3.json
    return 1
  fi

  echo "  Created jobs: $JOB1_ID, $JOB2_ID, $JOB3_ID"

  # Poll until all jobs complete (with timeout)
  TIMEOUT=60
  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS1=$(curl -s "$API_BASE_URL/jobs/$JOB1_ID" | jq -r '.data.status')
    STATUS2=$(curl -s "$API_BASE_URL/jobs/$JOB2_ID" | jq -r '.data.status')
    STATUS3=$(curl -s "$API_BASE_URL/jobs/$JOB3_ID" | jq -r '.data.status')

    if [ "$STATUS1" != "pending" ] && [ "$STATUS1" != "running" ] && \
       [ "$STATUS2" != "pending" ] && [ "$STATUS2" != "running" ] && \
       [ "$STATUS3" != "pending" ] && [ "$STATUS3" != "running" ]; then
      break
    fi

    sleep 2
    ELAPSED=$((ELAPSED + 2))
    echo "  Polling... ($STATUS1, $STATUS2, $STATUS3) ${ELAPSED}s/${TIMEOUT}s"
  done

  # Verify all completed
  if [ "$STATUS1" != "completed" ] || [ "$STATUS2" != "completed" ] || [ "$STATUS3" != "completed" ]; then
    test_fail "Not all jobs completed: $STATUS1, $STATUS2, $STATUS3"
    return 1
  fi

  echo "  All 3 jobs completed successfully"
  test_pass

  # Cleanup temp files
  rm -f /tmp/job1.json /tmp/job2.json /tmp/job3.json
}

# Test 9: Dry-Run Mode
test_dry_run_mode() {
  test_start "Dry-run mode verification"

  # Count files before dry-run
  BEFORE_COUNT=0
  if [ -d "docs" ]; then
    BEFORE_COUNT=$(find docs -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi

  # Create dry-run job
  CREATE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d '{"type":"notion:fetch-all","options":{"maxPages":3,"dryRun":true}}')

  JOB_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.jobId')

  if [ "$JOB_ID" = "null" ] || [ -z "$JOB_ID" ]; then
    test_fail "Failed to create dry-run job"
    return 1
  fi

  echo "  Created dry-run job: $JOB_ID"

  # Poll for completion
  TIMEOUT=60
  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS_RESPONSE=$(curl -s "$API_BASE_URL/jobs/$JOB_ID")
    STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')

    [ "$STATUS" != "pending" ] && [ "$STATUS" != "running" ] && break

    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done

  if [ "$STATUS" != "completed" ]; then
    test_fail "Dry-run job did not complete (status: $STATUS)"
    return 1
  fi

  # Count files after dry-run
  AFTER_COUNT=0
  if [ -d "docs" ]; then
    AFTER_COUNT=$(find docs -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi

  # Verify no new files were created
  if [ "$AFTER_COUNT" -ne "$BEFORE_COUNT" ]; then
    test_fail "Dry-run should not create files (before: $BEFORE_COUNT, after: $AFTER_COUNT)"
    return 1
  fi

  echo "  Dry-run completed without creating files ($BEFORE_COUNT files unchanged)"
  test_pass
}

# Test 10: Unknown Options Rejection
test_unknown_options() {
  test_start "Error handling - Unknown options rejection"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d '{"type":"notion:fetch","options":{"unknownKey":true,"invalidOption":"value"}}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" != "400" ]; then
    test_fail "Expected 400, got $HTTP_CODE"
    return 1
  fi

  test_pass
}

# Main execution
echo -e "${BLUE}=== Comprehensive API Integration Tests ===${NC}"
echo "Configuration:"
echo "  Image: $IMAGE_NAME"
echo "  Container: $CONTAINER_NAME"
echo "  API URL: $API_BASE_URL"
echo ""

# Build Docker image
echo -e "${BLUE}🔨 Building Docker image...${NC}"
docker build -t "$IMAGE_NAME" -f Dockerfile --target runner . -q

# Start container without auth (will restart with auth for that test)
echo -e "${BLUE}🚀 Starting API server...${NC}"
mkdir -p docs static/images

docker run --rm -d --user root -p 3002:3002 \
  --name "$CONTAINER_NAME" \
  --env-file .env \
  -e API_HOST=0.0.0.0 \
  -e API_PORT=3002 \
  -v "$(pwd)/docs:/app/docs" \
  -v "$(pwd)/static/images:/app/static/images" \
  "$IMAGE_NAME"

echo -e "${BLUE}⏳ Waiting for server...${NC}"
sleep 3

# Health check
echo -e "${BLUE}✅ Health check:${NC}"
HEALTH=$(curl -s "$API_BASE_URL/health")
echo "$HEALTH" | jq '.data.status, .data.auth'
echo ""

# Run all tests
echo -e "${BLUE}=== Running Tests ===${NC}"
echo ""

test_auth_disabled
test_auth_enabled
test_job_cancellation
test_error_invalid_job_type
test_error_missing_fields
test_error_malformed_json
test_error_404
test_concurrent_jobs
test_dry_run_mode
test_unknown_options

# Summary
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo "  Total: $TESTS_RUN"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
else
  echo "  Failed: 0"
fi
echo -e "${BLUE}═══════════════════════════════════════${NC}"

if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All tests passed!${NC}"
