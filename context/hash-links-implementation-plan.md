# Hash Links Implementation Plan

**Issue:** #93 - Hash links are simply skipped and are no links at all during rendering
**Date:** 2025-11-27
**Status:** Proposal - Awaiting Team Decision

---

## Executive Summary

This document presents multiple implementation approaches for fixing hash links in the Notion-to-Docusaurus pipeline. Each approach has trade-offs in complexity, maintainability, and integration with the existing architecture.

**Recommended Approach:** Hybrid Strategy (Approach D)
- Combines enhanced content sanitization with a Docusaurus remark plugin
- Follows existing architectural patterns (`remark-fix-image-paths`)
- Provides clean separation of concerns
- Most maintainable long-term solution

---

## Architecture Overview

### Current Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ Notion API                                                  │
│ • Blocks with link_to_page references                      │
│ • Page mentions (@Page Name)                               │
│ • Block IDs for anchors                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ notion-to-md v3.1.9                                         │
│ • pageToMarkdown() - converts blocks                       │
│ • toMarkdownString() - generates markdown                  │
│ • OUTPUT: Malformed tags like <link to section.>          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ contentSanitizer.ts                                         │
│ • Fixes malformed HTML/JSX tags                            │
│ • PROBLEM: Discards actual link information                │
│ • Converts to placeholder: [link](#)                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Docusaurus Build                                            │
│ • Processes markdown files                                  │
│ • Generates routes from frontmatter slugs                  │
│ • RESULT: Broken or missing hash links                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Approach A: Custom Post-Processing (Original Plan)

### Description

Add link rewriting during Notion fetch in `generateBlocks.ts`.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Build Mappings                                    │
│   • Notion Page ID → Local Slug                            │
│   • Notion Block ID → Readable Anchor Name                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Three-Pass Processing                             │
│   Pass 1: Collect all page ID → slug mappings             │
│   Pass 2: Process all blocks → build anchor mappings      │
│   Pass 3: Rewrite links with complete mapping data        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Link Rewriting                                    │
│   • Parse markdown links                                    │
│   • Extract Notion URLs and block IDs                      │
│   • Convert to local paths: /docs/slug#anchor              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Files

**New Files:**
```
scripts/notion-fetch/
├── linkMapper.ts              # Mapping system (page & block IDs)
├── linkRewriter.ts            # Notion URL → local path conversion
├── blockAnchorBuilder.ts      # Extract blocks & generate anchors
└── anchorSlugifier.ts         # Slugify text to match Docusaurus
```

**Modified Files:**
```
scripts/notion-fetch/
└── generateBlocks.ts          # Integrate link processing
```

### Pros
- ✅ Full control over link conversion
- ✅ Can handle all edge cases
- ✅ Works during Notion fetch (offline afterward)
- ✅ No dependency on Docusaurus build process

### Cons
- ❌ Complex three-pass processing required
- ❌ Custom code outside standard Docusaurus patterns
- ❌ Harder to debug and maintain
- ❌ Processes ALL pages even if Docusaurus doesn't need them
- ❌ Manual cache management required
- ❌ Doesn't leverage Docusaurus link resolution

### Estimated Effort
- **Development:** 11-16 hours
- **Testing:** 3-4 hours
- **Total:** 14-20 hours

---

## Approach B: Docusaurus Remark Plugin

### Description

Create a remark plugin that runs during Docusaurus build to transform links.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Notion Fetch (generateBlocks.ts)                           │
│   • Generate pages with enhanced metadata                  │
│   • Export page ID mappings to JSON file                   │
│   • Preserve Notion URLs in markdown temporarily           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Docusaurus Build                                            │
│   • Reads markdown files                                    │
│   • Applies remark plugins in order                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ remark-notion-links.ts (NEW)                                │
│   • Traverses markdown AST                                  │
│   • Finds link nodes with Notion URLs                      │
│   • Loads page ID mappings from JSON                       │
│   • Converts URLs to local paths with anchors             │
│   • Leverages Docusaurus heading data                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Final Markdown                                              │
│   • All links converted to local paths                     │
│   • Hash anchors match Docusaurus heading IDs              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Files

**New Files:**
```
scripts/
├── remark-notion-links.ts     # Remark plugin for link transformation
└── notion-link-mappings.json  # Generated page/block ID mappings
```

**Modified Files:**
```
docusaurus.config.ts           # Add new remark plugin
scripts/notion-fetch/
├── generateBlocks.ts          # Export link mappings to JSON
└── contentSanitizer.ts        # Preserve Notion URLs (don't discard)
```

### Pros
- ✅ Follows existing architectural pattern (`remark-fix-image-paths`)
- ✅ Integrates cleanly with Docusaurus
- ✅ Can leverage Docusaurus heading TOC data
- ✅ Only processes pages Docusaurus needs
- ✅ Uses Docusaurus caching automatically
- ✅ Easier to debug (part of standard build)
- ✅ More maintainable long-term

### Cons
- ❌ Requires mapping data to be exported/loaded
- ❌ Two-stage process (Notion fetch + Docusaurus build)
- ❌ Slightly more complex setup
- ❌ Need to handle stale mapping data

### Estimated Effort
- **Development:** 8-10 hours
- **Testing:** 2-3 hours
- **Total:** 10-13 hours

---

## Approach C: Upstream Fix (Wait for notion-to-md)

### Description

Contribute to notion-to-md Issue #161 or wait for upstream fix.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Contribute to notion-to-md                                  │
│   • Fork notion-to-md repository                           │
│   • Implement hash link support                            │
│   • Submit PR to upstream                                   │
│   • Wait for merge and release                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Upgrade notion-to-md                                        │
│   • Update package.json to new version                     │
│   • Test with existing content                             │
│   • Remove temporary workarounds                           │
└─────────────────────────────────────────────────────────────┘
```

### Pros
- ✅ Benefits entire community
- ✅ Proper long-term solution
- ✅ Reduces custom code in this project
- ✅ Maintained by upstream

### Cons
- ❌ Uncertain timeline (could be months)
- ❌ May not match exact requirements
- ❌ Need temporary workaround anyway
- ❌ Dependency on external maintainers
- ❌ High priority requirement (can't wait)

### Estimated Effort
- **Upstream contribution:** 20-30 hours
- **Integration:** 2-4 hours
- **Timeline:** 2-6 months (uncertain)

---

## Approach D: Hybrid Strategy (RECOMMENDED)

### Description

Combine enhanced content sanitization with a remark plugin for best of both worlds.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Enhanced Content Sanitizer                        │
│   • Extract page/block IDs from malformed tags             │
│   • Convert to markdown with data-notion-* attributes      │
│   • Example: [link](notion://page-id#block-id)            │
│   • Preserve link information for later processing         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Export Mappings                                    │
│   • Generate page ID → slug mappings                       │
│   • Generate block ID → anchor mappings                    │
│   • Export to scripts/notion-link-mappings.json            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Remark Plugin (Docusaurus Build)                  │
│   • Load mappings from JSON                                 │
│   • Transform notion:// URLs to local paths                │
│   • Generate readable anchors from block content           │
│   • Validate links and report broken references            │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Files

**New Files:**
```
scripts/
├── remark-notion-links.ts              # Remark plugin
├── notion-fetch/
│   ├── linkMappingExporter.ts         # Export mappings to JSON
│   └── anchorSlugifier.ts             # Slugify headings
└── notion-link-mappings.json           # Generated mappings
```

**Modified Files:**
```
scripts/notion-fetch/
├── contentSanitizer.ts                 # Enhanced link extraction
├── generateBlocks.ts                   # Export mappings
└── contentSanitizer.test.ts            # Updated tests

docusaurus.config.ts                    # Add remark plugin
```

### Implementation Phases

#### **Phase 1: Enhanced Sanitizer (2-3 hours)**
```typescript
// contentSanitizer.ts
function extractNotionLink(malformedTag: string): {
  pageId?: string;
  blockId?: string;
  text: string;
} {
  // Extract IDs from malformed tags
  // Return structured data
}

// Convert malformed tags to temporary format
content = content.replace(
  /<link\s+to\s+([^>]+)>/gi,
  (match, linkInfo) => {
    const { pageId, blockId, text } = extractNotionLink(linkInfo);
    return `[${text}](notion://${pageId}${blockId ? '#' + blockId : ''})`;
  }
);
```

#### **Phase 2: Mapping Exporter (2-3 hours)**
```typescript
// linkMappingExporter.ts
interface LinkMappings {
  pages: Record<string, string>;    // pageId → slug
  blocks: Record<string, string>;   // blockId → anchor
  version: string;                  // Cache version
  generated: string;                // Timestamp
}

export function exportLinkMappings(
  pages: PageData[],
  outputPath: string
): void {
  // Build mappings from processed pages
  // Write to JSON file
}
```

#### **Phase 3: Remark Plugin (4-5 hours)**
```typescript
// remark-notion-links.ts
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';

const remarkNotionLinks: Plugin = () => {
  const mappings = loadMappings();

  return (tree) => {
    visit(tree, 'link', (node) => {
      if (node.url.startsWith('notion://')) {
        const { pageId, blockId } = parseNotionUrl(node.url);
        const slug = mappings.pages[pageId];
        const anchor = blockId ? mappings.blocks[blockId] : '';

        if (slug) {
          node.url = `/docs/${slug}${anchor ? '#' + anchor : ''}`;
        } else {
          // Warn about broken link
          console.warn(`Unknown page ID: ${pageId}`);
        }
      }
    });
  };
};

export default remarkNotionLinks;
```

### Pros
- ✅ Clean separation of concerns
- ✅ Follows existing architectural patterns
- ✅ Preserves link information through pipeline
- ✅ Easier to debug (clear data flow)
- ✅ Can add validation and error reporting
- ✅ Extensible for future enhancements
- ✅ Leverages Docusaurus ecosystem
- ✅ Incremental implementation possible

### Cons
- ❌ Slightly more complex than single approach
- ❌ Need to maintain mapping file format
- ❌ Two-stage processing

### Estimated Effort
- **Phase 1:** 2-3 hours
- **Phase 2:** 2-3 hours
- **Phase 3:** 4-5 hours
- **Testing:** 2-3 hours
- **Total:** 10-14 hours

---

## Comparison Matrix

| Criteria | Approach A | Approach B | Approach C | Approach D |
|----------|-----------|-----------|-----------|-----------|
| **Complexity** | High | Medium | Low (wait) | Medium |
| **Maintainability** | Medium | High | High | High |
| **Integration** | Custom | Standard | Standard | Standard |
| **Timeline** | 2-3 weeks | 1-2 weeks | 2-6 months | 1-2 weeks |
| **Flexibility** | High | Medium | Low | High |
| **Debug Ease** | Medium | High | N/A | High |
| **Performance** | Medium | High | High | High |
| **Long-term Cost** | High | Medium | Low | Medium |
| **Risk Level** | Medium | Low | High | Low |

---

## Recommendation: Approach D (Hybrid Strategy)

### Why This Approach?

1. **Follows Existing Patterns**
   - Already using remark plugins (`remark-fix-image-paths`)
   - Team familiar with this architecture
   - Standard Docusaurus approach

2. **Clean Architecture**
   - Separation of concerns (sanitize → map → transform)
   - Clear data flow through pipeline
   - Easy to understand and maintain

3. **Extensible**
   - Can add link validation
   - Can add broken link reporting
   - Can add link analytics
   - Can add custom link transformations

4. **Reasonable Effort**
   - 10-14 hours total (vs 14-20 for Approach A)
   - Incremental implementation possible
   - Can deliver MVP faster

5. **Low Risk**
   - Follows proven patterns
   - Easy to debug
   - Easy to rollback if needed

### Future Path

After implementing Approach D, consider:
- **Contributing to notion-to-md** (Approach C) for long-term upstream fix
- **Removing workaround** when upstream support is available
- **Packaging remark plugin** as standalone package for community

---

## Implementation Roadmap

### Week 1: Investigation & Phase 1
- [ ] **Day 1-2:** Investigation (verify notion-to-md output formats)
- [ ] **Day 3:** Enhanced content sanitizer
- [ ] **Day 4:** Unit tests for sanitizer
- [ ] **Day 5:** Code review and refinement

### Week 2: Phase 2 & 3
- [ ] **Day 1-2:** Mapping exporter implementation
- [ ] **Day 3-4:** Remark plugin implementation
- [ ] **Day 5:** Integration and testing

### Week 3: Validation & Deployment
- [ ] **Day 1-2:** Test with real Notion content
- [ ] **Day 3:** Performance testing and optimization
- [ ] **Day 4:** Documentation and team training
- [ ] **Day 5:** Deploy to preview environment

### Week 4: Monitoring & Refinement
- [ ] Monitor for edge cases
- [ ] Fix any issues discovered
- [ ] Gather team feedback
- [ ] Plan enhancements

---

## Risk Mitigation

### Risk 1: Stale Mapping Data
**Mitigation:**
- Add version tracking to mapping file
- Regenerate on any Notion fetch
- Add validation checks in remark plugin

### Risk 2: Unknown Notion URL Formats
**Mitigation:**
- Comprehensive investigation phase first
- Robust parsing with fallbacks
- Clear error messages for unsupported formats

### Risk 3: Performance Impact
**Mitigation:**
- Mapping load is O(1) per page
- Docusaurus caching handles rebuild optimization
- Monitor build times before/after

### Risk 4: I18n Edge Cases
**Mitigation:**
- Research Docusaurus i18n + hash behavior first
- Test with multi-language pages
- Document i18n-specific behavior

---

## Testing Strategy

### Unit Tests
- [ ] Content sanitizer link extraction
- [ ] Mapping exporter output format
- [ ] Anchor slugification matches Docusaurus
- [ ] Remark plugin link transformation
- [ ] Edge cases (malformed URLs, missing mappings)

### Integration Tests
- [ ] Full pipeline (Notion → Sanitizer → Mappings → Remark → Docusaurus)
- [ ] Cross-page links work correctly
- [ ] Same-page hash links work correctly
- [ ] External links remain unchanged
- [ ] Multi-language pages

### Manual Tests
- [ ] Create test Notion pages with all link types
- [ ] Run full build pipeline
- [ ] Verify links work in dev server
- [ ] Test on preview deployment
- [ ] Check browser console for errors

---

## Success Metrics

### Functional
- [ ] 100% of same-page hash links work
- [ ] 100% of cross-page links work
- [ ] 100% of cross-page + hash links work
- [ ] 0 regressions in existing links
- [ ] External links unchanged

### Non-Functional
- [ ] Build time impact < 10%
- [ ] No memory issues
- [ ] Clear error messages for broken links
- [ ] Documentation complete
- [ ] Team training delivered

---

## Open Issues for Team Discussion

### 1. Error Handling Strategy
**Question:** What should happen when a link references a non-existent page or block?

**Options:**
- A. Fail the build (strict)
- B. Warn and keep original URL (graceful)
- C. Convert to broken link marker (explicit)

**Recommendation:** Option A for development, Option B for production

### 2. Caching Strategy
**Question:** Should link mappings be committed to git or generated on each build?

**Options:**
- A. Generate every time (slower but always fresh)
- B. Commit to git (faster but can be stale)
- C. Hybrid: cache with validation

**Recommendation:** Option A (regenerate on Notion fetch)

### 3. I18n Behavior
**Question:** How should hash links work across languages?

**Scenarios:**
- Portuguese page links to English heading
- Should it go to Portuguese version?
- Should anchors be translated?

**Action Required:** Research and team decision

---

**Document Version:** 1.0
**Last Updated:** 2025-11-27
**Status:** Proposal - Awaiting Team Review
**Next Steps:** Team review meeting to discuss approach selection
