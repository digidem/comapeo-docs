# Translation Hardening Test Guide

This guide validates the translation reliability hardening end to end.

## Scope

Covers:
- Strict failure behavior in `bun run notion:translate`
- `TRANSLATION_SUMMARY` output contract
- Behavior-level test coverage
- Workflow gating (`if: success()`) for status update + commit
- `target_branch` dispatch behavior

## Preconditions

1. You are on the hardening branch/worktree.
2. Dependencies are installed:
   - `bun i`
3. `.env` is present with:
   - `NOTION_API_KEY`
   - `OPENAI_API_KEY`
   - `DATA_SOURCE_ID` (preferred)
   - `DATABASE_ID` (fallback compatibility)
4. You have a safe non-production branch for workflow tests.

## 1) Static + Unit Validation

Run:

```bash
bunx eslint scripts/notion-translate/index.ts scripts/notion-translate/index.test.ts scripts/notion-translate/markdownToNotion.ts --fix
bunx prettier --write scripts/notion-translate/index.ts scripts/notion-translate/index.test.ts scripts/notion-translate/markdownToNotion.ts context/workflows/translation-process.md context/repository-guidelines.md TRANSLATION_FIX_PLAN.md
bunx vitest run scripts/notion-translate/translateFrontMatter.test.ts scripts/notion-translate/translateCodeJson.test.ts scripts/notion-translate/index.test.ts scripts/notion-status/index.test.ts scripts/notion-translate/markdownToNotion.test.ts
```

Expected:
- Vitest passes.
- No ESLint errors (warnings are acceptable if pre-existing).

## 2) Local Runtime Contract Test

Run:

```bash
bun run notion:translate
echo $?
```

Expected on success:
- Exit code `0`
- A line starting with `TRANSLATION_SUMMARY `
- Summary JSON has:
  - `processedLanguages > 0`
  - `failedTranslations = 0`
  - `codeJsonFailures = 0`
  - `themeFailures = 0`

Expected on failure:
- Exit code non-zero
- `TRANSLATION_SUMMARY` still printed
- Failure counts (`failedTranslations`, `codeJsonFailures`, `themeFailures`) reflect problem area

## 3) No-Pages Contract Test

Goal: Confirm explicit fail when no English pages are in `Ready for translation`.

Method:
1. Temporarily ensure there are no eligible English pages in Notion.
2. Run:

```bash
bun run notion:translate
echo $?
```

Expected:
- Non-zero exit code
- Error indicating no English pages found with `Ready for translation`
- `TRANSLATION_SUMMARY` printed with `totalEnglishPages = 0`

Restore content statuses after test.

## 4) Idempotent File Output Test

Goal: Ensure reruns do not create `-1`, `-2` suffix growth.

Method:
1. Run translation once:

```bash
bun run notion:translate
```

2. Record generated files:

```bash
find i18n/es/docusaurus-plugin-content-docs/current i18n/pt/docusaurus-plugin-content-docs/current -type f | sort
```

3. Run translation again with no source changes:

```bash
bun run notion:translate
find i18n/es/docusaurus-plugin-content-docs/current i18n/pt/docusaurus-plugin-content-docs/current -type f | sort
```

Expected:
- Same deterministic filenames across reruns
- No new duplicate suffix files created solely by rerun

## 5) Workflow Dispatch + Gating Test (GitHub)

Dispatch `.github/workflows/translate-docs.yml` with:
- `target_branch=<safe-test-branch>`

Expected:
1. Workflow checks out and pushes to `target_branch`.
2. If translation step fails:
   - workflow fails
   - status update step is skipped
   - commit/push step is skipped
3. If translation succeeds:
   - status update step runs
   - commit/push step runs (only if diff exists)

## 6) Secret Validation Test (GitHub)

Goal: confirm fast fail for missing required secrets.

Method:
1. In a test repo/environment, remove one required secret (for example `OPENAI_API_KEY`).
2. Dispatch workflow.

Expected:
- `Validate required secrets` fails early
- Clear log showing which secret is missing

## Pass Criteria

All are true:
1. Targeted tests pass.
2. Local runtime prints `TRANSLATION_SUMMARY` every run.
3. Failures return non-zero exit code.
4. No-pages path is non-zero and observable.
5. Reruns are idempotent on disk naming.
6. Workflow honors `target_branch` and success gating.
7. Missing secrets fail early with actionable output.

## Known Follow-up (Not Blocking This Test Guide)

- Workflow notifications do not yet include a summarized failure classification payload (tracked in `TRANSLATION_FIX_PLAN.md`).
