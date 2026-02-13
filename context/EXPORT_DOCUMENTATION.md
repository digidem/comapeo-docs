# Enhanced Notion Export Command Documentation

## Overview

The `notion:export` command has been significantly enhanced to provide comprehensive block-level content analysis and export capabilities. This tool exports complete Notion database content with detailed analysis for documentation planning, content gap identification, and translation management.

## Command Usage

```bash
npm run notion:export [options]
```

## Command Options

| Option            | Short | Description                             | Example                              |
| ----------------- | ----- | --------------------------------------- | ------------------------------------ |
| `--verbose`       | `-v`  | Show detailed progress information      | `--verbose`                          |
| `--quick`         | `-q`  | Skip detailed content analysis (faster) | `--quick`                            |
| `--output-prefix` | `-o`  | Custom prefix for output files          | `--output-prefix "test"`             |
| `--max-pages`     |       | Limit number of pages to process        | `--max-pages 50`                     |
| `--status-filter` |       | Only export pages with specific status  | `--status-filter "Ready to publish"` |
| `--no-raw-data`   |       | Exclude raw page data from export       | `--no-raw-data`                      |
| `--help`          | `-h`  | Show help message                       | `--help`                             |

## Output Files

The command generates two main files:

### 1. Complete Export (`notion_db_complete_[timestamp].json`)

Comprehensive export containing:

- **Metadata**: Export information, version, totals, options used
- **Statistics**: Breakdown by status, element type, language, block types
- **Content Stats**: Empty vs contentful pages, averages, totals
- **Pages Array**: Detailed analysis for each page including:
  - Page metadata (title, status, type, language)
  - Content scoring (0-100 scale)
  - Block-level analysis with text extraction
  - Structure analysis (headings, paragraphs, images, etc.)
  - Complete block hierarchy with children
- **Raw Data**: Original Notion API responses (optional)

### 2. Analysis Summary (`notion_content_analysis_[timestamp].json`)

Quick reference containing:

- **Summary**: High-level statistics
- **Top Content Pages**: Best scoring pages
- **Empty Pages List**: Pages needing content
- **Status/Block Type Breakdowns**: Distribution statistics

## Content Analysis Features

### Content Scoring Algorithm

Each page receives a content score (0-100) based on:

- **Basic Content Existence** (10 points per block with content)
- **Content Length Bonuses** (5-15 points based on text length)
- **Block Type Bonuses**:
  - Headings: 20 points (structure importance)
  - Paragraphs: 5-15 points (based on length)
  - Lists: 8 points each
  - Media (images/videos): 12 points each
  - Code/equations: 15 points each
  - Tables: 20 points each
  - Callouts/quotes: 10 points each
- **Overall Length Bonus** (10-25 points for substantial content)
- **Content Diversity Bonus** (5-20 points for varied block types)

### Block-Level Analysis

For each block, the system extracts:

- **Type**: Notion block type (paragraph, heading, image, etc.)
- **Content**: Full text content with rich text handling
- **Metadata**: Creation/edit times, children count
- **Structure**: Hierarchical position and nesting

### Page Structure Analysis

- **Headings**: All headings with levels and text
- **Content Counts**: Paragraphs, lists, images, links, code blocks, tables, embeds
- **Hierarchy Depth**: Maximum nesting level
- **Content Distribution**: Balance of different content types

## Use Cases

### 1. Content Gap Analysis

```bash
npm run notion:export --status-filter "Draft"
```

Identify pages that need content development.

### 2. Translation Planning

```bash
npm run notion:export --verbose
```

Get comprehensive language breakdown and content statistics.

### 3. Documentation Completeness Assessment

```bash
npm run notion:export --no-raw-data
```

Generate analysis-focused export without large raw data.

### 4. Quick Testing/Development

```bash
npm run notion:export --quick --max-pages 20 --output-prefix "test"
```

Fast export for development/testing purposes.

### 5. Publication Readiness Check

```bash
npm run notion:export --status-filter "Ready to publish" --verbose
```

Analyze content ready for publication.

## Advanced Features

### Null Status Handling

The export system properly handles Notion's null status values, ensuring pages without explicit status assignments are included appropriately.

### Recursive Block Fetching

All nested blocks and their children are fetched recursively, providing complete content hierarchy.

### Error Recovery

Robust error handling ensures the export continues even if individual pages fail to load.

### Progress Tracking

Real-time progress updates with different verbosity levels for different use cases.

### Flexible Output

Configurable output with options to exclude raw data for smaller files or focus on specific page types.

## Performance Considerations

- **Full Export**: ~2-5 minutes for 200 pages (depending on content complexity)
- **Quick Mode**: ~1-2 minutes for 200 pages (basic analysis only)
- **Filtered Export**: Proportionally faster based on filter scope
- **Memory Usage**: ~50-200MB during processing (depending on content size)

## Integration with Other Commands

The export data can be used with:

- `notion:gen-placeholders` - Identify empty pages for placeholder generation
- `notion:fetch-all` - Compare with publication-ready content
- Custom analysis scripts - Rich data format for further processing

## Example Outputs

### Sample Analysis Summary

```json
{
  "summary": {
    "totalPages": 193,
    "emptyPages": 45,
    "contentfulPages": 148,
    "averageContentScore": 67.3,
    "readyToPublish": 89,
    "needsContent": 23,
    "excellentContent": 34
  },
  "topContentPages": [
    {
      "title": "CoMapeo Mobile Installation Guide",
      "contentScore": 95,
      "status": "Ready to publish",
      "totalBlocks": 28,
      "totalTextLength": 2847
    }
  ]
}
```

### Sample Page Analysis

```json
{
  "id": "page-id",
  "title": "Getting Started with CoMapeo",
  "status": "Ready to publish",
  "elementType": "Tutorial",
  "contentScore": 87,
  "isEmpty": false,
  "totalBlocks": 15,
  "totalTextLength": 1200,
  "structure": {
    "headings": [
      { "level": 1, "text": "Getting Started" },
      { "level": 2, "text": "Installation" }
    ],
    "paragraphs": 8,
    "images": 3,
    "lists": 2
  }
}
```

## Troubleshooting

### Common Issues

1. **Rate Limiting**: If you encounter rate limits, the system automatically retries with exponential backoff.

2. **Memory Issues**: Use `--no-raw-data` for large databases to reduce memory usage.

3. **Slow Performance**: Use `--quick` mode for faster processing when detailed analysis isn't needed.

4. **Permission Errors**: Ensure your Notion API key has access to the database and all referenced pages.

### Debug Information

Use `--verbose` to see:

- Detailed progress information
- Applied filters and options
- Page processing statistics
- Error details for failed pages

This enhanced export system provides the foundation for comprehensive Notion content management and analysis workflows.
