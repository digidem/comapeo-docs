# Hash Links - Quick Summary

**Issue:** #93 - Hash links are simply skipped and are no links at all during rendering
**Priority:** High
**Status:** Investigation Complete - Ready for Implementation
**Date:** 2025-11-27

---

## The Problem in 30 Seconds

Notion allows linking to specific sections within pages using hash anchors (e.g., `https://notion.so/page#section`). Currently, these links are either broken or stripped during conversion to markdown, resulting in poor documentation navigation.

**User wants:**
- Links like `/docs/installation-guide#prerequisites` that work
- Both same-page and cross-page hash links
- Readable anchor names (not block IDs)

---

## Key Findings

### 1. notion-to-md Outputs Malformed Tags ⚠️

The library doesn't output standard markdown links. Instead:
```html
<link to section.>      <!-- What notion-to-md outputs -->
[link](#)               <!-- What our sanitizer converts it to -->
```

**Problem:** We're discarding the actual link information!

### 2. No Cross-Page Link Rewriting

There's no system to convert:
```
https://notion.so/page-id  →  /docs/page-slug
```

### 3. We Already Use Remark Plugins ✅

The project already uses remark plugins for transformations:
```typescript
remarkPlugins: [remarkFixImagePaths]  // docusaurus.config.ts:283
```

This is the right architecture for our solution.

---

## Recommended Solution

**Approach: Hybrid Strategy (Remark Plugin + Enhanced Sanitizer)**

### Phase 1: Enhanced Sanitizer
Extract link information instead of discarding it:
```typescript
// OLD: <link to section.> → [link](#)
// NEW: <link to section.> → [link](notion://page-id#block-id)
```

### Phase 2: Export Mappings
Generate `notion-link-mappings.json`:
```json
{
  "pages": { "notion-page-id": "page-slug" },
  "blocks": { "block-id": "readable-anchor" }
}
```

### Phase 3: Remark Plugin
Transform during Docusaurus build:
```typescript
// notion://page-id#block-id → /docs/page-slug#readable-anchor
```

**Why this approach?**
- ✅ Follows existing patterns
- ✅ Clean architecture
- ✅ Maintainable
- ✅ 10-14 hours effort

---

## Documentation Structure

### 📄 Read These Documents

1. **[hash-links-specification.md](./hash-links-specification.md)**
   - Full problem statement
   - Requirements and expected behavior
   - Success criteria
   - **Read this first for context**

2. **[hash-links-implementation-plan.md](./hash-links-implementation-plan.md)**
   - Four different implementation approaches
   - Detailed comparison matrix
   - Recommended approach (Hybrid Strategy)
   - Effort estimates and roadmap
   - **Read this for choosing implementation approach**

3. **[hash-links-technical-investigation.md](./hash-links-technical-investigation.md)**
   - Detailed technical findings
   - Current pipeline analysis
   - Code references and examples
   - Unanswered questions
   - **Read this for technical deep-dive**

---

## Next Steps for Team

### 1. Review Documents (1-2 hours)
- [ ] Read specification
- [ ] Review implementation approaches
- [ ] Understand technical findings

### 2. Team Discussion (1 hour)
- [ ] Choose implementation approach
- [ ] Decide on error handling strategy
- [ ] Assign implementation owner
- [ ] Set timeline

### 3. Investigation Phase (2-3 hours)
Before implementation, verify:
- [ ] Create test Notion page with various link types
- [ ] Document exact notion-to-md output formats
- [ ] Confirm approach is viable

### 4. Implementation (10-14 hours)
- [ ] Phase 1: Enhanced sanitizer (2-3h)
- [ ] Phase 2: Mapping exporter (2-3h)
- [ ] Phase 3: Remark plugin (4-5h)
- [ ] Testing (2-3h)

### 5. Deployment & Validation (2-3 hours)
- [ ] Test with real content
- [ ] Deploy to preview
- [ ] Monitor and iterate

**Total estimated time:** 15-23 hours from decision to deployment

---

## Quick Comparison: Implementation Approaches

| Approach | Effort | Risk | Maintainability | Recommendation |
|----------|--------|------|-----------------|----------------|
| A: Custom Post-Processing | 14-20h | Medium | Medium | ❌ Too complex |
| B: Remark Plugin Only | 10-13h | Low | High | ✅ Good option |
| C: Wait for Upstream | 2-6mo | High | High | ❌ Too slow |
| **D: Hybrid Strategy** | **10-14h** | **Low** | **High** | **✅ Recommended** |

---

## Open Questions for Discussion

### 1. Error Handling
**Question:** What happens when a link references a non-existent page?

**Options:**
- A. Fail the build (strict)
- B. Warn and keep original URL (graceful)
- C. Convert to broken link marker (explicit)

**Vote needed:** Team preference?

### 2. I18n Behavior
**Question:** Should hash links be language-aware?

**Example:** Portuguese page links to heading - go to PT or EN version?

**Research needed:** Docusaurus i18n + hash behavior

### 3. Caching
**Question:** Commit link mappings to git or regenerate?

**Options:**
- A. Generate every time (slower, always fresh)
- B. Commit to git (faster, can be stale)

**Recommendation:** Generate on Notion fetch

---

## Risk Assessment

### Low Risk ✅
- Following existing patterns
- Clear implementation path
- Reversible changes

### Medium Risk ⚠️
- notion-to-md output format assumptions
- I18n edge cases
- Performance impact (likely minimal)

### Mitigation Strategy
- Investigation phase validates assumptions
- Comprehensive testing plan
- Incremental implementation

---

## Success Metrics

### Functional
- ✅ Same-page hash links work
- ✅ Cross-page links work
- ✅ Cross-page + hash links work
- ✅ No regressions
- ✅ External links unchanged

### Non-Functional
- ✅ Build time impact < 10%
- ✅ Clear error messages
- ✅ Documentation complete
- ✅ Tests passing

---

## Related Issues & Resources

### Codebase
- Current sanitizer: `scripts/notion-fetch/contentSanitizer.ts:107-117`
- Slug generation: `scripts/notion-fetch/generateBlocks.ts:582-593`
- Remark plugin example: `scripts/remark-fix-image-paths.ts`

### External
- [notion-to-md Issue #161](https://github.com/souvikinator/notion-to-md/issues/161) - Upstream issue
- [Docusaurus MDX Plugins](https://docusaurus.io/docs/markdown-features/plugins) - Plugin docs
- [Notion Links Help](https://www.notion.com/help/create-links-and-backlinks) - How Notion links work

---

## Decision Needed

**Team:** Please review the three detailed documents and come to a meeting ready to discuss:

1. ✅ or ❌ on recommended Hybrid Strategy approach
2. Decision on error handling (fail vs warn vs mark)
3. Decision on i18n behavior
4. Implementation owner assignment
5. Timeline commitment

**Estimated meeting time:** 1 hour

---

## Quick Start After Decision

Once team approves approach:

```bash
# 1. Create feature branch
git checkout -b feature/hash-links-support

# 2. Investigation phase
# Create test Notion page, document findings

# 3. Implementation (in order)
touch scripts/notion-fetch/anchorSlugifier.ts
touch scripts/notion-fetch/linkMappingExporter.ts
touch scripts/remark-notion-links.ts

# 4. Tests
touch scripts/notion-fetch/anchorSlugifier.test.ts
touch scripts/notion-fetch/linkMappingExporter.test.ts
touch scripts/remark-notion-links.test.ts

# 5. Update existing
# - scripts/notion-fetch/contentSanitizer.ts
# - scripts/notion-fetch/generateBlocks.ts
# - docusaurus.config.ts
```

---

**Questions?** Review the detailed documents or reach out to the team lead.

**Ready to start?** Begin with investigation phase after team approval.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-27
**Status:** Ready for Team Review
