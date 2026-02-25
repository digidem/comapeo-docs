# CLI Reference

The CoMapeo Documentation project provides command-line interface (CLI) tools for managing Notion content, translations, and the API server. All commands are run using Bun.

## Prerequisites

- [Bun](https://bun.sh/) runtime installed
- Node.js 18+ installed
- Valid Notion API credentials configured in `.env` file

## Installation

```bash
# Install dependencies
bun install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your Notion credentials
```

## Available Commands

### Notion Content Commands

#### Fetch Pages from Notion

Fetch pages from Notion database.

```bash
bun run notion:fetch
```

**Options:**

- `--max-pages <number>` - Limit number of pages to fetch
- `--status <status>` - Filter by page status
- `--force` - Force re-fetch even if already cached

**Examples:**

```bash
# Fetch all pages
bun run notion:fetch

# Fetch only 10 pages
bun run notion:fetch --max-pages 10

# Fetch only pages with specific status
bun run notion:fetch --status "In Progress"

# Force re-fetch all pages
bun run notion:fetch --force
```

#### Fetch Single Page

Fetch a specific page from Notion by ID.

```bash
bun run notion:fetch-one <page-id>
```

**Examples:**

```bash
# Fetch specific page by name (fuzzy matching)
bun run notion:fetch-one "understanding how exchange works"
bun run notion:fetch-one "exchange"
```

#### Fetch All Pages

Fetch all pages from Notion database.

```bash
bun run notion:fetch-all
```

**Options:**

- `--max-pages <number>` - Limit number of pages to fetch
- `--force` - Force re-fetch even if already cached

**Examples:**

```bash
# Fetch all pages
bun run notion:fetch-all

# Fetch with limit
bun run notion:fetch-all --max-pages 20
```

### Translation Commands

#### Translate Content

Translate content to supported languages.

```bash
bun run notion:translate
```

This command processes all translatable content and generates translations for configured languages (Portuguese and Spanish).

**Examples:**

```bash
# Translate all content
bun run notion:translate
```

### Status Management Commands

Update the status of Notion pages for different workflows.

#### Translation Workflow

```bash
bun run notionStatus:translation
```

Updates page statuses for the translation workflow.

**Examples:**

```bash
# Update translation status
bun run notionStatus:translation
```

#### Draft Workflow

```bash
bun run notionStatus:draft
```

Updates page statuses for the draft publishing workflow.

**Examples:**

```bash
# Update draft status
bun run notionStatus:draft
```

#### Publish Workflow

```bash
bun run notionStatus:publish
```

Updates page statuses for the publishing workflow.

**Examples:**

```bash
# Update publish status
bun run notionStatus:publish
```

#### Production Publish Workflow

```bash
bun run notionStatus:publish-production
```

Updates page statuses for the production publishing workflow.

**Examples:**

```bash
# Update production publish status
bun run notionStatus:publish-production
```

### Export Commands

#### Export Database

Export the entire Notion database.

```bash
bun run notion:export
```

**Examples:**

```bash
# Export database to JSON
bun run notion:export
```

### Template Commands

#### Create Template

Create a new Notion page template.

```bash
bun run notion:create-template
```

**Examples:**

```bash
# Create a new template
bun run notion:create-template
```

### Version Commands

#### Check Version

Check the Notion version information.

```bash
bun run notion:version
```

**Examples:**

```bash
# Check version
bun run notion:version
```

### Placeholder Commands

#### Generate Placeholders

Generate placeholder content for missing translations.

```bash
bun run notion:gen-placeholders
```

**Examples:**

```bash
# Generate placeholders
bun run notion:gen-placeholders
```

## API Server Commands

### Start API Server

Start the API server for programmatic access.

```bash
bun run api:server
```

**Environment Variables:**

- `API_HOST` - Server hostname (default: `localhost`)
- `API_PORT` - Server port (default: `3001`)
- `API_KEY_*` - API keys for authentication (optional)

**Examples:**

```bash
# Start with default settings
bun run api:server

# Start with custom port
API_PORT=8080 bun run api:server

# Start with API key
API_KEY_ADMIN=secret123 bun run api:server
```

## Development Commands

### Start Development Server

Start the Docusaurus development server.

```bash
bun run dev
```

**Options:**

- `--locale <locale>` - Start with specific locale

**Examples:**

```bash
# Start English dev server
bun run dev

# Start Portuguese dev server
bun run dev:pt

# Start Spanish dev server
bun run dev:es
```

### Build Documentation

Build the documentation for production.

```bash
bun run build
```

**Examples:**

```bash
# Build documentation
bun run build
```

### Type Check

Run TypeScript type checking.

```bash
bun run typecheck
```

**Examples:**

```bash
# Type check all files
bun run typecheck
```

## Testing Commands

### Run All Tests

Run the complete test suite.

```bash
bun run test
```

**Examples:**

```bash
# Run all tests
bun run test
```

### Run Tests in Watch Mode

Run tests in watch mode for development.

```bash
bun run test:watch
```

**Examples:**

```bash
# Watch tests
bun run test:watch
```

### Run API Server Tests

Run tests specifically for the API server.

```bash
bun run test:api-server
```

**Examples:**

```bash
# Test API server
bun run test:api-server
```

### Run Notion Fetch Tests

Run tests specifically for Notion fetching.

```bash
bun run test:notion-fetch
```

**Examples:**

```bash
# Test Notion fetch
bun run test:notion-fetch
```

### Run Notion CLI Tests

Run tests specifically for Notion CLI commands.

```bash
bun run test:notion-cli
```

**Examples:**

```bash
# Test Notion CLI
bun run test:notion-cli
```

## Utility Commands

### Lint Code

Run ESLint on source code.

```bash
bun run lint
```

**Examples:**

```bash
# Lint source code
bun run lint

# Fix linting issues automatically
bun run lint:fix
```

### Fix Frontmatter

Fix frontmatter in documentation files.

```bash
bun run fix:frontmatter
```

**Examples:**

```bash
# Fix frontmatter
bun run fix:frontmatter
```

### Generate Robots.txt

Generate robots.txt for the documentation site.

```bash
bun run generate:robots
```

**Examples:**

```bash
# Generate robots.txt
bun run generate:robots
```

### Clean Generated Content

Clean up generated content.

```bash
bun run clean:generated
```

**Examples:**

```bash
# Clean generated files
bun run clean:generated
```

## Command Exit Codes

- `0` - Success
- `1` - General error
- `2` - Validation error
- `3` - Notion API error
- `4` - File system error

## Environment Variables

### Required

- `NOTION_API_KEY` - Your Notion integration API key
- `NOTION_DATABASE_ID` - The ID of your Notion database

### Optional

#### API Server

- `API_HOST` - Server hostname (default: `localhost`)
- `API_PORT` - Server port (default: `3001`)
- `API_KEY_*` - API keys for authentication

#### Development

- `DEFAULT_DOCS_PAGE` - Default documentation page
- `BASE_URL` - Base URL for the site
- `IS_PRODUCTION` - Set to `true` for production builds

## Troubleshooting

### "NOTION_API_KEY not set"

Make sure your `.env` file contains your Notion API key:

```bash
echo "NOTION_API_KEY=your_key_here" >> .env
```

### "NOTION_DATABASE_ID not set"

Make sure your `.env` file contains your Notion database ID:

```bash
echo "NOTION_DATABASE_ID=your_db_id_here" >> .env
```

### Command not found

Make sure you have installed dependencies:

```bash
bun install
```

### Port already in use

If the API server port is already in use, specify a different port:

```bash
API_PORT=3002 bun run api:server
```

## See Also

- API Reference - HTTP API documentation
- Development Setup - Setting up your development environment
