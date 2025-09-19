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

### PR Checklist

- commit style: Conventional Commits (e.g., `feat(scope): ...`)
- lint, format, and tests: all green locally
- diff: small and focused with a brief summary and i18n notes if applicable
- include screenshots for visual changes
- reference the GitHub issue being solved in the PR description and link it explicitly
- write a short human explanation of what changed and why (1–2 paragraphs max)
- double-check the PR title matches the scope of the changes and uses lowercase Conventional Commit style
- add “Testing” notes summarising which commands were run (or why a test could not be executed)
- update documentation or task trackers (like `TASK.md`) when the PR changes workflows or processes

### When Stuck

- ask a clarifying question or propose a short plan before large changes
- avoid speculative repo-wide rewrites

### Optional: Test-First

- for new script features or regressions under `scripts/`, add/update Vitest tests first, then code to green

### More Context

- Full repo guidelines, workflows, and commands: `./context/repository-guidelines.md`
