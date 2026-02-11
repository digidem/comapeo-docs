# Test Script Audit: `test-fetch.sh`

**File**: `scripts/test-docker/test-fetch.sh` (483 lines)
**Date**: 2026-02-11
**Overall Assessment**: REQUEST_CHANGES

---

## Issue Inventory

### 🔴 P0 - CRITICAL (Must Fix Before Production Use)

#### P0.1 - Command Injection via Unvalidated Docker Volume Mounts

- **Location**: Line 329-337
- **Severity**: 🔴 CRITICAL
- **Risk**: Path traversal, security vulnerability
- **Impact**: Malicious paths could mount sensitive directories
- **Effort**: 10 min
- **Code**:
  ```bash
  docker run --rm -d --user root -p 3001:3001 \
    --name "$CONTAINER_NAME" \
    --env-file .env \
    -e API_HOST=0.0.0.0 \
    -e API_PORT=3001 \
    -e DEFAULT_DOCS_PAGE=introduction \
    -v "$(pwd)/docs:/app/docs" \
    -v "$(pwd)/static/images:/app/static/images" \
    "$IMAGE_NAME"
  ```
- **Fix**: Validate and normalize paths before mounting

#### P0.2 - Docker Build Failure Not Detected

- **Location**: Line 317
- **Severity**: 🔴 CRITICAL
- **Risk**: Tests run with stale/corrupted image
- **Impact**: False positives, unreliable tests
- **Effort**: 2 min
- **Code**:
  ```bash
  docker build -t "$IMAGE_NAME" -f Dockerfile --target runner . -q
  ```
- **Fix**: Check exit code before proceeding

#### P0.3 - Container Running as Root User

- **Location**: Line 329
- **Severity**: 🔴 CRITICAL
- **Risk**: Security violation, permission issues
- **Impact**: Generated files owned by root, compromised container has root access
- **Effort**: 2 min
- **Code**:
  ```bash
  docker run --rm -d --user root -p 3001:3001 \
  ```
- **Fix**: Use host user UID/GID instead of root

---

### 🟡 P1 - HIGH (Should Fix Before Merge)

#### P1.1 - Missing HTTP Status Validation for API Calls

- **Location**: Line 144-146 (and other curl calls)
- **Severity**: 🟡 HIGH
- **Risk**: Silent network failures
- **Impact**: Cryptic errors, misleading test results
- **Effort**: 15 min (affects multiple curl calls)
- **Code**:
  ```bash
  COUNT_RESPONSE=$(curl -s -X POST "$API_BASE_URL/jobs" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"notion:count-pages\",\"options\":$COUNT_OPTIONS}")
  ```
- **Fix**: Validate HTTP status codes for all API calls

#### P1.2 - Race Condition in Server Readiness Check

- **Location**: Line 340, 368
- **Severity**: 🟡 HIGH
- **Risk**: Flaky tests, intermittent failures
- **Impact**: Tests fail randomly on slow systems
- **Effort**: 10 min
- **Code**:

  ```bash
  echo -e "${BLUE}⏳ Waiting for server...${NC}"
  sleep 3

  # Health check
  echo -e "${BLUE}✅ Health check:${NC}"
  HEALTH=$(curl -s "$API_BASE_URL/health")
  ```

- **Fix**: Implement retry loop with exponential backoff

#### P1.3 - No Job Cancellation on Timeout

- **Location**: Line 162-173
- **Severity**: 🟡 HIGH
- **Risk**: Wastes time on stuck jobs
- **Impact**: Cannot abort long-running failed jobs
- **Effort**: 10 min
- **Code**:

  ```bash
  while [ $COUNT_ELAPSED -lt $COUNT_TIMEOUT ]; do
    local COUNT_STATUS
    COUNT_STATUS=$(curl -s "$API_BASE_URL/jobs/$COUNT_JOB_ID")
    local COUNT_STATE
    COUNT_STATE=$(echo "$COUNT_STATUS" | jq -r '.data.status')

    [ "$COUNT_STATE" != "pending" ] && [ "$COUNT_STATE" != "running" ] && break
    sleep 2
    COUNT_ELAPSED=$((COUNT_ELAPSED + 2))
  done
  ```

- **Fix**: Add job cancellation in trap handler

#### P1.4 - Unquoted Variable in Find Command

- **Location**: Line 238-240
- **Severity**: 🟡 HIGH
- **Risk**: Fails with spaces in paths
- **Impact**: Incorrect file counts, validation failures
- **Effort**: 1 min
- **Code**:
  ```bash
  if [ -d "docs" ]; then
    ACTUAL=$(find docs -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi
  ```
- **Fix**: Quote the path: `find "docs"`

#### P1.5 - Directory Creation Without Permission Check

- **Location**: Line 324
- **Severity**: 🟡 HIGH
- **Risk**: Silent failure on read-only filesystem
- **Impact**: Test proceeds with no output directories
- **Effort**: 2 min
- **Code**:
  ```bash
  mkdir -p docs static/images
  ```
- **Fix**: Add error check after mkdir

#### P1.6 - No Port Conflict Detection

- **Location**: Line 100
- **Severity**: 🟡 HIGH
- **Risk**: Silent failure if port in use
- **Impact**: Container fails to start, misleading errors
- **Effort**: 5 min
- **Code**:
  ```bash
  API_BASE_URL="http://localhost:3001"
  ```
- **Fix**: Check port availability before starting container

---

### 🟠 P2 - MEDIUM (Fix in This PR or Create Follow-up)

#### P2.1 - JSON Construction Vulnerability

- **Location**: Line 144-146, 360-362
- **Severity**: 🟠 MEDIUM
- **Risk**: Low (mitigated by jq), defensive coding missing
- **Impact**: Potential JSON injection if upstream bugs exist
- **Effort**: 5 min per location (2 locations = 10 min total)
- **Code**:
  ```bash
  -d "{\"type\":\"notion:count-pages\",\"options\":$COUNT_OPTIONS}"
  ```
- **Fix**: Use jq for entire payload construction

#### P2.2 - Job Failure Does Not Exit Immediately

- **Location**: Line 405-423
- **Severity**: 🟠 MEDIUM
- **Risk**: Confusing output, missed failures
- **Impact**: Users may not realize test failed
- **Effort**: 5 min
- **Code**:

  ```bash
  if [ "$STATE" != "completed" ]; then
    # ... error handling ...
    VALIDATION_EXIT_CODE=1
  fi

  # Script continues with validation even though job failed
  ```

- **Fix**: Exit immediately on job failure or clearly separate results from success

#### P2.3 - Fragile Output Parsing with grep/tail

- **Location**: Line 198-204
- **Severity**: 🟠 MEDIUM
- **Risk**: Extracts wrong JSON if format changes
- **Impact**: Silent validation skip, incorrect counts
- **Effort**: 10 min
- **Code**:

  ```bash
  local COUNT_JSON
  COUNT_JSON=$(echo "$JOB_OUTPUT" | grep -E '^\{' | tail -1)

  if [ -z "$COUNT_JSON" ]; then
    echo -e "${YELLOW}⚠️  Could not parse count result from job output. Skipping validation.${NC}"
    return 1
  fi
  ```

- **Fix**: Use robust jq-based parsing

#### P2.4 - Integer Comparison Without Validation

- **Location**: Line 264-272
- **Severity**: 🟠 MEDIUM
- **Risk**: Silent failure with non-numeric values
- **Impact**: Wrong expected counts used
- **Effort**: 5 min
- **Code**:
  ```bash
  if [ "$MAX_PAGES" -lt "$COMPARISON_VALUE" ] 2>/dev/null; then
  ```
- **Fix**: Validate variables are numeric before comparison

#### P2.5 - Health Check Doesn't Validate Response

- **Location**: Line 344-345
- **Severity**: 🟠 MEDIUM
- **Risk**: Proceeds with invalid API responses
- **Impact**: Cryptic jq errors
- **Effort**: 5 min
- **Code**:
  ```bash
  HEALTH=$(curl -s "$API_BASE_URL/health")
  echo "$HEALTH" | jq '.data.status, .data.auth'
  ```
- **Fix**: Validate health response structure before processing

---

### ⚪ P3 - LOW (Optional Improvements)

#### P3.1 - Global Mutable State in Functions

- **Location**: Line 26-38
- **Severity**: ⚪ LOW
- **Risk**: None (correctness issue)
- **Impact**: Harder to test, potential bugs in future changes
- **Effort**: 20 min
- **Description**: Variables like `EXPECTED_TOTAL`, `EXPECTED_DOCS`, etc., are globals modified by functions
- **Fix**: Use local variables and return values, or structured data pattern

#### P3.2 - Tool Dependency Check Lacks Install Instructions

- **Location**: Line 89-94
- **Severity**: ⚪ LOW
- **Risk**: None (UX improvement)
- **Impact**: Users don't know how to install missing tools
- **Effort**: 5 min
- **Code**:
  ```bash
  for cmd in docker curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      echo -e "${YELLOW}Error: '$cmd' is required but not installed.${NC}"
      exit 1
    fi
  done
  ```
- **Fix**: Provide installation instructions for each tool

#### P3.3 - Unused Color Constant RED

- **Location**: Line 20
- **Severity**: ⚪ LOW
- **Risk**: None (dead code)
- **Impact**: Code clutter
- **Effort**: 1 min
- **Code**:
  ```bash
  readonly RED='\033[0;31m'
  ```
- **Fix**: Remove unused constant or use for critical errors

#### P3.4 - File Listing Could Show More Details

- **Location**: Line 432-449
- **Severity**: ⚪ LOW
- **Risk**: None (UX improvement)
- **Impact**: Less debugging information
- **Effort**: 5 min
- **Code**:
  ```bash
  if [ -d "docs" ]; then
    DOC_COUNT=$(find docs -name "*.md" 2>/dev/null | wc -l)
    echo "  - docs/: $DOC_COUNT markdown files"
    if [ "$DOC_COUNT" -gt 0 ]; then
      echo "    Sample files:"
      find docs -name "*.md" 2>/dev/null | head -5 | sed 's|^|    |'
    fi
  fi
  ```
- **Fix**: Show file timestamps and sizes for better debugging

---

## Summary by Priority

| Priority  | Count  | Total Effort | Criticality                                       |
| --------- | ------ | ------------ | ------------------------------------------------- |
| **P0**    | 3      | ~15 min      | 🔴 **CRITICAL** - Security & reliability blockers |
| **P1**    | 6      | ~45 min      | 🟡 **HIGH** - Flaky tests & error handling gaps   |
| **P2**    | 5      | ~30 min      | 🟠 **MEDIUM** - Robustness improvements           |
| **P3**    | 4      | ~30 min      | ⚪ **LOW** - Nice-to-have enhancements            |
| **TOTAL** | **18** | **~2 hours** |                                                   |

---

## Recommended Fix Packages

### Package A: "Security First" (P0 only)

- **Issues**: P0.1, P0.2, P0.3
- **Effort**: 15 minutes
- **Impact**: Eliminates critical security vulnerabilities
- **Recommended for**: Immediate hotfix

### Package B: "Production Ready" (P0 + P1)

- **Issues**: All P0 + All P1 (9 total)
- **Effort**: 60 minutes
- **Impact**: Makes test reliable and secure for CI/CD
- **Recommended for**: Merge-ready state ⭐ **RECOMMENDED**

### Package C: "Comprehensive" (P0 + P1 + P2)

- **Issues**: P0 through P2 (14 total)
- **Effort**: 90 minutes
- **Impact**: Production-grade test script with robust error handling
- **Recommended for**: Long-term stability

### Package D: "Complete Audit" (All)

- **Issues**: All 18 issues
- **Effort**: 2 hours
- **Impact**: Best-in-class test script with excellent UX
- **Recommended for**: Enterprise-grade testing

---

## Quick Decision Matrix

| Need              | Package | Issues       | Time      |
| ----------------- | ------- | ------------ | --------- |
| Just make it safe | A       | P0 only      | 15 min    |
| Ready for CI/CD   | B       | P0 + P1      | 60 min ⭐ |
| Robust tests      | C       | P0 + P1 + P2 | 90 min    |
| Perfect           | D       | All          | 2 hrs     |

---

## How to Use This Document

1. **Choose a package** based on your timeline and requirements
2. **List specific issues** by number (e.g., "Fix P0.1, P0.3, P1.2")
3. **Reference by theme** (e.g., "Fix all security issues")

**Example**:

```
Fix Package B (Production Ready):
- P0.1: Command injection via paths
- P0.2: Docker build validation
- P0.3: Container root user
- P1.1: HTTP status validation
- P1.2: Server readiness race condition
- P1.3: Job cancellation
- P1.4: Unquoted find variable
- P1.5: Directory creation check
- P1.6: Port conflict detection
```

---

## Security Highlights

**Most Critical Issues**:

1. ✗ Container running as root (P0.3)
2. ✗ Path traversal risk (P0.1)
3. ✗ Silent build failures (P0.2)
4. ✗ No HTTP status validation (P1.1)

**Overall Security Posture**: ⚠️ Needs hardening before production use

---

Generated: 2026-02-11
