# AGENTS.md

Short, high-signal rules for AI agents working in this repo. Keep changes small and focused. For full repository guidelines, see `./context/repository-guidelines.md`.

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
- do not commit content files in `./static` and `./docs` folders - these are generated from Notion

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
- **Content**: Uses same content from `content` branch as production
- **Security**: Only works for PRs from the main repository (not forks)

### Project Structure Hints

- `docs/`: Markdown/MDX docs (kebab-case)
- `src/`: Docusaurus customizations (components/pages/theme)
- `static/`: Public assets served at `/` (images under `/images/...`)
- `i18n/`: Localized content (`pt`, `es`)
- `scripts/`: Bun/TypeScript Notion sync and helpers; includes tests
- Key config: `docusaurus.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`

### Good Examples

- translations: see `src/pages/index.tsx` usage of `@docusaurus/Translate`
- components: small, typed React components like `src/components/HomepageFeatures/index.tsx`

### Visual Changes Workflow (CSS/Styling)

**MANDATORY for all styling changes:**

1. **Start dev server**: `bun run dev` and wait for it to be ready

2. **Capture BEFORE screenshot**:
   ```bash
   # Use the automated script (recommended)
   bun scripts/screenshot-prs.ts --url /docs/page --name before

   # Or manually with Playwright
   const { chromium } = require('playwright');
   const browser = await chromium.launch({ channel: 'chrome' });
   const page = await browser.newPage();
   await page.goto('http://localhost:3000/path/to/page', { waitUntil: 'networkidle' });
   await page.screenshot({ path: 'before.png' });
   await browser.close();
   ```

3. **Make CSS changes** and verify they work

4. **Capture AFTER screenshot** with same approach

5. **Create PR comment and MANUALLY upload screenshots**:
   ```bash
   # ONLY create text comment first (no automation for images!)
   gh pr comment <PR#> --body "## Visual Comparison

   ### Before
   [Will upload screenshot]

   ### After
   [Will upload screenshot]"

   # Then MANUALLY (REQUIRED):
   # 1. Go to the PR comment on GitHub web interface
   # 2. Click "Edit" on the comment
   # 3. Drag and drop screenshot files into the comment editor
   #    - Place 'before' screenshot under "### Before"
   #    - Place 'after' screenshot under "### After"
   # 4. Preview to VERIFY screenshots are visible (not "404" or broken)
   # 5. Save the comment only after verification
   ```

6. **VERIFY screenshots before saving**:
   - **CRITICAL**: Click "Preview" tab before saving
   - Ensure screenshots display correctly (not "Page not found")
   - If broken, re-upload the files
   - Only save comment after visual confirmation

7. **CRITICAL: NEVER commit screenshots to git**:
   - Screenshots are ONLY for PR review comments
   - `screenshots/` is in .gitignore to prevent commits
   - Delete screenshot files after successful PR upload
   - GitHub does not support automated image uploads via CLI/API

### PR Checklist

- commit style: Conventional Commits (e.g., `feat(scope): ...`)
- lint, format, and tests: all green locally
- diff: small and focused with a brief summary and i18n notes if applicable
- **CRITICAL: For visual changes, add before/after screenshots to PR comments (not committed to repo)**
- reference the GitHub issue being solved in the PR description and link it explicitly
- write a short human explanation of what changed and why (1–2 paragraphs max)
- double-check the PR title matches the scope of the changes and uses lowercase Conventional Commit style
- add "Testing" notes summarising which commands were run (or why a test could not be executed)
- update documentation or task trackers (like `TASK.md`) when the PR changes workflows or processes

### When Stuck

- ask a clarifying question or propose a short plan before large changes
- avoid speculative repo-wide rewrites

### Optional: Test-First

- for new script features or regressions under `scripts/`, add/update Vitest tests first, then code to green

### Database Context (when working with Notion integration)

- Database overview: `./context/database/overview.md`
- Properties & schema: `./context/database/properties.md` 
- Block types: `./context/database/block-types.md`
- Content patterns: `./context/database/content-patterns.md`
- Script targeting: `./context/database/script-targets.md`

### Development Context (when implementing Notion scripts)

- Development constants: `./context/development/constants.md`
- Script architecture: `./context/development/script-architecture.md`
- Testing patterns: `./context/development/testing-patterns.md`

### Workflow Context (when running Notion commands)

- Command reference: `./context/workflows/notion-commands.md`
- Content lifecycle: `./context/workflows/content-lifecycle.md`
- Translation process: `./context/workflows/translation-process.md`
- Content pipeline: `./context/workflows/content-pipeline.md`

### Quick Lookups (for rapid development reference)

- Property mappings: `./context/quick-ref/property-mapping.json`
- Status values: `./context/quick-ref/status-values.json`
- Block examples: `./context/quick-ref/block-examples.json`

### More Context

- Full repo guidelines, workflows, and commands: `./context/repository-guidelines.md`
