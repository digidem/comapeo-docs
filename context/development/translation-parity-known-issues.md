# Translation Parity Known Issues: PR Review + Fix Planning

This document is a practical plan for using the translation-parity known-issues list during PR preparation.

## Goal

Ship PRs where translation parity risks are explicitly triaged, in-scope gaps are fixed, and remaining issues are intentionally deferred with evidence.

## Phase 1 — Review which known issues are relevant to this PR

### 1) Build a parity issue inventory for the PR

For each known issue in this document, capture the following in a triage table:

- issue title / short ID
- impacted area (`docs/`, `i18n/*`, `src/`, Notion translation scripts)
- severity (blocker/high/medium/low)
- reproducibility (always/intermittent/unknown)
- evidence (failing test, snapshot diff, manual repro)

### 2) Determine PR relevance

Mark each issue as one of:

- **Directly relevant**: the PR touches the code/content path involved.
- **Regression-relevant**: not directly changed, but likely to be affected by this PR.
- **Not relevant**: outside this PR's scope.

Add one-line rationale for every "not relevant" decision.

### 3) Set "perfect PR" fix threshold

For this repo, treat these as **must-fix in PR**:

1. blockers/high issues that are directly relevant,
2. deterministic medium issues with a small, low-risk fix,
3. any issue that would make preview/build output inconsistent across locales.

Everything else can be deferred only if explicitly documented in PR notes.

### 4) Define acceptance criteria per selected issue

Before coding, write 1–3 verifiable checks per issue, e.g.:

- translated output exists at expected path,
- locale navigation/theme strings are updated as expected,
- parity check/test no longer fails.

## Phase 2 — Implementation plan for selected fixes

### 5) Implement by smallest-risk order

Recommended sequence:

1. data-loss or missing-content parity issues,
2. build/preview parity issues,
3. copy/terminology mismatches,
4. cleanup/refactor items.

### 6) Use focused commits per issue cluster

Use conventional commits and keep each commit reviewable:

- `fix(translation): ...` for behavior changes,
- `test(translation): ...` for parity guards,
- `docs(translation): ...` for process notes.

### 7) Verify with targeted checks

Run only checks related to touched files:

- `bunx eslint <touched-files> --fix`
- `bunx prettier --write <touched-files>`
- `bunx vitest run <related-tests>`
- `bun run typecheck --noEmit` (if TS behavior changed)

### 8) PR-ready output format

Include this in the PR description:

- **Relevant issues fixed** (with short evidence per issue)
- **Relevant issues deferred** (with reason + follow-up)
- **Testing commands run** (exact commands + outcomes)
- **i18n impact note** (which locales/files changed)

## Suggested triage template

| Issue  | Relevance    | Severity | Decision | Evidence              | Notes                        |
| ------ | ------------ | -------- | -------- | --------------------- | ---------------------------- |
| TP-001 | Direct       | High     | Fix now  | failing vitest        | touched translation pipeline |
| TP-002 | Regression   | Medium   | Fix now  | reproducible manually | small diff in `i18n/*`       |
| TP-003 | Not relevant | Low      | Defer    | N/A                   | outside this PR scope        |

## Exit criteria for a "perfect" translation-parity PR

- all directly relevant blocker/high issues are fixed,
- no known parity regressions introduced by touched paths,
- deferred items are explicitly documented,
- all targeted lint/format/tests pass.
