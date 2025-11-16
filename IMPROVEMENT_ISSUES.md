# Notion Fetch Improvement Issues

This document contains detailed issue descriptions for improving the Notion fetch system. These can be created as GitHub issues when ready.

---

## 🚀 Quick Wins (High Priority, Low Complexity)

### Issue 1: Disable spinners in CI environments

**Title:** `perf(notion-fetch): disable spinners in CI environments to reduce noise`

**Labels:** `enhancement`, `notion-fetch`, `quick-win`

**Priority:** ⭐⭐⭐ High

**Problem:**
Spinners create noise in CI logs and don't provide value in non-interactive environments. They can also cause timing issues in GitHub Actions.

**Current Behavior:**
- Spinners run in both local and CI environments
- CI logs show spinner control characters and timeout warnings
- Test output includes unnecessary spinner noise

**Proposed Solution:**
```typescript
// scripts/notion-fetch/spinnerManager.ts
static create(text: string, timeoutMs?: number) {
  // Disable spinners in CI environments
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return {
      text: '',
      succeed: () => console.log(`✓ ${text}`),
      fail: () => console.error(`✗ ${text}`),
      // ... other no-op methods
    };
  }
  // ... existing spinner logic
}
```

**Expected Impact:**
- **Time:** No performance change
- **Noise:** Eliminates spinner control characters in CI logs
- **Complexity:** Trivial (~5 minutes)

**Acceptance Criteria:**
- [ ] Spinners disabled when `CI=true` or `GITHUB_ACTIONS=true`
- [ ] Simple text output used instead (✓/✗ prefix)
- [ ] Local development still shows spinners
- [ ] Tests pass without spinner noise
- [ ] CI logs are cleaner

---

### Issue 2: Skip processing for small/optimized images

**Title:** `perf(notion-fetch): skip processing for small/optimized images`

**Labels:** `enhancement`, `notion-fetch`, `quick-win`, `performance`

**Priority:** ⭐⭐⭐ High

**Problem:**
All images go through full download → resize → compress pipeline, even when:
- Image is already small (< 50KB)
- Image is already optimized
- Image dimensions are below maxWidth threshold

This wastes CPU and time on images that don't need processing.

**Current Behavior:**
Every image processed through:
1. Download (30s max)
2. Sharp resize (30s max)
3. Compression (45s max)

Even a 20KB already-optimized PNG goes through all steps.

**Proposed Solution:**

**Phase 1: Skip small images (10 minutes)**
```typescript
// scripts/notion-fetch/imageProcessing.ts
const MIN_SIZE_FOR_PROCESSING = 50 * 1024; // 50KB

if (originalBuffer.length < MIN_SIZE_FOR_PROCESSING) {
  // Save directly, skip resize + compress
  fs.writeFileSync(filepath, originalBuffer);
  return {
    newPath: imagePath,
    savedBytes: 0,
    skipped: 'small-size'
  };
}
```

**Phase 2: Skip already-optimized images (30 minutes)**
```typescript
// Detect optimization markers
const isAlreadyOptimized = await checkIfOptimized(originalBuffer, chosenFmt);
if (isAlreadyOptimized) {
  // Skip compression
}
```

**Phase 3: Skip resize if dimensions OK (20 minutes)**
```typescript
// Check actual dimensions before resizing
const metadata = await sharp(originalBuffer).metadata();
if (metadata.width <= maxWidth) {
  // Skip resize, only compress
}
```

**Expected Impact:**
- **Time Saved:** 20-30% reduction on pages with many small images
- **Complexity:** Low (incremental implementation)
- **Risk:** Low (only skips unnecessary work)

**Data Points:**
- imageCompressor.ts already has partial skip logic (line 50-60)
- Can extend existing patterns

**Acceptance Criteria:**
- [ ] Images < 50KB saved directly without processing
- [ ] Dimensions checked before resize
- [ ] Already-optimized images skip compression
- [ ] Logs indicate when processing skipped and why
- [ ] Tests verify skip logic works correctly
- [ ] No regression in image quality

---

### Issue 3: Implement lazy-loading for image cache

**Title:** `perf(notion-fetch): implement lazy-loading for image cache`

**Labels:** `enhancement`, `notion-fetch`, `performance`

**Priority:** ⭐⭐ Medium

**Problem:**
Image cache loads entire JSON file into memory at startup, even though most URLs won't be checked during a run.

**Current Behavior:**
```typescript
// ImageCache constructor
this.loadCache(); // Loads ALL entries immediately
// For large caches (1000+ images), this adds 5-10s startup time
```

**Proposed Solution:**

**Option 1: On-demand loading**
```typescript
class ImageCache {
  private loaded = false;

  has(url: string): boolean {
    if (!this.loaded) this.loadCache();
    // ... rest of logic
  }
}
```

**Option 2: Streaming cache (better for large caches)**
```typescript
// Use one file per cache entry
// cache/
//   ├── hash-of-url-1.json
//   ├── hash-of-url-2.json
//   └── ...

get(url: string): CacheEntry | undefined {
  const hash = createHash('md5').update(url).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${hash}.json`);

  if (!fs.existsSync(cachePath)) return undefined;
  return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
}
```

**Option 3: SQLite (best for very large caches)**
```typescript
// Use better-sqlite3 for instant lookups
const db = new Database('image-cache.db');
db.exec('CREATE TABLE IF NOT EXISTS cache (url TEXT PRIMARY KEY, ...)');
```

**Expected Impact:**
- **Startup Time:** -5 to -10 seconds for large caches
- **Memory:** Reduced memory footprint
- **Complexity:** Medium (structural change)

**Recommendation:**
Start with **Option 1** (trivial), then **Option 2** if cache grows > 1000 entries.

**Acceptance Criteria:**
- [ ] Cache doesn't load all entries at startup
- [ ] First cache access loads data on-demand
- [ ] Performance improves for large caches (measured)
- [ ] Cache hits/misses still work correctly
- [ ] Tests verify lazy loading behavior

---

## ⚡ High-Impact Improvements (Medium Priority, Medium Complexity)

### Issue 4: Add parallel page processing

**Title:** `perf(notion-fetch): add parallel page processing`

**Labels:** `enhancement`, `notion-fetch`, `performance`, `high-impact`

**Priority:** ⭐⭐⭐ High

**Problem:**
Pages are processed sequentially (1 → 2 → 3 → ... → 156), but they're independent and could be processed in parallel.

**Current Behavior:**
```typescript
for (const page of pages) {
  await processPage(page); // Waits for each page to complete
}
```

For 50+ page runs, this creates artificial sequencing bottleneck.

**Proposed Solution:**

**Phase 1: Simple parallel batching (1 hour)**
```typescript
// scripts/notion-fetch/generateBlocks.ts
import { processBatch } from './timeoutUtils';

const pageResults = await processBatch(
  pages,
  async (page, index) => {
    const blocks = await fetchPageBlocks(page.id);
    const markdown = await blocksToMarkdown(blocks, page.name);
    await writeMarkdownFile(markdown, page.name);
    return { pageId: page.id, success: true };
  },
  {
    maxConcurrent: 5, // Process 5 pages at a time
    operation: 'page processing',
    timeoutMs: 180000, // 3 minutes per page
  }
);
```

**Phase 2: Adaptive concurrency (optional)**
```typescript
// Adjust concurrency based on image load
const concurrency = detectOptimalConcurrency({
  imagesPerPage: averageImageCount,
  availableMemory: os.freemem(),
  cpuCores: os.cpus().length,
});
```

**Expected Impact:**
- **Time Saved:** 50-70% reduction for multi-page runs
  - Example: 50 pages @ 30s each = 25 minutes sequential → ~7-10 minutes parallel
- **Complexity:** Medium
- **Risk:** Medium (need to ensure file write safety)

**Implementation Notes:**
- ✅ `processBatch` utility already exists in timeoutUtils.ts
- ✅ Image processing already uses batch processing (max 5 concurrent)
- ⚠️ Need to ensure markdown file writes don't conflict
- ⚠️ Need to track overall progress across parallel operations

**Potential Issues:**
1. **File write conflicts:** Multiple pages writing to same directory
   - Solution: Atomic writes already handled by `writeMarkdownFile`
2. **Progress tracking:** Spinners overlap with parallel processing
   - Solution: Use aggregated progress (see Issue #9)
3. **Memory usage:** 5 pages × 15 images = 75 concurrent image operations
   - Solution: Keep image batch size at 5, but process multiple pages

**Acceptance Criteria:**
- [ ] Pages processed in batches of 5 (configurable)
- [ ] Overall processing time reduced by 50%+ for multi-page runs
- [ ] No file write conflicts or corruption
- [ ] Progress tracking shows aggregate progress
- [ ] Error in one page doesn't stop other pages
- [ ] Failed pages reported clearly at end
- [ ] Memory usage stays within reasonable bounds

---

### Issue 5: Centralize error handling and retry logic

**Title:** `refactor(notion-fetch): centralize error handling and retry logic`

**Labels:** `enhancement`, `notion-fetch`, `refactoring`

**Priority:** ⭐⭐ Medium

**Problem:**
Error handling and retry logic is duplicated across multiple files:
- `imageProcessing.ts`: Retry with exponential backoff
- `imageReplacer.ts`: Error aggregation
- `emojiCache.ts`: Error logging
- `generateBlocks.ts`: Different retry pattern

This creates:
- Inconsistent error messages
- Duplicate retry logic
- Scattered error logs
- Hard to track failure patterns

**Current Issues:**
1. **logImageFailure() uses sync I/O** - Blocks in CI (lines 129-210 in imageProcessing.ts)
2. **No centralized error tracking** - Can't see failure patterns
3. **Retry logic duplicated** - Exponential backoff copied 3+ times
4. **Noisy error logs** - Stack traces in test output (recently fixed, but pattern exists elsewhere)

**Proposed Solution:**

**Create: `scripts/notion-fetch/errorManager.ts`**
```typescript
export class ErrorManager {
  private errors: Map<string, ErrorEntry[]> = new Map();
  private retryStats = { total: 0, succeeded: 0, failed: 0 };

  /**
   * Log error with automatic grouping
   */
  logError(type: ErrorType, details: ErrorDetails): void {
    // Group similar errors to reduce noise
    const key = `${type}:${details.operation}`;
    if (!this.errors.has(key)) {
      this.errors.set(key, []);
    }
    this.errors.get(key)!.push(details);

    // Only write to disk at end of run (async, batched)
  }

  /**
   * Centralized retry with circuit breaker
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      try {
        this.retryStats.total++;
        const result = await operation();
        if (attempt > 0) this.retryStats.succeeded++;
        return result;
      } catch (error) {
        lastError = error;

        // Circuit breaker: stop retrying if too many failures
        if (this.shouldOpenCircuit(config.operation)) {
          throw new CircuitBreakerError(config.operation);
        }

        // Exponential backoff with jitter
        const delay = this.calculateBackoff(attempt, config);
        await sleep(delay);
      }
    }

    this.retryStats.failed++;
    throw lastError;
  }

  /**
   * Flush errors to disk at end of run
   */
  async flush(): Promise<void> {
    // Async, batched write
    const summary = this.generateSummary();
    await fs.promises.writeFile('error-summary.json', JSON.stringify(summary));
  }

  /**
   * Generate human-readable error summary
   */
  generateSummary(): ErrorSummary {
    return {
      totalErrors: Array.from(this.errors.values()).flat().length,
      byType: this.groupByType(),
      retryStats: this.retryStats,
      topFailures: this.getTopFailures(5),
    };
  }
}

// Singleton instance
export const errorManager = new ErrorManager();

// Auto-flush on exit
process.on('beforeExit', () => errorManager.flush());
```

**Usage Example:**
```typescript
// Replace this:
let attempt = 0;
while (attempt < 3) {
  try {
    return await someOperation();
  } catch (error) {
    // ... manual retry logic
  }
  attempt++;
}

// With this:
return await errorManager.withRetry(
  () => someOperation(),
  {
    maxRetries: 3,
    operation: 'image-download',
    backoff: 'exponential',
  }
);
```

**Expected Impact:**
- **Code Deduplication:** Remove ~100 lines of duplicate retry logic
- **Better Debugging:** Centralized error tracking with patterns
- **Less Noise:** Batched error logging, no sync I/O blocks
- **Complexity:** High (touches many files)

**Migration Path:**
1. Create ErrorManager class
2. Migrate imageProcessing.ts to use ErrorManager
3. Migrate other files incrementally
4. Remove duplicate retry logic
5. Add error summary at end of runs

**Acceptance Criteria:**
- [ ] ErrorManager class created with retry logic
- [ ] All retry logic uses ErrorManager.withRetry()
- [ ] Error logging is async and batched
- [ ] Error summary generated at end of run
- [ ] No sync I/O in error paths
- [ ] Circuit breaker prevents infinite retries
- [ ] Tests verify retry behavior
- [ ] Documentation updated

---

## 🔬 Advanced Optimizations (Lower Priority, Higher Complexity)

### Issue 6: Add adaptive batch sizing based on system resources

**Title:** `feat(notion-fetch): add adaptive batch sizing based on system resources`

**Labels:** `enhancement`, `notion-fetch`, `performance`, `advanced`

**Priority:** ⭐⭐ Medium

**Problem:**
Batch sizes are hardcoded:
- Images: 5 concurrent (MAX_CONCURRENT_IMAGES)
- Pages: Sequential (1 at a time)
- Blocks: Sequential

This doesn't adapt to:
- Available system memory
- CPU core count
- Network bandwidth
- Image sizes (small vs large)

**Current Behavior:**
```typescript
const MAX_CONCURRENT_IMAGES = 5; // Always 5, regardless of system
```

On a 32-core machine with 64GB RAM, we could process many more images.
On a 2-core machine with 4GB RAM, 5 might be too many.

**Proposed Solution:**

**Phase 1: System resource detection**
```typescript
// scripts/notion-fetch/resourceManager.ts
import os from 'node:os';

export function detectOptimalConcurrency(type: 'images' | 'pages' | 'blocks'): number {
  const cpuCores = os.cpus().length;
  const freeMemoryGB = os.freemem() / (1024 ** 3);
  const totalMemoryGB = os.totalmem() / (1024 ** 3);

  // Conservative defaults
  const config = {
    images: {
      minConcurrency: 3,
      maxConcurrency: 10,
      memoryPerOperation: 0.5, // GB (image processing is memory-intensive)
    },
    pages: {
      minConcurrency: 5,
      maxConcurrency: 20,
      memoryPerOperation: 0.2,
    },
    blocks: {
      minConcurrency: 10,
      maxConcurrency: 50,
      memoryPerOperation: 0.05,
    },
  };

  const settings = config[type];

  // Calculate based on memory
  const memoryBasedLimit = Math.floor(
    (freeMemoryGB * 0.7) / settings.memoryPerOperation
  );

  // Calculate based on CPU
  const cpuBasedLimit = Math.max(2, Math.floor(cpuCores * 0.75));

  // Take the minimum of memory/CPU limits, clamped to min/max
  return Math.max(
    settings.minConcurrency,
    Math.min(
      settings.maxConcurrency,
      memoryBasedLimit,
      cpuBasedLimit
    )
  );
}
```

**Expected Impact:**
- **Performance:** 20-40% improvement on well-resourced machines
- **Stability:** Prevents OOM on low-memory systems
- **Complexity:** High (requires testing on various systems)

**Testing Strategy:**
- Test on 2-core, 4GB RAM system (GitHub Actions)
- Test on 8-core, 16GB RAM system (typical developer laptop)
- Test on 32-core, 64GB RAM system (high-end workstation)
- Verify memory usage stays within bounds

**Acceptance Criteria:**
- [ ] Batch size adapts to available CPU cores
- [ ] Batch size adapts to available memory
- [ ] Minimum/maximum limits enforced
- [ ] Performance improves on high-resource systems
- [ ] No OOM errors on low-resource systems
- [ ] Logs show concurrency adjustments
- [ ] Tests verify adaptive behavior
- [ ] Documentation explains resource requirements

---

### Issue 7: Add cache freshness tracking with Notion last_edited_time

**Title:** `feat(notion-fetch): add cache freshness tracking with Notion last_edited_time`

**Labels:** `enhancement`, `notion-fetch`, `cache`

**Priority:** ⭐⭐ Medium

**Problem:**
Image and block caches never expire or invalidate. If a Notion page is updated with a new image, the cache continues serving the old image.

**Current Behavior:**
```typescript
// Cache entry has no freshness tracking
interface ImageCacheEntry {
  url: string;
  localPath: string;
  timestamp: string; // When WE cached it
  blockName: string;
}
```

Cache never checks if Notion content has changed.

**Proposed Solution:**

**Phase 1: Track Notion's last_edited_time**
```typescript
interface ImageCacheEntry {
  url: string;
  localPath: string;
  timestamp: string;           // When we cached it
  notionLastEdited?: string;   // Notion's last_edited_time
  blockName: string;
}

// When caching, store Notion's timestamp
imageCache.set(url, localPath, blockName, notionPage.last_edited_time);
```

**Phase 2: Invalidate stale entries**
```typescript
has(url: string, notionLastEdited?: string): boolean {
  const entry = this.cache.get(url);
  if (!entry) return false;

  // Check if file exists
  const fullPath = this.getAbsoluteImagePath(entry.localPath);
  if (!fs.existsSync(fullPath)) return false;

  // Check if Notion content is newer than cache
  if (notionLastEdited && entry.notionLastEdited) {
    const cacheTime = new Date(entry.notionLastEdited);
    const notionTime = new Date(notionLastEdited);

    if (notionTime > cacheTime) {
      // Content changed in Notion, invalidate cache
      this.cache.delete(url);
      return false;
    }
  }

  return true;
}
```

**Expected Impact:**
- **Correctness:** Cache stays in sync with Notion
- **Performance:** Minimal impact (just timestamp comparison)
- **User Experience:** Users always see latest content

**Acceptance Criteria:**
- [ ] Cache entries track Notion's last_edited_time
- [ ] Stale entries invalidated when Notion content newer
- [ ] TTL fallback for entries without Notion timestamp
- [ ] Backwards compatible with existing cache files
- [ ] Tests verify freshness checking
- [ ] Documentation explains cache invalidation

---

### Issue 8: Add timeout telemetry and data-driven tuning

**Title:** `feat(notion-fetch): add timeout telemetry and data-driven tuning`

**Labels:** `enhancement`, `notion-fetch`, `observability`

**Priority:** ⭐ Low

**Problem:**
Timeout values are hardcoded guesses:
- Download: 30s
- Sharp: 30s
- Compression: 45s
- Overall: 90s

We don't know:
- How often timeouts actually occur
- Which operations timeout most frequently
- If timeout values are appropriate
- Performance distribution (p50, p95, p99)

**Proposed Solution:**

**Phase 1: Timeout instrumentation**
```typescript
// scripts/notion-fetch/timeoutTelemetry.ts
export class TimeoutTelemetry {
  private measurements: Map<string, Measurement[]> = new Map();

  record(operation: string, duration: number, timedOut: boolean): void {
    // Track all operations
  }

  getStats(operation: string): OperationStats {
    return {
      total: measurements.length,
      timeouts: timeoutCount,
      timeoutRate: percentage,
      p50, p95, p99, max,
      recommendedTimeout: p99 * 1.2,
    };
  }

  generateReport(): string {
    // Human-readable performance report
  }
}
```

**Example Output:**
```
=== Timeout Telemetry Report ===

image download:
  Total operations: 247
  Timeouts: 3 (1.2%)
  Performance:
    p50: 1,234ms
    p95: 8,456ms
    p99: 15,234ms
    max: 29,876ms
  Recommended timeout: 18,281ms (current: 30,000ms)
```

**Expected Impact:**
- **Data-Driven:** Tune timeouts based on actual performance
- **Visibility:** See which operations are slow
- **Optimization:** Identify bottlenecks with hard data

**Acceptance Criteria:**
- [ ] Telemetry class tracks operation timings
- [ ] withTimeout instrumented to record measurements
- [ ] Report generated at end of run
- [ ] Percentile calculations (p50, p95, p99)
- [ ] Recommended timeout calculations
- [ ] Tests verify telemetry accuracy

---

### Issue 9: Add aggregated progress tracking for parallel operations

**Title:** `feat(notion-fetch): add aggregated progress tracking for parallel operations`

**Labels:** `enhancement`, `notion-fetch`, `ux`

**Priority:** ⭐⭐ Medium

**Problem:**
When processing pages/images in parallel, individual spinners create noise and don't show overall progress clearly.

**Current Behavior:**
```
⠋ Processing image 1 (attempt 1/3)
⠋ Processing image 2 (attempt 1/3)
⠋ Processing image 3 (attempt 1/3)
...
```

Multiple spinners overlap and it's hard to see overall progress.

**Proposed Solution:**

Replace individual spinners with aggregate progress:
```typescript
⠋ Processing images: 5/15 complete (33%) | 2 in progress | ETA: 45s
```

**Implementation:**
```typescript
// scripts/notion-fetch/progressTracker.ts
export class ProgressTracker {
  private total: number;
  private completed = 0;
  private inProgress = 0;
  private failed = 0;
  private startTime = Date.now();

  constructor(total: number, operation: string) {
    this.total = total;
    this.spinner = SpinnerManager.create(this.getProgressText());
  }

  startItem(): void {
    this.inProgress++;
    this.updateSpinner();
  }

  completeItem(success: boolean): void {
    this.inProgress--;
    if (success) this.completed++;
    else this.failed++;
    this.updateSpinner();
  }

  private getProgressText(): string {
    const percentage = Math.round((this.completed / this.total) * 100);
    const eta = this.calculateETA();

    return `Processing images: ${this.completed}/${this.total} (${percentage}%) | ${this.inProgress} in progress | ${this.failed} failed | ETA: ${eta}`;
  }

  private calculateETA(): string {
    if (this.completed === 0) return 'calculating...';

    const elapsed = Date.now() - this.startTime;
    const avgTimePerItem = elapsed / this.completed;
    const remaining = this.total - this.completed;
    const etaMs = remaining * avgTimePerItem;

    return this.formatDuration(etaMs);
  }
}
```

**Expected Impact:**
- **UX:** Clearer progress visualization
- **Debugging:** Easier to see where processing is stuck
- **Performance:** See ETA for long-running operations

**Acceptance Criteria:**
- [ ] ProgressTracker class created
- [ ] Shows aggregate progress (X/Y complete)
- [ ] Shows percentage, in progress count, failed count
- [ ] Calculates and displays ETA
- [ ] Integrates with SpinnerManager
- [ ] Works with parallel batch processing
- [ ] Tests verify progress calculations

---

## Summary Table

| Issue | Priority | Complexity | Time Saved | Effort |
|-------|----------|------------|------------|--------|
| #1 CI Spinners | ⭐⭐⭐ | Trivial | 0% (noise) | 5min |
| #2 Smart Skips | ⭐⭐⭐ | Low | 20-30% | 1hr |
| #3 Lazy Cache | ⭐⭐ | Medium | 5-10s startup | 2hr |
| #4 Parallel Pages | ⭐⭐⭐ | Medium | 50-70% | 2-3hr |
| #5 Error Manager | ⭐⭐ | High | 0% (quality) | 4-6hr |
| #6 Adaptive Batch | ⭐⭐ | High | 20-40% | 6-8hr |
| #7 Cache Freshness | ⭐⭐ | Medium | 0% (correctness) | 3-4hr |
| #8 Telemetry | ⭐ | Medium | 0% (insight) | 3-4hr |
| #9 Progress Tracking | ⭐⭐ | Low | 0% (UX) | 2hr |

**Recommended Order:**
1. #1 CI Spinners (quick win)
2. #2 Smart Skips (high impact, low effort)
3. #4 Parallel Pages (massive performance boost)
4. #3 Lazy Cache (good optimization)
5. #9 Progress Tracking (pairs well with #4)
6. #5 Error Manager (code quality)
7. #7 Cache Freshness (correctness)
8. #6 Adaptive Batch (advanced optimization)
9. #8 Telemetry (nice to have)
