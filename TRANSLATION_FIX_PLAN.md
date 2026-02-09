# Translation Fix Plan

## Objective

Stabilize the Notion translation workflow so it is deterministic, observable, and fail-safe. This plan captures all known issues from `TRANSLATION_REVIEW.md`, validates them against the current codebase, and defines implementation tasks to achieve a reliable translation pipeline.

## Scope

- Workflow: `.github/workflows/translate-docs.yml`
- Scripts: `scripts/notion-translate/*`, `scripts/notion-status/index.ts`, related config/docs
- Targets: Portuguese (`pt`) and Spanish (`es`)

Out of scope for this phase:

- Full migration to API job orchestration as the only translation path
- New target locales

## Current Architecture

1. GitHub Action checks out a target branch, installs dependencies, and runs `bun notion:translate`.
2. Translation script fetches English pages in Notion with status `Ready for translation`.
3. Script translates:
   - Markdown content
   - `code.json` strings
   - navbar/footer i18n theme files
4. If successful, workflow updates Notion status via `bun run notionStatus:translation` and commits generated i18n/docs changes.

## Issue Register

### Critical

1. OpenAI schema/integration failure in frontmatter/content translation

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/translateFrontMatter.ts`
- Action: Replaced fragile parse path with strict JSON-schema chat completion parsing and strong payload validation.

2. Silent success on translation errors

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/translateFrontMatter.ts`, `scripts/notion-translate/index.ts`
- Action: Removed fallback success markdown behavior; errors now propagate and fail the run.

3. Workflow success despite failed translation internals

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/index.ts`, `.github/workflows/translate-docs.yml`
- Action: Non-zero exit on failure, machine-readable summary output, status-update/commit steps gated with `if: success()`.

4. Branch-selection mismatch in workflow

- Status: Mitigated in this phase
- Files: `.github/workflows/translate-docs.yml`
- Action: Added `workflow_dispatch.inputs.target_branch` and used it in checkout/push.

5. Missing `Parent item` null checks causing crashes

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/index.ts`
- Action: Added defensive relation checks with explicit error.

6. Missing-secret diagnostics

- Status: Mitigated in this phase
- Files: `.github/workflows/translate-docs.yml`
- Action: Added dedicated secret validation step with explicit missing-secret output.

### High Priority

7. No retry backoff/jitter for OpenAI JSON translation calls

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/translateCodeJson.ts`
- Action: Added exponential backoff with jitter between retries.

8. `code.json` schema too strict for real-world variations

- Status: Partially mitigated in this phase
- Files: `scripts/notion-translate/translateCodeJson.ts`
- Action: Relaxed schema (`message` required, `description` optional, extra fields allowed).

9. Status semantics mismatch and docs drift

- Status: Mitigated in this phase
- Files: docs/context workflow docs
- Action: Updated workflow docs to reflect strict failure policy, summary output contract, and success-gated status/commit behavior.

10. Notion env var ambiguity (`DATA_SOURCE_ID` vs `DATABASE_ID`)

- Status: Partially mitigated in this phase
- Files: translation + status scripts, docs
- Action: Standardized translation workflow/docs to prefer `DATA_SOURCE_ID` with `DATABASE_ID` fallback compatibility.

### Medium Priority

11. Translation page lookup by title can miss updates when translated titles diverge

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/index.ts`
- Action: Replaced primary lookup with relation-based matching (`Parent item` + language + order/element-type tie-breaks), then update by known page ID.

12. Disk output is collision-safe but not idempotent (`-1`, `-2` file growth on reruns)

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/index.ts`
- Action: Switched to deterministic file/folder naming with stable page identity to prevent rerun suffix growth.

13. No-pages path handling still ambiguous for operations

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/index.ts`, workflow docs
- Action: Enforced explicit failure contract when zero English pages are ready, and documented behavior.

14. Shared concurrency queue and push race behavior

- Status: Pending
- Files: `.github/workflows/translate-docs.yml`
- Action: Revisit concurrency policy and add push conflict retry/rebase strategy if needed.

15. Test coverage is still shallow for behavior-level translation workflow scenarios

- Status: Mitigated in this phase
- Files: `scripts/notion-translate/*.test.ts`
- Action: Added behavior-level tests for summary integrity, no-pages contract, and partial/total failure exit behavior.

## Implemented in This Pass

- Strict OpenAI structured output handling and typed translation error classification:
  - `quota_exceeded`, `authentication_failed`, `schema_invalid`, `transient_api_error`, `unexpected_error`
- Removed silent fallback translation success; failures propagate
- Added retry with backoff/jitter for translation API transient failures
- Added runtime env validation in translation script
- Added `Parent item` relation null checks with explicit errors
- Added run summary object and `TRANSLATION_SUMMARY` output for machine consumption
- Made workflow branch explicit via `target_branch`
- Added workflow secret validation step
- Gated Notion status update + commit steps to run only on success
- Added/updated tests for OpenAI call path and quota error classification

## Backlog Tasks

### P0 (Blockers)

1. Add explicit failure classification in workflow notifications (Slack/GitHub summary should include counts and failure reasons).

### P1

1. Make `code.json` source handling graceful when `i18n/en/code.json` is missing or malformed (without breaking doc translation path if policy allows).
2. Complete cross-repo standardization of Notion v5 ID usage.

## Progress Checklist

- [x] Strict translation failures propagate to non-zero workflow outcomes
- [x] `TRANSLATION_SUMMARY` machine-readable run output
- [x] Workflow success gates status update and commit
- [x] No-pages behavior explicitly fails and is documented
- [x] Relation-based translation page matching + update-by-id
- [x] Deterministic disk output naming
- [x] Behavior-level tests for summary + failure paths
- [ ] Workflow notifications include summarized failure categories

### P2

1. Evaluate migration to API job workflow as primary translation orchestrator.
2. Add quality guardrails for low-quality placeholder translations.
3. Improve observability: structured logs/metrics and clear runbook guidance.

## Test Plan

1. Unit: `translateFrontMatter` returns strict payload and classifies quota/auth/schema errors.
2. Unit: transient errors retry with backoff and then fail when exhausted.
3. Unit: missing parent relation fails page processing clearly.
4. Unit: `translateCodeJson` accepts optional `description` and preserves JSON shape.
5. Integration-lite: `notion-translate` run emits `TRANSLATION_SUMMARY` and exits non-zero when failures occur.
6. Workflow: translation step failure blocks status update and commit.
7. Workflow: missing secrets fail fast with actionable output.

## Acceptance Criteria

- Translation workflow cannot report success when critical translation errors occurred.
- Workflow cannot update Notion status after failed translation execution.
- OpenAI failures are classified and surfaced clearly in logs.
- Parent relation missing data no longer crashes with unhelpful TypeErrors.
- Branch selection in workflow dispatch is respected.
- Updated tests pass for touched translation modules.
