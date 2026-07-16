# Plan: Retire Legacy Notion Fetch from comapeo-docs

## Status: proposed, not started

## Why

`comapeo-docs` currently runs **two independent Notion → markdown
implementations** feeding the same site:

1. `digidem/comapeo-content-pipeline` (separate repo) — the intended
   production path. Fetches Notion, generates canonical markdown, pushes
   `docs/`, `i18n/`, `static/images/` to this repo's `content` branch. See
   its `DEPLOYMENT.md` and this repo's `README.md` (content generation
   section).
2. `scripts/notion-fetch/` (this repo, ~legacy) — still actively invoked by
   `.github/workflows/deploy-pr-preview.yml` via `bun run notion:fetch-all`
   whenever fetch scripts change, or when a PR carries the `fetch-10-pages`
   / `fetch-all-pages` labels (see `AGENTS.md`'s "Smart Content Generation
   Strategy" section).

These two implementations are **not** the same code — different slug and
frontmatter conventions, different Notion client, different converters.
They will drift. A PR preview built by the legacy fetcher can stop
reflecting what production (built from `comapeo-content-pipeline` output)
actually serves. Reviewed by Fable 5 (2026-07-16): this duplication, not
the extraction itself, is the most urgent problem to resolve.

Production deploys (`deploy-production.yml`, `deploy-staging.yml`,
`deploy-test.yml`) already only checkout `origin/content` +
`content-lock.sha` — they never run fetch. So removing `notion-fetch` from
this repo does not touch the production build path at all; it only
changes how PR previews get their content.

This plan covers the comapeo-docs side of the fetch/translate extraction.
The translation-side plan lives in the new `comapeo-translate-pipeline`
repo's `PLAN.md`. Theme-chrome translation (navbar/footer/`code.json`)
is explicitly **out of scope for removal** — see "What stays" below.

## What stays in comapeo-docs

- The Docusaurus site itself (theme, components, `docusaurus.config.ts`).
- Theme-chrome translation: `translateThemeConfig()` and
  `extractTranslatableText()` currently in
  `scripts/notion-translate/translateCodeJson.ts` and
  `scripts/notion-translate/index.ts`. These read `docusaurus.config.ts`
  directly and only change when site chrome changes (confirmed: the last
  four commits touching this code were all theme-chrome i18n fixes, not
  content changes). Plan: extract into a small standalone script, e.g.
  `scripts/translate-theme/`, run on-demand when `docusaurus.config.ts`
  changes, committing `i18n/*/docusaurus-theme-classic/{navbar,footer}.json`
  and `i18n/*/code.json` straight to `main` as reviewed static files —
  no `content` branch involvement needed for these three files.
- `content-lock.sha` promotion workflow (`deploy-production.yml`) —
  unaffected either way.

## What gets removed

Gate every deletion below on the parity check in Phase 1 passing first.

- `scripts/notion-fetch/` (active legacy fetcher)
- `scripts/archived-notion-fetch/` (already-dead code — safe to remove
  independent of everything else here; not blocked on the parity check)
- `scripts/notion-fetch-all/`, `scripts/notion-fetch-one/`
- `scripts/notionClient.ts`, `scripts/fetchNotionData.ts`,
  `scripts/notionPageUtils.ts`
- `scripts/notion-status/` (Notion status updates tied to fetch)
- `scripts/notion-translate/` and `.github/workflows/translate-docs.yml`
  — once `comapeo-translate-pipeline` is producing verified output (see
  that repo's `PLAN.md`, Phase 4)
- `package.json` scripts: `notion:fetch`, `notion:fetch-one`,
  `notion:fetch-all`, `notion:fetch-auto-translation-children`,
  `notion:export`, `notion:gen-placeholders`, `notion:translate`,
  `notion:translate-test`, `notion:push-translation`
- Dependencies once nothing references them: `@notionhq/client`, `openai`
  (only if the theme-chrome script ends up not needing it — check before
  dropping), `sharp` (used by legacy image processing in
  `notion-fetch`; confirm nothing else in the site needs it, e.g. Docusaurus
  ideal-image plugin, before removing)

## Phased plan

### Phase 1 — Parity check (blocking gate)

Before deleting anything, diff `notion:fetch-all` output against
`comapeo-content-pipeline`'s `docs:pull` output across all locales for the
same set of pages. `scripts/locale-parity.test.ts` already exists as a
starting point — extend it (or write a one-off comparison script) to
confirm the two pipelines produce equivalent `docs/`, `i18n/`, and
`static/images/` output before removing either one. Do not proceed past
this phase on a partial or assumed match.

### Phase 2 — Simplify PR previews

Update `.github/workflows/deploy-pr-preview.yml` to be content-branch-only:
drop the `notion:fetch-all` path, the `fetch-10-pages` / `fetch-all-pages`
label handling described in `AGENTS.md`, and the `sharp` rebuild step tied
to it. PR previews become "use whatever's on `content`" like every other
deploy target already does. Update `AGENTS.md`'s "Smart Content Generation
Strategy" section to remove the now-dead label documentation.

### Phase 3 — Extract theme-chrome translation

Move `translateThemeConfig()` / `extractTranslatableText()` into
`scripts/translate-theme/` (new, small, standalone — no dependency on
`notion-fetch` internals, since it never needed Notion page content in the
first place, only `docusaurus.config.ts`). Wire it to run manually or via
a lightweight Action triggered on `docusaurus.config.ts` changes, committing
directly to `main`.

### Phase 4 — Delete legacy fetch

Once Phase 1's parity check passes and Phase 2 ships, delete everything
listed under "What gets removed" above (fetch-related only — do this phase
independent of the translation extraction's own timeline). Remove the
corresponding `package.json` scripts and prune dependencies.

### Phase 5 — Delete legacy translate

Once `comapeo-translate-pipeline`'s `PLAN.md` Phase 4 confirms cutover
(verified `docs:pull` i18n output matches or improves on current output),
delete `scripts/notion-translate/` and
`.github/workflows/translate-docs.yml`. This phase is independent of
Phase 4 and gated on the other repo, not on this plan's own timeline.

## Risks / open questions

- `sharp` and `@notionhq/client` may have other, non-fetch call sites in
  this repo (e.g. `scripts/migration/`, `scripts/eval/`) — grep before
  removing from `package.json`, don't assume single-purpose.
- The `fetch-10-pages` / `fetch-all-pages` PR label workflow is documented
  user-facing behavior (`AGENTS.md`) — removing it is a workflow change
  reviewers should be told about explicitly in the PR description, not just
  inferred from a diff.
