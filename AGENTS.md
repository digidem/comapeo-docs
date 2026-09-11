# AGENTS.md

Short, high-signal rules for Junie working in this repo.
Keep changes small and focused.
For full repository guidelines, see `./context/repository-guidelines.md`.

### Do

- use Docusaurus v3 patterns and Bun scripts from `package.json`
- use `@docusaurus/Translate` for any user-facing strings
- follow Prettier style (2 spaces, semicolons, double quotes)
- follow ESLint rules; prefer small components and small diffs
- name React components in PascalCase; docs filenames in kebab-case
- store images under `static/images` and reference as `/images/...`
- keep i18n in mind: add/translate UI strings and update `i18n/*/code.json` when relevant
- spin up a fresh git worktree per issue, copy `.env` into that worktree, and run `bun i` before making changes

### Don't

- do not hardcode UI strings; do not bypass `@docusaurus/Translate`
- do not add heavy dependencies without approval
- do not commit secrets or modify CI without approval
- do not place images outside `static/images` or hotlink external assets
- do not commit content files in `./static` and `./docs` folders - these are generated from Notion by the external pipeline in `../comapeo-content-pipeline/`
- do not create new files in `./docs/` - this folder is reserved for Notion-generated content only

### Commands

# prefer file-scoped checks; run only what you touched

# use the GitHub CLI (`gh`) for PRs, issues, and other GitHub operations

# lint a single file

bunx eslint path/to/file.{ts,tsx,js} --fix

# format a single file

bunx prettier --write path/to/file.{ts,tsx,js,md,mdx}

# unit test a single file (or folder)

bunx vitest run path/to/file.test.ts

# typecheck project (tsc is project-wide)

bun run typecheck --noEmit

# full site build or dev only when requested

bun run build
bun run dev

Note: Always lint, format, and run relevant tests for updated files. Prefer targeted checks over project-wide runs.

### Safety and Permissions

Allowed without prompt:

- read/list files, search (`rg`), preview diffs
- run `eslint`, `prettier`, and `vitest` on specific files

Ask first:

- installing/removing packages; changing `package.json`
- deleting or moving many files; chmod
- running `bun run build` or `bun run notion:*` commands
- touching CI, deploy, or secrets

### PR Preview Deployments

Every PR automatically gets a staging deployment on Cloudflare Pages:

- **Preview URL**: `https://pr-{number}.comapeo-docs.pages.dev`
- **Automatic**: Deployed on PR open/update, cleaned up on close
- **Comment**: Bot comments on PR with preview link
- **Triggers**: Pushes to PR branch (except Markdown-only changes)
- **Security**: Only works for PRs from the main repository (not forks)

#### Content Source

Previews always build from the `content` branch — same source as staging and production. No Notion fetching in PR previews. If preview content looks stale or the build fails on missing content, run the sync in `../comapeo-content-pipeline/` (its push updates `content`), then re-run the preview workflow.

### Content Architecture & External Pipeline

`../comapeo-content-pipeline/` is the canonical content generator: it fetches from Notion and pushes generated `docs/`, `i18n/`, and `static/images/` content directly to this repo's `content` branch. comapeo-docs is a consumer: every build site (PR preview, staging, production) checks out content from the `content` branch instead of running Notion fetch itself. Do not add Notion fetching back to this repo's build workflows; to change what content gets generated, work in `../comapeo-content-pipeline/`.

### Project Structure Hints

- `docs/`: Markdown/MDX docs (kebab-case)
- `src/`: Docusaurus customizations (components/pages/theme)
- `static/`: Public assets served at `/` (images under `/images/...`)
- `i18n/`: Localized content (`pt`, `es`)
- `scripts/`: Bun/TypeScript Notion sync and helpers; includes tests

### Visual Changes Workflow (CSS/Styling)

**MANDATORY for all styling changes:**

1. **Start dev server**: `bun run dev`
2. **Capture BEFORE screenshot** using `bun scripts/screenshot-prs.ts --url /docs/page --name before` or Playwright.
3. **Make CSS changes** and verify.
4. **Capture AFTER screenshot** with same approach.
5. **Create PR comment and MANUALLY upload screenshots** via GitHub web interface (drag and drop).
6. **VERIFY screenshots before saving** using the Preview tab.
7. **CRITICAL: NEVER commit screenshots to git**.

### PR Checklist

- commit style: Conventional Commits (e.g., `feat(scope): ...`)
- lint, format, and tests: all green locally
- diff: small and focused with a brief summary and i18n notes
- **CRITICAL: For visual changes, add before/after screenshots to PR comments (not committed to repo)**
- reference the GitHub issue and link it explicitly
- write a short human explanation of what changed and why
- update documentation or task trackers (like `TASK.md`) when workflows change

### Production Content Deployment

Content reaches production via a manual deploy trigger:

1. **Write/update content** in Notion → synced to `content` branch (staging)
2. **Review on staging** site (PR preview or staging deploy)
3. **Deploy to production** → Actions → "Deploy to Production" → Run workflow
   - Updates `content-lock.sha` on `main` automatically
   - Builds and deploys with that locked SHA

See `context/workflows/PRODUCTION_DEPLOYMENT.md` for complete workflow.

### When Stuck

- ask a clarifying question or propose a short plan before large changes
- avoid speculative repo-wide rewrites

### Database & Development Context

- Database info: `./context/database/` (overview, schema, block-types, patterns)
- Script info: `./context/development/` (constants, architecture, testing, roadmap)
- Architecture & Lessons: `./NOTION_FETCH_ARCHITECTURE.md`
- Workflows: `./context/workflows/` (commands, lifecycle, translations, production deployment)
- Quick Lookups: `./context/quick-ref/` (mappings, status, examples)

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

<!-- caveman-directive -->

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" @[/] "normal mode".
