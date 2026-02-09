# API Server Review Plan — PR #126

Complete review plan for the Notion API service implementation. Each task includes complexity level for dispatching the right model size:

- **LOW** → haiku (fast, straightforward checks)
- **MED** → sonnet (moderate analysis, pattern matching)
- **HIGH** → opus (deep architectural reasoning, security analysis)

---

## Current State

- **Source files**: 12 modules, ~5,200 LOC (source only)
- **Test files**: 30 test files, ~19,900 LOC
- **Test results**: 1078 passed, 20 failed, 88 skipped, 1 unhandled error
- **Architecture**: Bun HTTP server → async job executor → child process spawning
- **Persistence**: File-based (jobs.json + jobs.log)
- **Auth**: API key from env vars with custom hash
- **Deployment**: Docker multi-stage build + GitHub Actions workflow

---

## TASK 1: Fix Failing Tests (3 test files, 20 failures)

**Complexity**: MED
**Files**: `scripts/api-server/docker-smoke-tests.test.ts`, `scripts/api-server/github-status.test.ts`, `scripts/api-server/docker-config.test.ts`
**Scope**: Fix 20 failing tests + 1 unhandled rejection

### Details

**docker-smoke-tests.test.ts** — Tests assert `ARG HEALTHCHECK_INTERVAL` exists in Dockerfile, but the Dockerfile moved healthcheck config to docker-compose.yml. Tests are stale/out-of-sync with implementation.

**Action**: Read the Dockerfile and docker-compose.yml, then update tests to match the actual configuration location. The tests should validate healthcheck exists in docker-compose.yml, not in the Dockerfile.

**github-status.test.ts** — Unhandled rejection: `GitHubStatusError: GitHub API error: Service unavailable`. The test "should throw after max retries exceeded" is leaking a promise rejection. The test likely needs proper `await expect(...).rejects.toThrow()` or the retry loop's final throw isn't being caught.

**Action**: Read the test, find the unhandled rejection source, and ensure all async errors are properly awaited/caught. Check if `vi.useFakeTimers()` is causing timing issues with the retry backoff.

**docker-config.test.ts** — Likely same root cause as docker-smoke-tests (stale assertions about Dockerfile content).

**Action**: Read both test files and the actual Dockerfile/docker-compose.yml, update assertions to match reality.

### Acceptance Criteria

- All 34 test files pass (0 failures)
- No unhandled rejections
- No skipped tests that should be running

---

## TASK 2: Remove Dead Code — JobQueue

**Complexity**: LOW
**Files**: `scripts/api-server/job-queue.ts`, `scripts/api-server/job-queue.test.ts`, `scripts/api-server/job-queue-behavior-validation.test.ts`
**Scope**: Evaluate and remove or integrate

### Details

`JobQueue` class (335 lines) is fully implemented with concurrency control, cancellation support, and queue management — but it is **never instantiated or used**. The actual execution path goes: `index.ts → executeJobAsync() → spawn()`, completely bypassing the queue.

This means:

- **No concurrency control**: Multiple simultaneous job requests all spawn processes in parallel
- **No queue ordering**: Jobs don't wait for each other
- **Misleading architecture**: Code suggests queue management exists but it doesn't

**Action**: Decide one of:

1. **Remove** job-queue.ts and its tests entirely (simplest, honest)
2. **Integrate** it into the execution path in index.ts so concurrency is actually enforced

If removing: also check for any imports of `JobQueue` or `createJobQueue` in other files. If integrating: wire it into `handleCreateJob()` in index.ts where `executeJobAsync` is currently called directly.

### Acceptance Criteria

- No dead code modules in the codebase
- If kept: concurrency is actually enforced and tested
- If removed: no dangling imports or references

---

## TASK 3: Security — Authentication Hash Function

**Complexity**: MED
**Files**: `scripts/api-server/auth.ts`, `scripts/api-server/auth.test.ts`
**Scope**: Replace weak hash with proper key comparison

### Details

The current `hashKey()` method in `ApiKeyAuth` uses a simple arithmetic hash:

```typescript
private hashKey(key: string): string {
  let hash = 0;
  const str = `api-key-${key}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}
```

This is NOT cryptographic. Collisions are trivial. However, the actual threat model matters here: API keys are loaded from environment variables and compared on each request. The hash is only used to avoid storing plaintext keys in the in-memory Map.

**Recommended fix**: Since Bun has native `Bun.password.hash()` and `Bun.password.verify()` (bcrypt), use those. Or simpler: use `crypto.createHash('sha256')` which is available in all Node/Bun runtimes without dependencies.

**Action**:

1. Read auth.ts fully to understand the key storage and comparison flow
2. Replace `hashKey()` with `crypto.createHash('sha256').update(key).digest('hex')`
3. Update the `authenticate()` method to use the new hash for comparison
4. Ensure `clearKeys()` and `addKey()` still work
5. Run auth.test.ts to verify

### Acceptance Criteria

- Hash function uses SHA-256 or bcrypt
- All auth tests pass
- Keys are never stored in plaintext in memory
- Timing-safe comparison for key matching (use `crypto.timingSafeEqual`)

---

## TASK 4: Security — Environment Variable Leakage to Child Processes

**Complexity**: MED
**Files**: `scripts/api-server/job-executor.ts`
**Scope**: Whitelist env vars passed to child processes

### Details

In `executeJob()`, child processes are spawned with `env: process.env`, which passes ALL environment variables to the child — including `API_KEY_*` secrets, `GITHUB_TOKEN`, and any other sensitive vars that the child process doesn't need.

The child scripts (notion-fetch, notion-fetch-all, etc.) only need:

- `NOTION_API_KEY`
- `DATABASE_ID` / `NOTION_DATABASE_ID`
- `DATA_SOURCE_ID`
- `OPENAI_API_KEY` (for translations)
- `OPENAI_MODEL`
- `DEFAULT_DOCS_PAGE`
- `NODE_ENV`
- `PATH` (for binary resolution)
- `HOME` (for bun/node resolution)

**Action**:

1. Read job-executor.ts to find where `spawn()` is called
2. Replace `env: process.env` with an explicit whitelist object
3. Build the whitelist from process.env, only including known needed vars
4. Test that all job types still work (the spawn args come from JOB_COMMANDS which is safe)

### Acceptance Criteria

- Child processes receive only whitelisted environment variables
- `API_KEY_*` variables are NOT passed to children
- `GITHUB_TOKEN` is NOT passed to children (GitHub status uses fetch, not child processes)
- All job types still execute correctly

---

## TASK 5: Fix count-pages expectedDocs Mismatch

**Complexity**: MED
**Files**: `scripts/notion-count-pages/index.ts`, `scripts/notion-count-pages.test.ts`, `scripts/test-docker/test-fetch.sh`
**Scope**: Already partially fixed — needs test verification

### Details

**Root cause identified and fix applied**: The `count-pages` script was counting ALL parent pages with elementType=Page, but `generateBlocks.ts` skips parent pages that are also referenced as Sub-items of other pages (they get merged into their parent's markdown instead of generating separate files).

**Fix applied**: Added `subpageIdSet` construction in `scripts/notion-count-pages/index.ts` (matching `generateBlocks.ts` lines 646-654) and a `subpageIdSet.has(page.id)` check before incrementing `expectedDocsCount`.

**Remaining work**:

1. Add a unit test for the new filtering behavior — create test data where parent pages reference other parents as Sub-items and verify expectedDocs excludes them
2. Run the integration test (`test-fetch.sh --all`) to verify the count now matches
3. Update the count-pages test file if the mock data needs adjustment

**Action**:

1. Read the existing test at `scripts/notion-count-pages.test.ts` (this tests the OLD count-pages.ts at root, not the one in notion-count-pages/)
2. Check if there are tests for `scripts/notion-count-pages/index.ts` specifically
3. Add test coverage for the sub-page exclusion logic
4. Verify the fix works end-to-end

### Acceptance Criteria

- `expectedDocs` matches actual markdown file count when running `test-fetch.sh --all`
- Unit tests cover the sub-page exclusion case
- The `notion-count-pages.test.ts` tests still pass

---

## TASK 6: Unbounded Log/Persistence File Growth

**Complexity**: MED
**Files**: `scripts/api-server/job-persistence.ts`, `scripts/api-server/audit.ts`
**Scope**: Add log rotation and size limits

### Details

Three files grow without bound:

1. `.jobs-data/jobs.json` — Contains all jobs; only cleaned after 24h for completed/failed
2. `.jobs-data/jobs.log` — JSONL append-only log; never cleaned
3. `.audit-data/audit.log` — JSONL append-only log; never cleaned

In production with daily scheduled jobs, the log files will grow ~1-5MB/day (job output can be large). After months, this becomes problematic on VPS storage.

**Action**:

1. **jobs.log**: Add rotation in `appendLog()` — when file exceeds 10MB, rename to `.log.1` and start fresh. Keep max 3 rotated files.
2. **audit.log**: Same rotation strategy in `AuditLogger.log()`
3. **jobs.json**: Already has `cleanupOldJobs()` on 24h interval — verify it works and add a `maxJobs` cap (e.g., keep last 1000 jobs max)
4. Add a `cleanupLogs()` function callable from the cleanup interval

### Acceptance Criteria

- Log files have a max size before rotation (configurable, default 10MB)
- Old rotated logs are deleted (keep max 3)
- jobs.json has a cap on total stored jobs
- Cleanup runs automatically (extend existing hourly interval)

---

## TASK 7: File Persistence Race Conditions

**Complexity**: HIGH
**Files**: `scripts/api-server/job-persistence.ts`
**Scope**: Add atomic writes and file locking

### Details

Current persistence writes the entire `jobs.json` file on every job state change. The flow is:

1. Read all jobs from file
2. Find and update the target job in the array
3. Write entire array back to file

If two job updates happen simultaneously (e.g., two concurrent jobs both completing), the sequence could be:

1. Job A reads jobs.json (contains [A=running, B=running])
2. Job B reads jobs.json (contains [A=running, B=running])
3. Job A writes [A=completed, B=running]
4. Job B writes [A=running, B=completed] — **Job A's completion is lost**

The existing retry logic (5 retries with exponential backoff) handles `EBUSY`/`EACCES` but NOT logical race conditions.

**Action**:

1. Use atomic writes: write to a temp file, then `rename()` (atomic on most filesystems)
2. Add advisory file locking using `flock` pattern or a `.lock` file
3. Alternative: since this is a single-process server, use an in-memory mutex (simpler)
4. The JobTracker is already a singleton with an in-memory Map — persistence could be debounced (batch writes every 1s instead of per-change)

**Recommended approach**: Since the server is single-process (Bun), add a write queue that serializes persistence operations. This is simpler than file locking and eliminates the race entirely.

### Acceptance Criteria

- Concurrent job state changes don't lose data
- Write operations are serialized (queue or mutex)
- Atomic file writes (temp + rename pattern)
- Test with concurrent job completion simulation

---

## TASK 8: CORS Configuration

**Complexity**: LOW
**Files**: `scripts/api-server/index.ts`
**Scope**: Make CORS configurable

### Details

The server returns `Access-Control-Allow-Origin: *` on all responses (lines in the CORS preflight handler and response headers). This allows any website to call the API from the browser.

For a VPS-deployed API that handles Notion data operations, this is overly permissive. The API should restrict origins to known consumers.

**Action**:

1. Find the CORS header setting in index.ts
2. Add an `ALLOWED_ORIGINS` environment variable (comma-separated)
3. If set, validate `Origin` header against the whitelist
4. If not set, default to `*` (backwards compatible for development)
5. Return `403` for disallowed origins

### Acceptance Criteria

- CORS origin is configurable via environment variable
- Default behavior unchanged (allows all if not configured)
- Preflight (OPTIONS) and actual responses both use the configured origin

---

## TASK 9: Job Execution Timeout

**Complexity**: MED
**Files**: `scripts/api-server/job-executor.ts`, `scripts/api-server/index.ts`
**Scope**: Add configurable timeout for spawned processes

### Details

Child processes spawned by `executeJob()` have no timeout. If a Notion API call hangs or a script enters an infinite loop, the process runs forever, consuming resources and leaving the job in "running" state permanently.

The test script (`test-fetch.sh`) has its own polling timeout (120s/3600s), but the API server itself doesn't enforce any limit.

**Action**:

1. Add a `JOB_TIMEOUT` constant per job type (or a global default, e.g., 30 minutes)
2. Use `setTimeout()` to set a kill timer when spawning the process
3. On timeout: send SIGTERM, wait 5s, send SIGKILL if still alive
4. Update job status to "failed" with error "Job execution timed out after X seconds"
5. Make timeout configurable per job type in `JOB_COMMANDS` or via environment variable

**Timeout recommendations**:

- `notion:fetch`: 5 minutes
- `notion:fetch-all`: 60 minutes
- `notion:count-pages`: 5 minutes
- `notion:translate`: 30 minutes
- `notion:status-*`: 5 minutes

### Acceptance Criteria

- All spawned processes have a timeout
- Timeout is configurable (env var or per-job-type)
- Timed-out jobs are marked as failed with clear error message
- Process is killed (SIGTERM then SIGKILL) on timeout
- Test coverage for timeout behavior

---

## TASK 10: Consolidate Duplicate Constants

**Complexity**: LOW
**Files**: `scripts/api-server/index.ts`, `scripts/api-server/validation-schemas.ts`, `scripts/api-server/job-executor.ts`
**Scope**: Single source of truth for job types and statuses

### Details

Job types and statuses are defined in multiple places:

- `index.ts`: `VALID_JOB_TYPES` array for route validation
- `validation-schemas.ts`: `jobTypeSchema` Zod enum
- `job-executor.ts`: `JOB_COMMANDS` keys (the canonical source)
- `job-tracker.ts`: Status literals in type definitions

If a new job type is added (like `notion:count-pages` was recently), it must be added in all locations — easy to miss one.

**Action**:

1. Make `JOB_COMMANDS` in job-executor.ts the single source of truth for job types
2. Export `Object.keys(JOB_COMMANDS)` as `VALID_JOB_TYPES`
3. Derive the Zod schema from this array: `z.enum(VALID_JOB_TYPES as [string, ...string[]])`
4. Remove duplicate arrays from index.ts
5. Do the same for job statuses — define once, export everywhere
6. Search for any other hardcoded job type strings

### Acceptance Criteria

- Job types defined in exactly one place
- Job statuses defined in exactly one place
- Adding a new job type requires changing only JOB_COMMANDS
- All validation schemas derive from the canonical source

---

## TASK 11: Monolithic index.ts Refactoring

**Complexity**: HIGH
**Files**: `scripts/api-server/index.ts` (1,415 lines)
**Scope**: Split into route handlers

### Details

`index.ts` contains the server setup, CORS handling, request parsing, authentication middleware, all 7 endpoint handlers, OpenAPI documentation, and error handling — all in one file. The `routeRequest()` function is a giant if/else chain.

**Action**:

1. Extract route handlers into `scripts/api-server/routes/`:
   - `health.ts` — GET /health
   - `docs.ts` — GET /docs (OpenAPI spec)
   - `jobs.ts` — GET /jobs, POST /jobs, GET /jobs/:id, DELETE /jobs/:id
   - `job-types.ts` — GET /jobs/types
2. Create a `middleware.ts` for auth, CORS, content-type validation
3. Keep index.ts as the entry point: create server, wire routes and middleware
4. Move the OpenAPI spec object into `docs.ts` or a separate `openapi-spec.ts`
5. Target: index.ts should be <200 lines

**Important**: Bun's native server doesn't have a router — the if/else chain is the routing. Consider extracting a simple pattern-matching router utility, or keep the chain but delegate to handler functions.

### Acceptance Criteria

- index.ts < 200 lines
- Each endpoint handler is in its own file or grouped logically
- Middleware is reusable
- All existing tests still pass
- No behavior changes

---

## TASK 12: GitHub Actions Workflow Review

**Complexity**: MED
**Files**: `.github/workflows/api-notion-fetch.yml`
**Scope**: Security and reliability review

### Details

The workflow has several concerns:

1. **Secret interpolation in shell**: Line 57 uses `${{ secrets.API_ENDPOINT }}` directly in a bash `if` statement. If the secret contains special characters, this could break or be exploited. Use environment variables instead.

2. **JSON body construction**: Lines 134-142 use a heredoc with `$JOB_TYPE` interpolated. If `JOB_TYPE` contains special JSON characters, the body is malformed. Should use `jq` for JSON construction (same lesson as test-fetch.sh).

3. **Local mode starts server in background**: The server PID is saved in `$GITHUB_ENV` but the cleanup step uses `$SERVER_PID` — verify this works correctly across steps.

4. **Slack notification**: The `slackapi/slack-github-action@v2.1.1` call runs on `if: always()` but will fail silently if `SLACK_WEBHOOK_URL` is not set. Should check for the secret first.

5. **Missing notion:count-pages**: The `job_type` choice list doesn't include `notion:count-pages` which is a valid job type.

6. **Schedule runs with defaults**: The cron schedule uses default `notion:fetch-all` with `maxPages: 5` — is this intentional? A daily scheduled fetch of only 5 pages seems low.

**Action**:

1. Replace `${{ secrets.* }}` interpolation in bash with proper env var assignment
2. Use `jq` for JSON body construction
3. Verify PID cleanup works across GitHub Actions steps
4. Add conditional check for Slack webhook
5. Add `notion:count-pages` to the job_type options
6. Clarify scheduled run configuration (should it fetch all pages daily?)

### Acceptance Criteria

- No direct secret interpolation in shell commands
- JSON construction uses jq
- All job types available in workflow dispatch
- Slack notification is conditional on webhook being configured
- Schedule configuration is intentional and documented

---

## TASK 13: Docker Configuration Review

**Complexity**: LOW
**Files**: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
**Scope**: Verify production readiness

### Details

Review items:

1. **Dockerfile runs as non-root user (bun)** — but test-fetch.sh uses `--user root` override. Verify the container works without root.
2. **All deps installed (not just production)** — This is intentional (devDeps needed at runtime). Document why in a comment.
3. **pngquant/jpegtran symlinks** — Verify these work inside the container. The symlinks point to system binaries that must be installed in the base image.
4. **docker-compose.yml volume mounts** — `.jobs-data` and `.audit-data` are mounted as volumes for persistence. Verify permissions work with non-root user.
5. **Healthcheck** — Defined in docker-compose.yml with `bun` fetch. Verify it works.
6. **`.dockerignore`** — Verify it excludes test files, node_modules, .git, docs, etc.

**Action**: Read all three files and verify each concern. Check that the image can be built and the healthcheck works.

### Acceptance Criteria

- Container runs as non-root user without issues
- Healthcheck passes
- Volume mounts have correct permissions
- .dockerignore excludes unnecessary files
- Image size is reasonable (check with `docker images`)

---

## TASK 14: OpenAPI Documentation Accuracy

**Complexity**: LOW
**Files**: `scripts/api-server/index.ts` (OpenAPI spec section)
**Scope**: Verify spec matches actual behavior

### Details

The server serves an OpenAPI 3.0 spec at GET /docs. This spec should accurately reflect:

1. All endpoints and their methods
2. Request body schemas (including all job options)
3. Response schemas (success and error envelopes)
4. Authentication requirements
5. Error codes and their meanings
6. The `notion:count-pages` job type (recently added)

**Action**:

1. Read the OpenAPI spec from the /docs endpoint handler in index.ts
2. Compare each endpoint definition against the actual route handler
3. Verify all job types are listed
4. Verify all job options are documented
5. Verify error response schemas match `response-schemas.ts` ErrorCode enum
6. Check that auth is documented (Bearer / Api-Key schemes)

### Acceptance Criteria

- OpenAPI spec lists all 7 endpoints
- All 8 job types are documented
- Request/response schemas match actual behavior
- Auth schemes are documented
- Error codes are documented

---

## TASK 15: Integration Test Completeness

**Complexity**: HIGH
**Files**: `scripts/test-docker/test-fetch.sh`, `scripts/test-docker/test-api-docker.sh`
**Scope**: Verify end-to-end test coverage

### Details

The integration test (`test-fetch.sh`) covers:

- Docker image build
- Container startup
- Health check
- Job type listing
- Count-pages job creation and polling
- Fetch-all job creation and polling
- Page count validation

**Missing test scenarios**:

1. **Job cancellation**: No test for DELETE /jobs/:id
2. **Concurrent jobs**: No test for multiple simultaneous jobs
3. **Error handling**: No test for what happens when Notion API returns errors
4. **Auth flow**: test-fetch.sh doesn't test authentication (no API key sent)
5. **Dry-run mode**: The `--dry-run` flag is supported but not tested in the integration test
6. **Status filter jobs**: `notion:status-*` job types are not tested
7. **Translate job**: `notion:translate` is not tested
8. **Timeout behavior**: No test for jobs that run too long

**Action**:

1. Review test-fetch.sh for coverage gaps
2. Review test-api-docker.sh (if it exists) for additional coverage
3. Document which scenarios need integration tests
4. Prioritize: auth, cancellation, and error handling are most important

### Acceptance Criteria

- Document all missing integration test scenarios
- Add auth testing to integration tests
- Add job cancellation test
- Add error handling test (invalid job type, missing options)

---

## TASK 16: Cleanup Generated Artifacts in Repository

**Complexity**: LOW
**Files**: Various generated/log files checked into the repo
**Scope**: Remove files that shouldn't be in git

### Details

The PR includes several files that appear to be generated artifacts or debug output that shouldn't be in the repository:

1. `scripts/api-server/test-results.json` — Vitest output
2. `scripts/api-server/test-results.html` — Vitest HTML report
3. `scripts/api-server/html.meta.json.gz` — Compressed metadata
4. `scripts/api-server/bg.png` — Background image (test report?)
5. `scripts/api-server/favicon.ico` / `favicon.svg` — Test report assets
6. `scripts/api-server/assets/index-BUCFJtth.js` — Built JS asset
7. `scripts/api-server/assets/index-DlhE0rqZ.css` — Built CSS asset
8. `scripts/api-server/parallel-test-runs.log` — Debug log
9. `scripts/api-server/flaky-test-runs.log` — Debug log
10. `scripts/api-server/flaky-test-counts.txt` — Debug output
11. `scripts/api-server/flaky-test-persistence-runs.log` — Debug log
12. `lint-run.log` — Lint output
13. `.beads/CACHE.db` — Cache database

**Action**:

1. Add these patterns to `.gitignore`
2. Remove the files from git tracking: `git rm --cached <files>`
3. Verify `.gitignore` covers: `*.log`, `test-results.*`, `scripts/api-server/assets/`, `scripts/api-server/*.html`, `.beads/`

### Acceptance Criteria

- No generated artifacts in git
- .gitignore updated to prevent future commits of these files
- PR diff is cleaner without noise files

---

## Priority Order

| Priority | Task                           | Complexity | Impact          | Why                                        |
| -------- | ------------------------------ | ---------- | --------------- | ------------------------------------------ |
| 1        | TASK 16: Cleanup artifacts     | LOW        | Hygiene         | Reduces PR noise immediately               |
| 2        | TASK 1: Fix failing tests      | MED        | Quality         | 20 failures block CI confidence            |
| 3        | TASK 5: count-pages fix        | MED        | Correctness     | Integration test can't pass without this   |
| 4        | TASK 10: Consolidate constants | LOW        | Maintainability | Prevents future bugs when adding job types |
| 5        | TASK 2: Remove dead JobQueue   | LOW        | Clarity         | Removes confusion about architecture       |
| 6        | TASK 4: Env var whitelist      | MED        | Security        | Prevents secret leakage                    |
| 7        | TASK 3: Auth hash fix          | MED        | Security        | Weak crypto in auth path                   |
| 8        | TASK 9: Job timeout            | MED        | Reliability     | Prevents runaway processes                 |
| 9        | TASK 8: CORS config            | LOW        | Security        | Quick win for API hardening                |
| 10       | TASK 12: GH Actions review     | MED        | Security        | Secret handling in CI                      |
| 11       | TASK 14: OpenAPI accuracy      | LOW        | Docs            | Ensures API documentation is correct       |
| 12       | TASK 13: Docker review         | LOW        | DevOps          | Verify production config                   |
| 13       | TASK 6: Log rotation           | MED        | Reliability     | Prevents disk exhaustion                   |
| 14       | TASK 7: Persistence races      | HIGH       | Data integrity  | Concurrent write safety                    |
| 15       | TASK 11: Refactor index.ts     | HIGH       | Maintainability | Nice-to-have, large effort                 |
| 16       | TASK 15: Integration tests     | HIGH       | Coverage        | Comprehensive E2E validation               |

---

## Dispatch Plan

### Batch 1 — Quick Wins (LOW complexity, haiku)

Run in parallel:

- TASK 16: Cleanup artifacts
- TASK 10: Consolidate constants
- TASK 2: Remove dead JobQueue
- TASK 8: CORS config
- TASK 14: OpenAPI accuracy
- TASK 13: Docker review

### Batch 2 — Core Fixes (MED complexity, sonnet)

Run in parallel where independent:

- TASK 1: Fix failing tests
- TASK 5: count-pages fix verification
- TASK 4: Env var whitelist
- TASK 3: Auth hash fix

### Batch 3 — Reliability (MED complexity, sonnet)

Sequential (depends on Batch 2):

- TASK 9: Job timeout
- TASK 6: Log rotation
- TASK 12: GH Actions review

### Batch 4 — Deep Work (HIGH complexity, opus)

Sequential:

- TASK 7: Persistence race conditions
- TASK 11: Refactor index.ts
- TASK 15: Integration test completeness
