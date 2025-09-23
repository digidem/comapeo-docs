# Script Targeting Reference

Specific targeting criteria for the three-script Notion integration architecture.

## Script Overview

### 1. `notion:gen-placeholders`
**Purpose**: Generate placeholder content for empty English "Content elements" pages

**Targeting Criteria**:
- `elementType: "Page"`
- `language: "English"`
- `status !== "Remove"`
- Empty or minimal content

**Estimated Targets**: ~48 English pages (focus on "No Status")

### 2. `notion:fetch-all`
**Purpose**: Comprehensive content fetching and markdown conversion

**Targeting Criteria**:
- `status !== "Remove"`
- All languages
- All element types

**Estimated Targets**: 190 pages (193 total - 3 "Remove")

### 3. `notion:export`
**Purpose**: Complete database dump for LLM analysis

**Targeting Criteria**:
- No filters (complete export)
- Include all metadata and relationships

**Estimated Targets**: 193 pages (complete database)

## Filtering Logic

### Status-Based Filtering
```typescript
// Include all except "Remove"
const activeStatuses = [
  "No Status",
  "Not started", 
  "Update in progress",
  "Draft published",
  "Ready to publish"
];
```

### Language-Based Filtering
```typescript
// For placeholders: English only
const placeholderLang = "English";

// For fetch-all: All languages
const allLanguages = ["English", "Spanish", "Portuguese"];
```

### Element Type Filtering
```typescript
// For placeholders: Content pages only
const placeholderTypes = ["Page"];

// For fetch-all: All types
const allTypes = ["Page", "Title", "Toggle", "Unknown"];
```

## Content Identification

### Empty Page Detection
- `hasContent: false`
- `contentScore: 0`
- `isEmpty: true`
- `totalTextLength: 0`

### Content Quality Thresholds
- **Empty**: score = 0
- **Minimal**: score 1-10
- **Basic**: score 11-30
- **Rich**: score 31+

## Implementation Notes

- Use constants from `scripts/constants.ts` for property names
- Implement dry-run capabilities for safety
- Include progress reporting for large operations
- Handle rate limiting for Notion API calls
- Provide detailed logging for debugging