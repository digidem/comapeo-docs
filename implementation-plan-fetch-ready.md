# Implementation Plan: Replace `api-notion-fetch` with API-native `fetch-ready`

## Summary

Stop using `.github/workflows/api-notion-fetch.yml` as runtime orchestration (it has been failing and is not a useful control plane).
Move the real fetch/status transition into the API service with dedicated `fetch-ready` / `fetch-all` job types by extending the existing `api-server/` implementation.

Keep CI focused on ephemeral API validation only: spin up a temporary API server, run smoke tests, and tear it down.

## Agreed Scope

1. Delete `.github/workflows/api-notion-fetch.yml`.
2. Implement two job types in the existing `api-server/` service codebase (deployed on VPS):
   - `fetch-ready`: Fetches "Ready to publish" pages (+ any existing translations), updates status to "Draft published"
   - `fetch-all`: Fetches all pages except those tagged "Remove", deletes stale artifacts, no status update
3. Add/keep CI only for temporary API deployment + verification + cleanup.
4. Enforce two hard guarantees:
   - Branch safety: sync `content <- main` before any generated-content push.
   - Status safety: update Notion to `Draft published` only after content is confirmed present on `origin/content` — either by a successful push in the current run, or by detecting that generated content is already identical to what is on the branch (no-op commit case). This guarantee assumes the API service is the only writer to `origin/content` (single-writer model below).
5. Implement concurrency guard to prevent any two fetch jobs running simultaneously.

## Non-goals

1. Preserving the current `api-notion-fetch.yml` manual/scheduled/dispatch runtime entrypoints.
2. Migration burn-in/dual-run strategy.
3. Keeping existing Slack/status reporting parity from the deleted workflow (Slack is handled by GitHub Actions triggered by the content push).
4. Automatic rollback on partial failure — the system is designed so each step is safe to re-run.

## Existing implementation baseline

The `api-server/` directory already provides core capabilities that this plan must extend, not replace:

- Job tracking + lifecycle: `api-server/job-tracker.ts`
- Terminal state persistence + retention/cleanup: `api-server/job-persistence.ts`
- Bearer auth: `api-server/auth.ts`
- Request validation (Zod): `api-server/validation-schemas.ts`
- Job routing: `api-server/routes/jobs.ts`
- Process execution + timeout controls: `api-server/job-executor.ts`
- Content-repo git operations + repo locking: `api-server/content-repo.ts`
- Health endpoint: `api-server/routes/health.ts`
- Error/response envelopes: `api-server/response-schemas.ts`

Implementation tasks below are deltas against these modules:

- Add `fetch-ready` and `fetch-all` job types to existing type unions/schemas.
- Extend existing job execution paths (or add adapter path) to support the new branch-prep, commit-decision, and push-retry semantics.
- Integrate concurrency guard into current `POST /jobs` creation flow.
- Reuse existing persistence/auth/validation/logging patterns and only change contracts where required by this plan.
- Retire legacy `notion:fetch` / `notion:fetch-all` execution path only after the new API-native path is verified.

## Git command notes

- `git merge` does not rebase by default; do not pass `--no-rebase` (that flag is for `git pull`). All merge commands in this plan use plain `git merge <ref>`.
- `git checkout -B <branch> <remote-ref>` creates or resets the local branch to exactly the remote ref.

## Known limitation

`fetch-ready` is an incremental job — it adds/updates content for the queried pages but does not prune stale artifacts (e.g., renamed or removed pages from prior runs). Run `fetch-all` periodically for full sync and stale artifact cleanup.

## Single-writer branch model (required)

- `origin/content` must be treated as single-writer and owned by the API service credentials.
- Manual/operator pushes to `origin/content` during a job are out of contract and can invalidate status-safety assumptions.
- Enforce operationally where possible (token scope/branch protection/permissions) so only the service account writes `origin/content`.

## API Shape

All job endpoints are **asynchronous**:

- `POST /jobs` → `202 Accepted` with `{ jobId, status: "pending" }` immediately.
- `GET /jobs/{jobId}` → poll for terminal state; returns full response contract when `status` is `completed` or `failed`.
- Terminal job state persistence and cleanup are provided by existing `api-server/job-persistence.ts`; this plan extends its contract usage and does not introduce new storage technology. `GET /jobs/{jobId}` returns `404` for unknown or expired jobs.
- On API server restart, any in-flight (non-terminal) jobs are considered lost. Callers that do not receive a terminal status within a reasonable timeout should treat the job as failed and re-trigger.

All requests to `POST /jobs` require a static API key:

```
Authorization: Bearer <API_KEY>
```

Requests without a valid key return `401 Unauthorized`. The API key is a VPS environment variable.

### Request validation

- Unknown `type` values → `400 Bad Request`.
- `maxPages` must be a non-negative integer; values below 0 → `400 Bad Request`.
- Unknown option keys are silently ignored.

### Failure response schema

Pre-job request failures (no job created; e.g., `401`, `400`, `409` from `POST /jobs`) use:

```json
{
  "status": "failed",
  "error": {
    "code": "UNAUTHORIZED" | "INVALID_REQUEST" | "CONFLICT" | "UNKNOWN",
    "message": "Human-readable description"
  }
}
```

Terminal failed jobs (`GET /jobs/{jobId}` with `status: "failed"`) use:

```json
{
  "jobId": "uuid",
  "status": "failed",
  "error": {
    "code": "DIRTY_WORKING_TREE" | "MERGE_CONFLICT" | "PUSH_FAILED" | "NOTION_QUERY_FAILED" | "CONTENT_GENERATION_FAILED" | "NOTION_STATUS_PARTIAL" | "BRANCH_MISSING" | "JOB_TIMEOUT" | "UNKNOWN",
    "message": "Human-readable description"
  },
  "commitHash": "abc123" | null,
  "failedPageIds": []
}
```

## Response Counters (definitions)

- `pagesProcessed`: pages returned from Notion that produced non-blank content and were (or would have been, in dry-run) included in a commit.
- `pagesSkipped`: pages returned from Notion that produced blank or empty-string output and were excluded.
- `pagesTransitioned` (`fetch-ready` only): pages where the Notion status update succeeded.
- `failedPageIds` (`fetch-ready` only): IDs of pages where Notion status update failed after all retries. Always empty on `status: "completed"`.
- `warnings` (`fetch-ready` only): non-fatal warnings collected during execution. Use structured entries, e.g. `{ type: "status_changed", pageId, message }`.

> **Note on partial success**: If push succeeds but Notion status updates fail, the content IS deployed (GitHub Actions fires staging deploy from the push), but the API job is `status: "failed"` with `commitHash` present. These are two decoupled signals; this is acceptable behavior.

## Required API Behavior

### Job Type 1: `fetch-ready`

#### Request

```json
{
  "type": "fetch-ready",
  "options": {
    "maxPages": 10,
    "dryRun": false,
    "force": false
  }
}
```

- `maxPages`: cap on pages queried from Notion. Preferred ordering is `Order` ascending, then `last_edited_time` ascending as tiebreaker. If Notion query sorting cannot enforce both keys, apply deterministic ordering in application code after query. If `maxPages` is 0 or omitted, query all matching pages.
- `dryRun`: if `true`, query and generate normally but skip git operations and Notion status update.
- `force`: if `true`, bypass the dirty tree check by cleaning generated paths only: `git restore --source=HEAD --staged --worktree docs/ i18n/ static/images/ && git clean -fd docs/ i18n/ static/images/`. Use only after an operator has confirmed the dirty state is safe to discard.

#### Execution flow

1. **Assert clean working tree** (`git status --porcelain`). If dirty and `force: false`: fail immediately with `DIRTY_WORKING_TREE` — no git or Notion operations. If `force: true`: run `git restore --source=HEAD --staged --worktree docs/ i18n/ static/images/ && git clean -fd docs/ i18n/ static/images/` (generated paths only).
2. Query Notion pages where `status === "Ready to publish"`, using preferred ordering (`Order` asc, `last_edited_time` asc). If needed, apply deterministic post-query sort in application code. Apply `maxPages` cap.
3. If 0 pages found: mark job `completed` immediately with `{ pagesProcessed: 0, pagesSkipped: 0, commitHash: null }`. No git or Notion operations.
4. Generate content to a temp directory (`/tmp/fetch-job-{jobId}/`):
   - For each page: fetch the English content and any existing translation sub-pages. If no translations exist, proceed with English only.
   - Skip pages that produce blank output or contain only empty strings; count them in `pagesSkipped`.
   - Convert to `docs/`, `i18n/*/docusaurus-plugin-content-docs/`, `static/images/` format.
   - Generation logic must not write `i18n/*/code.json`; only docs-content and related assets are produced.
   - On any generation error: delete temp dir, fail with `CONTENT_GENERATION_FAILED`.
5. If `dryRun: true`: delete temp dir, mark job `completed` with `{ commitHash: null, dryRun: true }`. No git or Notion operations.
6. Prepare the `content` branch:
   - `git fetch origin main content`. If `origin/content` does not exist: delete temp dir, fail with `BRANCH_MISSING` — "Bootstrap it manually: `git push origin main:content`".
   - `git checkout -B content origin/content`
   - Record remote ref: `REMOTE_REF=$(git rev-parse origin/content)`.
   - `git merge origin/main` (plain merge, no flags needed — `git merge` never rebases by default).
   - If merge fails: `git merge --abort`, delete temp dir, fail with `MERGE_CONFLICT`.
7. Copy generated content from temp dir into `docs/`, `i18n/*/docusaurus-plugin-content-docs/`, `static/images/` in the working directory. Delete temp dir. On any copy error: `git restore --source=HEAD --staged --worktree docs/ i18n/ static/images/ && git clean -fd docs/ i18n/ static/images/`, delete temp dir, fail with `CONTENT_GENERATION_FAILED`.
8. Stage only the content paths: `git add docs/ i18n/ static/images/`
9. Determine what needs to happen:
   - `CONTENT_CHANGED = ! git diff --cached --quiet` (new generated content to commit)
   - `MERGE_ADVANCED = git rev-parse HEAD != REMOTE_REF` (merge in step 6 created new commits)
   - If `CONTENT_CHANGED`: commit (step 10) then push (step 11).
   - Else if `MERGE_ADVANCED` (merge commits exist but generated content is identical): skip commit; push the merge commits (step 11). Set `commitHash` to current HEAD.
   - Else (nothing staged, HEAD == remote ref — truly no-op): skip commit and push. Set `commitHash: null`. Proceed to step 12 only after remote-ref verification in step 12; do not short-circuit status transitions for eligible pages.
10. Commit: `git commit -m "fetch-ready: {pagesProcessed} pages [{jobId}]"`
11. Push to `origin/content`. On non-fast-forward failure: `git fetch origin content && git merge origin/content` then push again (one retry). `commitHash` is the final pushed commit hash (may be a merge commit). If the retry merge fails: `git merge --abort`, `git checkout -B content origin/content`, `git clean -fd docs/ i18n/ static/images/`, fail with `PUSH_FAILED`. If push still fails after the retry, reset to remote (`git checkout -B content origin/content`) and clean generated paths (`git clean -fd docs/ i18n/ static/images/`) before failing with `PUSH_FAILED`. No status transition on push failure.
12. Before any Notion status transition, verify remote head has not changed since this job's final git state: `git fetch origin content` and assert `git rev-parse origin/content == git rev-parse HEAD`. If this check fails, reset to `origin/content` and fail with `PUSH_FAILED` (no status transition).
13. For each page in the **processed set** (non-blank pages that produced committed content — not skipped pages):

- Verify `status === "Ready to publish"` is still current in Notion. If a page's status has changed during the run: skip it as a non-fatal warning (do not add to `failedPageIds`).
- For pages still at "Ready to publish": run `notionStatus:draft` with up to 3 retries using exponential backoff. Collect `failedPageIds` for any that exhaust retries.
- Blank/skipped pages are never transitioned.
- For status-changed pages, append a warning entry with `type: "status_changed"`, `pageId`, and `message`.

14. If `failedPageIds` is non-empty: mark job `failed` with `commitHash` present and `error.code: NOTION_STATUS_PARTIAL`. If empty: mark job `completed`.

#### Response (from `GET /jobs/{jobId}` at terminal state)

```json
{
  "jobId": "uuid",
  "status": "completed" | "failed",
  "pagesProcessed": 10,
  "pagesSkipped": 0,
  "commitHash": "abc123" | null,
  "pagesTransitioned": 10,
  "failedPageIds": [],
  "warnings": [],
  "dryRun": true
}
```

- `dryRun` field only present when `dryRun: true` was requested.
- `commitHash` is `null` for dry runs, zero-result runs, true no-ops (identical content + HEAD already at remote ref), or failures before push.
- `commitHash` is the final pushed commit hash — may be a merge commit if the retry path was taken or if only merge commits needed pushing.

### Job Type 2: `fetch-all`

#### Request

```json
{
  "type": "fetch-all",
  "options": {
    "maxPages": 50,
    "dryRun": false,
    "force": false
  }
}
```

- `maxPages`: safety cap; if 0 or omitted, paginate through all matching Notion pages until exhausted.
- `dryRun` and `force`: same semantics as `fetch-ready`.

#### Execution flow

1. **Assert clean working tree** — same as `fetch-ready` step 1.
2. Query ALL Notion pages where `status !== "Remove"`, using preferred ordering (`Order` asc, `last_edited_time` asc). If needed, apply deterministic post-query sort in application code. Apply `maxPages` cap.
3. If 0 pages found: mark job `completed` with `{ pagesProcessed: 0, pagesSkipped: 0, commitHash: null }`. No git operations.
4. Generate content to `/tmp/fetch-job-{jobId}/` — same rules as `fetch-ready` step 4.
5. If `dryRun: true`: delete temp dir, mark `completed` with `{ commitHash: null, dryRun: true }`. Done.
6. Prepare the `content` branch and perform full-sync deletion **before** merging `main` (so that only Notion-generated files are removed, not hand-managed assets from `main`):
   - `git fetch origin main content`. If `origin/content` missing: delete temp dir, fail with `BRANCH_MISSING`.
   - `git checkout -B content origin/content`
   - Record remote ref: `REMOTE_REF=$(git rev-parse origin/content)`.
   - **Delete** `docs/`, `i18n/*/docusaurus-plugin-content-docs/`, `static/images/` from the working directory. At this point the tree contains only content-branch files, so this removes all previously generated Notion content without touching `main`'s assets.
   - `git merge origin/main` (plain merge — no flags needed; merges in `main`'s application code and hand-managed assets, but not the just-deleted generated paths).
   - If merge fails: `git merge --abort`, `git checkout -B content origin/content` (full branch reset to known remote state), delete temp dir, fail with `MERGE_CONFLICT`.
7. Copy generated content from temp dir into `docs/`, `i18n/*/docusaurus-plugin-content-docs/`, `static/images/`. Delete temp dir. On copy error: `git restore --source=HEAD --staged --worktree docs/ i18n/ static/images/ && git clean -fd docs/ i18n/ static/images/`, delete temp dir, fail with `CONTENT_GENERATION_FAILED`.
8. Stage: `git add docs/ i18n/ static/images/`
9. Determine what to push (same logic as `fetch-ready` step 9):
   - `CONTENT_CHANGED` and `MERGE_ADVANCED` flags. If nothing staged and HEAD == `REMOTE_REF`: treat as success with `commitHash: null`, skip push, mark `completed`.
10. Commit: `git commit -m "fetch-all: {pagesProcessed} pages [{jobId}]"`
11. Push to `origin/content`. Same retry strategy as `fetch-ready` step 11 (non-fast-forward: `git fetch origin content && git merge origin/content`, then push; one retry). On retry failure, reset to `origin/content` and clean generated paths before returning `PUSH_FAILED`.
12. NO Notion status update.
13. Mark `completed`.

#### Response (from `GET /jobs/{jobId}` at terminal state)

```json
{
  "jobId": "uuid",
  "status": "completed" | "failed",
  "pagesProcessed": 50,
  "pagesSkipped": 3,
  "commitHash": "abc123" | null,
  "dryRun": true
}
```

## Failure semantics

1. Dirty tree + `force: false`: fail immediately, `DIRTY_WORKING_TREE`.
2. 0 pages from Notion: succeed immediately, `commitHash: null`, no git ops.
3. `origin/content` missing: fail immediately with bootstrap message, `BRANCH_MISSING`.
4. Merge `main -> content` fails: `git merge --abort`, reset to `origin/content` (`git checkout -B content origin/content`), delete temp dir, fail with `MERGE_CONFLICT`.
5. Push retry merge fails or push fails after retry: reset to `origin/content` (`git checkout -B content origin/content`), clean generated paths (`git clean -fd docs/ i18n/ static/images/`), and fail with `PUSH_FAILED` (if merge is in progress, abort first).
6. Copy error mid-flow: restore/clean generated paths only (`docs/`, `i18n/`, `static/images/`), delete temp dir, fail with `CONTENT_GENERATION_FAILED`.
7. Remote-head verification fails before `fetch-ready` status transitions (branch advanced externally): reset to `origin/content`, fail with `PUSH_FAILED`, and do not perform transitions.
8. Notion status update fails after successful push (`fetch-ready`): `status: "failed"`, `commitHash` present, `failedPageIds` non-empty, `NOTION_STATUS_PARTIAL`.
9. Page status changed during run: skipped and surfaced in `warnings` (non-fatal).
10. API must never push to `main`.
11. Temp directory is always deleted on both success and failure paths.
12. Job execution timeout reached: fail with `JOB_TIMEOUT`, release lock, no further Notion status transitions.

## Concurrency Guard

- **Implementation choice**: single-process VPS with one in-memory lock for all fetch job types.
- While a lock is held, reject new `fetch-ready` / `fetch-all` requests with `409 Conflict`.
- Lock is acquired at job start and always released in a `finally` block.
- Job timeout is mandatory (`JOB_TIMEOUT_MS`, default 20 minutes). Timeout fails the job with `JOB_TIMEOUT` and releases the lock.
- Multi-process locking (file/DB + TTL heartbeat) is explicitly out of scope for this implementation.
- This lock prevents concurrent fetch jobs in this process; it does not prevent out-of-band pushes by other actors. The single-writer model for `origin/content` is therefore a required operational control.
- Clear lock only after job reaches terminal state.
- On API server startup: clear stale in-memory running state. Also check `git status --porcelain`; if the working tree is dirty, log a warning so operators know to pass `force: true` on the next job request.
- Test-only option: support `CI_FETCH_HOLD_MS` (default `0`) to pause after lock acquisition in CI runs so lock-behavior assertions (`202` then `409`) are deterministic.
- `CI_FETCH_HOLD_MS` is read only in the lock-acquisition/test path; it must not change normal fetch generation/merge/push/status-transition timing.

## CI Strategy (in this repo)

### Ephemeral API Validation Workflow

Create `.github/workflows/api-validate.yml`:

1. **Setup**: Install dependencies, rebuild Sharp.
2. **Start API server locally** (not deployed externally). Requires `NOTION_API_KEY` and `DATABASE_ID` secrets (dry-run still queries Notion).
3. **Smoke tests**:
   - `GET /health` → server up.
   - `POST /jobs` without API key → `401`.
   - Start API in CI mode with `CI_FETCH_HOLD_MS=3000` so accepted fetch jobs hold the lock briefly.
   - Send `POST /jobs` (`fetch-ready`, dryRun: true); assert `202` and capture `jobId`.
   - Immediately send `POST /jobs` (`fetch-all`, dryRun: true); assert `409`.
   - Poll `GET /jobs/{jobId}` for the accepted job until terminal state.
4. **Validate terminal response**: `status`, `pagesProcessed`, `commitHash: null`, `dryRun: true` present and correct.
5. **Cleanup**: stop server, remove temp files.

### Workflow triggers

- On changes to `.github/workflows/api-validate.yml` itself.
- Manual dispatch for ad-hoc validation.

> **Scope note**: API source code lives in `api-server/` in this repo, but CI here cannot perfectly replicate VPS runtime conditions. CI validates contract shape and core behavior; comprehensive regression testing must still be done on the VPS before deployment.

## Service ownership and deployment target

- The implementation source of truth is `api-server/` in this repository; deployment target is the VPS service instance.
- CI in this repository validates contract and endpoint behavior, but final verification still requires VPS smoke tests.
- Before deleting `.github/workflows/api-notion-fetch.yml`, run and record a VPS smoke test for both `fetch-ready` and `fetch-all` against the deployed service.

## Runtime observability and health

- Required endpoint: `GET /health` returning `200` with basic service metadata (`status`, `version`, `uptime`).
- Log structured lifecycle events at minimum: `job_started`, `job_completed`, `job_failed`, `job_timeout`, `job_warning`.
- Every log entry must include `jobId` and `type`; warning entries should include affected page IDs when available.

## Partial-failure recovery playbook (`fetch-ready`)

- If push succeeds but some status transitions fail (`NOTION_STATUS_PARTIAL`), treat content deployment as successful and status transition as partially failed.
- Operator action: re-run `fetch-ready` for remaining pages.
- Idempotency expectation: pages already moved out of "Ready to publish" are skipped; only still-ready pages are transitioned.

## Repository changes (this repo)

### Remove

- `.github/workflows/api-notion-fetch.yml`

### Add

- `.github/workflows/api-validate.yml`

### Update docs

1. Remove references to `Notion Fetch via API` as an operational workflow.
2. Document `fetch-ready` and `fetch-all` as API capabilities.
3. Document the branch/status safety guarantees as required behavior.
4. Document concurrency guard behavior.
5. Document the known limitation: `fetch-ready` does not prune stale artifacts.

### Rollout sequencing

Delete `api-notion-fetch.yml` only after the new API endpoints are live, verified end-to-end on the VPS, and triggerable by their callers. Do not delete first.

## Implementation Progress Tracker

Use this tracker to execute implementation without duplicating plan details. Mark each task as complete in-place.

### Parallelization map

- **Track A (foundation)**: A1-A4, E1-E3
- **Track B (job execution core)**: B1-B5 (starts after A1, A2)
- **Track C (`fetch-ready`)**: C1-C4 (starts after B1-B5)
- **Track D (`fetch-all`)**: D1-D3 (starts after B1-B5; can run in parallel with Track C)
- **Track E (operability + CI + cutover)**: F1-F2, G1-G3, H1-H3 (F can start early; G starts after A1/A3/E1; H starts after C/D/G)

### Task groups

| ID  | Task                                                                                                                                                     | Status | Depends on | Plan reference                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| A1  | Extend existing auth + create-job flow in `routes/jobs.ts`/`auth.ts` to return `202` async enqueue contract for fetch jobs                               | [x]    | -          | `API Shape`, `Existing implementation baseline`                                                           |
| A2  | Extend existing persistence contract in `job-tracker.ts` + `job-persistence.ts` for terminal payload shape and restart behavior                          | [x]    | -          | `API Shape`, `Existing implementation baseline`                                                           |
| A3  | Extend request validation schemas for new fetch types/options (`type`, `maxPages`) while preserving unknown option handling                              | [x]    | -          | `Request validation`, `Existing implementation baseline`                                                  |
| A4  | Align existing error/response helpers to required pre-job + terminal failure envelopes and `error.code` values                                           | [x]    | A1, A2     | `Failure response schema`, `Failure semantics`                                                            |
| B1  | Extend existing job execution skeleton (`job-executor.ts` + `content-repo.ts`) for temp-dir lifecycle and cleanup paths                                  | [x]    | A1, A2     | `Job Type 1: fetch-ready > Execution flow`, `Job Type 2: fetch-all > Execution flow`, `Failure semantics` |
| B2  | Add shared git preflight (`dirty` check + `force` scoped restore/clean behavior) in existing content-repo flow                                           | [x]    | B1         | `fetch-ready` step 1, `fetch-all` step 1                                                                  |
| B3  | Extend branch prep (`fetch`, `checkout -B`, merge `origin/main`, merge conflict reset path) in `content-repo.ts`                                         | [x]    | B1         | `fetch-ready` step 6, `fetch-all` step 6, `Failure semantics`                                             |
| B4  | Extend staging/commit decision logic (`CONTENT_CHANGED`, `MERGE_ADVANCED`, no-op semantics) in existing git task path                                    | [x]    | B1, B3     | `fetch-ready` step 9-10, `fetch-all` step 9-10                                                            |
| B5  | Extend push + non-fast-forward retry merge strategy, remote-head recheck before status transition, and `commitHash` semantics in existing git task path  | [x]    | B4         | `fetch-ready` step 11-12, `fetch-all` step 11, `Failure semantics`                                        |
| C1  | Add Notion query flow for `fetch-ready` (`Ready to publish`, preferred deterministic ordering, `maxPages`)                                               | [x]    | B1         | `fetch-ready` step 2, `fetch-ready` request                                                               |
| C2  | Add content generation rules for `fetch-ready` (translations, blank skip counters)                                                                       | [x]    | C1         | `fetch-ready` step 4, `Response Counters (definitions)`                                                   |
| C3  | Add status transition stage with status re-check + retry; capture status-change race in structured `warnings` entries                                    | [x]    | B5, C2     | `fetch-ready` step 13, `Response Counters (definitions)`                                                  |
| C4  | Add terminal result logic for partial status failures (`NOTION_STATUS_PARTIAL`)                                                                          | [x]    | C3         | `fetch-ready` step 14, `Failure semantics`                                                                |
| D1  | Add Notion query flow for `fetch-all` (`status !== Remove`, preferred deterministic ordering, pagination/`maxPages`)                                     | [x]    | B1         | `fetch-all` step 2, `fetch-all` request                                                                   |
| D2  | Add full-sync deletion semantics before merge, then copy generated output                                                                                | [x]    | B3, D1     | `fetch-all` step 6-7                                                                                      |
| D3  | Enforce `fetch-all` no-status-update behavior and terminal response contract                                                                             | [x]    | D2, B5     | `fetch-all` step 12-13, `fetch-all` response                                                              |
| E1  | Add single-process in-memory lock for all fetch job types (`409` while running) and integrate with existing create-job path                              | [x]    | A1         | `Concurrency Guard`                                                                                       |
| E2  | Extend timeout handling (`JOB_TIMEOUT_MS`, default 20m) with `JOB_TIMEOUT` failure and lock release                                                      | [x]    | E1, B1     | `Concurrency Guard`, `Failure semantics`, `Failure response schema`                                       |
| E3  | Add startup behavior (clear in-memory running state, warn if git tree dirty)                                                                             | [x]    | E1         | `Concurrency Guard`                                                                                       |
| F1  | Validate/extend `GET /health` endpoint contract (`200`, status/version/uptime) in existing route                                                         | [x]    | A1         | `Runtime observability and health`, `CI Strategy`                                                         |
| F2  | Add/extend structured lifecycle logs (`job_started`, `job_completed`, `job_failed`, `job_timeout`, `job_warning`)                                        | [x]    | B1, E2     | `Runtime observability and health`                                                                        |
| G1  | Add `.github/workflows/api-validate.yml` scaffold (setup, start local API, cleanup)                                                                      | [x]    | A1, F1     | `CI Strategy (in this repo)`                                                                              |
| G2  | Add CI smoke assertions (`401` envelope, deterministic lock behavior using `CI_FETCH_HOLD_MS`, sequential `202` then immediate `409`, poll terminal job) | [x]    | G1, E1     | `Ephemeral API Validation Workflow`                                                                       |
| G3  | Validate terminal dry-run response checks and workflow trigger scope                                                                                     | [x]    | G2         | `Ephemeral API Validation Workflow`, `Workflow triggers`                                                  |
| H1  | Update docs references to new runtime model (`fetch-ready`/`fetch-all`, guarantees, limitations)                                                         | [x]    | C4, D3     | `Update docs`                                                                                             |
| H2  | Run VPS smoke validation for deployed service before workflow removal                                                                                    | [x]    | C4, D3, F1 | `Service ownership and deployment target`, `Rollout sequencing`                                           |
| H3  | Remove `.github/workflows/api-notion-fetch.yml` only after H2 passes                                                                                     | [x]    | H2         | `Rollout sequencing`, `Repository changes (this repo)`                                                    |

### H2 execution record

- Date: 2026-02-19
- Command: `scripts/ci-validation/vps-fetch-smoke.sh`
- Result: `fetch-ready` dry-run terminal response validated, `fetch-all` dry-run terminal response validated
- Notes: executed against the API runtime with production-equivalent fetch env (`GITHUB_REPO_URL`, `GITHUB_TOKEN`, `GIT_AUTHOR_*`, `WORKDIR`) and auth enabled.

## Acceptance criteria

1. `api-notion-fetch.yml` removed (after verification).
2. `POST /jobs` without API key returns `401` with pre-job error envelope (`status`, `error.code`, `error.message`) and no `jobId`.
3. Invalid request (e.g., unknown `type`, negative `maxPages`) returns `400` with pre-job error envelope and no `jobId`.
4. `fetch-ready` callable returns `202`.
5. `fetch-all` callable returns `202`.
6. `GET /jobs/{jobId}` returns the terminal contract for known jobs and `404` for unknown/expired jobs.
7. Concurrent fetch requests while lock is held return `409` with pre-job error envelope and no `jobId`.
8. Successful `fetch-ready` (non-dry, non-zero pages) transitions pages `Ready to publish -> Draft published` and has `failedPageIds: []`.
9. If `fetch-ready` creates a content commit, only generated paths (`docs/`, `i18n/`, `static/images/`) are staged for that commit.
10. Merge-only push in `fetch-ready` is allowed when content is unchanged but `main` merge advanced `content`.
11. Successful `fetch-all` performs stale deletions, does not run Notion status updates, and does not modify `i18n/*/code.json` via generation logic.
12. Zero-result runs return `completed` with `commitHash: null` and no git/Notion ops.
13. Dirty tree + `force: false` fails immediately with no git/Notion ops.
14. Dirty tree + `force: true` cleans generated paths only (`docs/`, `i18n/`, `static/images/`) and then proceeds.
15. Identical content true no-op returns `commitHash: null` with no push; `fetch-ready` still transitions eligible pages.
16. Merge conflict triggers `git merge --abort`, resets to `origin/content`, and fails with `MERGE_CONFLICT`.
17. Non-fast-forward push uses merge-based retry; `commitHash` reflects the final pushed commit on success, and failed retry paths reset to `origin/content`.
18. `fetch-ready` re-checks `origin/content == HEAD` before status transitions; mismatch fails with `PUSH_FAILED` and no transitions are applied.
19. Partial Notion failure returns `status: "failed"`, `commitHash` present, and non-empty `failedPageIds`.
20. Status-changed pages during transition are non-fatal and surfaced via structured `warnings` entries.
21. Missing `origin/content` fails with `BRANCH_MISSING` and bootstrap message.
22. Job timeout returns terminal failure with `error.code: JOB_TIMEOUT`, releases lock, and stops further status transitions.
23. Terminal job state survives API server restart (persisted).
24. CI validates `401` envelope and deterministic lock behavior (`CI_FETCH_HOLD_MS` with sequential `202` then immediate `409`), dry-run poll cycle, and clean teardown.
25. Plan documents and enforces single-writer ownership of `origin/content` as a precondition for status-safety guarantees.
