# QA Script: Issue 118 — Stable Sidebar Order on Partial Syncs

## Goal
Verify that a *partial* Notion sync (processing only a subset of pages) does **not** reshuffle:
- `sidebar_position` for pages missing Notion `Order`
- `_category_.json.position` for toggle sections
- ordering of sub-pages relative to parents

This QA is designed to mimic the “filtered/tagged” CI behavior by running `notion:fetch-all` twice with different `--max-pages` values.

## Preconditions
- You are on PR branch `fix/issue-118-stable-order` (PR #125).
- You have valid Notion env vars available (via `.env` or environment):
  - `NOTION_API_KEY`
  - `DATABASE_ID` or `NOTION_DATABASE_ID`
  - (optional) `DATA_SOURCE_ID`
  - (optional) `BASE_URL=/comapeo-docs/`

## Safety notes
- These commands will generate content under `docs/`, `i18n/`, and `static/images/`. Do not commit generated content changes.
- Prefer running this QA in a throwaway worktree.

## Step 1 — Install deps (if needed)
```bash
bun i
```

## Step 2 — Script/unit verification
```bash
bunx vitest run scripts/fetchNotionData.test.ts scripts/notion-fetch/generateBlocks.test.ts
```
Expected: green.

## Step 3 — Baseline full-ish run (establish stable positions)
Run a bigger batch to populate cache and write initial frontmatter.
```bash
rm -rf .cache/page-metadata.json 2>/dev/null || true
bun run notion:fetch-all --force --max-pages 20
```

Snapshot sidebar/category positions after the baseline:
```bash
rg -n \"^sidebar_position:\" docs i18n -S > /tmp/sidebar_positions.before.txt
rg -n '\"position\"\\s*:' docs -S --glob \"**/_category_.json\" > /tmp/category_positions.before.txt
```

## Step 4 — Partial run (simulate filtered sync)
Run a smaller batch without `--force` (this simulates a filtered subset run where index-based fallbacks used to drift).
```bash
bun run notion:fetch-all --max-pages 5
```

Snapshot again:
```bash
rg -n \"^sidebar_position:\" docs i18n -S > /tmp/sidebar_positions.after.txt
rg -n '\"position\"\\s*:' docs -S --glob \"**/_category_.json\" > /tmp/category_positions.after.txt
```

## Step 5 — Assertions (what must be true)
1) **No sidebar reshuffle for existing pages missing `Order`:**
```bash
diff -u /tmp/sidebar_positions.before.txt /tmp/sidebar_positions.after.txt || true
```
Expected: either no diff, or only diffs attributable to *newly generated* files/pages in the smaller run (not re-numbering existing pages).

2) **No `_category_.json` reshuffle due to partial indexing:**
```bash
diff -u /tmp/category_positions.before.txt /tmp/category_positions.after.txt || true
```
Expected: no diff for existing categories.

3) **Git diff sanity check (generated content shouldn’t get reordered):**
```bash
git diff -- docs i18n static/images | rg -n \"sidebar_position|_category_\\.json|position\" -S || true
```
Expected: no “position churn” across existing files.

## Step 6 — Sub-page placement spot check (manual)
In the logs of the partial run, confirm at least one case where a parent page and its sub-page(s) are processed consecutively (sub-pages immediately after parent). If logs are too noisy, spot-check output:
- Pick a known parent doc and a sub-page doc.
- Confirm their sidebar positions do not jump unexpectedly and that the sub-page appears directly under/near its parent in the sidebar for a local build (optional).

Optional local UI verification (only if requested):
```bash
bun run dev
```

## Reporting back
Post a short QA result in the PR:
- ✅/❌ for steps 2–5
- Paste any diffs from the `diff -u` checks (trimmed)
- Mention any observed sidebar/category position churn

