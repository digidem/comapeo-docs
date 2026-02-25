# Scripts Inventory

Complete inventory of all Notion-related scripts in the comapeo-docs repository, including core entry points, shared utilities, and API server integration.

## Overview

This document provides a comprehensive inventory of all Bun scripts that interact with Notion API, their relationships, and how they integrate with the API server service.

## Core Notion Scripts

### 1. notion-fetch

**Path**: `scripts/notion-fetch/index.ts`

**Purpose**: Fetches ready-to-publish content from Notion and generates documentation files.

**Entry Point**: `scripts/notion-fetch/index.ts`

**Core Functions**:

- `runFetchPipeline()` - Main pipeline orchestration
- Filters pages by "Ready to Publish" status
- Excludes pages with Parent item relation
- Generates markdown files with frontmatter
- Creates section folders with `_category_.json` files

**Command**: `bun run notion:fetch`

**Environment Variables**:

- `NOTION_API_KEY` - Notion API authentication token
- `DATABASE_ID` / `NOTION_DATABASE_ID` - Notion database ID

**API Server Job Type**: `notion:fetch`

**Output**:

- Markdown files in `docs/` directory
- Section metadata in `_category_.json` files

---

### 2. notion-fetch-all

**Path**: `scripts/notion-fetch-all/index.ts`

**Purpose**: Comprehensive export of ALL pages from Notion regardless of status, with analysis and comparison capabilities.

**Entry Point**: `scripts/notion-fetch-all/index.ts`

**Core Functions**:

- `fetchAllNotionData()` - Main fetch function with options
- `PreviewGenerator.generatePreview()` - Documentation preview generation
- `StatusAnalyzer.analyzePublicationStatus()` - Status analysis
- `ComparisonEngine.compareWithPublished()` - Compare with published docs

**Command**: `bun run notion:fetch-all [options]`

**Options**:

- `--max-pages <n>` - Limit number of pages to process
- `--status-filter <status>` - Filter by specific status
- `--force` - Force full rebuild, ignore cache
- `--dry-run` - Show what would be processed without doing it
- `--include-removed` - Include pages with "Remove" status
- `--preview-only` - Generate preview only, no file export
- `--comparison, -c` - Compare with published documentation

**API Server Job Type**: `notion:fetch-all`

**Output**:

- Markdown files (default)
- Preview reports (markdown/JSON/HTML)
- Status analysis reports
- Comparison reports

---

### 3. notion-fetch-one

**Path**: `scripts/notion-fetch-one/index.ts`

**Purpose**: Fetch a single page from Notion using fuzzy matching.

**Entry Point**: `scripts/notion-fetch-one/index.ts`

**Core Functions**:

- Fuzzy page title matching
- Single page export

**Command**: `bun run notion:fetch-one <page-title>`

**Use Case**: Quick single-page updates without full fetch

---

### 4. notion-translate

**Path**: `scripts/notion-translate/index.ts`

**Purpose**: Translation workflow for multilingual documentation.

**Entry Point**: `scripts/notion-translate/index.ts`

**Command**: `bun run notion:translate`

**API Server Job Type**: `notion:translate`

**Languages Supported**:

- `pt` (Portuguese)
- `es` (Spanish)

**Output**: Translated content in `i18n/{lang}/docs/`

---

### 5. notion-status

**Path**: `scripts/notion-status/index.ts`

**Purpose**: Update page statuses based on workflow state.

**Entry Point**: `scripts/notion-status/index.ts`

**Workflows**:

- `translation` - Update translation workflow status
- `draft` - Update draft workflow status
- `publish` - Update publish workflow status
- `publish-production` - Update production publish status

**Command**: `bun run notion:status --workflow <workflow-name>`

**API Server Job Types**:

- `notion:status-translation`
- `notion:status-draft`
- `notion:status-publish`
- `notion:status-publish-production`

---

### 6. notion-placeholders

**Path**: `scripts/notion-placeholders/index.ts`

**Purpose**: Generate placeholder content for empty pages.

**Entry Point**: `scripts/notion-placeholders/index.ts`

**Command**: `bun run notion:gen-placeholders`

**Output**: Placeholder markdown files with TODO comments

---

### 7. notion-create-template

**Path**: `scripts/notion-create-template/index.ts`

**Purpose**: Create new Notion page templates.

**Entry Point**: `scripts/notion-create-template/index.ts`

**Command**: `bun run notion:create-template`

---

### 8. notion-version

**Path**: `scripts/notion-version/index.ts`

**Purpose**: Version management for documentation.

**Entry Point**: `scripts/notion-version/index.ts`

**Command**: `bun run notion:version`

---

## Shared Utilities

### Core Data Fetching

**Path**: `scripts/fetchNotionData.ts`

**Purpose**: Core Notion API data fetching logic used by all scripts.

**Key Functions**:

- `fetchNotionData()` - Main data fetching function
- Block type parsing and conversion
- Image optimization and caching
- Frontmatter generation

**Dependencies**:

- `notionClient.ts` - Notion API client
- `constants.ts` - Configuration constants

---

### Notion Client

**Path**: `scripts/notionClient.ts`

**Purpose**: Notion API client wrapper with error handling and retry logic.

**Key Functions**:

- `queryDatabase()` - Query Notion database with filters
- `getPage()` - Fetch single page
- `getBlockChildren()` - Fetch block children recursively
- `retryWithBackoff()` - Exponential backoff retry logic

**Features**:

- Rate limit handling
- Error recovery
- Request logging

---

### Constants

**Path**: `scripts/constants.ts`

**Purpose**: Shared configuration and Notion property mappings.

**Exports**:

- `NOTION_PROPERTIES` - Property name constants
- `BLOCK_TYPES` - Notion block type mappings
- Database ID resolution logic

---

### Error Handling

**Path**: `scripts/shared/errors.ts`

**Purpose**: Unified error handling for all scripts.

**Exports**:

- `ValidationError` - Validation error class
- `NotionAPIError` - Notion API error wrapper
- Error formatting utilities
- Error response schemas

---

### Page Utilities

**Path**: `scripts/notionPageUtils.ts`

**Purpose**: Notion page processing utilities.

**Key Functions**:

- Page title extraction
- Page URL generation
- Page property parsing
- Icon handling

---

## API Server Integration

### Job Executor

**Path**: `scripts/api-server/job-executor.ts`

**Purpose**: Execute Notion jobs asynchronously with progress tracking.

**Job Types Mapped**:

```typescript
const JOB_COMMANDS = {
  "notion:fetch": ["bun", "scripts/notion-fetch"],
  "notion:fetch-all": ["bun", "scripts/notion-fetch-all"],
  "notion:translate": ["bun", "scripts/notion-translate"],
  "notion:status-translation": [
    "bun",
    "scripts/notion-status",
    "--workflow",
    "translation",
  ],
  "notion:status-draft": [
    "bun",
    "scripts/notion-status",
    "--workflow",
    "draft",
  ],
  "notion:status-publish": [
    "bun",
    "scripts/notion-status",
    "--workflow",
    "publish",
  ],
  "notion:status-publish-production": [
    "bun",
    "scripts/notion-status",
    "--workflow",
    "publish-production",
  ],
};
```

**Features**:

- Process spawning with `node:child_process`
- Progress parsing from stdout
- Log capture and persistence
- GitHub status reporting integration

---

### Job Tracker

**Path**: `scripts/api-server/job-tracker.ts`

**Purpose**: In-memory job state management.

**Job States**:

- `pending` - Job queued, not started
- `running` - Job currently executing
- `completed` - Job finished successfully
- `failed` - Job failed with error

**Job Progress Tracking**:

- Current/total progress counters
- Progress messages
- Estimated completion time

---

### Authentication

**Path**: `scripts/api-server/auth.ts`

**Purpose**: API key authentication for protected endpoints.

**Features**:

- Header-based API key validation (`X-API-Key`)
- Environment variable configuration (`API_KEYS`)
- Multiple API key support (comma-separated)

---

### Audit Logging

**Path**: `scripts/api-server/audit.ts`

**Purpose**: Request audit logging for compliance and debugging.

**Logged Data**:

- Request ID
- Timestamp
- Auth result
- Endpoint
- Request body (sanitized)
- Response status
- Duration

---

### GitHub Status Reporting

**Path**: `scripts/api-server/github-status.ts`

**Purpose**: Report job completion status to GitHub commits.

**Features**:

- Status API integration
- Idempotent status updates
- Context-aware reporting (e.g., "notion-fetch", "notion-translate")

---

## Testing Infrastructure

### Test Utilities

**Path**: `scripts/test-utils.ts`
**Path**: `scripts/test-utils/`

**Purpose**: Shared testing utilities and mocks.

**Features**:

- Notion API mocks
- Test data fixtures
- Environment setup
- Assertion helpers

---

### Vitest Configuration

**Path**: `vitest.config.ts`

**Purpose**: Test runner configuration for all script tests.

**Coverage Areas**:

- Unit tests for core utilities
- Integration tests for API endpoints
- Job queue behavior tests
- Auth and audit logging tests

---

## Workflow Integration

### GitHub Actions

**Path**: `.github/workflows/notion-fetch.yml`

**Purpose**: CI/CD integration for Notion content fetching.

**Features**:

- Manual and automatic triggers
- API-based fetch execution
- Status reporting to PRs
- Preview deployment on Cloudflare Pages

**Smart Content Generation**:

- Detects script changes → regenerates content
- No script changes → uses cached content branch
- Label-based override (`fetch-10-pages`, `fetch-all-pages`)

---

## Module Dependencies

### Dependency Graph

```
api-server/
├── job-executor.ts → spawns all notion-* scripts
├── job-tracker.ts → manages job state
├── auth.ts → validates API keys
├── audit.ts → logs requests
└── github-status.ts → reports to GitHub

notion-fetch/
├── index.ts (entry point)
├── runFetch.ts (pipeline orchestration)
└── runtime.ts (graceful shutdown)

notion-fetch-all/
├── index.ts (entry point)
├── fetchAll.ts (data fetching)
├── previewGenerator.ts (preview generation)
├── statusAnalyzer.ts (status analysis)
└── comparisonEngine.ts (comparison logic)

Shared Utilities:
├── fetchNotionData.ts (core fetching)
├── notionClient.ts (API client)
├── constants.ts (configuration)
├── notionPageUtils.ts (page utilities)
└── shared/errors.ts (error handling)
```

---

## Operational Notes

### Environment Variables Required

All scripts require:

- `NOTION_API_KEY` - Notion integration token

Most scripts require:

- `DATABASE_ID` / `NOTION_DATABASE_ID` - Notion database ID

API server requires:

- `API_PORT` - Server port (default: 3001)
- `API_HOST` - Server host (default: localhost)
- `API_KEYS` - Comma-separated valid API keys

GitHub integration requires:

- `GITHUB_TOKEN` - GitHub personal access token

### Performance Considerations

- **Image Optimization**: Scripts automatically compress images during fetch
- **Caching**: `notion-fetch-all` supports caching with `--force` to bypass
- **Concurrency**: API server limits concurrent jobs (configurable)
- **Progress Tracking**: Real-time progress reporting for long-running jobs

### Error Recovery

- **Retry Logic**: Notion client uses exponential backoff for rate limits
- **Graceful Shutdown**: All scripts support SIGTERM/SIGINT handling
- **Job Persistence**: Failed jobs preserve error logs and partial output
- **Status Reporting**: GitHub status updates reflect job outcomes

---

## Future Considerations

### Potential Refactoring Opportunities

1. **Module Extraction**: Core logic from `notion-fetch` and `notion-fetch-all` could be extracted into reusable modules
2. **Pure Functions**: Some scripts have side effects that could be isolated
3. **Shared Types**: Common interfaces could be consolidated
4. **Test Coverage**: Some utility scripts lack comprehensive tests

### API Server Enhancements

1. **WebSocket Support**: Real-time progress updates
2. **Job Priorities**: Priority queue for different job types
3. **Rate Limiting**: Per-API-key rate limiting
4. **Job History**: Persistent job history beyond current session

---

_Last Updated: 2025-02-07_
