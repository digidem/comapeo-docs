# Image URL Expiration - Solution Specification

## Problem Statement

Notion's image URLs expire after **1 hour** from generation. When processing large batches of documentation pages, the delay between URL generation (during API fetches) and actual image downloads can exceed this window, causing 403 errors and failed downloads.

### Issue Reference

- **GitHub Issue**: #94 - Images being skipped during fetch

## Root Cause Analysis

### Current Architecture Flow

1. **Page Fetching (Parallel - 5 concurrent)**
   - `generateBlocks()` processes up to 5 pages concurrently
   - Each page calls `n2m.pageToMarkdown(pageId)`
   - **🔴 IMAGE URLs GENERATED HERE** with 1-hour expiry (AWS S3 presigned URLs)

2. **Markdown Conversion**
   - `n2m.toMarkdownString(markdown)` converts blocks to markdown
   - Image URLs are embedded in the markdown string

3. **Image Processing (Later in the same page task)**
   - `processAndReplaceImages()` extracts images via regex
   - Images are downloaded in batches (5 concurrent)
   - **🔴 TIME GAP: URLs may have expired by this point**

### Failure Scenarios

#### Scenario 1: Large Page Batches

```
Timeline with 50 pages (5 concurrent, 10 batches):

T+0:00  → Batch 1 (pages 1-5): URLs generated
T+0:10  → Batch 2 (pages 6-10): URLs generated
T+0:20  → Batch 3 (pages 11-15): URLs generated
...
T+0:50  → Batch 10 (pages 46-50): URLs generated
T+0:60  → Batch 1 URLs EXPIRE ❌
T+1:10  → Batch 2 URLs EXPIRE ❌
```

**Risk**: Early batches' URLs expire before late batches finish processing.

#### Scenario 2: Pages with Many Images

```
Single page with 50 images:

T+0:00  → Page fetched, all 50 image URLs generated
T+0:05  → Images 1-5 downloaded (batch 1)
T+0:10  → Images 6-10 downloaded (batch 2)
...
T+0:50  → Images 46-50 downloaded (batch 10)
```

**Lower risk** but still possible with very image-heavy pages and processing delays.

#### Scenario 3: Processing Delays

```
T+0:00  → URLs generated for page
T+0:05  → Heavy markdown processing (callouts, emojis, formatting)
T+0:15  → Network congestion or rate limiting
T+0:30  → Sharp image processing timeouts
T+0:45  → Retry delays and backoff
T+1:05  → Finally attempt image download → 403 EXPIRED ❌
```

**Risk**: Cumulative delays from processing, retries, and rate limiting.

### Technical Details

- **URL Format**: AWS S3 Presigned URLs with Signature Version 4
- **Expiry Time**: 3600 seconds (1 hour) from generation
- **Error Code**: 403 Forbidden with `SignatureDoesNotMatch` when expired
- **URL Example**:
  ```
  https://s3.us-west-2.amazonaws.com/secure.notion-static.com/...
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Expires=3600
  &X-Amz-Signature=...
  ```

## Solution Design

### Strategy: Immediate Download After URL Generation

The safest approach is to **download images immediately after URLs are generated**, minimizing the time gap between generation and download.

### Implementation Approach

#### 1. **Download Images Immediately Within Page Processing**

**Current Flow (in `processSinglePage()` in generateBlocks.ts):**

```typescript
// Line 260-274: Load markdown from Notion
const markdown = await loadMarkdownForPage(...);  // URLs generated here via n2m.pageToMarkdown()
const markdownString = n2m.toMarkdownString(markdown);  // Line 280

// Lines 284-294: Apply emoji mappings
markdownString.parent = EmojiProcessor.applyEmojiMappings(...);

// Lines 298-308: Process fallback emojis
const fallbackEmojiResult = await EmojiProcessor.processPageEmojis(...);

// Lines 311-317: Process callouts
markdownString.parent = processCalloutsInMarkdown(...);

// Lines 320-325: Download images (TOO LATE! After all other processing)
const imageResult = await processAndReplaceImages(markdownString.parent, safeFilename);
```

**Time Gap Analysis:**

- Emoji processing: ~2-5 seconds per page
- Callout processing: ~1-2 seconds per page
- Total overhead: **~3-7 seconds per page** before images are downloaded
- With 50 pages at 5 concurrent: **~30-70 seconds** of cumulative delay
- Plus network delays, retries, and processing time can push this over 1 hour

**Proposed Flow (SIMPLE REORDERING):**

```typescript
// Line 260-274: Load markdown from Notion
const markdown = await loadMarkdownForPage(...);  // URLs generated here
const markdownString = n2m.toMarkdownString(markdown);  // Line 280

// ✅ MOVE IMAGE PROCESSING HERE (immediately after markdown conversion)
const imageResult = await processAndReplaceImages(markdownString.parent, safeFilename);
markdownString.parent = imageResult.markdown;

// THEN do other processing (emojis and callouts work on already-processed images)
markdownString.parent = EmojiProcessor.applyEmojiMappings(...);
const fallbackEmojiResult = await EmojiProcessor.processPageEmojis(...);
markdownString.parent = processCalloutsInMarkdown(...);
```

**Benefits:**

- ✅ Minimizes time between URL generation and download (within seconds)
- ✅ Simple code reordering - no new functions needed
- ✅ No architectural changes (still processes 5 pages concurrently)
- ✅ Downloads happen while URLs are fresh (< 10 seconds old)
- ✅ Respects existing rate limits and concurrency controls
- ✅ Emoji and callout processing still work correctly

#### 2. **Add URL Expiry Tracking and Prioritization**

Track when URLs are generated and prioritize downloads based on age:

```typescript
interface ImageDownloadTask {
  url: string;
  generatedAt: number; // timestamp
  expiresAt: number; // timestamp + 3600000ms
  priority: number; // based on time remaining
}

function prioritizeImageDownloads(
  tasks: ImageDownloadTask[]
): ImageDownloadTask[] {
  return tasks.sort((a, b) => a.expiresAt - b.expiresAt); // oldest first
}
```

**Benefits:**

- ✅ Ensures oldest URLs are downloaded first
- ✅ Provides visibility into URL age at download time
- ✅ Can log warnings for URLs approaching expiration

#### 3. **Implement URL Refresh on Expiry Detection**

Add retry logic that detects expired URLs and fetches fresh ones:

```typescript
async function downloadImageWithRefresh(
  url: string,
  pageId: string,
  blockId: string,
  maxRetries = 3
): Promise<Buffer> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await downloadImage(url);
    } catch (error) {
      if (isExpiredUrlError(error) && attempt < maxRetries - 1) {
        console.warn(`Image URL expired, fetching fresh URL...`);
        // Re-fetch just this block to get fresh URL
        const freshUrl = await refetchImageUrl(pageId, blockId);
        url = freshUrl; // Use fresh URL for next attempt
        continue;
      }
      throw error;
    }
  }
}

function isExpiredUrlError(error: any): boolean {
  return (
    error.response?.status === 403 &&
    (error.message?.includes("SignatureDoesNotMatch") ||
      error.message?.includes("expired"))
  );
}
```

**Benefits:**

- ✅ Automatic recovery from expired URLs
- ✅ No manual intervention required
- ✅ Works as safety net for edge cases

#### 4. **Add Monitoring and Alerting**

Track URL age at download time for observability:

```typescript
interface ImageDownloadMetrics {
  urlGeneratedAt: number;
  downloadStartedAt: number;
  downloadCompletedAt: number;
  ageAtDownload: number; // milliseconds
  success: boolean;
}

function logImageDownloadMetrics(metrics: ImageDownloadMetrics): void {
  const ageMinutes = metrics.ageAtDownload / 60000;

  if (ageMinutes > 45) {
    console.warn(
      `⚠️  Image URL is ${ageMinutes.toFixed(1)}min old (approaching expiry)`
    );
  }

  if (ageMinutes > 60) {
    console.error(`❌ Image URL expired (${ageMinutes.toFixed(1)}min old)`);
  }
}
```

**Benefits:**

- ✅ Visibility into URL freshness
- ✅ Early warning system for potential issues
- ✅ Helps diagnose timing issues

## Recommended Implementation Plan

### Phase 1: Immediate Download (HIGH PRIORITY) ⭐

**Goal**: Download images immediately after markdown conversion, before other processing

**Changes**:

1. **Reorder operations in `processSinglePage()`** in `generateBlocks.ts` (lines 280-325):
   - Move `processAndReplaceImages()` call from line 320 to immediately after line 280
   - Place it BEFORE emoji processing (line 284) and callout processing (line 311)
   - This ensures images are downloaded within seconds of URL generation
2. **No new functions needed** - just reordering existing code
3. **Verify emoji and callout processing** still work correctly with already-processed images

**Specific Code Changes**:

```typescript
// In processSinglePage() function, around line 280:
const markdownString = n2m.toMarkdownString(markdown);

if (markdownString?.parent) {
  // ✅ MOVE IMAGE PROCESSING HERE (was at line 320)
  const imageResult = await processAndReplaceImages(
    markdownString.parent,
    safeFilename
  );
  markdownString.parent = imageResult.markdown;
  totalSaved += imageResult.stats.totalSaved;

  // THEN process emojis (they work on local image paths now, not remote URLs)
  if (emojiMap.size > 0) {
    markdownString.parent = EmojiProcessor.applyEmojiMappings(...);
  }

  // Process fallback emojis
  if (emojiMap.size === 0) {
    const fallbackEmojiResult = await EmojiProcessor.processPageEmojis(...);
  }

  // Process callouts
  if (rawBlocks && rawBlocks.length > 0) {
    markdownString.parent = processCalloutsInMarkdown(...);
  }

  // Continue with sanitization...
}
```

**Timeline**: This is the critical fix - should be implemented first
**Complexity**: LOW (simple reordering)
**Risk**: LOW (no new logic, just changing order)

### Phase 2: URL Refresh on Expiry (MEDIUM PRIORITY)

**Goal**: Add safety net for URLs that still expire despite Phase 1

**Changes**:

1. **Add `isExpiredUrlError()` helper** in `imageProcessing.ts`:

   ```typescript
   function isExpiredUrlError(error: any): boolean {
     return (
       error.response?.status === 403 &&
       (error.response?.data?.includes?.("SignatureDoesNotMatch") ||
         error.response?.data?.includes?.("Request has expired") ||
         error.message?.toLowerCase().includes("expired"))
     );
   }
   ```

2. **Modify retry logic in `downloadAndProcessImage()`** (line 686-953):
   - Detect 403 expired errors specifically
   - Log clear warnings when URLs expire
   - For now, fail gracefully and use fallback (URL refresh requires additional Notion API calls)

3. **Add logging for expired URL detection**:
   ```typescript
   if (isExpiredUrlError(error)) {
     console.error(
       chalk.red(
         `❌ Image URL expired (403): ${url}\n` +
           `   This indicates the image was processed more than 1 hour after fetching.\n` +
           `   Phase 1 reordering should prevent this.`
       )
     );
   }
   ```

**Note**: Full URL refresh (re-fetching from Notion) is complex and requires:

- Storing block IDs with image URLs
- Calling `notion.blocks.retrieve()` to get fresh URLs
- Additional API rate limiting considerations

**For now, Phase 2 focuses on detection and logging. Full URL refresh can be added later if needed after Phase 1.**

**Timeline**: Implement after Phase 1 and validate if still needed
**Complexity**: MEDIUM (requires API integration for full refresh)
**Risk**: LOW (detection/logging only)

### Phase 3: Final Pass Safety Net (HIGH PRIORITY) ⭐

**Goal**: Catch and fix any S3 URLs that remain in the final markdown (e.g., re-introduced by callouts or missed by initial regex)

**Changes**:

1. **Add `validateAndFixRemainingImages` in `imageReplacer.ts`**:
   - Scans final markdown for any remaining `amazonaws.com` URLs
   - Uses specific regex to target S3 paths
   - Re-runs `processAndReplaceImages` if found
   - Logs warnings if they persist

2. **Call in `processSinglePage`**:
   - Run this check just before writing the file (after all other processing)

**Specific Code Changes**:

```typescript
// In imageReplacer.ts
export async function validateAndFixRemainingImages(markdown, safeFilename) {
  const s3Regex =
    /!\[.*?\]\((https:\/\/prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com\/[^\)]+)\)/;
  if (s3Regex.test(markdown)) {
    console.warn(`Found S3 URLs in final markdown...`);
    return processAndReplaceImages(markdown, safeFilename);
  }
  return markdown;
}

// In generateBlocks.ts
markdownString.parent = await validateAndFixRemainingImages(
  markdownString.parent,
  safeFilename
);
```

**Benefits**:

- ✅ Catch-all safety net for edge cases
- ✅ Handles re-introduced URLs from callouts/emojis
- ✅ Provides final guarantee before file write

### Phase 4: Monitoring and Metrics (LOW PRIORITY - OPTIONAL/FUTURE WORK)

**Status**: NOT IMPLEMENTED - Future enhancement

**Goal**: Add visibility into URL freshness and download timing

**Changes**:

1. Add timestamp tracking for URL generation
2. Log URL age at download time
3. Add warnings for URLs approaching expiration
4. Track metrics for analysis

**Timeline**: Implement for long-term monitoring and optimization

**Note**: This phase is **optional** and should only be implemented if:

- Phase 2 detects expired URLs in production (indicating Phase 1 isn't sufficient)
- We need detailed metrics for performance tuning
- Debugging timing issues requires more granular data

**Current Status**: Phases 1 & 2 are sufficient for solving Issue #94. Phase 3 can be tracked in a separate issue if needed.

## Testing Strategy

### Unit Tests

```typescript
describe("Image URL Expiration Handling", () => {
  it("should download images immediately after markdown generation", async () => {
    const markdown = await fetchMarkdownWithImages(pageId);
    const urlsBefore = extractImageUrls(markdown);

    // Mock current time
    const startTime = Date.now();

    await downloadImagesImmediately(urlsBefore);

    const downloadTime = Date.now() - startTime;

    // Should download within 30 seconds of generation
    expect(downloadTime).toBeLessThan(30000);
  });

  it("should detect and refresh expired URLs", async () => {
    const expiredUrl = "https://notion.so/image?...&X-Amz-Expires=3600...";

    // Mock 403 expired error
    mockAxios.onGet(expiredUrl).reply(403, { error: "SignatureDoesNotMatch" });

    // Mock fresh URL fetch
    const freshUrl = "https://notion.so/image?...&new-signature...";
    mockNotion.blocks.retrieve.mockResolvedValue({
      image: { file: { url: freshUrl } },
    });

    mockAxios.onGet(freshUrl).reply(200, imageBuffer);

    // Should successfully download after refreshing URL
    const result = await downloadImageWithRefresh(expiredUrl, pageId, blockId);
    expect(result).toBeDefined();
    expect(mockNotion.blocks.retrieve).toHaveBeenCalledTimes(1);
  });

  it("should log warnings for URLs approaching expiration", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn");

    // Mock URL generated 50 minutes ago
    const oldTimestamp = Date.now() - 50 * 60 * 1000;

    await downloadImageWithMetrics(imageUrl, {
      generatedAt: oldTimestamp,
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("approaching expiry")
    );
  });
});
```

### Integration Tests

```typescript
describe("End-to-End Image Download", () => {
  it("should successfully download all images in large batch", async () => {
    // Create 50 pages with 10 images each (500 total images)
    const pages = createMockPages(50, 10);

    const result = await generateBlocks(pages);

    // All images should download successfully
    expect(result.successfulImages).toBe(500);
    expect(result.failedImages).toBe(0);
  });

  it("should handle pages with many images without expiration", async () => {
    // Single page with 100 images
    const page = createMockPageWithImages(100);

    const startTime = Date.now();
    const result = await generateBlocks([page]);
    const duration = Date.now() - startTime;

    // Should complete before URLs expire (< 1 hour)
    expect(duration).toBeLessThan(3600000);
    expect(result.successfulImages).toBe(100);
  });
});
```

### Performance Tests

```typescript
describe("Performance Impact", () => {
  it("should not significantly slow down page processing", async () => {
    const pageWithoutImages = createMockPage(0);
    const pageWithImages = createMockPage(10);

    const baselineTime = await measureProcessingTime(pageWithoutImages);
    const withImagesTime = await measureProcessingTime(pageWithImages);

    // Image processing should not add more than 10s per image
    const overhead = withImagesTime - baselineTime;
    expect(overhead).toBeLessThan(10000 * 10); // 10s per image
  });
});
```

## Rollout Plan

### Step 1: Feature Flag

```typescript
const ENABLE_IMMEDIATE_IMAGE_DOWNLOAD =
  process.env.ENABLE_IMMEDIATE_IMAGE_DOWNLOAD === "true";

if (ENABLE_IMMEDIATE_IMAGE_DOWNLOAD) {
  // Use new immediate download approach
} else {
  // Use existing approach
}
```

### Step 2: Gradual Rollout

1. Enable for CI/PR previews first (low risk)
2. Monitor for issues in preview deployments
3. Enable for production builds
4. Remove feature flag after stable for 2 weeks

### Step 3: Monitoring

- Track success/failure rates
- Monitor URL age at download time
- Log any 403 errors with URL details
- Alert on patterns of expiration

## Success Metrics

### Primary Metrics

- **Image download success rate**: Should be >99%
- **403 errors due to expiration**: Should be <1%
- **URL age at download**: Should be <5 minutes on average

### Secondary Metrics

- **Total processing time**: Should not increase by >10%
- **Memory usage**: Should remain stable
- **Cache hit rate**: Should remain above 80%

## Alternative Approaches Considered

### Option A: Download All Images First (REJECTED)

**Approach**: Fetch all pages first, extract all image URLs, download all images, then process pages.

**Rejected because**:

- ❌ Breaks existing parallel processing architecture
- ❌ Increases memory usage (all URLs in memory)
- ❌ Reduces incremental sync benefits
- ❌ Complex coordination between phases

### Option B: Increase Batch Size (REJECTED)

**Approach**: Process more pages concurrently (10-15 instead of 5).

**Rejected because**:

- ❌ Doesn't solve the fundamental timing issue
- ❌ Increases resource usage and rate limit pressure
- ❌ May make timing worse for later batches

### Option C: Use Notion's Hosted Images (NOT AVAILABLE)

**Approach**: Have Notion host images permanently.

**Rejected because**:

- ❌ Not supported by Notion API (intentional security feature)
- ❌ Would require Notion to change their architecture
- ❌ Not under our control

## Risk Assessment

### Low Risk

- ✅ Changes are isolated to image processing logic
- ✅ Existing retry mechanisms remain in place
- ✅ Cache system continues to work
- ✅ Can be feature-flagged for safe rollout

### Medium Risk

- ⚠️ May increase memory usage slightly (images in memory earlier)
- ⚠️ Processing order changes (images before other markdown processing)
- ⚠️ URL refresh logic adds complexity

### Mitigation Strategies

- Implement feature flag for gradual rollout
- Add comprehensive testing at each phase
- Monitor metrics closely during rollout
- Keep fallback logic for backward compatibility

## References

- **Issue #94**: Images being skipped during fetch
- **AWS S3 Presigned URLs**: https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
- **Notion API Rate Limits**: https://developers.notion.com/reference/request-limits
- **Current Architecture**: `NOTION_FETCH_ARCHITECTURE.md`
- **Repository Guidelines**: `CLAUDE.md`

## Open Questions

1. **Should we cache the original Notion blocks to enable URL refresh?**
   - Pro: Enables efficient URL refresh without re-fetching pages
   - Con: Increases cache size and complexity
   - **Recommendation**: Not needed for Phase 1, evaluate for Phase 2

2. **Should we extract expiry time from URL parameters?**
   - Pro: Know exact expiration time for each URL
   - Con: Adds parsing complexity, may not be reliable
   - **Recommendation**: Use simple age-based heuristics (generated timestamp + 1 hour)

3. **Should we parallelize image downloads across pages?**
   - Pro: Could speed up overall processing
   - Con: Breaks task isolation, complicates coordination
   - **Recommendation**: Keep downloads within page tasks for now

4. **Should we add telemetry for URL expiration events?**
   - Pro: Better visibility into real-world timing issues
   - Con: Adds overhead and complexity
   - **Recommendation**: Yes, add as part of Phase 3 monitoring

## Deployment Strategy

### Pre-Deployment Checklist

#### Code Quality Gates

- [ ] All TypeScript type checks pass (`bun run typecheck`)
- [ ] All ESLint rules pass (`bunx eslint scripts/notion-fetch/**/*.ts`)
- [ ] All Prettier formatting applied (`bunx prettier --write scripts/`)
- [ ] All unit tests pass with 100% success rate (`bun test`)
- [ ] Integration tests cover all retry scenarios
- [ ] No console errors or warnings in test output

#### Feature Validation

- [ ] Feature flag system works correctly (enable/disable toggle)
- [ ] Single-pass processing works without retry logic
- [ ] Retry processing works with full retry loop
- [ ] Metrics JSON file is created and populated correctly
- [ ] Rollback documentation is complete and tested
- [ ] Environment variables documented in `.env.example`

#### Documentation

- [ ] `ROLLBACK.md` created with step-by-step rollback instructions
- [ ] Deployment strategy added to `IMAGE_URL_EXPIRATION_SPEC.md`
- [ ] PR description updated with fixes summary
- [ ] Testing results documented in PR
- [ ] Breaking changes clearly noted (if any)

### Deployment Phases

#### Phase 1: Development Environment (Day 1)

**Goal**: Validate feature flag system and basic functionality

**Steps**:

1. Merge PR #102 to main branch
2. Deploy to development environment with feature flag enabled
3. Run full Notion fetch (`bun run notion:fetch-all`)
4. Monitor console output for retry messages
5. Verify `retry-metrics.json` is created with expected data

**Success Criteria**:

- No TypeScript errors
- All images download successfully
- Retry metrics show reasonable values (retry frequency <10%)
- No performance degradation >10%

**Rollback Trigger**: Any critical errors or performance degradation >20%

#### Phase 2: CI/PR Preview Environment (Days 2-3)

**Goal**: Validate feature in automated testing environment

**Steps**:

1. Enable feature flag in PR preview workflow
2. Run multiple PR preview deployments
3. Monitor retry metrics across different content sets
4. Validate image quality in preview deployments

**Success Criteria**:

- PR previews build successfully
- Images display correctly in preview sites
- Retry success rate >95%
- No 403 errors in logs

**Rollback Trigger**: PR preview failures >10% or persistent image download errors

#### Phase 3: Production Deployment (Day 4-7)

**Goal**: Enable feature in production with monitoring

**Steps**:

1. Deploy with feature flag enabled by default
2. Run production Notion sync
3. Monitor retry metrics for 24 hours
4. Review `retry-metrics.json` for anomalies
5. Check for any error reports or issues

**Success Criteria**:

- Production build completes successfully
- Retry frequency <5% (most pages don't need retry)
- Retry success rate >98%
- No increase in support requests

**Rollback Trigger**: Production errors, retry success rate <90%, or user-reported issues

#### Phase 4: Feature Flag Removal (Day 14+)

**Goal**: Remove feature flag after stable period

**Steps**:

1. Confirm feature stable for 2 weeks
2. Remove `ENABLE_RETRY_IMAGE_PROCESSING` environment variable checks
3. Remove `processMarkdownSinglePass()` fallback function
4. Keep `processMarkdownWithRetry()` as default behavior
5. Update documentation to reflect changes

**Success Criteria**:

- Code simplified with flag removed
- No functionality regression
- Metrics continue to show healthy values

### Environment Variables

All environment variables related to this feature:

| Variable                        | Default  | Description                     | Valid Values        |
| ------------------------------- | -------- | ------------------------------- | ------------------- |
| `ENABLE_RETRY_IMAGE_PROCESSING` | `"true"` | Enable/disable retry logic      | `"true"`, `"false"` |
| `MAX_IMAGE_RETRIES`             | `"3"`    | Maximum retry attempts per page | `"1"` to `"10"`     |

**Note**: These variables should be documented in `.env.example` file.

### Monitoring and Observability

#### Key Metrics to Track

**Primary Metrics** (check after every deployment):

1. **Retry Frequency**: `(totalPagesWithRetries / totalPagesProcessed) * 100`
   - **Target**: <5% in production
   - **Alert Threshold**: >10%
2. **Retry Success Rate**: `(successfulRetries / totalPagesWithRetries) * 100`
   - **Target**: >95%
   - **Alert Threshold**: <90%
3. **Image Download Success Rate**: Overall image downloads that succeed
   - **Target**: >99%
   - **Alert Threshold**: <95%

**Secondary Metrics** (monitor for trends):

1. **Average Retry Attempts per Page**: `totalRetryAttempts / totalPagesWithRetries`
   - **Target**: <2 (most pages succeed on first or second retry)
   - **Alert Threshold**: >3
2. **Total Processing Time**: End-to-end time for full Notion fetch
   - **Baseline**: ~8-12 minutes for 50 pages
   - **Alert Threshold**: >20 minutes (>60% increase)
3. **Memory Usage**: Peak memory during processing
   - **Baseline**: Track during Phase 1
   - **Alert Threshold**: >50% increase from baseline

#### How to Access Metrics

**Console Output**:

```bash
# At end of script execution, look for:
# ═══════════════════════════════════════════════
# 📊 Image Retry Metrics Summary
# ═══════════════════════════════════════════════
```

**JSON File** (`retry-metrics.json`):

```bash
# Read metrics file
cat retry-metrics.json | jq '.'

# Check retry frequency
cat retry-metrics.json | jq '.metrics.retryFrequency'

# Check retry success rate
cat retry-metrics.json | jq '.summary.retrySuccessRate'

# Check configuration
cat retry-metrics.json | jq '.configuration'
```

**CI/CD Logs**:

- PR preview builds log retry metrics
- Search for "Image Retry Metrics Summary" in build logs
- Check for any "🔄 Retry attempt" messages

#### Alert Thresholds

**Critical Alerts** (immediate action required):

- Retry success rate <90%
- Image download failures >5%
- Processing time increase >100%
- Any 403 errors with "expired" in message

**Warning Alerts** (monitor and investigate):

- Retry frequency >10%
- Average retry attempts >3
- Processing time increase >50%

### Testing Checklist

#### Manual Testing

**Feature Flag Toggle Test**:

```bash
# Test with retry enabled (default)
unset ENABLE_RETRY_IMAGE_PROCESSING
bun run notion:fetch -- --limit 5
# Expected: Should see retry messages if any pages need retry

# Test with retry disabled
export ENABLE_RETRY_IMAGE_PROCESSING=false
bun run notion:fetch -- --limit 5
# Expected: Should see "Using single-pass processing (retry disabled)"

# Verify metrics file reflects configuration
cat retry-metrics.json | jq '.configuration.retryEnabled'
# Expected: false when disabled, true when enabled
```

**Retry Logic Test**:

```bash
# Run on pages known to have S3 URLs
bun run notion:fetch -- --limit 10

# Check for retry attempts in console
# Look for: "🔄 Retry attempt X/Y for page: ..."

# Verify retry metrics
cat retry-metrics.json | jq '.metrics'
```

**Image Quality Test**:

```bash
# After running fetch, check images
ls -lh static/images/notion/

# Verify images are valid (not corrupted)
file static/images/notion/*.png | grep -v "PNG image"
# Should return empty (all files are valid PNGs)

# Check markdown references
grep -r "amazonaws.com" docs/
# Should return empty (no S3 URLs remain)
```

#### Automated Testing

**Unit Tests**:

```bash
# Run full test suite
bun test

# Run specific retry tests
bun test markdownRetryProcessor.test.ts

# Expected: All tests pass, 100% success rate
```

**Integration Tests**:

```bash
# Test full workflow with feature flag
bun test --grep "processMarkdown"

# Test metrics logging
bun test --grep "retry metrics"
```

**Performance Tests**:

```bash
# Benchmark execution time
time bun run notion:fetch-all

# Compare with baseline (pre-PR #102)
# Should be within 10% of baseline
```

### Rollback Procedures

See `ROLLBACK.md` for detailed rollback instructions.

**Quick Reference**:

```bash
# Emergency rollback
export ENABLE_RETRY_IMAGE_PROCESSING=false

# Verify rollback
cat retry-metrics.json | jq '.configuration.retryEnabled'
# Expected: false
```

### Post-Deployment Validation

**Immediate** (within 1 hour of deployment):

- [ ] Verify feature flag is set correctly in environment
- [ ] Run test Notion fetch and check console output
- [ ] Confirm `retry-metrics.json` is created
- [ ] Check retry frequency and success rate

**Short-term** (within 24 hours):

- [ ] Monitor PR preview builds for any failures
- [ ] Review retry metrics trends
- [ ] Check for any error reports or support tickets
- [ ] Validate image quality in deployed content

**Long-term** (within 1 week):

- [ ] Analyze retry patterns over multiple runs
- [ ] Identify any recurring issues
- [ ] Optimize retry configuration if needed
- [ ] Plan for feature flag removal

### Known Issues and Limitations

1. **Bun Regex Bug**: Known issue with lookbehind assertions in Bun regex engine
   - **Impact**: Alternative regex patterns used in code
   - **Workaround**: Implemented in code, no user action needed
   - **Tracking**: File upstream bug with Bun team

2. **Rate Limiting**: Notion API has rate limits that may affect retry logic
   - **Impact**: Multiple retries may trigger rate limiting
   - **Mitigation**: Retry logic respects existing rate limit handling
   - **Monitoring**: Track rate limit errors in logs

3. **Memory Usage**: Retry logic may slightly increase memory usage
   - **Impact**: Additional markdown copies kept during retry attempts
   - **Mitigation**: Memory released after each page completes
   - **Monitoring**: Track memory metrics during deployment

### Success Criteria

The deployment is considered successful when:

1. **Functionality**:
   - ✅ Feature flag toggle works correctly
   - ✅ Retry logic handles expired URLs successfully
   - ✅ Single-pass mode works as fallback
   - ✅ Metrics logging is accurate and complete

2. **Quality**:
   - ✅ All tests pass (unit, integration, E2E)
   - ✅ No TypeScript, ESLint, or Prettier errors
   - ✅ Code review feedback addressed
   - ✅ Documentation is complete and accurate

3. **Performance**:
   - ✅ Execution time within 10% of baseline
   - ✅ Memory usage within 20% of baseline
   - ✅ Retry frequency <5% in production
   - ✅ Retry success rate >95%

4. **Observability**:
   - ✅ Metrics are being logged correctly
   - ✅ Console output is clear and informative
   - ✅ Rollback procedures are documented and tested
   - ✅ Monitoring is in place for key metrics

### Next Steps After Deployment

1. **Monitor metrics for 2 weeks**
   - Track retry frequency trends
   - Identify any performance issues
   - Collect feedback from team

2. **Optimize if needed**
   - Adjust `MAX_IMAGE_RETRIES` if necessary
   - Fine-tune retry logic based on metrics
   - Consider additional improvements

3. **Remove feature flag** (after 2 weeks of stability)
   - Simplify code by removing fallback logic
   - Update documentation
   - Keep metrics logging in place

4. **File upstream bug reports**
   - Bun regex lookbehind issue
   - Any Notion API issues discovered
   - Share learnings with community
