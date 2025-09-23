# Content Lifecycle Workflow

Documentation content workflow from creation to publication.

## Content Stages

### 1. Creation Stage
**Status**: "No Status" or "Not started"
**Action**: Create content structure in Notion

**Process**:
1. Create page in Notion with proper `Element Type`
2. Set `Language` to source language (English)
3. Define `Order` for navigation structure
4. Add to parent via `Sub-item` relation

### 2. Development Stage  
**Status**: "Update in progress"
**Action**: Write and structure content

**Process**:
1. Add meaningful content (text, images, callouts)
2. Structure with headings and lists
3. Include relevant media and examples
4. Use callouts for important information

### 3. Ready for Translation
**Status**: "Ready for translation"
**Action**: Prepare for localization

**Process**:
1. Content review and editing complete
2. Run `bun run notion:translate` to:
   - Create translation pages in Notion
   - Update `i18n/*/code.json` files
   - Translate navbar/footer strings
   - Generate translated markdown

### 4. Ready for Publication
**Status**: "Ready to publish"
**Action**: Content approved for live site

**Process**:
1. Final content review completed
2. Translations validated
3. Technical review passed
4. Ready for site deployment

### 5. Published
**Status**: "Draft published"
**Action**: Live on documentation site

**Process**:
1. Run `bun run notion:fetch` to:
   - Pull published content
   - Generate frontmatter
   - Optimize images
   - Create navigation structure
2. Deploy to production site

### 6. Removal
**Status**: "Remove"
**Action**: Mark for cleanup

**Process**:
1. Content deprecated or obsolete
2. Excluded from all processing
3. Can be safely deleted

## Automated Workflows

### Placeholder Generation
```bash
# Generate placeholders for empty English pages
bun run notion:gen-placeholders
```
- Targets "No Status" pages
- Creates contextual placeholder content
- Maintains content structure

### Complete Content Sync
```bash
# Fetch all non-removed content
bun run notion:fetch-all
```
- Processes all active content
- Generates complete site structure
- Handles multiple languages

## Quality Gates

### Content Requirements
- Meaningful title and structure
- Proper heading hierarchy
- Relevant images and media
- Clear, actionable content

### Technical Requirements
- Valid markdown generation
- Image optimization
- Proper frontmatter
- Navigation structure

### Translation Requirements
- Source content finalized
- Translation strings updated
- Localized content reviewed
- Cultural adaptation complete

## Status Transitions

```
No Status → Not started → Update in progress 
    ↓
Ready for translation → Ready to publish → Draft published
    ↓
Remove (if deprecated)
```

## Content Guidelines

### English (Source)
- Primary content creation
- Technical accuracy focus
- Clear, concise writing
- Comprehensive coverage

### Spanish/Portuguese (Translations)
- Cultural adaptation
- Localized examples
- Regional considerations
- Consistent terminology