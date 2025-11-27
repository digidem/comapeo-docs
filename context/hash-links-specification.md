# Hash Links Specification

**Issue:** #93 - Hash links are simply skipped and are no links at all during rendering
**Priority:** High
**Status:** Investigation Complete - Awaiting Implementation Decision
**Date:** 2025-11-27

---

## Problem Statement

Notion allows users to create links to specific blocks (headings, paragraphs, etc.) within a page. These links include a block ID as a hash fragment in the URL (e.g., `https://notion.so/page-id#block-abc123`). Currently, these hash links are either stripped during conversion or converted to placeholder links, resulting in broken navigation in the generated documentation.

### User Requirements

1. **Readable anchor names**: Hash links should use human-readable names like `#about-this-guide`, not block IDs like `#block-abc123`
2. **Cross-page support**: Links should work for both same-page references and cross-page references
3. **Same-page support**: Links to headings within the same page should work correctly

### Expected Behavior

**Before (Current):**
```markdown
Check the [installation guide](https://notion.so/Installation-Guide-abc123#block-def456) for details.
```
→ Broken link or points to Notion.so

**After (Desired):**
```markdown
Check the [installation guide](/docs/installation-guide#prerequisites) for details.
```
→ Works locally, navigates to correct section

---

## Research Findings

### 1. Current Link Processing Pipeline

```
Notion API (raw blocks with link_to_page and mentions)
    ↓
notion-to-md v3.1.9: pageToMarkdown()
    ↓
notion-to-md: toMarkdownString()
    → Outputs MALFORMED HTML/JSX tags: <link to section.>, <mention ...>
    ↓
contentSanitizer.ts: sanitizeMarkdownContent()
    → Converts to placeholder links: [link](#)
    ↓
Docusaurus build
    → Renders as links, but destinations are broken
```

### 2. Key Discovery: Malformed Tag Output

The `notion-to-md` library (v3.1.9) does **not** output standard markdown links for Notion page references. Instead, it outputs malformed HTML/JSX-like tags:

**Examples from current sanitizer:**
- `<link to section.>` → Currently converted to `[link to section](#section)`
- `<link href.example=value>` → Currently converted to `[link](#)`
- `<Link to.page=value>` → Currently converted to `[Link](#)`

**Current sanitizer behavior (contentSanitizer.ts:107-117):**
```typescript
// Discards actual link information!
content = content.replace(
  /<link\s+to\s+section\.?>/gi,
  "[link to section](#section)"
);

content = content.replace(/<link\s+[^>]*[^\w\s"=-][^>]*>/g, "[link](#)");
content = content.replace(/<Link\s+[^>]*[^\w\s"=-][^>]*>/g, "[Link](#)");
```

### 3. Cross-Page Linking Status

**Current State:**
- ✅ Page titles are converted to kebab-case slugs (e.g., "Getting Started" → `getting-started`)
- ✅ Frontmatter includes `slug: /getting-started` for Docusaurus routing
- ✅ Multi-language pages share the same slug across languages
- ✅ Page metadata cache tracks Notion page IDs → output file paths

**Missing:**
- ❌ No link rewriting system to convert Notion page URLs to local doc URLs
- ❌ No hash link support for block ID anchors
- ❌ No block ID → readable anchor mapping

### 4. Upstream Library Status

**notion-to-md v3.1.9:**
- GitHub Issue #161: "Add support for 'Link to block' to URL hash conversion"
- Status: Open (as of 2025-07-21)
- Current behavior: Strips out hash/block ID information during conversion
- No timeline for fix

**Reference:** https://github.com/souvikinator/notion-to-md/issues/161

---

## Technical Requirements

### 1. Link Types to Support

| Link Type | Example | Current Behavior | Desired Behavior |
|-----------|---------|------------------|------------------|
| Same-page hash | `#block-id` | Stripped | `#section-name` |
| Cross-page | `https://notion.so/page-id` | Notion URL | `/docs/page-slug` |
| Cross-page + hash | `https://notion.so/page-id#block-id` | Notion URL or broken | `/docs/page-slug#section` |
| External | `https://example.com` | Works ✅ | Keep unchanged ✅ |

### 2. Anchor Name Generation

**Requirements:**
- Must match Docusaurus's heading anchor generation algorithm
- Must be human-readable (slugified from heading text)
- Must handle duplicates (append `-2`, `-3`, etc.)
- Must work across all languages (i18n)

**Docusaurus Anchor Algorithm:**
```typescript
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/[^\w\-]+/g, '')       // remove special chars
    .replace(/\-\-+/g, '-')         // collapse multiple hyphens
    .replace(/^-+/, '')             // trim leading hyphens
    .replace(/-+$/, '');            // trim trailing hyphens
}
```

### 3. Notion URL Formats

Must handle multiple Notion URL variants:
```
https://notion.so/page-id
https://notion.so/Page-Title-page-id
https://notion.so/workspace/page-id
https://notion.so/page-id?p=page-id#block-id
```

### 4. I18n Considerations

**Multi-language behavior:**
- Pages share slugs across languages: `/docs/page` (English) and `/pt/docs/page` (Portuguese)
- Question: Should hash links be language-aware?
- Question: Do block IDs differ across language variants?

**Needs research:** How Docusaurus handles i18n + hash link navigation

---

## Open Questions

### 1. Notion Link Format Investigation

**Need to verify:**
- What exactly does notion-to-md output for different link types?
- Are same-page hash links handled differently than cross-page links?
- How are `link_to_page` block types represented?
- How are page mentions (`@Page Name`) represented?

**Action:** Create test Notion page with all link types and run notion-to-md to see actual output

### 2. Block Content Availability

**Question:** Do we already have block content during markdown generation?

**Investigation findings:**
- Yes, blocks are already fetched via `fetchNotionBlocks()` in `generateBlocks.ts`
- No additional API calls needed for block content
- Block tree structure is available for traversal

### 3. Error Handling Strategy

**Scenarios:**
- Link references non-existent page
- Block ID doesn't exist or is deleted
- Malformed Notion URL

**Options:**
- **Strict:** Fail the build with clear error
- **Graceful:** Warn and keep original URL
- **Explicit:** Convert to marked broken link (e.g., `[link ⚠️](#broken)`)

**Decision needed:** Team preference for error handling approach

### 4. Caching Strategy

**Questions:**
- Should block anchor mappings be persisted between builds?
- How to handle incremental sync with link changes?
- How to detect and clean up broken links?

**Current state:** Page metadata cache exists (`pageMetadataCache.ts`), could be extended

---

## Related Documentation

### Codebase Files
- `scripts/notion-fetch/contentSanitizer.ts` - Current link sanitization (lines 107-117)
- `scripts/notion-fetch/generateBlocks.ts` - Page processing and slug generation (lines 582-593)
- `scripts/notion-fetch/pageMetadataCache.ts` - Page ID to file path mapping
- `scripts/remark-fix-image-paths.ts` - Example remark plugin architecture
- `docusaurus.config.ts` - Remark plugin configuration (line 283)

### External Resources
- [Notion Help: Links & Backlinks](https://www.notion.com/help/create-links-and-backlinks)
- [notion-to-md Issue #161](https://github.com/souvikinator/notion-to-md/issues/161)
- [Docusaurus MDX Plugins](https://docusaurus.io/docs/markdown-features/plugins)
- [Docusaurus Hash-Links Issue #11358](https://github.com/facebook/docusaurus/issues/11358)
- [Super.so: Anchor Links Guide](https://help.super.so/en/articles/6388730-how-to-link-to-a-part-of-a-page-anchor-links)

---

## Success Criteria

### MVP (Minimum Viable Product)
- [ ] Same-page hash links work with readable anchor names
- [ ] Cross-page links convert to local doc paths
- [ ] Cross-page + hash links work correctly
- [ ] External links remain unchanged
- [ ] No regressions in existing link behavior

### Nice to Have
- [ ] Broken link detection and reporting
- [ ] Link validation during build
- [ ] I18n-aware hash link routing
- [ ] Cached mappings for faster incremental builds
- [ ] Migration tool for existing content

---

## Next Steps

1. **Phase 1: Investigation** (1-2 hours)
   - Create test Notion pages with various link types
   - Run notion-to-md to document actual output formats
   - Document findings in technical investigation document

2. **Phase 2: Architecture Decision** (Team review)
   - Review implementation plan options
   - Decide on error handling strategy
   - Decide on caching approach
   - Choose implementation approach

3. **Phase 3: Implementation** (6-12 hours, depending on approach)
   - Implement chosen solution
   - Write comprehensive tests
   - Update documentation

4. **Phase 4: Validation** (2-3 hours)
   - Test with real Notion content
   - Verify links work in Docusaurus
   - Performance testing
   - Deploy to preview environment

---

**Document Version:** 1.0
**Last Updated:** 2025-11-27
**Authors:** Claude (AI Assistant)
**Reviewers:** _Pending team review_
