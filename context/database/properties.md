# Notion Database Properties

Database schema for all pages in the CoMapeo documentation Notion database.

## Core Properties

| Property Name | Type | Description | Required | Example Values |
|---------------|------|-------------|----------|----------------|
| `Content elements` | title | Main page title | ✅ | "Installing & Uninstalling CoMapeo" |
| `Language` | select | Content language | ✅ | "English", "Spanish", "Portuguese" |
| `Publish Status` | select | Publishing workflow status | ❌ | "Ready to publish", "No Status" |
| `Element Type` | select | Content categorization | ❌ | "Page", "Toggle", "Title", "Unknown" |
| `Order` | number | Display order | ❌ | 1, 2, 3, etc. |
| `Tags` | multi_select | Content tags | ❌ | [] (typically empty) |

## Workflow Properties

| Property Name | Type | Description |
|---------------|------|-------------|
| `Date Published` | date | Publication date |
| `Drafting Status` | select | Draft workflow status |
| `↳ Assignment Target Date` | rollup | Rollup from related items |

## System Properties

| Property Name | Type | Description |
|---------------|------|-------------|
| `Last edited by` | people | Last editor |
| `Created time` | created_time | Creation timestamp |
| `Last edited time` | last_edited_time | Last modification timestamp |

## Valid Values

### Status Options
- `"No Status"` (default, 72% of pages)
- `"Not started"` 
- `"Update in progress"`
- `"Draft published"`
- `"Ready to publish"`
- `"Remove"` (exclude from processing)

### Element Types
- `"Page"` (standard content pages, 70.5%)
- `"Title"` (section headers, 19.2%)
- `"Toggle"` (collapsible sections, 5.2%)
- `"Unknown"` (unclassified content, 5.2%)

### Languages
- `"English"` (source language, 32.7%)
- `"Spanish"` (translation target, 31.3%)
- `"Portuguese"` (translation target, 34.7%)

## Development Notes

- Use constants from `scripts/constants.ts` for property names
- Filter by `status !== "Remove"` for active content
- `"No Status"` indicates placeholder/empty pages
- Order property used for navigation structure