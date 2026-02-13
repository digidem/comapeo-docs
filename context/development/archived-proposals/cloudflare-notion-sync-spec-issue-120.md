# Issue #120 — Move Notion fetch from GitHub Actions to Cloudflare Worker

## Context / Problem

Today, the `content` branch is populated by running Notion fetch + generation inside GitHub Actions, then committing generated output back to `content`.

This has been unstable (sometimes succeeds, sometimes fails) and slow (long runtimes), especially for full fetches and/or image-heavy pages.

Primary workflow to look at:

- `.github/workflows/sync-docs.yml` (runs `bun notion:fetch`, commits `docs/`, `i18n/`, `static/images/` to `content`)
- `.github/workflows/notion-fetch-test.yml` (runs `bun run notion:fetch-all`, commits to `content`)

Relevant scripts:

- `scripts/notion-fetch/index.ts` (published-only fetch pipeline)
- `scripts/notion-fetch-all/index.ts` (full CLI; supports `--max-pages`)
- Shared Notion tooling: `scripts/notionClient.ts`, `scripts/notionPageUtils.ts`, `scripts/fetchNotionData.ts`, etc.
- Architecture notes: `NOTION_FETCH_ARCHITECTURE.md`

## Goal

Make content generation more stable and faster by moving the Notion API fetching + content generation off GitHub Actions and into Cloudflare.

GitHub Actions should still be able to “request a refresh” on demand (manual dispatch and/or repository dispatch), but the heavy Notion work should happen on Cloudflare.

## Non-goals

- Do not change the Notion database schema or page selection rules.
- Do not change Docusaurus site behavior, routing, or rendering.
- Do not attempt to run “PR script validation” (preview workflow that regenerates 5/10/all pages to test changed scripts) on Cloudflare; those runs must execute the PR’s code and are intentionally tied to the PR branch.
- Do not change the “generated content lives on `content` branch” model in this issue.

## Constraints / Important repo rules

- Generated content in `docs/` and `static/` is Notion-derived and should only be pushed to the `content` branch (never to `main`).
- Keep diffs small; avoid new heavy dependencies without approval.
- Prefer targeted checks (eslint/prettier/vitest) over project-wide runs.

## Research summary (Cloudflare feasibility)

Key constraints to design around:

- A plain HTTP Worker request is not suitable for multi-minute work; use Cloudflare Queues or Workflows for long-running jobs.
  - Cloudflare Queues consumer invocations have a **15 minute wall-clock duration limit** and **CPU time defaults to 30 seconds** (configurable up to 5 minutes). (See Cloudflare Queues “Limits”.)
  - Cloudflare Workflows are designed for **durable, multi-step workflows** that can run for “minutes, hours, days, or weeks”. (See Cloudflare Workflows product page/docs.)
- Workers can run Node.js libraries with `nodejs_compat`. Cloudflare supports Node’s `fs` module as a **virtual/ephemeral filesystem**:
  - `node:fs` is enabled by default for Workers with `nodejs_compat` + compatibility date `2025-09-01` or later.
  - For earlier compatibility dates, `node:fs` can be enabled via `enable_nodejs_fs_module`.
- The Notion API is rate limited. Notion’s published guidance is **~3 requests/second per integration on average**, with 429s and `Retry-After` requiring backoff. (See Notion “Request limits”.)

Implication:

- “Run the whole pipeline inside a single `fetch()` request” is risky.
- “Trigger background job → poll status → download artifact” is the stable pattern.

## Recommended approach (Option B)

**Architecture:** Cloudflare Worker (HTTP API) + Cloudflare Workflows generate a single zip artifact containing `docs/`, `i18n/`, `static/images/`. GitHub Actions downloads that artifact and commits it to the `content` branch (git operations stay in Actions).

Why this is the right split:

- Avoids having the Worker directly push to GitHub (Git Data API is doable, but significantly more complex and can be rate-limit heavy with many files).
- Keeps the “commit to content branch” logic in GitHub Actions where git operations already exist and are easy to debug.
- Moves the flaky/slow part (Notion API + generation + image processing) into Cloudflare’s runtime.

### Alternatives (document, but don’t implement unless chosen)

**Option A: Worker commits directly to `content` via GitHub API**

- Pros: GitHub Actions no longer needs to do commit/push; could reduce time.
- Cons: Must implement Git Data API tree/blob/commit update logic; can be complex for large file sets and binary assets; adds GitHub API rate/size failure modes.

**Option C: Improve GitHub Actions stability without Cloudflare**

- Pros: Lowest engineering risk; no new infrastructure.
- Cons: Does not address the “Actions network/runtime instability” root cause, and still runs long jobs on Actions.

## SPEC

## Resolved decisions (no open questions)

These decisions remove ambiguity for implementation:

1. **Use Cloudflare Workflows (required).** Do not implement a Queues-based fallback in this issue. If Workflows are not available on the account, pause and request that Workflows be enabled (or revisit the approach).
2. **Worker mode will not resize or compress images.** The current pipeline uses `sharp`, `spawn`, and `pngquant-bin` (not Workers-friendly). In Worker mode:
   - Download images as-is to `static/images/` and update markdown paths to `/images/...`.
   - No resizing, no `sharp`, no imagemin plugins, no pngquant.
3. **Artifact retention: 7 days.** Store artifacts in R2 with a 7-day lifecycle/TTL.
4. **Scope:** Migrate only the “populate `content` branch” workflow (`.github/workflows/sync-docs.yml`). Keep `.github/workflows/notion-fetch-test.yml` Action-based for now.
5. **Add `dryRun` support.** The Worker must support a `dryRun: true` request that generates a tiny deterministic artifact (no Notion calls) for smoke-testing deployments and the Actions integration.
6. **Workers Paid plan is required.** Workers Free limits CPU time to 10ms per request and Workflows Free limits compute time to 10ms per step, which is not sufficient for Notion fetching + markdown generation + packaging. Use Workers Paid ($5/month minimum).

## Cost guardrails (aim for $0 usage overages)

This design is intended to keep variable costs at or near $0/month beyond the Workers Paid base charge, by keeping usage tiny:

- **Workflows/Workers requests:** GitHub polling every 15s for 60 minutes is ~240 requests per run, plus trigger + artifact download. Even 50 runs/month is far below the included 10M requests/month on Workers Paid.
- **Workflows CPU:** Most time is network I/O (Notion + image downloads). Keep CPU-heavy work small by:
  - disabling image resize/compress in Worker mode (already required)
  - zipping once at the end (single pass)
  - avoiding unnecessary parsing or duplicate transforms
- **Workflow state storage:** Set Workflow instance retention to the minimum needed for debugging (recommend 1 day) so state does not accumulate. Workflows include 1GB/month; overages are billed per GB-month.
- **R2 (artifact storage):** Store only one zip per run and expire after 7 days. R2 includes 10 GB-month storage, 1M Class A ops/month, 10M Class B ops/month, and free egress.
- **KV:** Status polling is read-heavy; keep polling interval at 15 seconds (not faster) and avoid chatty status writes. KV Free limits are daily; on Workers Paid, KV has monthly included usage and low overage rates.

## Required configuration (exact names)

### Cloudflare resources

Create these resources in the same Cloudflare account used for this repo’s Pages project:

1. **Worker**
   - Name: `comapeo-docs-notion-sync`
   - Entry: `workers/notion-sync/src/index.ts`
2. **Workflow**
   - Name: `notion-sync`
   - Entry: `workers/notion-sync/src/workflow.ts`
3. **R2 bucket (artifact storage, 7-day retention)**
   - Bucket name: `comapeo-docs-notion-sync-artifacts`
   - Object key prefix: `artifacts/`
   - Lifecycle rule: expire objects under `artifacts/` after 7 days
4. **KV namespace (job status + lock)**
   - Namespace name: `comapeo-docs-notion-sync-jobs`
   - Keys:
     - `jobs/<jobId>` → job status JSON
     - `lock/content-sync` → a lock record with TTL (prevents concurrent worker jobs)

### Wrangler configuration (exact file and keys)

Create `workers/notion-sync/wrangler.toml` with these requirements:

- `name = "comapeo-docs-notion-sync"`
- `main = "src/index.ts"`
- `compatibility_date = "2025-12-09"` (must be `>= 2025-09-01` so `node:fs` is available by default when using `nodejs_compat`)
- `compatibility_flags = ["nodejs_compat"]`
- Bindings:
  - KV: `JOBS_KV`
  - R2: `ARTIFACTS_R2`
  - Workflow binding: `NOTION_SYNC_WORKFLOW` with `class_name = "NotionSyncWorkflow"`

Minimum TOML shape (fill in IDs after creating resources):

```toml
name = "comapeo-docs-notion-sync"
main = "src/index.ts"
compatibility_date = "2025-12-09"
compatibility_flags = ["nodejs_compat"]

kv_namespaces = [
  { binding = "JOBS_KV", id = "<KV_NAMESPACE_ID>" }
]

[[r2_buckets]]
binding = "ARTIFACTS_R2"
bucket_name = "comapeo-docs-notion-sync-artifacts"

[[workflows]]
name = "notion-sync"
binding = "NOTION_SYNC_WORKFLOW"
class_name = "NotionSyncWorkflow"
```

### Cloudflare Worker secrets / vars

Set these secrets for `comapeo-docs-notion-sync`:

- `NOTION_API_KEY`
- `DATA_SOURCE_ID`
- `DATABASE_ID`
- `NOTION_SYNC_WORKER_TOKEN` (shared bearer token; see Security)

Set these non-secret vars:

- `NOTION_RUNTIME=worker`
- `NOTION_IMAGE_OPTIMIZE=false`
- `NOTION_SYNC_ARTIFACT_TTL_DAYS=7`
- `NOTION_SYNC_BASE_URL=/comapeo-docs/` (default if request omits `baseUrl`)

### GitHub Actions secrets

Add these repository secrets:

- `NOTION_SYNC_WORKER_URL` (the deployed Worker base URL, ending in `.workers.dev`)
- `NOTION_SYNC_WORKER_TOKEN` (must match Worker secret `NOTION_SYNC_WORKER_TOKEN`)

### 1) Cloudflare Worker API

The Worker `comapeo-docs-notion-sync` exposes these endpoints:

1. `POST /sync`
   - Purpose: Request a new Notion sync run.
   - Auth: Required (see Security section). Reject unauthenticated requests with 401.
   - Request JSON:
     - `mode`: `"published"` | `"all"`
       - `"published"` maps to current `bun notion:fetch` behavior (Ready-to-Publish pages only).
       - `"all"` maps to `bun run notion:fetch-all` behavior.
     - `maxPages` (optional): number
       - Only valid for `mode: "all"`. Mirrors `--max-pages`.
     - `force` (optional): boolean
       - `true` bypasses caches and reprocesses everything.
     - `baseUrl` (optional): string
       - Default: `NOTION_SYNC_BASE_URL` (configured in Worker).
     - `dryRun` (optional): boolean
       - If `true`, do not call Notion. Generate an artifact with a minimal `docs/` and `sync-metadata.json` so GitHub Actions can validate “trigger → poll → download → unzip → commit” end-to-end.
   - Response (202 Accepted):
     - `jobId`: string (stable identifier)
     - `statusUrl`: string (`/sync/<jobId>`)
   - Error responses:
     - 400 for invalid JSON or invalid combinations (for example: `maxPages` with `mode: "published"`).
     - 409 if a job is already running (lock held); response includes the running `jobId`.

2. `GET /sync/:jobId`
   - Purpose: Poll status and read summary.
   - Auth: Required.
   - Response (200):
     - `status`: `"queued" | "running" | "succeeded" | "failed"`
     - `startedAt` / `finishedAt` (ISO strings)
     - `progress` (optional):
       - `phase`: `"fetch" | "generate" | "images" | "packaging" | "upload"`
       - `processed` / `total` (numbers; best-effort)
     - `summary` (only when finished):
       - `docsCount`, `i18nCount`, `imageCount`
       - `durationMs`
       - `notionRequests` (integer; set to 0 if unknown)
       - `rateLimitEvents` (integer; set to 0 if unknown)
     - `artifact` (only when succeeded):
       - `downloadUrl`: string (`/sync/<jobId>/artifact`)
   - Error responses:
     - 404 if `jobId` is unknown
     - 410 if the artifact/status was expired/cleaned up

3. `GET /sync/:jobId/artifact`
   - Purpose: Download the generated artifact.
   - Auth: Required.
   - Response (200):
     - Content-Type: `application/zip`
     - Body: zip with:
       - `docs/**`
       - `i18n/**` (if present)
       - `static/images/**` (including emojis that are normally gitignored on `main`)
       - `sync-metadata.json` (job summary + timestamps + Worker version metadata)

### 2) Background execution model (Cloudflare Workflows)

Implement background execution with **Cloudflare Workflows**:

- Durable state for long-running jobs, explicit step boundaries, retries, and safe progress reporting.

Minimum requirements:

- The `/sync` endpoint must return quickly (don’t keep the request open).
- Status must be queryable via `GET /sync/:jobId`.
- The artifact must remain available long enough for Actions to download it (required: 7 days retention).

Locking requirements:

- A single “content sync” job may run at a time.
- `/sync` must acquire `lock/content-sync` in KV with a TTL of 2 hours.
- On workflow completion (success or failure), release the lock.

### 3) Runtime + paths (must be Worker-safe)

The Worker must generate files into an explicit output root (not repo-relative paths computed from `__dirname`).

Define a single output root directory per job:

- `outputRoot = /tmp/notion-sync/<jobId>` (ephemeral FS)
- Generate into:
  - `<outputRoot>/docs/**`
  - `<outputRoot>/i18n/**` (if any)
  - `<outputRoot>/static/images/**`

Required refactor in the existing Notion generator code:

- Remove hard-coded paths based on `__dirname` (for example: `scripts/notion-fetch/generateBlocks.ts` currently uses `path.join(__dirname, "../../docs")`).
- Introduce a shared resolver that reads `process.env.NOTION_OUTPUT_ROOT`:
  - New module: `scripts/notion-fetch/outputPaths.ts`
  - Exports:
    - `getOutputRoot(): string` (defaults to repo root when env not set)
    - `getDocsPath(): string`
    - `getI18nPath(locale: string): string`
    - `getImagesPath(): string`
- Update all writes to use these functions (minimum: `scripts/notion-fetch/generateBlocks.ts`, and any writer used by image/emoji download).

Worker-only incremental sync behavior (required):

- In Worker mode (`NOTION_RUNTIME=worker`), the generator must run as a full rebuild and must not attempt incremental sync features that depend on hashing source files on disk.
- Update `scripts/notion-fetch/generateBlocks.ts` so that when `process.env.NOTION_RUNTIME === "worker"`:
  - it does not call `computeScriptHash()` (`scripts/notion-fetch/scriptHasher.ts`)
  - it does not call `loadPageMetadataCache()` / `savePageMetadataCache()` (no `.cache/page-metadata.json` persistence is required)
  - it does not perform deleted-page detection
  - it logs a single line: `incremental sync disabled (worker runtime)`

To keep internal path normalization consistent when cache is disabled, update:

- `scripts/notion-fetch/pageMetadataCache.ts` so `PROJECT_ROOT` is derived from `process.env.NOTION_OUTPUT_ROOT` when set; otherwise it falls back to the current `__dirname`-based behavior.

Worker must set:

- `process.env.NOTION_OUTPUT_ROOT = outputRoot`
- `process.env.NOTION_RUNTIME = "worker"`
- `process.env.NOTION_IMAGE_OPTIMIZE = "false"`

### 3) Content generation inside Cloudflare

Use the existing generator functions (not the CLI entrypoints):

Execution mapping:

- `mode: "published"`: call `runFetchPipeline()` from `scripts/notion-fetch/runFetch.ts` with the same filter logic as `scripts/notion-fetch/index.ts`.
- `mode: "all"`: call `fetchAllNotionData()` from `scripts/notion-fetch-all/fetchAll.ts` with:
  - `exportFiles: true`
  - `maxPages` mapped from request (optional)

**Worker image handling (required):**

- Do not import or execute:
  - `sharp`
  - `node:child_process` spawning (used by pngquant)
  - imagemin plugins that depend on native binaries
- Instead, implement a Worker-mode path that:
  - downloads images (with timeouts + retries)
  - writes them to `static/images/<stable-name>.<ext>`
  - returns markdown paths as `/images/<file>`

Required implementation details:

- Worker sets:
  - `NOTION_RUNTIME=worker`
  - `NOTION_IMAGE_OPTIMIZE=false`
- In Worker mode, the pipeline must still:
  - download images
  - write images to `static/images/`
  - replace markdown URLs to `/images/...`
  - but must not resize or compress images

Concrete refactor (required) to make the existing pipeline Worker-safe without maintaining duplicate implementations:

1. `scripts/notion-fetch/imageProcessing.ts`
   - Replace axios usage with native `fetch()` for image downloading (Node and Worker).
   - Guard all optimization steps behind `process.env.NOTION_IMAGE_OPTIMIZE !== "false"`.
   - Remove top-level imports of non-Worker-safe modules:
     - Move `sharp` usage to a lazy `await import("sharp")` inside the optimize-only path.
     - Do not import `node:child_process` at module top-level (see `imageCompressor.ts`).

2. `scripts/notion-fetch/imageProcessor.ts`
   - Remove top-level `import sharp from "sharp"`.
   - Implement `processImage()` so it lazily imports `sharp` only when called.
   - `processImage()` must never be called when `NOTION_IMAGE_OPTIMIZE=false`.

3. `scripts/notion-fetch/imageCompressor.ts`
   - Remove top-level `import { spawn } from "node:child_process"`.
   - Lazy-import `node:child_process` inside the PNG compression function (only used when optimization is enabled).
   - Compression must never run when `NOTION_IMAGE_OPTIMIZE=false`.

4. `scripts/notion-fetch/generateBlocks.ts`
   - Stop importing `sanitizeMarkdownContent` from `scripts/notion-fetch/utils.ts`.
   - Import `sanitizeMarkdownContent` directly from `scripts/notion-fetch/contentSanitizer.ts` so Worker builds never load optimizer code indirectly.

Image filename algorithm (required):

- `sha256(url)` hex
- filename = `<sha256-hex.slice(0, 24)><ext>`
- ext is chosen from:
  1. content-type header, else
  2. magic bytes, else
  3. URL pathname extension, else `.bin`

### 4) Artifact packing

Produce a single artifact to keep the integration with GitHub Actions simple:

- Zip is required.
- Use `fflate` to create the zip. Add it as a direct dependency in the root `package.json` (do not rely on transitive dependencies).
- Include a `sync-metadata.json` for debugging.

`sync-metadata.json` schema (required):

- `jobId`: string
- `mode`: `"published" | "all"`
- `dryRun`: boolean
- `baseUrl`: string
- `startedAt`: ISO string
- `finishedAt`: ISO string
- `durationMs`: number
- `counts`: `{ docs: number; i18n: number; images: number }`
- `worker`: `{ id: string; tag: string }`
  - `id`: Cloudflare version metadata id if available, otherwise `"unknown"`
  - `tag`: release tag if provided at deploy time, otherwise `"unknown"`

### 5) GitHub Actions integration

Update `.github/workflows/sync-docs.yml` so it no longer runs `bun notion:fetch` in Actions.

New flow:

1. Checkout `content` branch (unchanged).
2. Trigger worker job:
   - `POST ${{ secrets.NOTION_SYNC_WORKER_URL }}/sync` with desired payload.
3. Poll `GET /sync/:jobId` until:
   - success → continue
   - failed → exit non-zero and surface Worker error summary
   - timeout (60 minutes) → fail clearly
4. Download artifact from `GET /sync/:jobId/artifact`.
5. Unzip into the workspace root, overwriting:
   - `docs/`, `i18n/`, `static/images/`
6. Commit + push to `content` exactly as today (reuse existing staging rules, including forced emoji add).

Exact implementation requirements for `.github/workflows/sync-docs.yml` (Worker path):

- Trigger:
  - Use `curl` to `POST "$NOTION_SYNC_WORKER_URL/sync"` with:
    - header `Authorization: Bearer $NOTION_SYNC_WORKER_TOKEN`
    - JSON body: `{"mode":"published","force":true,"dryRun":false}`
- Poll:
  - Poll every 15 seconds for up to 60 minutes.
  - Fail the workflow if status is `failed` or if timeout is reached.
- Download:
  - `curl -L -o notion-sync.zip "$NOTION_SYNC_WORKER_URL/sync/$JOB_ID/artifact"` with the same auth header.
- Unpack:
  - Delete the existing `docs/`, `i18n/`, and `static/images/` directories before unzipping (prevents stale files lingering).
  - `unzip -o notion-sync.zip`

Notes:

- Keep the existing `concurrency` group `content-branch-updates`.
- Actions should not need `NOTION_API_KEY` anymore for this workflow; Notion secrets move to Cloudflare.
- Do not change `.github/workflows/notion-fetch-test.yml` in this issue.

### 6) Security

Requirements:

- The Worker must not be publicly triggerable.
- Secrets must not be logged.

Auth method (required): shared bearer token

- Require `Authorization: Bearer <token>` where `<token>` equals `NOTION_SYNC_WORKER_TOKEN`.
- Apply to all endpoints (`/sync`, `/sync/:jobId`, `/sync/:jobId/artifact`).
- Constant-time compare for token validation.

### 7) Observability / Debugging

Minimum:

- Log a single line per phase transition with `jobId`, phase, and elapsed time.
- Store an error string (sanitized) in job status for `failed` runs.
- Include counts in `sync-metadata.json` (docs/i18n/images).

Nice-to-have:

- Persist a short text log in R2 per job (`sync-logs/:jobId.txt`) for postmortems.

### 8) Rollout / fallback

Feature flag (required):

- Add a `workflow_dispatch` boolean input `useWorker` to `.github/workflows/sync-docs.yml`.
- Default: `true`.
- If `useWorker=false`, run the current Action-based path (`bun notion:fetch` + commit to `content`) unchanged.

## Development plan (step-by-step)

1. **Create Worker package in-repo**
   - Create directory: `workers/notion-sync/`
   - Create files:
     - `workers/notion-sync/wrangler.toml`
     - `workers/notion-sync/src/index.ts` (HTTP API)
     - `workers/notion-sync/src/workflow.ts` (Workflow logic)
     - `workers/notion-sync/src/zip.ts` (zip creation using `fflate`)
     - `workers/notion-sync/src/statusStore.ts` (KV read/write helpers)
     - `workers/notion-sync/src/r2.ts` (artifact upload/download helpers)

2. **Implement auth**
   - `workers/notion-sync/src/auth.ts` validates `Authorization` header against `NOTION_SYNC_WORKER_TOKEN`.

3. **Implement `/sync` trigger + lock**
   - Acquire KV lock `lock/content-sync` (TTL 2 hours).
   - Create `jobId` (uuid).
   - Persist initial status to KV at `jobs/<jobId>`.
   - Start Workflow instance with input payload (mode/maxPages/force/baseUrl/dryRun, jobId, outputRoot).

4. **Implement Workflow runner**
   - Steps (must update KV status between steps):
     1. `fetch` (or `dryRun-generate`)
     2. `generate`
     3. `images` (Worker-mode download only, no optimize)
     4. `packaging` (zip)
     5. `upload` (R2 put)
   - On completion:
     - write final status to KV
     - release lock

5. **Refactor generator paths**
   - Add `scripts/notion-fetch/outputPaths.ts` and refactor writers to use `process.env.NOTION_OUTPUT_ROOT`.
   - Ensure all generated output lands under that root.

6. **Refactor image processing to be Worker-safe**
   - Implement the `.node` / `.worker` split described above.
   - Ensure Worker build does not import `sharp`, `axios`, `node:child_process`, imagemin plugins, or `pngquant-bin`.

7. **Implement artifact download**
   - `GET /sync/:jobId/artifact` streams `r2.get("artifacts/<jobId>.zip")`.

8. **Update `.github/workflows/sync-docs.yml`**
   - Add `useWorker` input with default `true`.
   - When `useWorker=true`: trigger/poll/download/unzip/commit.
   - When `useWorker=false`: run current `bun notion:fetch` path unchanged.

9. **Add tests**
   - Add unit tests for Worker request validation (zod) and auth.
   - Add a Worker `dryRun` test that asserts the zip contains `docs/` + `sync-metadata.json`.

## Acceptance criteria

- `sync-docs.yml` completes without running Notion fetch scripts locally in Actions.
- A Cloudflare-hosted sync job can be triggered from Actions and reliably returns:
  - job status
  - downloadable artifact
- After unzipping the artifact, the workflow commits and pushes to `content` successfully.
- Notion credentials are stored only on Cloudflare (not required in Actions for sync-docs).
- Failures are actionable:
  - Worker status reports `failed` with a sanitized error message
  - Actions logs include `jobId` and a direct hint to fetch status/logs
- Worker-produced artifacts always include `static/images/**` (directory may be empty) and do not perform image optimization.

## Reference links (primary docs)

- Cloudflare Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Cloudflare Workers `node:fs`: https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/
- Cloudflare Workers compatibility flags: https://developers.cloudflare.com/workers/configuration/compatibility-flags/
- Cloudflare Workflows overview: https://workers.cloudflare.com/product/workflows
- Notion API request limits: https://developers.notion.com/reference/request-limits
