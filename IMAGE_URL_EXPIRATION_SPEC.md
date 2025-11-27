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
  generatedAt: number;  // timestamp
  expiresAt: number;    // timestamp + 3600000ms
  priority: number;     // based on time remaining
}

function prioritizeImageDownloads(tasks: ImageDownloadTask[]): ImageDownloadTask[] {
  return tasks.sort((a, b) => a.expiresAt - b.expiresAt);  // oldest first
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
        url = freshUrl;  // Use fresh URL for next attempt
        continue;
      }
      throw error;
    }
  }
}

function isExpiredUrlError(error: any): boolean {
  return (
    error.response?.status === 403 &&
    (error.message?.includes('SignatureDoesNotMatch') ||
     error.message?.includes('expired'))
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
  ageAtDownload: number;  // milliseconds
  success: boolean;
}

function logImageDownloadMetrics(metrics: ImageDownloadMetrics): void {
  const ageMinutes = metrics.ageAtDownload / 60000;

  if (ageMinutes > 45) {
    console.warn(`⚠️  Image URL is ${ageMinutes.toFixed(1)}min old (approaching expiry)`);
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
       (error.response?.data?.includes?.('SignatureDoesNotMatch') ||
        error.response?.data?.includes?.('Request has expired') ||
        error.message?.toLowerCase().includes('expired'))
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

### Phase 3: Monitoring and Metrics (LOW PRIORITY)

**Goal**: Add visibility into URL freshness and download timing

**Changes**:
1. Add timestamp tracking for URL generation
2. Log URL age at download time
3. Add warnings for URLs approaching expiration
4. Track metrics for analysis

**Timeline**: Implement for long-term monitoring and optimization

## Testing Strategy

### Unit Tests

```typescript
describe('Image URL Expiration Handling', () => {
  it('should download images immediately after markdown generation', async () => {
    const markdown = await fetchMarkdownWithImages(pageId);
    const urlsBefore = extractImageUrls(markdown);

    // Mock current time
    const startTime = Date.now();

    await downloadImagesImmediately(urlsBefore);

    const downloadTime = Date.now() - startTime;

    // Should download within 30 seconds of generation
    expect(downloadTime).toBeLessThan(30000);
  });

  it('should detect and refresh expired URLs', async () => {
    const expiredUrl = 'https://notion.so/image?...&X-Amz-Expires=3600...';

    // Mock 403 expired error
    mockAxios.onGet(expiredUrl).reply(403, { error: 'SignatureDoesNotMatch' });

    // Mock fresh URL fetch
    const freshUrl = 'https://notion.so/image?...&new-signature...';
    mockNotion.blocks.retrieve.mockResolvedValue({
      image: { file: { url: freshUrl } }
    });

    mockAxios.onGet(freshUrl).reply(200, imageBuffer);

    // Should successfully download after refreshing URL
    const result = await downloadImageWithRefresh(expiredUrl, pageId, blockId);
    expect(result).toBeDefined();
    expect(mockNotion.blocks.retrieve).toHaveBeenCalledTimes(1);
  });

  it('should log warnings for URLs approaching expiration', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn');

    // Mock URL generated 50 minutes ago
    const oldTimestamp = Date.now() - (50 * 60 * 1000);

    await downloadImageWithMetrics(imageUrl, {
      generatedAt: oldTimestamp
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('approaching expiry')
    );
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Image Download', () => {
  it('should successfully download all images in large batch', async () => {
    // Create 50 pages with 10 images each (500 total images)
    const pages = createMockPages(50, 10);

    const result = await generateBlocks(pages);

    // All images should download successfully
    expect(result.successfulImages).toBe(500);
    expect(result.failedImages).toBe(0);
  });

  it('should handle pages with many images without expiration', async () => {
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
describe('Performance Impact', () => {
  it('should not significantly slow down page processing', async () => {
    const pageWithoutImages = createMockPage(0);
    const pageWithImages = createMockPage(10);

    const baselineTime = await measureProcessingTime(pageWithoutImages);
    const withImagesTime = await measureProcessingTime(pageWithImages);

    // Image processing should not add more than 10s per image
    const overhead = withImagesTime - baselineTime;
    expect(overhead).toBeLessThan(10000 * 10);  // 10s per image
  });
});
```

## Rollout Plan

### Step 1: Feature Flag
```typescript
const ENABLE_IMMEDIATE_IMAGE_DOWNLOAD =
  process.env.ENABLE_IMMEDIATE_IMAGE_DOWNLOAD === 'true';

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
