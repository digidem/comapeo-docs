# Translation Review Findings

## P0 - Critical

1. **Workflow notifications with explicit failure categories/counts (checkbox still unchecked).**
   - Ensure workflow notifications include categorized failure counts (docs, `code.json`, theme, infra) and reflect unchecked checklist state clearly.
   - This is a release-blocking observability gap.

## P1 - High

1. **`TRANSLATION_SUMMARY` contract break on env validation failure.**
   - File: `scripts/notion-translate/index.ts:679`
   - `validateRequiredEnvironment()` executes before the `try/catch`; when env is invalid, execution exits before emitting `TRANSLATION_SUMMARY`.
   - Violates the documented contract that every run emits the machine-readable summary line.

2. **Graceful policy for missing/malformed `i18n/en/code.json` (currently hard-fail).**
   - Current behavior throws fatal error immediately when `i18n/en/code.json` is missing/invalid.
   - Define and implement a graceful fallback policy (for example: skip `code.json` translation with explicit failure category while continuing doc translation), aligned with desired operational behavior.

3. **Full cross-repo `DATA_SOURCE_ID` standardization not complete.**
   - Branch currently shows partial migration.
   - Remaining scripts/docs/workflows should be standardized to `DATA_SOURCE_ID` with intentional fallback/deprecation strategy for `DATABASE_ID`.

## P2 - Medium

1. **Workflow secret validation conflicts with runtime fallback semantics.**
   - File: `.github/workflows/translate-docs.yml:50-53`
   - Workflow currently requires both `DATA_SOURCE_ID` and `DATABASE_ID`, while runtime accepts either.
   - Can cause avoidable workflow failures during migration.

2. **Push-race/concurrency retry strategy missing in translation workflow.**
   - File: `.github/workflows/translate-docs.yml`
   - Add retry/backoff around `git push` or conflict handling for concurrent updates to reduce transient failures from branch races.

## P3 - Low

1. **Slack notification branch text is stale for `target_branch` runs.**
   - File: `.github/workflows/translate-docs.yml:111`
   - Message still references `content` even when workflow runs against another target branch.
