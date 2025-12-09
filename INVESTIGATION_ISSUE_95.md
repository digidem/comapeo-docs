# Investigation Report: Issue #95

## Summary

**Issue**: Some content is not being updated or skipped during fetch.

**Investigation Date**: December 2024

**Status**: Investigation complete - **Multiple potential causes identified**

---

## Findings Overview

| Priority | Issue | Impact | Location |
|----------|-------|--------|----------|
| **HIGH** | Silent sub-page drops | Content never recovered | `fetchNotionData.ts`, `pageGrouping.ts` |
| **MEDIUM** | Dead code confusion | Code maintainability | `generateBlocks.ts:56` |
| **LOW** | Path case sensitivity | Windows/macOS edge case | `generateBlocks.ts:742` |
| **LOW** | Empty outputPaths edge | Rare edge case | `pageMetadataCache.ts:264` |
| **LOW** | Timestamp regression guard | Eventual consistency | `pageMetadataCache.ts:310` |

---

## Critical Finding #1: Silent Sub-page Drops

### Problem

When fetching sub-pages, failures are silently dropped with only a warning log. The content is never generated and **cannot be recovered on subsequent runs**.

### Affected Files

- `scripts/fetchNotionData.ts:221-227`
- `scripts/notion-fetch/pageGrouping.ts:124-128`

### Code Analysis

**In `fetchNotionData.ts`:**

```typescript
// Lines 221-227
} catch (pageError) {
  // Log the error but don't let it fail the entire batch
  console.warn(
    `⚠️  Skipping sub-page ${rel.subId} (parent: "${rel.parentTitle}"): ${pageError.message}`
  );
  return null; // Sub-page silently dropped
}
```

The `null` values are filtered out:

```typescript
// Line 233
const validResults = batchResults.filter((result) => result !== null);
```

**In `pageGrouping.ts`:**

```typescript
// Lines 124-128
for (const relation of subItemRelation) {
  const subpage = pages.find((candidate) => candidate.id === relation?.id);
  if (!subpage) {
    continue;  // Silently skip - no error raised
  }
  // ...
}
```

### Impact Scenario

1. Parent page "Getting Started" has sub-items: EN, ES, PT translations
2. During fetch, the ES translation times out (10s timeout in `fetchNotionData.ts:189`)
3. ES sub-page is dropped from `pages` array
4. `groupPagesByLang` can't find ES sub-page, silently skips it
5. Only EN and PT content files are generated
6. **Next run**: Parent page timestamp unchanged, so it's skipped (incremental sync)
7. ES content **never gets generated**

### Why This Causes "Content Not Updated"

The cache tracks page IDs and timestamps. Since the ES sub-page was never successfully processed:
- It has no cache entry
- But the parent page DOES have a cache entry
- If the parent page isn't edited, the entire group is skipped
- The missing sub-page is never retried

### Recommended Fix

Option A: Track failed sub-pages in cache for retry

```typescript
// Add to cache structure
interface PageMetadataCache {
  // ...existing fields
  failedSubpages?: Array<{
    pageId: string;
    parentId: string;
    lastAttempt: string;
    errorMessage: string;
  }>;
}
```

Option B: Force re-fetch of parent pages that have incomplete sub-page sets

```typescript
// In generateBlocks.ts, before skipping unchanged pages
const expectedSubpages = page?.properties?.["Sub-item"]?.relation?.length ?? 0;
const cachedOutputCount = cachedPage?.outputPaths?.length ?? 0;
if (expectedSubpages > 0 && cachedOutputCount < expectedSubpages) {
  // Force re-processing - some sub-pages may be missing
  needsProcessing = true;
}
```

---

## Finding #2: Dead Code - `filterChangedPages` Never Used

### Problem

The `filterChangedPages` function is imported in `generateBlocks.ts` but never called.

### Location

- **Import**: `scripts/notion-fetch/generateBlocks.ts:56`
- **Definition**: `scripts/notion-fetch/pageMetadataCache.ts:181-208`

### Code Analysis

The import:
```typescript
// generateBlocks.ts:56
import {
  // ...
  filterChangedPages,  // IMPORTED but never called
  // ...
} from "./pageMetadataCache";
```

Instead, there's inline logic at lines 736-744 that does similar filtering:

```typescript
const needsProcessing =
  syncMode.fullRebuild ||
  !cachedPage ||
  hasMissingOutputs(metadataCache, page.id) ||
  !cachedPage.outputPaths?.includes(filePath) ||  // <-- NOT in filterChangedPages!
  new Date(page.last_edited_time).getTime() >
    new Date(cachedPage.lastEdited).getTime();
```

### Differences Between Implementations

| Check | `filterChangedPages` | Inline logic |
|-------|---------------------|--------------|
| Full rebuild | N/A (handled separately) | ✓ |
| Not in cache | ✓ | ✓ |
| Missing outputs | ✓ | ✓ |
| **Path changed** | ✗ | ✓ |
| Timestamp newer | ✓ | ✓ |

### Impact

The inline logic has an additional check for path changes (`!cachedPage.outputPaths?.includes(filePath)`) that `filterChangedPages` doesn't have. This handles cases where a page moves to a different folder.

### Recommended Fix

Either:
1. Remove the unused import to reduce confusion
2. Or refactor to use `filterChangedPages` and add the path-change check to it

---

## Finding #3: Output Path Case Sensitivity

### Problem

The path comparison is case-sensitive, which could cause issues on case-insensitive filesystems (Windows, macOS default).

### Location

`scripts/notion-fetch/generateBlocks.ts:742`

### Code

```typescript
!cachedPage.outputPaths?.includes(filePath)
```

### Impact Scenario

1. Cache stores: `/home/user/comapeo-docs/docs/Getting-Started.md`
2. Current filePath: `/home/user/comapeo-docs/docs/getting-started.md`
3. `includes()` returns `false` because case differs
4. Page is unnecessarily re-processed

### Recommended Fix

```typescript
const normalizedCachedPaths = cachedPage.outputPaths?.map(p =>
  process.platform === 'win32' || process.platform === 'darwin'
    ? p.toLowerCase()
    : p
);
const normalizedFilePath =
  process.platform === 'win32' || process.platform === 'darwin'
    ? filePath.toLowerCase()
    : filePath;
const pathInCache = normalizedCachedPaths?.includes(normalizedFilePath);
```

---

## Finding #4: Empty outputPaths Edge Case

### Problem

If a page is cached with an empty `outputPaths` array, `hasMissingOutputs` returns `false`.

### Location

`scripts/notion-fetch/pageMetadataCache.ts:264-274`

### Code

```typescript
export function hasMissingOutputs(
  cache: PageMetadataCache | null,
  pageId: string
): boolean {
  // ...
  return cached.outputPaths.some((outputPath) => {
    // some() on empty array returns false
    // So pages with outputPaths=[] are never flagged as missing
  });
}
```

### Impact

If a page was somehow cached without any output paths, it would never be flagged as needing re-processing, even though no files exist.

### Recommended Fix

```typescript
// Early return if outputPaths is empty
if (cached.outputPaths.length === 0) {
  return true; // No outputs recorded = treat as missing
}
```

---

## Finding #5: Timestamp Regression Guard

### Problem

`updatePageInCache` keeps the existing timestamp if it's newer than the incoming one.

### Location

`scripts/notion-fetch/pageMetadataCache.ts:310-314`

### Code

```typescript
const latestLastEdited =
  existing &&
  new Date(existing.lastEdited).getTime() > new Date(lastEdited).getTime()
    ? existing.lastEdited  // Keep EXISTING if it's newer
    : lastEdited;
```

### Potential Issue

If Notion's API returns inconsistent timestamps (eventual consistency), this could:
1. Store a "newer" timestamp from one API call
2. Subsequent calls return the "correct" older timestamp
3. Cache keeps the incorrect newer timestamp
4. Future edits with timestamps older than the cached one are skipped

### Mitigation

This is intentional defensive coding. However, if issues persist, consider:
1. Logging when timestamp regression is detected
2. Adding a `--force-timestamps` flag to always use incoming timestamps

---

## Testing Recommendations

### Test Cases to Add

1. **Sub-page timeout handling**
   - Mock a sub-page fetch timeout
   - Verify the page is tracked for retry
   - Verify subsequent runs re-attempt the fetch

2. **Case-insensitive path matching** (for cross-platform)
   - Cache a path with different case
   - Verify it's correctly recognized as existing

3. **Empty outputPaths handling**
   - Create cache entry with empty outputPaths
   - Verify page is flagged for re-processing

---

## Conclusion

The **most likely cause** of "content not being updated" is **Finding #1: Silent Sub-page Drops**. When sub-pages fail to fetch due to timeouts or network issues:

1. They are silently dropped
2. Content for that language is never generated
3. Subsequent runs skip the parent (unchanged timestamp)
4. The missing content is never recovered

### Immediate Actions

1. Add logging to track when sub-pages are dropped
2. Consider a retry mechanism or cache of failed pages
3. Clean up the dead `filterChangedPages` import

### Long-term Improvements

1. Track failed fetches in the incremental sync cache
2. Add health check for expected vs actual sub-page counts
3. Add monitoring/alerting for dropped sub-pages in CI
