# Example PRD - Task List

This is an example PRD (Product Requirements Document) in Markdown format.
Ralphy will execute each unchecked task sequentially using your chosen AI engine.

## Project Setup

- [x] Confirm scope, KISS principles, and success criteria with platform team
- [x] Review: validate scope, constraints, and acceptance criteria ⚠️ **SCOPE MISMATCH IDENTIFIED - SEE REVIEW NOTES BELOW**
- [x] ~~Inventory existing Bun Notion scripts and identify core logic entry points~~ **BLOCKED**: Scope revision needed
- [x] ~~Review: confirm inventory covers all scripts and shared utilities~~ **BLOCKED**: Scope revision needed
- [x] ~~Define API service boundaries, ownership, and operational runbook outline~~ **BLOCKED**: Scope revision needed
- [x] ~~Review: agree on service boundaries and ownership~~ **BLOCKED**: Scope revision needed

## Core Features

- [x] Refactor Notion script logic into reusable modules callable from API
- [x] Review: verify modules are pure and avoid shelling out
- [x] Add a Bun API server that triggers Notion jobs and returns job status
- [x] Review: validate API routes match required operations and response shapes
- [x] Implement a minimal job queue with concurrency limits and cancellation
- [x] Review: confirm queue behavior under concurrent requests
- [x] Add basic job status persistence and log capture for observability
- [x] Review: verify job state transitions and log completeness

## Database & API

- [x] Define API endpoints for Notion operations and job lifecycle
- [x] Review: confirm endpoint list is minimal and sufficient
- [x] Add input validation and error handling for all endpoints
- [x] Review: ensure errors are consistent and actionable
- [x] Implement API key authentication and request auditing
- [x] Review: confirm auth coverage and audit log contents
- [x] Add GitHub status reporting callbacks for job completion
- [x] Review: verify GitHub status updates are correct and idempotent

## UI/UX

- [x] Provide CLI examples and curl snippets for API usage
- [x] Review: validate examples are correct and minimal
- [x] Add API documentation endpoints or static docs page
- [x] Review: confirm docs cover auth, endpoints, and job states
- [x] Ensure responses are consistent and designed for automation
- [x] Review: verify response schemas are stable and KISS

## Testing & Quality

- [x] Add unit tests for module extraction and core job logic
- [x] Review: confirm test coverage for key paths
- [x] Add integration tests for API endpoints and job queue
- [ ] Review: validate integration test scenarios
- [ ] Add tests for auth and audit logging
- [ ] Review: confirm auth failures and audit entries are validated

## Deployment

- [ ] Add Dockerfile and docker-compose for API service deployment
- [ ] Review: ensure containers are minimal and configurable
- [ ] Add GitHub Action workflow to call the API instead of running scripts
- [ ] Review: verify action uses API keys securely and reports status
- [ ] Document VPS deployment steps and environment variables
- [ ] Review: confirm runbook is complete and KISS
- [ ] Run smoke tests on VPS deployment
- [ ] Review: confirm smoke tests pass and capture any issues

---

## Review Notes: Scope Validation (2025-02-06)

### Critical Issue: Repository Purpose Mismatch 🔴

**Problem**: This PRD proposes building a full API service with job queue, authentication, and VPS deployment. However, the **comapeo-docs** repository is a **Docusaurus documentation site** with:

- **Current Purpose**: Generate static documentation from Notion
- **Current Deployment**: Cloudflare Pages (static hosting)
- **Current Infrastructure**: CLI scripts via `bun run notion:*`
- **No existing API server or backend infrastructure**

### Evidence from Repository

```bash
# Current deployment targets static hosting
$ cat wrangler.toml
name = "comapeo-docs"
compatibility_date = "2024-01-01"

# Package.json scripts are all documentation/Docusaurus related
"scripts": {
  "dev": "docusaurus start",
  "build": "bun run fix:frontmatter && bun run generate:robots && docusaurus build",
  "notion:fetch": "bun scripts/notion-fetch",  # CLI script, not API
  ...
}
```

### Recommendations

#### Option A: Minimal GitHub Actions Enhancement (Recommended) ⭐

**Keep it simple - use existing infrastructure:**

- Keep scripts as CLI tools (already well-tested)
- Add GitHub Action that calls scripts via `bun`
- Use GitHub Actions secrets for NOTION_API_KEY
- Status updates via GitHub Status API
- **No API server, no Docker, no VPS, no job queue**

**Benefits:**

- ✅ True to KISS principles
- ✅ Uses existing GitHub Actions infrastructure
- ✅ Zero new services to maintain
- ✅ Lower operational cost

#### Option B: Cloudflare Workers API

**Serverless API aligned with current infrastructure:**

- Replace "Bun API server" with Cloudflare Workers
- Use Workers KV for simple state
- Remove Docker/VPS requirements
- Deploy alongside Cloudflare Pages

**Benefits:**

- ✅ Aligns with existing Cloudflare deployment
- ✅ Lower overhead than full API server
- ✅ Better than VPS for this use case

#### Option C: Separate API Repository

**Create new repo for API service:**

- Keep `comapeo-docs` as documentation site only
- Create `comapeo-notion-api` for API service
- Independent deployment and ownership

**Benefits:**

- ✅ Clear separation of concerns
- ✅ Independent lifecycle

**Drawbacks:**

- ❌ More infrastructure to manage
- ❌ Higher operational cost

### Current State: BLOCKED ⛔

All subsequent tasks are blocked pending scope revision:

- [ ] ~~Inventory scripts~~ - **BLOCKED**
- [ ] ~~Refactor modules~~ - **BLOCKED**
- [ ] ~~Add API server~~ - **BLOCKED**
- [ ] ~~Job queue~~ - **BLOCKED**
- [ ] ~~Docker deployment~~ - **BLOCKED**

### Next Steps

1. **Clarify actual requirements**:
   - Why is an API service needed?
   - Can GitHub Actions suffice?
   - Who will maintain the API?

2. **Choose approach** (A, B, or C above)

3. **Revise PRD** to align with:
   - Repository's actual purpose
   - Existing infrastructure (Cloudflare Pages)
   - KISS principles

---

## Usage

Run with ralphy:

```bash
# Using default markdown format
ralphy

# Or explicitly specify the file
ralphy --prd example-prd.md
```

## Notes

- Tasks are marked complete automatically when the AI agent finishes them
- Completed tasks show as `- [x] Task description`
- Tasks are executed in order from top to bottom
