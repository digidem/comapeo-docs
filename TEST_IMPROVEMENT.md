# Test Improvement Plan

Generated from comprehensive test review of PR `feat/notion-api-service`.

**Current State**: 3 test files failing, 20 tests broken, 1 process error.

```
Test Files  3 failed | 111 passed | 1 skipped (115)
     Tests  20 failed | 2747 passed | 91 skipped (2858)
    Errors  1 error
```

---

## Task 1: Remove or Fix Tests That Reference Deleted Files

**Complexity**: LOW

**Problem**: Three test files reference `docs/developer-tools/vps-deployment.md` which was deleted in this PR (confirmed via `git status: D docs/developer-tools/vps-deployment.md`). All 20 test failures trace back to this.

**Failing Files**:

1. `scripts/api-server/vps-deployment-docs.test.ts` — The entire file tests the deleted doc. Line 21-26 sets `DOCS_PATH` to the nonexistent file. `loadDocumentation(DOCS_PATH)` at line 47 throws `ENOENT`.

2. `scripts/api-server/docker-smoke-tests.test.ts:401-413` — The "Production Readiness" describe block at line 401 reads the same deleted file at line 413: `docsContent = readFileSync(DOCS_PATH, "utf-8")`.

3. `scripts/api-server/docker-config.test.ts` — Multiple failures in:
   - Line 57: "should only copy production dependencies" — asserts `dockerfileContent` contains `--production` but actual Dockerfile doesn't use that flag
   - Line 65: "should copy only essential API server files" — asserts no `COPY . .` but Dockerfile may differ
   - Line 90: "should support configurable health check intervals via ARG" — asserts `ARG.*HEALTHCHECK` pattern not found
   - Line 97: "should use ARG variables in HEALTHCHECK instruction" — same issue
   - Line 375: "should set explicit UID/GID for non-root user" — asserts UID/GID pattern not in Dockerfile
   - Line 392: "should install only production dependencies" — asserts `--production` not found
   - Line 421: "should have health check enabled for monitoring" — HEALTHCHECK assertion fails

**Fix Instructions**:

- **Delete** `scripts/api-server/vps-deployment-docs.test.ts` entirely — it tests a file that no longer exists.
- **In** `scripts/api-server/docker-smoke-tests.test.ts` — Remove or skip the "Production Readiness" describe block (lines ~401-440) that reads `docs/developer-tools/vps-deployment.md`. The rest of the file is fine.
- **In** `scripts/api-server/docker-config.test.ts` — Read the actual `Dockerfile` at project root and update assertions to match its real content. Specifically:
  - Check what the Dockerfile actually uses instead of `--production` (it installs all deps because devDeps are needed at runtime)
  - Check actual HEALTHCHECK syntax in the Dockerfile
  - Check actual USER directive syntax
  - If Dockerfile intentionally differs from what these tests expect, update the tests to match reality or delete the assertions

**Verification**: Run `bunx vitest run scripts/api-server/docker-config.test.ts scripts/api-server/docker-smoke-tests.test.ts` and confirm 0 failures.

---

## Task 2: Fix Tests That Copy Source Code Instead of Importing

**Complexity**: MEDIUM

**Problem**: Three test files duplicate production functions/constants instead of importing them. One has already drifted — the copied `VALID_JOB_TYPES` is missing `notion:count-pages`.

### Task 2a: Fix `input-validation.test.ts`

**File**: `scripts/api-server/input-validation.test.ts`

**Problem at lines 28-64**: The file copies `VALID_JOB_TYPES`, `isValidJobType`, `isValidJobStatus`, and `isValidJobId` from `scripts/api-server/index.ts` instead of importing them. The copied `VALID_JOB_TYPES` (line 28-36) lists only 7 types and is **missing `notion:count-pages`**, while the actual source at `scripts/api-server/index.ts:52-61` has 8 types.

**Current copied list (WRONG — line 28-36)**:

```ts
const VALID_JOB_TYPES: readonly JobType[] = [
  "notion:fetch",
  "notion:fetch-all",
  "notion:translate",
  "notion:status-translation",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
] as const;
```

**Actual source list (`index.ts:52-61`)**:

```ts
const VALID_JOB_TYPES: readonly JobType[] = [
  "notion:fetch",
  "notion:fetch-all",
  "notion:count-pages", // ← MISSING from test copy
  "notion:translate",
  "notion:status-translation",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
] as const;
```

**Fix**: The functions `isValidJobType`, `isValidJobStatus`, `isValidJobId`, and the constants `VALID_JOB_TYPES`, `VALID_JOB_STATUSES`, `MAX_JOB_ID_LENGTH` are not currently exported from `index.ts`. Two options:

**Option A (preferred)**: Export these from `index.ts` and import in the test:

1. In `scripts/api-server/index.ts`, add `export` to lines 52, 63, 49, 93, 97, 101:
   ```ts
   export const VALID_JOB_TYPES: readonly JobType[] = [...]
   export const VALID_JOB_STATUSES: readonly JobStatus[] = [...]
   export const MAX_JOB_ID_LENGTH = 100;
   export function isValidJobType(type: string): type is JobType { ... }
   export function isValidJobStatus(status: string): status is JobStatus { ... }
   export function isValidJobId(jobId: string): boolean { ... }
   ```
   BUT NOTE: `index.ts` has a side effect — it calls `serve()` at line 1327. Importing from it will start the server. So the export approach requires extracting these into a separate module first.

**Option B (simpler)**: Extract validation functions and constants into `scripts/api-server/validation.ts`, import from both `index.ts` and the test file.

Create `scripts/api-server/validation.ts`:

```ts
import type { JobType, JobStatus } from "./job-tracker";

export const MAX_REQUEST_SIZE = 1_000_000;
export const MAX_JOB_ID_LENGTH = 100;

export const VALID_JOB_TYPES: readonly JobType[] = [
  "notion:fetch",
  "notion:fetch-all",
  "notion:count-pages",
  "notion:translate",
  "notion:status-translation",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
] as const;

export const VALID_JOB_STATUSES: readonly JobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

export function isValidJobType(type: string): type is JobType {
  return VALID_JOB_TYPES.includes(type as JobType);
}

export function isValidJobStatus(status: string): status is JobStatus {
  return VALID_JOB_STATUSES.includes(status as JobStatus);
}

export function isValidJobId(jobId: string): boolean {
  if (!jobId || jobId.length > MAX_JOB_ID_LENGTH) return false;
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\"))
    return false;
  return true;
}
```

Then update `index.ts` to import from `./validation` instead of defining inline, and update `input-validation.test.ts` to import from `./validation`.

2. In `scripts/api-server/input-validation.test.ts`, replace lines 24-64 with:
   ```ts
   import {
     VALID_JOB_TYPES,
     VALID_JOB_STATUSES,
     MAX_JOB_ID_LENGTH,
     isValidJobType,
     isValidJobStatus,
     isValidJobId,
   } from "./validation";
   ```

### Task 2b: Fix `job-executor-core.test.ts`

**File**: `scripts/api-server/job-executor-core.test.ts`

**Problem at lines 17-100**: Replicates the entire `JOB_COMMANDS` mapping and `parseProgressFromOutput` function from `scripts/api-server/job-executor.ts`. The test exercises the **copy**, not the actual production code.

**Source of truth**: `scripts/api-server/job-executor.ts:31-88` (JOB_COMMANDS) and `205-224` (parseProgressFromOutput).

**Note**: The copied `JOB_COMMANDS` at test line 33 uses `args: ["scripts/notion-fetch"]` while the actual source at `job-executor.ts:41` uses `args: ["scripts/notion-fetch/index.ts"]` — **drift has already happened**.

**Fix**: Export `JOB_COMMANDS` and `parseProgressFromOutput` from `job-executor.ts`, then import in the test.

1. In `scripts/api-server/job-executor.ts`:
   - Add `export` before `const JOB_COMMANDS` at line 31
   - Add `export` before `function parseProgressFromOutput` at line 205

2. In `scripts/api-server/job-executor-core.test.ts`:
   - Replace lines 17-103 with:
     ```ts
     import { JOB_COMMANDS, parseProgressFromOutput } from "./job-executor";
     ```
   - Note: This import will pull in `job-executor.ts` which imports `spawn` from `node:child_process` and other modules. The tests should still work since they only call `parseProgressFromOutput` (a pure function) and inspect `JOB_COMMANDS` (a static object). If there are import side-effect issues, mock the problematic imports.

### Task 2c: Fix `protected-endpoints-auth.test.ts`

**File**: `scripts/api-server/protected-endpoints-auth.test.ts`

**Problem at lines 27-62**: Copies `PUBLIC_ENDPOINTS`, `isPublicEndpoint`, and `simulateHandleRequestAuth` from `index.ts`.

**Fix**: After creating `scripts/api-server/validation.ts` (from Task 2a), also move `PUBLIC_ENDPOINTS` and `isPublicEndpoint` there. Then import in the test.

Add to `scripts/api-server/validation.ts`:

```ts
export const PUBLIC_ENDPOINTS = ["/health", "/jobs/types", "/docs"] as const;

export function isPublicEndpoint(path: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => path === endpoint);
}
```

In `scripts/api-server/protected-endpoints-auth.test.ts`, replace lines 27-32 with:

```ts
import { PUBLIC_ENDPOINTS, isPublicEndpoint } from "./validation";
```

The `simulateHandleRequestAuth` function (lines 35-61) is test-specific simulation code and can remain in the test file — it's a test helper, not production code being copied.

**Verification for all Task 2 subtasks**: Run `bunx vitest run scripts/api-server/input-validation.test.ts scripts/api-server/job-executor-core.test.ts scripts/api-server/protected-endpoints-auth.test.ts` and confirm 0 failures.

---

## Task 3: Add HTTP Integration Tests for the API Server

**Complexity**: HIGH

**Problem**: The main server handler at `scripts/api-server/index.ts` (function `handleRequest` at line 1244, function `routeRequest` at line 260) has **zero tests** that make actual HTTP requests. All existing "integration" tests call `JobTracker` or `JobQueue` methods directly.

**What's untested at the HTTP level**:

| Code Location        | What's Untested                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `index.ts:113-118`   | CORS headers (`Access-Control-Allow-Origin: *`) in actual responses                        |
| `index.ts:216-245`   | `parseJsonBody()` with real Request objects (Content-Type check, size limit, JSON parsing) |
| `index.ts:248-255`   | Public endpoint detection in HTTP context                                                  |
| `index.ts:267-269`   | OPTIONS preflight handling                                                                 |
| `index.ts:272-285`   | GET /health full response structure                                                        |
| `index.ts:288-898`   | GET /docs OpenAPI spec response                                                            |
| `index.ts:902-942`   | GET /jobs/types response                                                                   |
| `index.ts:945-996`   | GET /jobs with query filters                                                               |
| `index.ts:999-1083`  | GET /jobs/:id and DELETE /jobs/:id                                                         |
| `index.ts:1086-1203` | POST /jobs full validation + job creation                                                  |
| `index.ts:1206-1238` | 404 catch-all route                                                                        |
| `index.ts:1244-1320` | `handleRequest` wrapper (auth + audit + error handling)                                    |

**Fix**: Create `scripts/api-server/http-integration.test.ts`. The server exports `server` and `actualPort` at line 1415 and auto-starts on import (with random port in test mode since `NODE_ENV=test`).

```ts
/**
 * HTTP Integration Tests
 *
 * Tests the actual HTTP server endpoints via real HTTP requests.
 * The server auto-starts when imported (using port 0 in test mode).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { server, actualPort } from "./index";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import { getAuth } from "./auth";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".jobs-data");
const BASE_URL = `http://localhost:${actualPort}`;

function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

describe("HTTP Integration Tests", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
    const auth = getAuth();
    auth.clearKeys();
  });

  afterAll(() => {
    server.stop();
    destroyJobTracker();
    cleanupTestData();
  });

  // --- Public Endpoints ---

  describe("GET /health", () => {
    it("should return 200 with health data", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("ok");
      expect(body.data.timestamp).toBeDefined();
      expect(body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(body.requestId).toMatch(/^req_/);
    });

    it("should not require authentication", async () => {
      // Add an API key to enable auth
      const auth = getAuth();
      auth.addKey("test", "test-key-1234567890123456", {
        name: "test",
        active: true,
      });

      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      auth.clearKeys();
    });
  });

  describe("GET /docs", () => {
    it("should return OpenAPI spec", async () => {
      const res = await fetch(`${BASE_URL}/docs`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe("3.0.0");
      expect(body.info.title).toBe("CoMapeo Documentation API");
      expect(body.paths).toBeDefined();
    });
  });

  describe("GET /jobs/types", () => {
    it("should list all job types including notion:count-pages", async () => {
      const res = await fetch(`${BASE_URL}/jobs/types`);
      expect(res.status).toBe(200);
      const body = await res.json();
      const typeIds = body.data.types.map((t: { id: string }) => t.id);
      expect(typeIds).toContain("notion:fetch");
      expect(typeIds).toContain("notion:fetch-all");
      expect(typeIds).toContain("notion:count-pages");
      expect(typeIds).toContain("notion:translate");
    });
  });

  // --- CORS ---

  describe("OPTIONS preflight", () => {
    it("should return 204 with CORS headers", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });
  });

  // --- Authentication ---

  describe("Protected endpoints", () => {
    it("should return 401 when auth is enabled and no key provided", async () => {
      const auth = getAuth();
      auth.addKey("test", "test-key-1234567890123456", {
        name: "test",
        active: true,
      });

      const res = await fetch(`${BASE_URL}/jobs`);
      expect(res.status).toBe(401);

      auth.clearKeys();
    });

    it("should return 200 when valid Bearer token provided", async () => {
      const auth = getAuth();
      const key = "test-key-1234567890123456";
      auth.addKey("test", key, { name: "test", active: true });

      const res = await fetch(`${BASE_URL}/jobs`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      expect(res.status).toBe(200);

      auth.clearKeys();
    });
  });

  // --- POST /jobs ---

  describe("POST /jobs", () => {
    it("should reject missing Content-Type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject invalid job type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invalid:type" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_ENUM_VALUE");
    });

    it("should create a job with valid type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.jobId).toBeTruthy();
      expect(body.data.status).toBe("pending");
      expect(body.data._links.self).toMatch(/^\/jobs\//);
    });

    it("should reject unknown options", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notion:fetch",
          options: { unknownKey: true },
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // --- GET /jobs/:id ---

  describe("GET /jobs/:id", () => {
    it("should return 404 for nonexistent job", async () => {
      const res = await fetch(`${BASE_URL}/jobs/nonexistent-id`);
      expect(res.status).toBe(404);
    });

    it("should reject path traversal in job ID", async () => {
      const res = await fetch(`${BASE_URL}/jobs/../../etc/passwd`);
      expect(res.status).toBe(400);
    });
  });

  // --- 404 catch-all ---

  describe("Unknown routes", () => {
    it("should return 404 with available endpoints", async () => {
      const res = await fetch(`${BASE_URL}/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("ENDPOINT_NOT_FOUND");
      expect(body.details.availableEndpoints).toBeDefined();
    });
  });

  // --- X-Request-ID header ---

  describe("Request tracing", () => {
    it("should include X-Request-ID in response headers", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    });
  });
});
```

**Important notes for the implementing agent**:

- The server auto-starts when `index.ts` is imported because `serve()` is called at module level (line 1327). In test mode (`NODE_ENV=test`), it uses port 0 (random).
- `actualPort` is exported at line 1415 and gives the random port.
- `server` is exported and has a `.stop()` method for cleanup.
- When auth is disabled (no keys), all endpoints are accessible. Tests must add/clear keys explicitly.
- Run with: `bunx vitest run scripts/api-server/http-integration.test.ts`

---

## Task 4: Fix Bug in `createJobQueue` Default Executor

**Complexity**: LOW

**Problem**: In `scripts/api-server/job-queue.ts:278-334`, the `createJobQueue` function has two issues:

1. **Dead code** (lines 282-300): A `defaultExecutor` variable is defined but never used — it's immediately shadowed by per-type registrations in the for-loop at lines 314-331.

2. **Hardcoded job type** in dead code (line 297): The unused `defaultExecutor` calls `executeJob("notion:fetch" as JobType, ...)` regardless of the actual job type. While this code is dead (unused), it reveals intent confusion.

**Fix**:

1. Delete lines 282-300 (the unused `defaultExecutor` variable)
2. Add a test in `scripts/api-server/job-queue.test.ts` that verifies each registered executor dispatches the correct job type. Example:

```ts
describe("createJobQueue executor registration", () => {
  it("should register executors for all valid job types", () => {
    const queue = createJobQueue({ concurrency: 1 });
    // The queue should have executors for all 8 job types
    // Test by adding a job of each type and verifying it doesn't fail with "No executor registered"
    const jobTypes: JobType[] = [
      "notion:fetch",
      "notion:fetch-all",
      "notion:count-pages",
      "notion:translate",
      "notion:status-translation",
      "notion:status-draft",
      "notion:status-publish",
      "notion:status-publish-production",
    ];
    for (const type of jobTypes) {
      // Just verify add doesn't throw - executor exists
      expect(async () => await queue.add(type)).not.toThrow();
    }
    // Clean up
    await queue.awaitTeardown();
  });
});
```

**Verification**: Run `bunx vitest run scripts/api-server/job-queue.test.ts`.

---

## Task 5: Remove Committed Log/Artifact Files

**Complexity**: LOW

**Problem**: 9 build artifact files are tracked in this PR. These should not be committed.

**Files to remove from git tracking**:

```
lint-run.log
test-flaky-analysis.log
test-run-1.log
test-run-api-server.log
typecheck-run.log
scripts/api-server/flaky-test-counts.txt
scripts/api-server/flaky-test-persistence-runs.log
scripts/api-server/flaky-test-runs.log
scripts/api-server/parallel-test-runs.log
```

**Fix**:

1. Add these patterns to `.gitignore` (check if they're already there; if not, add):

   ```
   *.log
   test-run-*.log
   test-flaky-analysis.log
   typecheck-run.log
   lint-run.log
   scripts/api-server/flaky-test-*.log
   scripts/api-server/flaky-test-counts.txt
   scripts/api-server/parallel-test-runs.log
   ```

2. Remove from git tracking:
   ```bash
   git rm --cached lint-run.log test-flaky-analysis.log test-run-1.log test-run-api-server.log typecheck-run.log scripts/api-server/flaky-test-counts.txt scripts/api-server/flaky-test-persistence-runs.log scripts/api-server/flaky-test-runs.log scripts/api-server/parallel-test-runs.log
   ```

**Verification**: `git status` should show these as deleted from tracking. Files remain on disk but won't be committed.

---

## Task 6: Add Security-Relevant Tests for Auth Module

**Complexity**: MEDIUM

**Problem**: The auth module at `scripts/api-server/auth.ts` has security-relevant gaps:

### 6a: Hash Collision Test

**Location**: `scripts/api-server/auth.ts:110-119`

The `hashKey` function uses a simple bit-shift hash:

```ts
private hashKey(key: string): string {
  let hash = 0;
  const str = `api-key-${key}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}
```

This is a weak hash. Two different API keys could produce the same hash value, allowing an attacker with one key to authenticate as another user.

**Add to `scripts/api-server/auth.test.ts`**:

```ts
describe("Hash collision resistance", () => {
  it("should produce different hashes for different keys", () => {
    const auth = new ApiKeyAuth();
    const keys = [
      "test-key-aaaa-1234567890",
      "test-key-bbbb-1234567890",
      "test-key-cccc-1234567890",
      "completely-different-key-1",
      "completely-different-key-2",
      "abcdefghijklmnop12345678",
      "12345678abcdefghijklmnop",
    ];

    // Add all keys
    for (const [i, key] of keys.entries()) {
      auth.addKey(`key${i}`, key, { name: `key${i}`, active: true });
    }

    // Each key should authenticate as its own identity, not another
    for (const [i, key] of keys.entries()) {
      const result = auth.authenticate(`Bearer ${key}`);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe(`key${i}`);
    }

    auth.clearKeys();
  });

  it("should not authenticate with a key that has the same hash length but different content", () => {
    const auth = new ApiKeyAuth();
    auth.addKey("real", "real-api-key-1234567890ab", {
      name: "real",
      active: true,
    });

    // Try keys that are similar but different
    const fakeKeys = [
      "real-api-key-1234567890ac",
      "real-api-key-1234567890aa",
      "real-api-key-1234567890ba",
      "fake-api-key-1234567890ab",
    ];

    for (const fakeKey of fakeKeys) {
      const result = auth.authenticate(`Bearer ${fakeKey}`);
      // Should either fail or authenticate as a different key
      if (result.success) {
        // If it somehow succeeds, it should NOT be the "real" key identity
        // This would indicate a hash collision
        expect(result.meta?.name).not.toBe("real");
      }
    }

    auth.clearKeys();
  });
});
```

### 6b: Test for Empty/Whitespace Authorization Headers

**Add to `scripts/api-server/auth.test.ts`** in the "Authorization Header Parsing" describe:

```ts
it("should reject empty string Authorization header", () => {
  const result = auth.authenticate("");
  expect(result.success).toBe(false);
});

it("should reject whitespace-only Authorization header", () => {
  const result = auth.authenticate("   ");
  expect(result.success).toBe(false);
});

it("should reject Authorization header with extra spaces", () => {
  const result = auth.authenticate("Bearer  valid-key-123456789012  extra");
  expect(result.success).toBe(false);
});
```

**Verification**: Run `bunx vitest run scripts/api-server/auth.test.ts`.

---

## Task 7: Add Missing `notion:count-pages` to Test Constants

**Complexity**: LOW

**Problem**: Even beyond the copy-vs-import issue (Task 2), several test files have hardcoded job type lists that are missing `notion:count-pages`. If Task 2 is completed (extracting to `validation.ts`), this is automatically fixed. But if Task 2 is deferred, these files need manual updates.

**Files with incomplete job type lists**:

1. `scripts/api-server/input-validation.test.ts:28-36` — Missing `notion:count-pages`
2. `scripts/api-server/api-docs.test.ts:70-78` — Missing `notion:count-pages` (line 70-78 defines `validJobTypes`)
3. `scripts/api-server/api-documentation-validation.test.ts` — Check for hardcoded job types list

**Fix**: Add `"notion:count-pages"` after `"notion:fetch-all"` in each list.

**Verification**: Run `bunx vitest run scripts/api-server/input-validation.test.ts scripts/api-server/api-docs.test.ts scripts/api-server/api-documentation-validation.test.ts`.

---

## Task 8: Add Test for `parseJsonBody` Edge Cases

**Complexity**: MEDIUM

**Problem**: `scripts/api-server/index.ts:216-245` defines `parseJsonBody` which validates Content-Type, request size, and JSON parsing. It's only tested indirectly through handler integration tests (which don't actually use HTTP requests). No direct tests exist for:

- Missing Content-Type header
- Wrong Content-Type (e.g., `text/plain`)
- Content-Length exceeding `MAX_REQUEST_SIZE` (1MB)
- Non-object JSON body (e.g., `"just a string"`, `[1,2,3]`, `null`)
- Malformed JSON

**Fix**: If Task 2 is done (extracting to `validation.ts`), also extract `parseJsonBody` and test directly. Otherwise, these will be covered by Task 3 (HTTP integration tests) through actual HTTP requests.

If implementing separately, add to `scripts/api-server/input-validation.test.ts`:

```ts
describe("parseJsonBody validation", () => {
  // Test via HTTP requests using the server
  // (requires server to be running - see Task 3)

  it("should reject request without Content-Type", async () => {
    const res = await fetch(`http://localhost:${port}/jobs`, {
      method: "POST",
      body: JSON.stringify({ type: "notion:fetch" }),
      // No Content-Type header
    });
    expect(res.status).toBe(400);
  });

  it("should reject non-JSON Content-Type", async () => {
    const res = await fetch(`http://localhost:${port}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});
```

**Note**: This overlaps with Task 3. If Task 3 is completed, this is already covered.

---

## Summary / Priority Order

| Task | Complexity | Impact            | Description                                              |
| ---- | ---------- | ----------------- | -------------------------------------------------------- |
| 1    | LOW        | Fixes 20 failures | Remove/fix tests referencing deleted `vps-deployment.md` |
| 5    | LOW        | Hygiene           | Remove committed log files, update `.gitignore`          |
| 7    | LOW        | Correctness       | Add missing `notion:count-pages` to test constants       |
| 4    | LOW        | Bug fix           | Remove dead code in `createJobQueue`, add executor test  |
| 2    | MEDIUM     | Prevents drift    | Extract shared validation code, stop copying in tests    |
| 6    | MEDIUM     | Security          | Add hash collision and auth edge case tests              |
| 3    | HIGH       | Coverage gap      | Add full HTTP integration test suite                     |
| 8    | MEDIUM     | Coverage gap      | Add `parseJsonBody` edge case tests (covered by Task 3)  |

**Recommended execution order**: 1 → 5 → 7 → 4 → 2 → 6 → 3 (Task 8 is covered by Task 3)
