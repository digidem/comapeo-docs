# Notion Commands Reference

Command reference for the Notion integration workflow.

## Core Commands

### `notion:gen-placeholders`
Generate meaningful placeholder content for empty pages in Notion.

**Basic Usage**:
```bash
bun run notion:gen-placeholders
```

**Options**:
```bash
# Dry run to preview changes
bun run notion:gen-placeholders -- --dry-run

# Verbose output with detailed progress  
bun run notion:gen-placeholders -- --verbose

# Generate longer content
bun run notion:gen-placeholders -- --content-length long

# Process only specific status
bun run notion:gen-placeholders -- --filter-status "Draft"

# Limit number of pages processed
bun run notion:gen-placeholders -- --max-pages 10

# Force update even if page has some content
bun run notion:gen-placeholders -- --force

# Skip backup creation
bun run notion:gen-placeholders -- --no-backup

# Include pages with "Remove" status  
bun run notion:gen-placeholders -- --include-removed
```

### `notion:fetch-all`
Comprehensive content fetching and markdown conversion for all non-removed pages.

**Basic Usage**:
```bash
bun run notion:fetch-all
```

**Options**:
```bash
# Dry run mode
bun run notion:fetch-all -- --dry-run

# Process specific language only
bun run notion:fetch-all -- --language English

# Include specific status pages
bun run notion:fetch-all -- --status "Ready to publish"

# Skip image processing
bun run notion:fetch-all -- --no-images

# Verbose logging
bun run notion:fetch-all -- --verbose
```

### `notion:export`
Complete database export in JSON format for analysis.

**Basic Usage**:
```bash
bun run notion:export
```

**Options**:
```bash
# Custom output file
bun run notion:export -- --output custom-export.json

# Include detailed block analysis
bun run notion:export -- --include-blocks

# Compress output
bun run notion:export -- --compress
```

## Legacy Commands

### `notion:fetch`
Current implementation for fetching ready-to-publish content.

```bash
bun run notion:fetch
```

### `notion:translate`
Translation workflow (may be integrated into fetch-all).

```bash
bun run notion:translate
```

## Command Safety

**Destructive Operations**:
- `notion:gen-placeholders` (modifies Notion pages)
- Require confirmation or `--force` flag

**Read-Only Operations**:
- `notion:fetch-all`
- `notion:export`
- Safe to run multiple times

## Environment Setup

Required environment variables:
```bash
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_database_id
OPENAI_API_KEY=your_openai_key  # For placeholder generation
```

## Error Handling

Common error patterns:
- **Rate limiting**: Commands automatically retry with backoff
- **API errors**: Detailed error messages with retry suggestions  
- **Permission errors**: Clear instructions for access requirements
- **Validation errors**: Specific feedback on data issues