# CoMapeo Docs

Documentation site and content pipeline for CoMapeo, built with Docusaurus v3 and synced from Notion.

## What This Repo Includes

- Docusaurus site code (`src/`, config, scripts)
- Notion sync and translation tooling (`scripts/`)
- API service for content automation (`api-server/`)

## Branch Model

This repository uses two branches:

- `main`: source code, scripts, workflows, and configuration
  - Includes `content-lock.sha`: pins approved content SHA for production
- `content`: generated docs and assets (`docs/`, `i18n/`, `static/images/`)
  - Staging workspace for content review (not directly deployed to production)

Do not manually edit generated content in `docs/` or `static/`; these are synced from Notion.

### Production Deployment & Content Approval

Production content deploys use a locked content SHA (stored in `content-lock.sha` on `main`) to ensure only reviewed and approved content goes live. Promoting content requires a PR to `main` — that PR is the approval gate. See `context/workflows/PRODUCTION_DEPLOYMENT.md` for details.

## Quick Start

### Prerequisites

- Node.js `>=18`
- Bun
- Git

### 1. Clone and install

```bash
git clone https://github.com/digidem/comapeo-docs.git
cd comapeo-docs
bun i
```

### 2. Pull generated content (recommended)

```bash
git fetch origin content
git checkout origin/content -- docs/ i18n/ static/images/
```

### 3. Start the local docs site

```bash
bun run dev
```

The dev server runs with live reload for docs and UI changes.

## Usage

### Preview localized sites

```bash
bun run dev:es
bun run dev:pt
```

### Build and serve production output

```bash
bun run build
bun run serve
```

### Regenerate docs from Notion

Requires `.env` values (see Configuration):

```bash
bun run notion:fetch
```

### Run translation workflow

```bash
bun run notion:translate
```

### Run the API service

The repo includes a small API for content automation jobs.

```bash
bun run api:server
```

## Configuration

Copy and edit env vars:

```bash
cp .env.example .env
```

Common required variables:

- `NOTION_API_KEY`
- `DATA_SOURCE_ID` (preferred) or `DATABASE_ID` (fallback)
- `OPENAI_API_KEY` (for translation workflows)
- `DEFAULT_DOCS_PAGE`

For API server and mutating content jobs, also configure:

- `GITHUB_REPO_URL`
- `GITHUB_TOKEN`

See `.env.example` for the complete list and notes.

## Development

### Targeted checks

```bash
# Lint one file
bunx eslint path/to/file.{ts,tsx,js} --fix

# Format one file
bunx prettier --write path/to/file.{ts,tsx,js,md,mdx}

# Run focused tests
bunx vitest run path/to/file.test.ts
```

### Common project commands

```bash
bun run test
bun run test:scripts
bun run typecheck --noEmit
```

## Related Docs

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Setup/API service notes: `SETUP.md`
- Repository guidelines: `context/repository-guidelines.md`
- API reference: `context/api-server/reference.md`
- API deployment workflow: `context/workflows/api-service-deployment.md`
- Production deployment workflow: `context/workflows/PRODUCTION_DEPLOYMENT.md`
- Content lifecycle: `context/workflows/content-lifecycle.md`
- Notion architecture: `NOTION_FETCH_ARCHITECTURE.md`

## License

This repository currently does not declare an open-source license (`LICENSE` file is not present).
