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
2. Page translations generated via `../comapeo-content-pipeline/`
3. Theme chrome translated in-repo via `bun scripts/translate-theme/index.ts`

### 4. Ready for Publication

**Status**: "Ready to publish"
**Action**: Content approved for live site

**Process**:

1. Final content review completed
2. Translations validated
3. Technical review passed
4. Ready for site deployment

### 5. Ready for Production

**Status**: "Draft published" (after fetch)
**Action**: Approved content ready for production deploy

**Process**:

1. Content generated and pushed to `content` branch via `../comapeo-content-pipeline/`
2. Previews and staging sites build directly from the `content` branch
3. Review content on staging site (PR previews or staging deploy)
4. When approved, trigger "Deploy to Production" workflow (Actions → workflow_dispatch):
   - Automatically updates `content-lock.sha` on `main`
   - Deploys with the locked SHA in the same run

### 6. Published

**Status**: "Draft published"
**Action**: Live on production documentation site

**Process**:

1. Production deploy workflow triggered by `content-lock.sha` merge:
   - Checks out locked content SHA
   - Validates content exists and is valid
   - Deploys to production Cloudflare Pages
   - Updates Notion status to published

### 6. Removal

**Status**: "Remove"
**Action**: Mark for cleanup

**Process**:

1. Content deprecated or obsolete
2. Excluded from all processing
3. Can be safely deleted

## Content Synchronization

Content synchronization is handled end-to-end by `../comapeo-content-pipeline/`:

- Notion is the editorial source of truth.
- The external pipeline processes pages, generates frontmatter, optimizes images to `static/images/notion/`, and commits directly to `content`.
- Production deployment promotes `content-lock.sha` on `main` pointing to the approved content revision (see [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)).

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
