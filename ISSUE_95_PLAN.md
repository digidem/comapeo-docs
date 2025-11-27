# Fix Plan: Issue #95 - Content Not Being Updated or Skipped During Fetch

**Issue:** Some content is not being updated or skipped during fetch operations.

**Investigation Date:** 2025-11-27

**Related Commit:** 2f2a47a (Incremental sync feature added 2025-11-26)

---

## Root Causes Identified

### 1. Dead Code: `filterChangedPages` Not Used
- **Severity:** Medium (technical debt, potential future bug)
- **File:** `scripts/notion-fetch/pageMetadataCache.ts`
- **Problem:** Function is imported but never called in production code
- **Impact:** Confusing codebase, potential for bugs if used later

### 2. Logic Discrepancy: Missing Path Change Detection
- **Severity:** High (could cause skipped updates)
- **File:** `scripts/notion-fetch/pageMetadataCache.ts:179-206`
- **Problem:** `filterChangedPages` lacks the path change check that inline logic has
- **Impact:** If used, would skip renamed/moved pages incorrectly

### 3. Sub-page Timeout Issues
- **Severity:** Medium (causes incomplete content)
- **File:** `scripts/fetchNotionData.ts:189`
- **Problem:** 10-second timeout may be too aggressive for slow API responses
- **Impact:** Sub-pages timeout and get skipped silently

### 4. Insufficient Logging
- **Severity:** Low (makes debugging difficult)
- **Problem:** Limited visibility into why pages are skipped
- **Impact:** Hard to diagnose issues in production

---

## Implementation Plan

### Phase 1: Immediate Fixes (High Priority)

#### Task 1.1: Add Detailed Skip Reason Logging
**File:** `scripts/notion-fetch/generateBlocks.ts:713-719`

**Current Code:**
```typescript
if (!needsProcessing) {
  console.log(chalk.gray(`  ⏭️  Skipping unchanged page: ${pageTitle}`));
}
```

**New Code:**
```typescript
if (!needsProcessing) {
  const reason =
    !cachedPage ? "not in cache (NEW)" :
    hasMissingOutputs(metadataCache, page.id) ? "missing output files" :
    !cachedPage.outputPaths?.includes(filePath) ? `path changed (cached: ${cachedPage.outputPaths?.join(", ")}, current: ${filePath})` :
    new Date(page.last_edited_time).getTime() <= new Date(cachedPage.lastEdited).getTime()
      ? `unchanged since ${cachedPage.lastEdited}`
      : "UNKNOWN";

  console.log(
    chalk.gray(`  ⏭️  Skipping page: ${pageTitle}`)
  );
  console.log(
    chalk.dim(`      Reason: ${reason}`)
  );
}
```

**Benefits:**
- Immediate visibility into why pages are skipped
- Helps diagnose cache issues
- No breaking changes

#### Task 1.2: Enhance Sub-page Timeout Logging
**File:** `scripts/fetchNotionData.ts:221-228`

**Current Code:**
```typescript
console.warn(
  `⚠️  Skipping sub-page ${rel.subId} (parent: "${rel.parentTitle}"): ${pageError.message}`
);
```

**New Code:**
```typescript
console.warn(
  `⚠️  Skipping sub-page ${rel.subId} (parent: "${rel.parentTitle}")`
);
console.warn(
  `    Error: ${pageError.message}`
);
console.warn(
  `    Type: ${pageError instanceof Error ? pageError.constructor.name : typeof pageError}`
);
if (pageError.message.includes("timeout")) {
  console.warn(
    `    💡 Hint: Consider increasing TIMEOUT_MS in fetchNotionData.ts`
  );
}
```

**Benefits:**
- Better error categorization (timeout vs. API error vs. permission)
- Actionable hints for resolution
- Track patterns in failures

#### Task 1.3: Increase Sub-page Timeout
**File:** `scripts/fetchNotionData.ts:189`

**Current Code:**
```typescript
const TIMEOUT_MS = 10000; // 10 second timeout
```

**New Code:**
```typescript
// Increased from 10s to 30s to handle slow Notion API responses
// particularly for pages with large blocks or many nested children
const TIMEOUT_MS = 30000; // 30 second timeout
```

**Rationale:**
- 10 seconds may be too aggressive for complex pages
- CI/GitHub Actions can have slower network
- Better to wait longer than skip content
- Still prevents indefinite hangs

---

### Phase 2: Fix Core Logic (Medium Priority)

#### Task 2.1: Update `filterChangedPages` Function
**File:** `scripts/notion-fetch/pageMetadataCache.ts:179-206`

**Problem:** Missing path change detection

**Solution:** Add optional callback parameter for path resolution

**New Signature:**
```typescript
export function filterChangedPages<
  T extends { id: string; last_edited_time: string },
>(
  pages: T[],
  cache: PageMetadataCache | null,
  options?: {
    /**
     * Callback to get the current file path for a page.
     * If provided, pages with changed paths will be marked as needing update.
     */
    getFilePath?: (page: T) => string;
  }
): T[]
```

**New Logic:**
```typescript
return pages.filter((page) => {
  const cached = cache.pages[page.id];

  // New page - not in cache
  if (!cached) {
    return true;
  }

  // If any expected outputs are missing, force regeneration
  if (hasMissingOutputs(cache, page.id)) {
    return true;
  }

  // NEW: Check if path changed (only if callback provided)
  if (options?.getFilePath) {
    const currentPath = options.getFilePath(page);
    if (!cached.outputPaths?.includes(currentPath)) {
      return true;
    }
  }

  // Compare timestamps
  const notionTime = new Date(page.last_edited_time).getTime();
  const cachedTime = new Date(cached.lastEdited).getTime();

  return notionTime > cachedTime;
});
```

**Benefits:**
- Backwards compatible (options parameter is optional)
- Matches inline logic behavior
- Can be used for upfront filtering if needed
- Fixes potential future bug

#### Task 2.2: Update Tests
**File:** `scripts/notion-fetch/__tests__/pageMetadataCache.test.ts`

**Add new test:**
```typescript
describe("filterChangedPages with path changes", () => {
  it("should include pages when path changes even if timestamp unchanged", () => {
    const pages = [
      { id: "page-1", last_edited_time: "2024-01-01T00:00:00.000Z" },
    ];

    const cache: PageMetadataCache = {
      version: CACHE_VERSION,
      scriptHash: "test",
      lastSync: "2024-01-01",
      pages: {
        "page-1": {
          lastEdited: "2024-01-01T00:00:00.000Z",
          outputPaths: ["/docs/old-path.md"],
          processedAt: "2024-01-01",
        },
      },
    };

    // Path changed from /docs/old-path.md to /docs/new-path.md
    const result = filterChangedPages(pages, cache, {
      getFilePath: () => "/docs/new-path.md",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("page-1");
  });
});
```

---

### Phase 3: Add Cache Diagnostics (Low Priority)

#### Task 3.1: Add Cache Validation Command
**New File:** `scripts/notion-fetch/validateCache.ts`

**Purpose:** Detect and report cache issues

**Features:**
```typescript
export async function validateCache(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const cache = loadPageMetadataCache();
  const issues: string[] = [];

  if (!cache) {
    return { valid: false, issues: ["No cache found"] };
  }

  // Check 1: Verify output files exist
  for (const [pageId, metadata] of Object.entries(cache.pages)) {
    for (const outputPath of metadata.outputPaths) {
      if (!fs.existsSync(outputPath)) {
        issues.push(
          `Missing output file for page ${pageId}: ${outputPath}`
        );
      }
    }
  }

  // Check 2: Find orphaned output files
  const cachedPaths = new Set(
    Object.values(cache.pages).flatMap(p => p.outputPaths)
  );
  // Scan docs/ for .md files not in cache...

  // Check 3: Verify script hash is current
  const currentHash = await computeScriptHash();
  if (cache.scriptHash !== currentHash.hash) {
    issues.push(
      `Script hash mismatch (cache: ${cache.scriptHash.slice(0, 8)}, current: ${currentHash.hash.slice(0, 8)})`
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
```

**CLI Command:**
```bash
bun run notion:validate-cache
```

---

## Testing Plan

### Test 1: Verify Skip Logging
```bash
# Run with incremental sync enabled
bun run notion:fetch-all

# Expected: See detailed reasons for each skipped page
# Example output:
#   ⏭️  Skipping page: Getting Started
#       Reason: unchanged since 2025-11-26T10:00:00.000Z
```

### Test 2: Verify Timeout Increase
```bash
# Monitor for "Skipping sub-page" warnings
bun run notion:fetch-all 2>&1 | grep -i "skipping sub-page"

# Expected: Fewer timeout-related skips
```

### Test 3: Test Path Change Detection
```bash
# Manually edit cache to have wrong path
# Run fetch
# Expected: Page is regenerated despite unchanged timestamp
```

### Test 4: Dry Run Validation
```bash
# Run dry run to see what would be processed
bun run notion:fetch-all --dry-run

# Expected: Clear indication of what will be skipped and why
```

---

## Rollback Plan

If issues occur after implementation:

1. **Revert logging changes:** Safe, can be undone without side effects
2. **Revert timeout increase:** Restore to 10000ms if causing other issues
3. **Revert filterChangedPages changes:** Backwards compatible, can revert
4. **Force full rebuild:** Run with `--force` flag to bypass cache entirely

---

## Success Metrics

1. **Reduced Skip Complaints:** Issue #95 should be resolved
2. **Better Diagnostics:** Team can quickly identify why pages are skipped
3. **Fewer Timeouts:** Sub-page timeout warnings decrease
4. **No Regressions:** All pages that should update do update

---

## Documentation Updates

After implementation, update:

1. **`context/workflows/notion-commands.md`**: Document new logging format
2. **`context/development/roadmap.md`**: Mark issue as resolved
3. **`NOTION_FETCH_ARCHITECTURE.md`**: Add section on skip logic
4. **`CLAUDE.md`**: Add debugging tips for cache issues

---

## Timeline

- **Phase 1 (Immediate):** 1-2 hours (logging + timeout)
- **Phase 2 (Core Fix):** 2-3 hours (function update + tests)
- **Phase 3 (Diagnostics):** 2-4 hours (optional, can defer)
- **Testing:** 1 hour
- **Documentation:** 30 minutes

**Total Estimated Time:** 6-10 hours

---

## Notes

- Incremental sync was just added yesterday (2025-11-26)
- This issue likely surfaced immediately after that change
- The fixes maintain backwards compatibility
- All changes are testable with `--dry-run` flag
