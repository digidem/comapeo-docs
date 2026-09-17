# CLI Reference

The CoMapeo Documentation project provides command-line interface (CLI) tools for managing Notion content and translations. All commands are run using Bun.

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

### Content Pipeline (External)

Notion content fetching, markdown generation, and page translation are owned by `../comapeo-content-pipeline/`. See that repository's documentation for CLI commands (`pnpm pipeline sync:full`, `pnpm pipeline docs:pull`, etc.).

### Theme Translation Commands

#### Translate Theme Chrome

Translate UI strings and theme chrome (`navbar`, `footer`, `code.json`) for configured locales (Portuguese and Spanish):

```bash
bun scripts/translate-theme/index.ts
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

## See Also

- API Reference - HTTP API documentation
- Development Setup - Setting up your development environment
