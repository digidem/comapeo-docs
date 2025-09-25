# Content Patterns & Usage Analysis

Analysis of content distribution and usage patterns in the CoMapeo Notion database.

## Content Categories

### Empty Placeholders (72%)
- **Status**: "No Status" (139 pages)
- **Characteristics**: Minimal/no content, contentScore: 0
- **Usage**: Structural placeholders awaiting content

### Work in Progress (15%)
- **Statuses**: "Not started" (19), "Update in progress" (10)
- **Characteristics**: Partial content, various scores
- **Usage**: Active development, draft content

### Ready Content (8%)
- **Status**: "Ready to publish" (15 pages)
- **Characteristics**: Complete content, higher scores
- **Usage**: Completed, awaiting publication

### Published Content (4%)
- **Status**: "Draft published" (7 pages)
- **Characteristics**: Live content, validated
- **Usage**: Currently published documentation

### Deprecated (2%)
- **Status**: "Remove" (3 pages)
- **Characteristics**: Marked for deletion
- **Usage**: Legacy content to be cleaned up

## Language Distribution Patterns

- **Portuguese**: 34.7% (51 pages) - Highest representation
- **English**: 32.7% (48 pages) - Source language
- **Spanish**: 31.3% (46 pages) - Translation target

*Note: Portuguese leads likely due to active translation efforts*

## Block Usage Patterns

### Primary Content (55%)
- Paragraphs: 46.2% (main content)
- Dividers: 9.5% (organization)

### Structure (15%)
- Headings (all levels): 15.2%
- Lists: 11.5%

### Rich Content (10%)
- Images: 6.3% (visual content)
- Callouts: 2.8% (highlighted info)
- Tables: 5.7% (structured data)

### Navigation (1.3%)
- Table of contents: Auto-generated

## Content Depth Analysis

- **Average blocks per page**: 9.9
- **Average content score**: 27.7
- **Pages with images**: ~62% (120 images across 193 pages)
- **Pages with callouts**: ~27% (53 callouts)
- **Empty pages**: 72% ("No Status")

## Development Implications

### Script Targeting
1. **notion:gen-placeholders**: Focus on 139 "No Status" pages
2. **notion:fetch-all**: Process 190 non-"Remove" pages
3. **notion:export**: All 193 pages for analysis

### Content Quality
- Most content needs development (72% empty)
- Ready content represents mature documentation
- Translation coverage is balanced across languages