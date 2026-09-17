# Repository Guidelines

## Project Structure & Module Organization

- `docs/`: Source Markdown/MDX content. Use kebab-case filenames (e.g., `getting-started.mdx`).
- `src/`: Docusaurus customizations (components, pages, theme overrides).
- `static/`: Public assets served at site root (e.g., `static/images/...`).
- `i18n/`: Localized content (currently `pt`, `es`).
- `scripts/`: Bun/TypeScript utilities for Notion sync and helpers; includes tests.
- Key config: `docusaurus.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`.

## Build, Test, and Development Commands

- Install deps: `bun install` (or `npm ci`).
- Dev server: `bun run dev` (`dev:pt`, `dev:es` for locales).
- Build site: `bun run build` → output in `build/`.
- Serve build: `bun run serve`.
- Lint: `bun run lint` (auto-fix: `bun run lint:fix`).
- Tests (Vitest): `bun run test`, coverage: `bun run test:coverage`.
- Notion sync: content generation is managed by `../comapeo-content-pipeline/` which pushes generated docs to the `content` branch (see `AGENTS.md`).

## Coding Style & Naming Conventions

- Formatting via Prettier: 2 spaces, semicolons, double quotes.
- ESLint with Docusaurus/React/TS rules; untranslated-text rule is enabled for UI strings.
- Components: `PascalCase` (e.g., `HomepageFeatures`). Docs files: kebab-case.
- Images: place under `static/images/` and reference as `/images/...`.

## Testing Guidelines

- Framework: Vitest (Node env, globals enabled).
- Location/pattern: `scripts/**/*.{test,spec}.{ts,js,tsx}`.
- Coverage thresholds (global): 85% branches/functions/lines/statements.
- Run focused: `bun run test:scripts` or `vitest scripts/ --watch`.

## Commit & Pull Request Guidelines

- Follow Conventional Commits: `feat:`, `fix:`, `build:`, `ci:`, `chore:`, with optional scopes (e.g., `fix(build): ...`). Automated content sync uses `(content-update): ...`.
- PRs must include: clear description, linked issues, before/after screenshots for visual changes, and notes on i18n impact.
- Ensure `lint` and `test` pass locally; pre-commit hooks (Lefthook) run ESLint on staged files.

## Documentation Workflow

- Author in Notion (English is source). Use the provided template: set `Element Type` (Heading/Toggle/Page), `Order`, `Tags`, and relate child pages via `Sub-item`.
- Draft → translation: set Status to `Ready for translation`. Page translation is generated via `../comapeo-content-pipeline/`. In-repo theme-chrome translation runs via `bun scripts/translate-theme/index.ts`.
- Review → publish: when content is reviewed, set Status to `Ready to publish`.
- Content generation: `../comapeo-content-pipeline/` pulls publish-ready items, generates frontmatter and images under `static/images/notion/`, and pushes to the `content` branch.
- Preview: `bun run dev` (or `bun run build && bun run serve`).
- Status utilities: move batches with `bun run notionStatus:translation`, `notionStatus:draft`, `notionStatus:publish`.
- Redirects: keep `.env DEFAULT_DOCS_PAGE` aligned with the intended landing doc.

## Security & Configuration

- Copy `.env.example` to `.env`. Required: `NOTION_API_KEY`, `OPENAI_API_KEY`, `DATA_SOURCE_ID` (preferred), `DATABASE_ID` (fallback compatibility), `DEFAULT_DOCS_PAGE`.
- Do not commit secrets. For deploy-related secrets, use CI environment variables.
