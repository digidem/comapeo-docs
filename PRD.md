# PRD - Translation End-to-End Validation

## Progress Logging Rules

- [x] Create `PROGRESS.md` before starting tests.
- [x] After each task, append a short entry in `PROGRESS.md` with: task, pass/fail, evidence, next action.
- [x] If a task fails, log issue severity (`high`, `medium`, `low`), impact, and reproduction steps in `PROGRESS.md`.
- [x] Keep entries simple (KISS): 3-6 lines per update.

## Scope And Acceptance

- [x] Confirm acceptance criteria: `TRANSLATION_SUMMARY` always prints, failures are classified correctly, and workflow gating blocks status/commit on failed translation.
- [x] Confirm test boundaries: use dedicated Notion test pages and a safe test branch.
- [x] Log scope confirmation in `PROGRESS.md`.

## Batch 1: Baseline Checks

- [x] Verify prerequisites: `.env` has `NOTION_API_KEY`, `OPENAI_API_KEY`, and `DATA_SOURCE_ID` (or `DATABASE_ID` fallback), and dependencies are installed (`bun i`).
- [x] Run targeted quality checks on touched files: `bunx eslint <touched-files> --fix` and `bunx prettier --write <touched-files>`.
- [x] Run targeted tests: `bunx vitest run scripts/notion-translate/translateFrontMatter.test.ts scripts/notion-translate/translateCodeJson.test.ts scripts/notion-translate/index.test.ts scripts/notion-status/index.test.ts scripts/notion-translate/markdownToNotion.test.ts`.
- [x] Log command outputs and result status in `PROGRESS.md`.

### Review Gate: Baseline

- [x] Classify any failures as environment, flaky test, or implementation defect.
- [x] Confirm baseline is clean or defects are clearly listed with reproduction.
- [x] Log review decision in `PROGRESS.md`.

## Batch 2: Notion Test Data Setup

- [x] Create or select at least two English test pages with realistic content blocks.
- [x] Set `Publish Status = Ready for translation` for those English source pages.
- [x] Verify `Language = English` for source pages.
- [x] Ensure translation siblings exist/can be created for `Spanish` and `Portuguese`.
- [x] Record page IDs and original statuses for rollback.
- [x] Log all setup actions in `PROGRESS.md`.

### Review Gate: Notion Setup

- [x] Confirm no tag change is required; selection is based on `Publish Status` and `Language`.
- [x] Confirm only isolated test pages were modified.
- [x] Log review outcome in `PROGRESS.md`.

## Batch 3: Runtime Contract Tests

- [x] Run `bun run notion:translate` and capture `TRANSLATION_SUMMARY`.
- [x] Verify success contract: `processedLanguages > 0`, `failedTranslations = 0`, `codeJsonFailures = 0`, `themeFailures = 0`.
- [x] Run translation again with no source changes and verify deterministic file output in `i18n/es/.../current` and `i18n/pt/.../current` (no `-1`/`-2` suffix drift).
- [x] Run no-pages test: temporarily move English test pages out of `Ready for translation`, rerun translation, verify non-zero exit and `totalEnglishPages = 0`.
- [x] Restore page statuses to original values.
- [x] Log each run and summary values in `PROGRESS.md`.

### Review Gate: Runtime

- [ ] Confirm `TRANSLATION_SUMMARY` is emitted in all runs (success and failure).
- [ ] Confirm generated locale output is correct and no unintended English output writes occurred.
- [ ] Log review outcome in `PROGRESS.md`.

## Batch 4: Failure And Soft-Fail Coverage

- [ ] Validate missing required env var behavior: non-zero exit and summary still emitted.
- [ ] Validate `i18n/en/code.json` soft-fail behavior (missing or malformed): doc translation continues and summary captures non-critical classification.
- [ ] Validate theme translation failure behavior: non-zero exit and `themeFailures > 0`.
- [ ] Log each failure scenario and classification in `PROGRESS.md`.

### Review Gate: Failure Model

- [ ] Confirm failure categories are clear in summary: `failedTranslations`, `codeJsonFailures`, `themeFailures`.
- [ ] Confirm hard-fail vs soft-fail behavior matches policy.
- [ ] Log review outcome in `PROGRESS.md`.

## Batch 5: Workflow Gating And Branch Dispatch

- [ ] Dispatch `.github/workflows/translate-docs.yml` with `target_branch=<safe-test-branch>`.
- [ ] Validate failure path: translation failure causes workflow failure and skips status-update and commit steps.
- [ ] Validate success path: status update runs and commit/push runs only when diff exists.
- [ ] Validate secrets gate: missing required secret fails early in `Validate required secrets`.
- [ ] Log run IDs, branch used, and gating evidence in `PROGRESS.md`.

### Review Gate: Workflow

- [ ] Confirm checkout/push used the requested `target_branch`.
- [ ] Confirm no unintended push happened outside the safe test branch.
- [ ] Log review outcome in `PROGRESS.md`.

## Final Verification

- [ ] Re-run targeted checks for touched files (`eslint`, `prettier`, targeted `vitest`).
- [ ] Confirm all translation features passed or list remaining defects with severity and owner.
- [ ] Finalize `PROGRESS.md` with a short final summary: overall status, open issues, and next actions.
