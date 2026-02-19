# Translation Improvements Progress Tracker

Date started: 2026-02-19  
Branch: `feat/translation-parity-improvements`  
Worktree: `.worktrees/translation-parity-improvements`

## Goal

Ensure auto-translation output is structurally equivalent across `en`, `pt`, and `es` markdown for every translated page family.

Allowed differences:

- media asset URLs/files/paths (images and other media links)

Required exact parity (after excluding media only):

- emojis (presence, position, and semantics)
- markdown structure and formatting
- heading hierarchy and order
- admonitions/callouts
- list structure and ordering
- code fences and inline code tokens
- non-media link structure and target parity
- frontmatter key set consistency (translated values allowed for text fields)

## Current Snapshot (Baseline)

Baseline check date: 2026-02-19

Verified failing family:

- Root page: `2331b081-62d5-80a1-810e-dbb15a2e0f68`
- EN: `docs/gathering-the-right-equipment-for-comapeo.md`
- PT: `i18n/pt/docusaurus-plugin-content-docs/current/reunindo-o-equipamento-certo-para-o-comapeo.md`
- ES: `i18n/es/docusaurus-plugin-content-docs/current/nueva-pgina.md`

Observed mismatches:

- heading levels/count/order mismatch
- list nesting/ordering mismatch
- non-media link mismatch
- ES body effectively empty vs EN/PT content

## Success Criteria

The translation pipeline is considered fixed only when all criteria pass:

1. For sampled and targeted translated families, parity checks pass for EN/PT/ES after media normalization.
2. No generated PT/ES markdown files are empty when EN source contains non-empty content.
3. Emoji conversion and placement is preserved across locales.
4. Markdown formatting survives translation roundtrip without structural loss.
5. CI/local test suite contains automated parity checks that fail on regressions.

## Verification Workflow (Repeatable)

### Step 1: Generate translation-child outputs from Notion

Targeted family:

```bash
bun run notion:fetch-auto-translation-children -- --page-id <root_page_id>
```

Batch mode:

```bash
bun run notion:fetch-auto-translation-children
```

This writes:

- `.cache/auto-translation-children-comparison.md`

### Step 2: Build EN/PT/ES file triplets

Source of truth:

- `.cache/auto-translation-children-comparison.md`

Select rows where EN/PT/ES all exist.

### Step 3: Run parity comparison (media-normalized)

Comparison must validate:

- headings
- lists
- admonitions/callouts
- code fences and inline code
- non-media links
- frontmatter key set
- emoji retention

Current implementation status:

- manual/subagent-driven parity analysis exists
- automated parity script and tests still needed (tracked in research + implementation backlog)

### Step 4: Record results in this tracker

For each run, append:

- date/time
- command used
- families compared
- pass/fail counts
- failure categories
- links to changed code/tests

## Run Log

| Date       | Scope                                                | Compared Families | Pass | Fail | Notes                                                      |
| ---------- | ---------------------------------------------------- | ----------------: | ---: | ---: | ---------------------------------------------------------- |
| 2026-02-19 | Targeted root `2331b081-62d5-80a1-810e-dbb15a2e0f68` |                 1 |    0 |    1 | ES output empty/partial mismatch; structural parity failed |

## Implementation Backlog (Pipeline Hardening)

- [ ] Add deterministic parity checker script for EN/PT/ES triplets (media-normalized).
- [ ] Add Vitest coverage for parity checker with golden fixtures.
- [ ] Harden `scripts/notion-translate/markdownToNotion.ts` against block loss.
- [ ] Harden markdown generation path (`scripts/notion-fetch/*`) for locale consistency.
- [ ] Add CI gate for parity regressions on sampled families.

## Guardrails

- Do not patch generated markdown by hand.
- Fix generation code and rerun pipeline.
- Treat empty translated markdown as critical failure.
- Preserve existing media exception only; no broader exceptions.
