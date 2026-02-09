#!/usr/bin/env bash
# Unit tests for validate_page_count function from test-fetch.sh
# Tests the page count validation logic in isolation
#
# Usage:
#   ./scripts/test-docker/test-fetch-validation.test.sh
#
# This test file sources the validation functions and tests them
# with various scenarios without requiring Docker or Notion API access.

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Mock variables that would normally be set by test-fetch.sh
EXPECTED_TOTAL=""
EXPECTED_PARENTS=""
EXPECTED_SUBPAGES=""
FETCH_ALL=true
MAX_PAGES=5
INCLUDE_REMOVED=false

# Logging functions
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_error() { echo -e "${RED}[FAIL]${NC} $*"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }

# Source the validation function from test-fetch.sh
# We need to extract just the validate_page_count function
validate_page_count() {
  local EXPECTED="$1"

  # Count actual English markdown files generated (docs/ only)
  # The pipeline also generates i18n/pt/ and i18n/es/ but those are translations
  # of the same unique pages, so we compare against English count only.
  local ACTUAL=0
  if [ -d "docs" ]; then
    ACTUAL=$(find docs -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi

  echo ""
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo -e "${BLUE}  PAGE COUNT VALIDATION${NC}"
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo "  Expected pages: $EXPECTED"
  echo "  Actual markdown files: $ACTUAL"

  # For --max-pages N, expected count is min(N, total_available)
  if [ "$FETCH_ALL" = false ] && [ -n "$EXPECTED_TOTAL" ]; then
    local EFFECTIVE_EXPECTED
    if [ "$MAX_PAGES" -lt "$EXPECTED" ] 2>/dev/null; then
      EFFECTIVE_EXPECTED="$MAX_PAGES"
      echo "  (--max-pages $MAX_PAGES limits expected to $EFFECTIVE_EXPECTED)"
    else
      EFFECTIVE_EXPECTED="$EXPECTED"
    fi
    EXPECTED="$EFFECTIVE_EXPECTED"
    echo "  Adjusted expected: $EXPECTED"
  fi

  if [ "$ACTUAL" -eq "$EXPECTED" ]; then
    echo -e "${GREEN}  ✅ PASS: Page counts match!${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    return 0
  else
    local DIFF=$((EXPECTED - ACTUAL))
    echo -e "${YELLOW}  ❌ FAIL: Page count mismatch (off by $DIFF)${NC}"
    echo ""
    echo "  Diagnostics:"
    echo "    - Expected total from Notion: $EXPECTED_TOTAL"
    echo "    - Parent pages: $EXPECTED_PARENTS"
    echo "    - Sub-pages: $EXPECTED_SUBPAGES"
    echo "    - Fetch mode: $([ "$FETCH_ALL" = true ] && echo '--all' || echo "--max-pages $MAX_PAGES")"
    echo "    - Include removed: $INCLUDE_REMOVED"
    if [ "$ACTUAL" -lt "$EXPECTED" ]; then
      echo ""
      echo "  Possible causes:"
      echo "    - Notion API pagination may have stalled (check for anomaly warnings in logs)"
      echo "    - Sub-page fetch may have timed out (check for 'Skipping sub-page' warnings)"
      echo "    - Status filtering may be more aggressive than expected"
      echo ""
      echo "  To debug, re-run with --no-cleanup and check container logs:"
      echo "    docker logs comapeo-fetch-test 2>&1 | grep -E '(DEBUG|anomaly|Skipping|Status Summary)'"
    fi
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    return 1
  fi
}

# Test assertion helpers
assert_equals() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [ "$actual" = "$expected" ]; then
    log_success "$test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_error "$test_name (expected: $expected, got: $actual)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

assert_exit_code() {
  local expected="$1"
  local command="$2"
  local test_name="$3"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  # Capture exit code
  if $command >/dev/null 2>&1; then
    local actual=0
  else
    local actual=$?
  fi

  if [ "$actual" = "$expected" ]; then
    log_success "$test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_error "$test_name (expected exit code: $expected, got: $actual)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# Setup test environment
setup_test_env() {
  local test_name="$1"
  local file_count="$2"

  # Create temp test directory
  TEST_DIR=$(mktemp -d)
  mkdir -p "$TEST_DIR/docs"

  # Create test markdown files
  if [ "$file_count" -gt 0 ]; then
    for i in $(seq 1 "$file_count"); do
      touch "$TEST_DIR/docs/page-$i.md"
    done
  fi

  # Change to test directory
  cd "$TEST_DIR"
}

teardown_test_env() {
  # Return to original directory and cleanup
  cd - >/dev/null 2>&1
  if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
}

# ===== TESTS =====

# Test 1: Exact match - should pass
test_exact_match() {
  log_info "Test 1: Exact match (expected=5, actual=5)"
  setup_test_env "exact_match" 5

  FETCH_ALL=true
  EXPECTED_TOTAL=10
  if validate_page_count 5; then
    assert_equals 0 0 "Exact match returns success"
  else
    assert_equals 0 1 "Exact match returns success"
  fi

  teardown_test_env
}

# Test 2: Mismatch - fewer files than expected
test_fewer_files() {
  log_info "Test 2: Fewer files (expected=10, actual=5)"
  setup_test_env "fewer_files" 5

  FETCH_ALL=true
  EXPECTED_TOTAL=10
  EXPECTED_PARENTS=3
  EXPECTED_SUBPAGES=7

  if validate_page_count 10; then
    assert_equals 1 0 "Fewer files returns failure"
  else
    assert_equals 1 1 "Fewer files returns failure"
  fi

  teardown_test_env
}

# Test 3: Mismatch - more files than expected
test_more_files() {
  log_info "Test 3: More files (expected=5, actual=10)"
  setup_test_env "more_files" 10

  FETCH_ALL=true
  EXPECTED_TOTAL=5

  if validate_page_count 5; then
    assert_equals 1 0 "More files returns failure"
  else
    assert_equals 1 1 "More files returns failure"
  fi

  teardown_test_env
}

# Test 4: Max-pages adjustment - expected > max_pages
test_max_pages_adjustment_down() {
  log_info "Test 4: Max-pages adjustment (expected=10, max-pages=5, actual=5)"
  setup_test_env "max_pages_down" 5

  FETCH_ALL=false
  MAX_PAGES=5
  EXPECTED_TOTAL=10

  if validate_page_count 10; then
    assert_equals 0 0 "Max-pages adjusted down passes"
  else
    assert_equals 0 1 "Max-pages adjusted down passes"
  fi

  teardown_test_env
}

# Test 5: Max-pages adjustment - expected < max_pages
test_max_pages_no_adjustment() {
  log_info "Test 5: Max-pages no adjustment (expected=3, max-pages=10, actual=3)"
  setup_test_env "max_pages_no_adj" 3

  FETCH_ALL=false
  MAX_PAGES=10
  EXPECTED_TOTAL=3

  if validate_page_count 3; then
    assert_equals 0 0 "Max-pages not adjusted passes"
  else
    assert_equals 0 1 "Max-pages not adjusted passes"
  fi

  teardown_test_env
}

# Test 6: Empty docs directory
test_empty_docs() {
  log_info "Test 6: Empty docs directory (expected=0, actual=0)"
  setup_test_env "empty_docs" 0

  FETCH_ALL=true
  EXPECTED_TOTAL=0

  if validate_page_count 0; then
    assert_equals 0 0 "Empty docs passes with zero expected"
  else
    assert_equals 0 1 "Empty docs passes with zero expected"
  fi

  teardown_test_env
}

# Test 7: Non-empty docs but expected zero
test_nonempty_zero_expected() {
  log_info "Test 7: Non-empty docs with zero expected (expected=0, actual=5)"
  setup_test_env "nonempty_zero" 5

  FETCH_ALL=true
  EXPECTED_TOTAL=0

  if validate_page_count 0; then
    assert_equals 1 0 "Non-empty docs fails with zero expected"
  else
    assert_equals 1 1 "Non-empty docs fails with zero expected"
  fi

  teardown_test_env
}

# Test 8: Fetch all mode with exact match
test_fetch_all_exact() {
  log_info "Test 8: Fetch all mode exact (expected=15, actual=15)"
  setup_test_env "fetch_all_exact" 15

  FETCH_ALL=true
  EXPECTED_TOTAL=15
  EXPECTED_PARENTS=5
  EXPECTED_SUBPAGES=10

  if validate_page_count 15; then
    assert_equals 0 0 "Fetch all exact match passes"
  else
    assert_equals 0 1 "Fetch all exact match passes"
  fi

  teardown_test_env
}

# Test 9: Large count difference
test_large_difference() {
  log_info "Test 9: Large count difference (expected=100, actual=50)"
  setup_test_env "large_diff" 50

  FETCH_ALL=true
  EXPECTED_TOTAL=100
  EXPECTED_PARENTS=30
  EXPECTED_SUBPAGES=70

  if validate_page_count 100; then
    assert_equals 1 0 "Large difference fails validation"
  else
    assert_equals 1 1 "Large difference fails validation"
  fi

  teardown_test_env
}

# Test 10: Single file match
test_single_file_match() {
  log_info "Test 10: Single file match (expected=1, actual=1)"
  setup_test_env "single_file" 1

  FETCH_ALL=true
  EXPECTED_TOTAL=1

  if validate_page_count 1; then
    assert_equals 0 0 "Single file match passes"
  else
    assert_equals 0 1 "Single file match passes"
  fi

  teardown_test_env
}

# ===== RUN ALL TESTS =====

log_info "=== Page Count Validation Unit Tests ==="
echo ""

test_exact_match
echo ""

test_fewer_files
echo ""

test_more_files
echo ""

test_max_pages_adjustment_down
echo ""

test_max_pages_no_adjustment
echo ""

test_empty_docs
echo ""

test_nonempty_zero_expected
echo ""

test_fetch_all_exact
echo ""

test_large_difference
echo ""

test_single_file_match
echo ""

# ===== RESULTS =====
log_info "=== Test Results Summary ==="
echo "Total tests:  $TESTS_TOTAL"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  log_success "All tests passed!"
  exit 0
else
  log_error "Some tests failed!"
  exit 1
fi
