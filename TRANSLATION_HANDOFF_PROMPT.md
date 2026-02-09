# Translation Workflow Handoff Prompt

You are continuing translation workflow hardening work already in progress.

## Goal

Finish the translation reliability fixes so the pipeline is strictly fail-safe, observable, and ready to merge.

## Current State

The branch already contains major P0 hardening work.

### Modified tracked files

- `.github/workflows/translate-docs.yml`
- `scripts/notion-translate/index.ts`
- `scripts/notion-translate/test-openai-mock.ts`
- `scripts/notion-translate/translateCodeJson.ts`
- `scripts/notion-translate/translateFrontMatter.test.ts`
- `scripts/notion-translate/translateFrontMatter.ts`
- `bun.lock` (changed by `bun i`; likely should be reverted unless dependency updates are intentional)

### New untracked files

- `TRANSLATION_FIX_PLAN.md`
- `TRANSLATION_REVIEW.md`
- `TRANSLATION_HANDOFF_PROMPT.md` (this file)

## What Has Already Been Implemented

1. Switched content translation to strict OpenAI chat-completions JSON-schema parsing in `translateFrontMatter.ts`.
2. Added typed translation error categories and criticality flags.
3. Removed silent fallback-success behavior from content translation.
4. Added retry with backoff+jitter for transient translation API failures.
5. Added run summary object and `TRANSLATION_SUMMARY ...` output in `notion-translate/index.ts`.
6. Made translation run fail when doc/code.json/theme translation failures occur.
7. Added null-safe guard for missing `Parent item` relation.
8. Workflow now:
   - accepts `target_branch` input,
   - validates required secrets early,
   - gates status update + commit on success,
   - has timeout configured.
9. Updated unit tests/mocks for new OpenAI call path and quota-error classification.

## Validation Already Run

- ESLint + Prettier on touched translation files: passed.
- Tests passed:
  - `scripts/notion-translate/translateFrontMatter.test.ts`
  - `scripts/notion-translate/translateCodeJson.test.ts`
  - `scripts/notion-translate/index.test.ts`
  - `scripts/notion-status/index.test.ts`
- Full project `typecheck` still fails due pre-existing unrelated test typing issues outside this scope.

## Remaining Work (Priority)

1. Decide and implement explicit policy for `bun.lock` diff (revert unless required).
2. Expand behavior-level tests for `scripts/notion-translate/index.ts`:
   - summary integrity,
   - exit-code behavior on partial/total failures,
   - no-pages behavior contract.
3. Improve translation page matching logic (currently title-based): migrate to stable relation/key strategy.
4. Make disk output idempotent (avoid duplicate `-1`, `-2` filename growth across reruns).
5. Standardize Notion v5 ID env var usage (`DATA_SOURCE_ID` vs `DATABASE_ID`) and update docs.
6. Finalize docs alignment in workflow docs and `TRANSLATION_FIX_PLAN.md` status checkboxes.

## Constraints

- Keep diffs focused.
- Do not touch unrelated ongoing work.
- Prefer targeted lint/tests only for touched files.

## Suggested Immediate Next Commands

- `git status --short`
- `git diff -- .github/workflows/translate-docs.yml scripts/notion-translate`
- `bunx vitest run scripts/notion-translate/translateFrontMatter.test.ts scripts/notion-translate/translateCodeJson.test.ts scripts/notion-translate/index.test.ts scripts/notion-status/index.test.ts`
