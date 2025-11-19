# Notion Fetch Architecture & Lessons Learned

This document captures the architecture decisions, bug fixes, and lessons learned from implementing the Notion fetch system improvements.

---

## Implementation Summary

**Completed:** 9 improvement issues + 9 critical bug fixes

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| SpinnerManager | `spinnerManager.ts` | CI-aware spinner management |
| ProgressTracker | `progressTracker.ts` | Aggregate progress display with ETA |
| ErrorManager | `errorManager.ts` | Centralized error handling with retry logic |
| RateLimitManager | `rateLimitManager.ts` | 429 detection and backoff |
| ResourceManager | `resourceManager.ts` | Adaptive concurrency based on system resources |
| TelemetryCollector | `telemetryCollector.ts` | Timeout instrumentation with percentiles |
| ImageCache | `imageProcessing.ts` | Per-entry lazy cache with freshness tracking |

### Key Patterns

1. **Factory pattern** for per-call state (avoids race conditions)
2. **Guard flags** for exactly-once notifications
3. **Try-catch on all callbacks** (never mask underlying errors)
4. **Two-phase processing** (shared state → parallel independent)

---

## Critical Bug Fixes

These bugs were discovered during implementation. Future developers should be aware of these patterns.

### Bug Fix #1: Duplicate Metric Counting in Retry Loops

**File:** `imageProcessing.ts`

**Problem:** Metrics incremented inside retry loop, counting retries as separate operations.

**Root Cause:**
```typescript
while (attempt < maxRetries) {
  processingMetrics.totalProcessed++;  // ❌ Counts retries
  try { await processImage(...); break; }
  catch { /* Retry */ }
}
```

**Fix:** Increment once before retry loop, use flags for result types.

**Lesson:** Never increment metrics inside retry loops. Use flags and increment once on completion.

---

### Bug Fix #2: ProgressTracker Leak on Empty Arrays

**File:** `imageReplacer.ts`

**Problem:** ProgressTracker created for empty arrays never finished, causing 2.5 minute hangs.

**Root Cause:**
```typescript
const progressTracker = new ProgressTracker({
  total: validImages.length,  // Could be 0!
});
await processBatch(validImages, ...);  // Never calls completeItem
```

**Fix:** Only create ProgressTracker when `validImages.length > 0`.

**Lesson:** Always check array length before creating progress trackers. Empty arrays never trigger item callbacks.

---

### Bug Fix #3: Metrics Race Condition in Parallel Processing

**Files:** `imageProcessing.ts`, `imageReplacer.ts`

**Problem:** Shared module-level `processingMetrics` reset by concurrent pages caused nondeterministic telemetry.

**Root Cause:**
```typescript
// Module-level shared state
const processingMetrics = { totalProcessed: 0, ... };

export async function processAndReplaceImages(...) {
  resetProcessingMetrics();  // ❌ Resets while other pages running
}
```

**Fix:** Factory function for per-call metrics:
```typescript
export function createProcessingMetrics(): ImageProcessingMetrics {
  return { totalProcessed: 0, ... };
}

export async function processAndReplaceImages(...) {
  const metrics = createProcessingMetrics();  // ✅ Per-call
  // Pass metrics through function chain
  return { ..., metrics };
}
```

**Lesson:** Module-level shared state causes race conditions in parallel processing. Use per-call state (factory pattern) and pass through function chains.

---

### Bug Fix #4: False Success Reporting in ProgressTracker

**File:** `timeoutUtils.ts`

**Problem:** `processBatch` counted all fulfilled promises as success, but `processImageWithFallbacks` returns `{ success: false }` instead of rejecting.

**Root Cause:**
```typescript
.then((result) => {
  progressTracker.completeItem(true);  // ❌ Always true
})
```

**Fix:** Check `result.success` property if available:
```typescript
const isSuccess = typeof result === "object" && result !== null && "success" in result
  ? result.success === true
  : true;
progressTracker.completeItem(isSuccess);
```

**Lesson:** Promise fulfillment ≠ success. Check result.success for operations that return error objects.

---

### Bug Fix #5: Timeout Hangs Progress Tracker

**File:** `timeoutUtils.ts`

**Problem:** When timeout fires, `withTimeout` rejects immediately but underlying promise's `.then/.catch` never runs, so `completeItem()` never called.

**Root Cause:**
```typescript
const trackedPromise = promise
  .then(() => progressTracker.completeItem(true))
  .catch(() => progressTracker.completeItem(false));

return withTimeout(trackedPromise, timeoutMs, ...);  // ❌ Timeout bypasses handlers
```

**Fix:** Notify tracker in timeout catch block too:
```typescript
return withTimeout(trackedPromise, timeoutMs, ...).catch((error) => {
  if (error instanceof TimeoutError && progressTracker) {
    progressTracker.completeItem(false);  // ✅ Handle timeout path
  }
  throw error;
});
```

**Lesson:** When wrapping promises with timeout, handle progress in BOTH paths (normal + timeout).

---

### Bug Fix #6: Double-Counting Timed-Out Tasks

**File:** `timeoutUtils.ts`

**Problem:** Timeout calls `completeItem(false)`, then underlying promise settles and calls it again.

**Fix:** Per-item guard flag:
```typescript
let hasNotifiedTracker = false;

.then((result) => {
  if (progressTracker && !hasNotifiedTracker) {
    hasNotifiedTracker = true;
    progressTracker.completeItem(isSuccess);
  }
})
```

**Lesson:** Use per-item guards for exactly-once notification when multiple code paths can notify.

---

### Bug Fix #7: Malformed Pages Crash with TypeError

**File:** `generateBlocks.ts`

**Problem:** Direct access to `page.properties["Tags"]` crashed on malformed pages.

**Fix:** Guard with optional chaining:
```typescript
const props = page.properties;
if (props?.["Tags"]?.multi_select) { ... }
```

**Lesson:** Always guard nested property access for external API data.

---

### Bug Fix #8: Placeholder Page Spinner Overwritten

**File:** `generateBlocks.ts`

**Problem:** `pageSpinner.succeed()` called unconditionally, overwriting warn state from `writePlaceholderFile()`.

**Fix:** Only call `succeed()` for real content:
```typescript
if (markdownString) {
  // Write real content
  pageSpinner.succeed(...);
} else {
  writePlaceholderFile(...);  // warn state preserved
}
```

**Lesson:** Don't unconditionally set final spinner state.

---

### Bug Fix #9: Unguarded onItemComplete Callbacks

**File:** `timeoutUtils.ts`

**Problem:** Callback only guarded in fulfilled case, not rejected/timeout/sync error cases. Callback errors masked real failures.

**Fix:** Wrap ALL invocations in try-catch:
```typescript
.catch((error) => {
  try {
    onItemComplete(itemIndex, { status: "rejected", reason: error });
  } catch (callbackError) {
    console.error(`Error in onItemComplete callback: ${callbackError}`);
  }
  throw error;
});
```

**Lesson:** Guard ALL callback invocation paths. Callback errors should never mask operation results.

---

## Architecture Decisions

### Parallel Processing Strategy

**Two-phase approach:**
1. **Sequential:** Toggle/Heading sections (modify shared state)
2. **Parallel:** Page sections (independent, max 5 concurrent)

**Why:** Toggle/Heading modify `currentSectionFolder` which must be sequential. Pages are independent and safe to parallelize.

### Concurrency Model

```
processBatch (max 5 pages)
  └─ processSinglePage
       └─ processAndReplaceImages
            └─ processBatch (max 5 images)
                 └─ processImageWithFallbacks
```

### Cache Design

**Per-entry file cache** instead of monolithic JSON:
- Instant startup (no full load)
- True lazy loading
- `notionLastEdited` freshness tracking
- TTL fallback (30 days)

---

## Performance Characteristics

- **50-70% faster** for multi-page runs
- **20-30% reduction** on pages with many small images (skip optimization)
- **Instant startup** with lazy cache loading

---

## Gotchas

- ⚠️ Don't parallelize Toggle/Heading - they modify shared state
- ⚠️ Empty arrays never trigger processBatch callbacks
- ⚠️ Promise fulfillment ≠ success (check result.success)
- ⚠️ Timeouts bypass inner promise handlers
- ⚠️ Module-level state causes race conditions in parallel code
