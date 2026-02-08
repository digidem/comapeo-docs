# Notion API Service Reviewer PRD - Task List

This PRD is for reviewer execution only.
Ralphy will execute each unchecked review task sequentially using your chosen AI engine.

## Project Setup

- [x] Validate PR scope against repository constraints and confirm acceptance criteria
- [x] Review changed files list and map each file to a requirement in the implementation PRD
- [x] Verify generated-content policy compliance for `docs/`, `static/`, and `i18n/` updates

## Core Features

- [x] Review API server entrypoints and ensure routes match intended job operations
- [x] Validate job queue behavior for concurrency, cancellation, and status transitions
- [x] Confirm job persistence and log capture are deterministic and recoverable
- [x] Review GitHub status callback flow for idempotency and failure handling

## Database & API

- [x] Validate endpoint input schemas and error responses for all API operations
- [x] Verify authentication middleware coverage for protected operations
- [x] Confirm audit records are written for authenticated and failed requests

## UI/UX

- [x] Validate API usage documentation examples against current request and response shapes
- [x] Verify deployment runbook is simple, ordered, and executable for first-time operators
- [x] Confirm docker-compose integration guidance includes adding service into an existing stack
- [x] Confirm GitHub integration guidance covers required secrets and workflow invocation

## Testing & Quality

- [x] Enumerate API implementation files and confirm direct or indirect test coverage for each
- [x] Review API server test suite for relevance and remove or flag low-signal assertions
- [x] Investigate flaky tests in `scripts/api-server` by reproducing failures with repeated runs (`bun run test:api-server` and focused reruns), capturing fail frequency, and recording exact failing test names plus stack traces
- [x] Identify root cause of `.jobs-data/jobs.json` failures in `scripts/api-server/job-persistence.test.ts` and potential cross-test interference from queue lifecycle tests that write persistence concurrently
- [x] Implement deterministic isolation for persistence paths in tests (per-test temp directories and cleanup), eliminate shared global file-state coupling, and ensure async queue operations are fully awaited before teardown
- [x] Add regression tests that prove stability of persistence and queue interactions under repeated execution, including at least one looped stress case for `deleteJob` and queue completion events
- [x] Execute focused test commands and document pass/fail evidence with command outputs
- [x] Validate deployment documentation tests assert required sections and executable commands
- [x] Verify no critical path in API implementation remains untested

## Deployment

- [x] Validate Dockerfile and docker-compose production settings and security defaults
- [x] Execute smoke validation plan for container health and basic job lifecycle operations
- [x] Verify GitHub Actions workflow can run API jobs with secure secret handling
- [x] Confirm deployment documentation covers VPS setup, docker-compose integration, and GitHub setup
- [x] Approve production checklist completeness and operational readiness notes

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
