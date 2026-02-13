# Three-Script Architecture

Design overview for the comprehensive Notion integration pipeline.

## Architecture Overview

### 1. `notion:gen-placeholders`

**Purpose**: Generate placeholder content for ALL English sub-pages of "Content elements"

**Scope**:

- Target: English pages with `elementType: "Page"`
- Filter: Exclude only `status === "Remove"`
- Operation: Create meaningful placeholder content in Notion

**Key Features**:

- TDD approach with comprehensive tests
- Contextual placeholder generation
- Batch processing with rate limiting
- Dry-run capability for safety

### 2. `notion:fetch-all`

**Purpose**: Comprehensive content fetching like current `notion:fetch` but for ALL pages

**Scope**:

- Target: ALL pages in database
- Filter: Exclude only `status === "Remove"`
- Operation: Convert to markdown, preserve metadata

**Key Features**:

- Enhanced callout support (addresses issue #17)
- Multi-language content handling
- Image processing and optimization
- Translation metadata preservation

### 3. `notion:export`

**Purpose**: Complete database export in JSON format for LLM analysis

**Scope**:

- Target: Complete database (no filters)
- Output: Structured JSON with full schema
- Operation: Comprehensive data dump

**Key Features**:

- Block-level analysis
- Content scoring
- Relationship mapping
- Development-friendly format

## Implementation Strategy

### Test-Driven Development

- **Requirement**: All scripts implemented using TDD
- **Quality**: Precise, comprehensive, well-designed tests
- **Success**: All tests must pass for successful implementation

### Integration Points

- Shared constants from `scripts/constants.ts`
- Common utilities for API handling
- Unified error handling and logging
- Consistent configuration management
- **Sidebar ordering stability**: During full rebuilds, the fetch pipeline prefers `existingCache` output paths to preserve prior `sidebar_position` values when `Order` is missing and computed paths shift (e.g., filtered runs missing toggles/headings).

### Development Workflow

1. Write failing tests for each script
2. Implement minimal functionality to pass tests
3. Refactor for quality and performance
4. Validate with real Notion data
5. Document usage and edge cases

## Quality Standards

- **Test Coverage**: 100% for core functionality
- **Error Handling**: Robust with informative messages
- **Performance**: Handle large datasets efficiently
- **Documentation**: Clear usage examples and API docs
- **Safety**: Dry-run modes and backup strategies
