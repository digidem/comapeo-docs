# Plan: Retire Legacy Notion Fetch from comapeo-docs

## Status: proposed, not started (revised after Codex gpt-5.6-sol review, 2026-07-16)

## Why

`comapeo-docs` currently runs **two independent Notion → markdown
implementations** feeding the same site:

1. `digidem/comapeo-content-pipeline` (separate repo) — the intended
   production path. Fetches Notion, generates canonical markdown, pushes
   `docs/`, `i18n/`, `static/images/` to this repo's `content` branch. See
   its `DEPLOYMENT.md` and this repo's `README.md` (content generation
   section).
2. `scripts/notion-fetch/` (this repo, ~legacy) — confirmed still invoked by
   `.github/workflows/deploy-pr-preview.yml` via `bun run notion:fetch-all`
   for script/label changes, with two additional fallback paths in that
   workflow (see `AGENTS.md`'s "Smart Content Generation Strategy" section).

These two implementations are **not** the same code — different slug and
frontmatter conventions, different Notion client, different converters.
They will drift. A PR preview built by the legacy fetcher can stop
reflecting what production (built from `comapeo-content-pipeline` output)
actually serves. Reviewed by Fable 5 (2026-07-16): this duplication, not
the extraction itself, is the most urgent problem to resolve.

**Deployment reality, corrected**: no deployment workflow runs fetch. But
they are not uniform: `deploy-production.yml` resolves and checks out the
locked `content-lock.sha`; `deploy-staging.yml` and `deploy-test.yml`
checkout current `origin/content` HEAD (no lock). Production and staging
also still run their own Notion status writers after deploy
(`notionStatus:publish-production`, `notionStatus:draft` — see
`deploy-production.yml:227`, `deploy-staging.yml:208`), which is a
separate Notion dependency from fetch and is **not** removed by anything
in this plan (see "What does NOT go away" below).

This plan covers the comapeo-docs side of the fetch/translate extraction.
The translation-side plan lives in the new `comapeo-translate-pipeline`
repo's `PLAN.md`. Theme-chrome translation (navbar/footer/`code.json`)
is explicitly **out of scope for removal** — see "What stays" below.

## What stays in comapeo-docs

- The Docusaurus site itself (theme, components, `docusaurus.config.ts`).
- Theme-chrome translation — **corrected attribution**: `translateThemeConfig()`
  (the function that does `await import("docusaurus.config.ts")`) lives in
  `scripts/notion-translate/index.ts:1245`, not in `translateCodeJson.ts` as
  earlier drafts of this plan claimed. `translateCodeJson.ts` only supplies
  the OpenAI-backed JSON translation helpers `translateThemeConfig()` calls
  into. This matters because Phase 5 below deletes `index.ts` wholesale —
  **theme-chrome extraction (Phase 3) must physically move
  `translateThemeConfig()`/`extractTranslatableText()` out of `index.ts`
  before Phase 5 runs, not just declare them "not moving."** Also dropped
  the unverifiable "last four commits were theme-chrome only" claim from
  the original draft — not worth asserting without a pinned, re-checked
  commit range.
- **Theme-file deployment mechanism needs to change**, not just "commit to
  main": `.gitignore:59` ignores `/i18n/` on `main`, and all three deploy
  workflows (`deploy-production.yml:127`, `deploy-staging.yml:116`,
  `deploy-test.yml:21`) overlay the *entire* `i18n/` tree from a content
  revision at deploy time. Committing `navbar.json`/`footer.json`/`code.json`
  straight to `main` as originally planned would either get git-ignored or
  get silently overwritten by the content-branch overlay during deploy —
  either way the translated theme strings would not reach production as
  intended. Phase 3 (below) now includes picking one real owner for these
  three files instead of assuming `main` works as-is.
- `content-lock.sha` promotion workflow (`deploy-production.yml`) —
  unaffected either way.

## What does NOT go away (previously missed)

Codex's review found this plan's original removal list did not close the
dependency graph. These stay regardless of fetch/translate extraction
unless explicitly re-scoped in a future revision:

- `scripts/notion-status/` — **cannot be deleted in Phase 4 as originally
  planned.** Production and staging deploys call it directly
  (`notionStatus:publish-production`, `notionStatus:draft`); it is not
  fetch-only. Any removal needs its own ownership decision (move to
  `comapeo-content-pipeline`? keep in comapeo-docs as a deploy-time
  concern?) — out of scope for this plan as written; tracked as an open
  question below instead of a deletion target.
- `package.json` scripts `notion:create-template`, `notion:version` —
  not fetch-only, no removal case made yet.
- `scripts/migration/discoverDataSource.ts` — imports `@notionhq/client`
  directly.
- `scripts/notion-api/modules.ts`, `scripts/notion-count-pages/index.ts`,
  `scripts/notion-placeholders/index.ts` — depend on modules this plan
  proposed deleting (`notionClient`, `fetchNotionData`, etc.).
- `.github/workflows/create-content-template.yml` (creates Notion pages)
  and `.github/workflows/release.yml` (updates Notion versions) — both
  independent Notion writers outside fetch/translate.

**Consequence: "comapeo-docs becomes documentation-only" is not achievable
by this plan plus the translate-pipeline extraction alone.** Treat that as
an aspirational direction, not a claim this plan delivers on its own.

## What gets removed

Gate every deletion below on the parity check in Phase 1 passing first,
**and** on the dependency-closure work in Phase 1.5 (new — see below).

- `scripts/notion-fetch/` (active legacy fetcher)
- `scripts/archived-notion-fetch/` (already-dead code — safe to remove
  independent of everything else here; not blocked on the parity check)
- `scripts/notion-fetch-all/`, `scripts/notion-fetch-one/`
- `scripts/notionClient.ts`, `scripts/fetchNotionData.ts`,
  `scripts/notionPageUtils.ts` — **only after** `scripts/notion-translate/`
  is cut over or given replacement equivalents (see next bullet and Phase
  4 below). `notion-translate/index.ts:8` currently imports
  `notionClient`, `fetchNotionData`, `requestScheduler`,
  `frontmatterBuilder`, and `pageMetadataCache` directly — deleting these
  before translation stops needing them breaks `bun notion:translate`
  outright.
- `scripts/notion-translate/` and `.github/workflows/translate-docs.yml`
  — once `comapeo-translate-pipeline` is producing verified output (see
  that repo's `PLAN.md`, Phase 4) **and** `translateThemeConfig()` /
  `extractTranslatableText()` have already been extracted out per Phase 3
  above.
- `package.json` scripts: `notion:fetch`, `notion:fetch-one`,
  `notion:fetch-all`, `notion:fetch-auto-translation-children`,
  `notion:export`, `notion:gen-placeholders`, `notion:translate`,
  `notion:translate-test`, `notion:push-translation`
- Dependencies once nothing references them: `@notionhq/client` (confirmed
  **not** fetch-only — also used by `scripts/migration/`,
  `scripts/notion-api/`, others listed above; do not remove until every
  listed consumer is gone), `openai` (confirmed **not** fetch-only —
  serves both content translation and theme translation; only drop once
  neither remains), `sharp` (direct imports confirmed fetch-only, but
  Docusaurus's `ideal-image` plugin carries its own transitive `sharp` —
  removing the package.json dependency may be a no-op if that transitive
  copy already satisfies the build; verify before treating this as a real
  cleanup item).

## Phased plan

### Phase 1 — Parity check (blocking gate)

Before deleting anything, diff `notion:fetch-all` output against
`comapeo-content-pipeline`'s `docs:pull` output across all locales for the
same set of pages. **`scripts/locale-parity.test.ts` is not sufficient for
this as-is** — it hardcodes one mirror layout and checks EN/ES/PT
consistency *within a single already-generated tree*; it does not compare
two separate generators, catalogs, image assets, routing, or Docusaurus
build output against each other. Needs a real comparison harness: generate
into two isolated roots from pinned commits (one per pipeline), then
compare route sets, relevant frontmatter, category/catalog output, image
references/assets, and — ideally — actual Docusaurus build results.
Explicitly enumerate intentional differences instead of requiring exact
equivalence. Do not proceed past this phase on a partial or assumed match.

### Phase 1.5 — Close the dependency graph (new)

Before Phase 4/5 deletions, produce a complete retain/move/delete matrix
covering every consumer listed under "What does NOT go away" and every
import listed under "What gets removed." This plan's original single-pass
removal list undercounted real consumers (see that section) — do not
proceed on the assumption that only `scripts/notion-fetch/` and
`scripts/notion-translate/` touch these shared modules.

### Phase 2 — Simplify PR previews

Update `.github/workflows/deploy-pr-preview.yml` to be content-branch-only:
drop the `notion:fetch-all` path, the `fetch-10-pages` / `fetch-all-pages`
label handling described in `AGENTS.md`, and the `sharp` rebuild step tied
to it. PR previews become "use whatever's on `content`" like every other
deploy target already does. Update `AGENTS.md`'s "Smart Content Generation
Strategy" section to remove the now-dead label documentation.

### Phase 3 — Extract theme-chrome translation (revised)

Move `translateThemeConfig()` and `extractTranslatableText()` — the former
currently in `scripts/notion-translate/index.ts:1245`, the latter in
`scripts/notion-translate/translateCodeJson.ts` — into a new, small,
standalone `scripts/translate-theme/` (no dependency on `notion-fetch`
internals; it only ever needed `docusaurus.config.ts`, not Notion page
content). **Also decide and implement one real owner for the three output
files** (`i18n/*/docusaurus-theme-classic/{navbar,footer}.json`,
`i18n/*/code.json`) given the `.gitignore` + deploy-time `i18n/` overlay
conflict described above — either add explicit `.gitignore` exceptions so
these three files survive on `main` through every deploy's content
overlay, or publish them onto `content` instead and drop the "no content
branch involvement" goal from the original draft. Retain the `openai`
dependency in comapeo-docs for this script regardless of what happens to
it elsewhere, since theme translation still calls OpenAI.

### Phase 4 — Delete legacy fetch

Only after Phase 1's parity check passes, Phase 1.5's dependency matrix is
complete, and Phase 2 ships. **Not fully independent of translation
extraction as originally claimed** — `scripts/notionClient.ts` and
`scripts/fetchNotionData.ts` cannot go until `scripts/notion-translate/`
either has replacement clients (via the `comapeo-translate-pipeline`
cutover) or Phase 5 has already run. Sequence Phase 4's shared-dependency
deletions to happen no earlier than Phase 5.

### Phase 5 — Delete legacy translate

Once `comapeo-translate-pipeline`'s `PLAN.md` Phase 4 confirms cutover
(verified `docs:pull` i18n output matches or improves on current output)
**and** Phase 3 above has already extracted `translateThemeConfig()` /
`extractTranslatableText()` out of `index.ts`, delete
`scripts/notion-translate/` and `.github/workflows/translate-docs.yml`.
This phase gates Phase 4's shared-dependency cleanup (see above) — it is
not simply "independent, gated on the other repo" as the original draft
stated.

## Risks / open questions

- `scripts/notion-status/`'s ownership is unresolved (see "What does NOT
  go away") — needs its own decision before any deletion is proposed for
  it.
- The `fetch-10-pages` / `fetch-all-pages` PR label workflow is documented
  user-facing behavior (`AGENTS.md`) — removing it is a workflow change
  reviewers should be told about explicitly in the PR description, not just
  inferred from a diff.
- "No sender anywhere" for `repository_dispatch: translate-docs` (claimed
  in the companion `PLAN.md`) is only confirmed as "no sender found in this
  repo" — external services or other repositories cannot be ruled out from
  a comapeo-docs-only search. Audit org-wide before treating the contract
  as safe to retire.
- `markdownToNotion.ts` is 1,412 lines with a 705-line direct test file
  (`markdownToNotion.test.ts`), not "6k+ lines of tests" as an earlier
  draft claimed — the full `scripts/notion-translate/` test suite across
  all files totals 8,465 lines. Use exact counts when scoping what "port
  the tests" means in the companion plan.
