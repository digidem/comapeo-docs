import fs from "node:fs";
import chalk from "chalk";
import {
  processAndReplaceImages,
  validateAndFixRemainingImages,
  getImageDiagnostics,
  type ImageProcessingStats,
} from "./imageReplacer";
import { processCalloutsInMarkdown } from "./markdownTransform";
import { EmojiProcessor } from "./emojiProcessor";

const DEBUG_S3_IMAGES =
  (process.env.DEBUG_S3_IMAGES ?? "").toLowerCase() === "true";

/**
 * Feature flag to enable/disable the retry-based image processing system.
 *
 * **Purpose**: Allows safe rollback to simpler single-pass processing if issues occur.
 *
 * **Default**: `true` (retry system enabled)
 *
 * **Usage**:
 * - Set to `"true"` (default): Use intelligent retry loop with progress validation
 * - Set to `"false"`: Use simple single-pass processing (faster, no retry safety net)
 *
 * **When to disable**:
 * - If retry loop causes performance degradation
 * - If issues with retry logic are discovered in production
 * - For debugging/testing simpler processing flow
 *
 * **Environment Variable**: `ENABLE_RETRY_IMAGE_PROCESSING`
 *
 * @example
 * // Enable retry processing (default)
 * ENABLE_RETRY_IMAGE_PROCESSING=true bun run notion:fetch
 *
 * @example
 * // Disable retry processing (rollback to simple mode)
 * ENABLE_RETRY_IMAGE_PROCESSING=false bun run notion:fetch
 *
 * @see {@link processMarkdownWithRetry} - Retry-based processing (when enabled)
 * @see {@link processMarkdownSinglePass} - Simple processing (when disabled)
 */
const ENABLE_RETRY_IMAGE_PROCESSING =
  (process.env.ENABLE_RETRY_IMAGE_PROCESSING ?? "true").toLowerCase() ===
  "true";

/**
 * Maximum number of retry attempts for image processing when S3 URLs remain.
 * Can be configured via MAX_IMAGE_RETRIES environment variable.
 * Default: 3 attempts (initial + 2 retries)
 * Rationale: Balances fixing transient issues (regex bugs, timing) without
 * excessive processing time for genuinely broken images.
 */
const MAX_IMAGE_REFRESH_ATTEMPTS = parseInt(
  process.env.MAX_IMAGE_RETRIES ?? "3",
  10
);

function debugS3(message: string): void {
  if (DEBUG_S3_IMAGES) {
    console.log(chalk.magenta(`[s3-debug] ${message}`));
  }
}

function formatRemainingImageDiagnostics(
  diagnostics: ReturnType<typeof getImageDiagnostics>
): string {
  const s3Matches = diagnostics.s3Matches ?? 0;
  const dataUrlMatches = diagnostics.dataUrlMatches ?? 0;
  const parts: string[] = [];

  if (s3Matches > 0) {
    parts.push(`${s3Matches} S3 URL${s3Matches === 1 ? "" : "s"}`);
  }
  if (dataUrlMatches > 0) {
    parts.push(`${dataUrlMatches} data URL${dataUrlMatches === 1 ? "" : "s"}`);
  }

  return parts.join(" and ") || "0 unresolved image references";
}

function hasRemainingImageReferences(
  diagnostics: ReturnType<typeof getImageDiagnostics>
): boolean {
  return (
    (diagnostics.s3Matches ?? 0) > 0 || (diagnostics.dataUrlMatches ?? 0) > 0
  );
}

/**
 * Log diagnostic information for a retry attempt to help debug image processing issues.
 * Consolidates repeated diagnostic logging patterns throughout the retry loop.
 */
function logRetryAttemptDiagnostics(
  attemptNumber: number,
  diagnostics: ReturnType<typeof getImageDiagnostics>,
  imageStats: ImageProcessingStats,
  context?: { pageTitle?: string; showSamples?: boolean }
): void {
  const { showSamples = true, pageTitle = "" } = context ?? {};
  const s3Samples = diagnostics.s3Samples ?? [];
  const dataUrlSamples = diagnostics.dataUrlSamples ?? [];

  // Only log if there are issues or we're past the first attempt
  if (
    hasRemainingImageReferences(diagnostics) ||
    imageStats.totalFailures > 0 ||
    attemptNumber > 1
  ) {
    const prefix = pageTitle ? `[${pageTitle}] ` : "";
    console.info(
      chalk.gray(
        `     ${prefix}Attempt ${attemptNumber}: images=${diagnostics.totalMatches} (md=${diagnostics.markdownMatches}, html=${diagnostics.htmlMatches}), remaining=${formatRemainingImageDiagnostics(diagnostics)}, successes=${imageStats.successfulImages}, failures=${imageStats.totalFailures}`
      )
    );

    if (showSamples && s3Samples.length > 0) {
      console.info(
        chalk.gray(`       Sample S3 URLs: ${s3Samples.join(", ")}`)
      );
    }

    if (showSamples && dataUrlSamples.length > 0) {
      console.info(
        chalk.gray(`       Sample data URLs: ${dataUrlSamples.join(", ")}`)
      );
    }
  }
}

interface RetryAttemptStats {
  attempt: number;
  markdownMatches: number;
  htmlMatches: number;
  remainingS3: number;
  remainingDataUrls: number;
  successfulImages: number;
  failedImages: number;
}

/**
 * Retry metrics tracking structure for aggregating retry statistics across pages.
 */
export interface RetryMetrics {
  totalPagesWithRetries: number;
  totalRetryAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttemptsPerPage: number;
}

/**
 * Process markdown content with intelligent retry logic for S3 image URL replacement.
 *
 * This function implements a retry loop that attempts to replace expiring S3 image URLs
 * with permanent local copies. It retries up to MAX_IMAGE_REFRESH_ATTEMPTS (default 3)
 * when S3 URLs persist after processing.
 *
 * **Processing Pipeline** (executed on each attempt):
 * 1. Process and replace images (fetch S3 images and save locally)
 * 2. Process callouts (convert Notion callouts to Docusaurus admonitions)
 * 3. Apply emoji mappings (replace custom emoji references)
 * 4. Validate and fix remaining images (final S3 URL cleanup)
 *
 * **Retry Strategy**:
 * - Succeeds on first attempt if no S3 URLs remain
 * - Retries when S3 URLs persist after processing
 * - Aborts early if content is identical (no progress being made)
 * - Stops at MAX_IMAGE_REFRESH_ATTEMPTS to prevent infinite loops
 * - Tracks retry metrics for monitoring and debugging
 *
 * **Progress Validation**:
 * After each attempt, the function checks if the content has changed. If content
 * is identical to the previous attempt, it aborts immediately as further retries
 * won't help (indicates a genuinely stuck image, not a transient issue).
 *
 * @param markdownContent - Initial markdown content to process (from Notion API)
 * @param pageContext - Page metadata for logging and debugging
 * @param pageContext.pageId - Notion page ID for emoji processing
 * @param pageContext.pageTitle - Page title for user-friendly logging
 * @param pageContext.safeFilename - Sanitized filename for image downloads
 * @param rawBlocks - Raw Notion blocks for callout and emoji processing
 * @param emojiMap - Pre-processed custom emoji mappings from block-level emojis
 * @param retryMetrics - Optional metrics tracking object to aggregate retry statistics
 *
 * @returns Promise resolving to processing results
 * @returns result.content - Final processed markdown content
 * @returns result.totalSaved - Total bytes saved from image downloads across ALL attempts (accumulated)
 * @returns result.fallbackEmojiCount - Number of fallback emojis processed
 * @returns result.containsS3 - Whether final content still contains S3 URLs
 * @returns result.retryAttempts - Number of retry attempts made (0 if succeeded on first try)
 *
 * @throws {Error} If content is null/undefined after max attempts or type validation fails
 *
 * @example
 * ```typescript
 * const result = await processMarkdownWithRetry(
 *   markdownString.parent,
 *   { pageId: page.id, pageTitle: "My Page", safeFilename: "my-page" },
 *   rawBlocks,
 *   emojiMap
 * );
 *
 * if (result.containsS3) {
 *   console.warn(`Page still has ${result.retryAttempts} S3 URLs after ${result.retryAttempts} retries`);
 * }
 * ```
 *
 * @see {@link MAX_IMAGE_REFRESH_ATTEMPTS} - Configure max retry attempts via MAX_IMAGE_RETRIES env var
 * @see {@link processAndReplaceImages} - Core image processing logic
 * @see {@link validateAndFixRemainingImages} - Final validation step
 */
export async function processMarkdownWithRetry(
  markdownContent: string,
  pageContext: {
    pageId: string;
    pageTitle: string;
    safeFilename: string;
  },
  rawBlocks: any[],
  emojiMap: Map<string, string>,
  retryMetrics?: RetryMetrics
): Promise<{
  content: string;
  totalSaved: number;
  fallbackEmojiCount: number;
  containsS3: boolean;
  retryAttempts: number;
}> {
  const { pageId, pageTitle, safeFilename } = pageContext;
  const retryTelemetry: RetryAttemptStats[] = [];

  /**
   * Run the full content processing pipeline for one attempt.
   * Processes images → callouts → emojis → validation in sequence.
   */
  const runFullContentPipeline = async (
    initialContent: string,
    attemptLabel: string
  ): Promise<{
    content: string;
    savedDelta: number;
    fallbackEmojiCount: number;
    imageStats: ImageProcessingStats;
  }> => {
    const warnIfUnresolvedImages = (stage: string, content: string): void => {
      const diagnostics = getImageDiagnostics(content);
      if (hasRemainingImageReferences(diagnostics)) {
        console.warn(
          chalk.yellow(
            `  ⚠️  ${stage} still contains ${formatRemainingImageDiagnostics(diagnostics)}`
          )
        );
      }
    };

    let workingContent = initialContent;
    let savedDelta = 0;
    let fallbackEmojiCount = 0;

    // DEBUG: Log image count BEFORE image processing
    if (DEBUG_S3_IMAGES) {
      const beforeDiagnostics = getImageDiagnostics(workingContent);
      console.log(
        chalk.magenta(
          `[s3-debug] BEFORE image processing: ${beforeDiagnostics.totalMatches} images (S3: ${beforeDiagnostics.s3Matches}, data URLs: ${beforeDiagnostics.dataUrlMatches ?? 0})`
        )
      );

      // DEBUG: Save markdown to file to inspect
      if (
        attemptLabel.includes("building-a-custom-categories-set") &&
        !attemptLabel.includes("retry")
      ) {
        const debugPath = `/tmp/debug-markdown-${attemptLabel}.md`;
        fs.writeFileSync(debugPath, workingContent, "utf-8");
        console.log(chalk.magenta(`[s3-debug] Saved markdown to ${debugPath}`));
      }
    }

    const imageResult = await processAndReplaceImages(
      workingContent,
      attemptLabel
    );
    workingContent = imageResult.markdown;
    savedDelta += imageResult.stats.totalSaved;
    warnIfUnresolvedImages("Image processing stage", workingContent);

    if (rawBlocks && rawBlocks.length > 0) {
      workingContent = await processCalloutsInMarkdown(
        workingContent,
        rawBlocks
      );
      console.log(chalk.blue(`  ↳ Processed callouts in markdown content`));
    }

    if (emojiMap.size > 0) {
      workingContent = EmojiProcessor.applyEmojiMappings(
        workingContent,
        emojiMap
      );
      console.log(
        chalk.green(
          `  ↳ Applied ${emojiMap.size} custom emoji mappings to markdown`
        )
      );
    }

    if (emojiMap.size === 0) {
      const fallbackEmojiResult = await EmojiProcessor.processPageEmojis(
        pageId,
        workingContent
      );
      if (fallbackEmojiResult) {
        workingContent = fallbackEmojiResult.content;
        savedDelta += fallbackEmojiResult.totalSaved ?? 0;
        fallbackEmojiCount += fallbackEmojiResult.processedCount ?? 0;
      }
    }

    workingContent = await validateAndFixRemainingImages(
      workingContent,
      attemptLabel
    );
    warnIfUnresolvedImages("Final validation stage", workingContent);

    return {
      content: workingContent,
      savedDelta,
      fallbackEmojiCount,
      imageStats: imageResult.stats,
    };
  };

  let attempt = 0;
  let processedContent: string | null = null;
  let processedSavedDelta = 0;
  let cumulativeSavedBytes = 0; // Track total bytes saved across all attempts
  let processedFallbackEmojiCount = 0;
  let currentSource = markdownContent;

  // Retry loop with configurable max attempts (see MAX_IMAGE_REFRESH_ATTEMPTS)
  while (attempt < MAX_IMAGE_REFRESH_ATTEMPTS) {
    const attemptLabel =
      attempt === 0 ? safeFilename : `${safeFilename}-retry-${attempt}`;

    // Safety check: Ensure we have valid content to process
    // Note: Empty strings are valid (pages with only title or filtered content)
    if (currentSource == null || typeof currentSource !== "string") {
      throw new Error(
        `Unable to load markdown content for ${pageTitle} (attempt ${attempt + 1}): content is ${typeof currentSource}`
      );
    }

    // DEBUG: Log currentSource before processing
    if (DEBUG_S3_IMAGES) {
      const beforeDiagnostics = getImageDiagnostics(currentSource);
      debugS3(`[${safeFilename}] === RETRY LOOP Attempt ${attempt + 1} ===`);
      debugS3(
        `  currentSource type: ${typeof currentSource}, length: ${currentSource?.length ?? 0}`
      );
      debugS3(
        `  currentSource unresolved image refs BEFORE pipeline: ${formatRemainingImageDiagnostics(beforeDiagnostics)}`
      );
      debugS3(
        `  currentSource first 100 chars: "${String(currentSource).substring(0, 100)}"`
      );
    }

    const {
      content: attemptContent,
      savedDelta,
      fallbackEmojiCount,
      imageStats,
    } = await runFullContentPipeline(currentSource, attemptLabel);

    // DEBUG: Log attemptContent after pipeline
    if (DEBUG_S3_IMAGES) {
      const afterDiagnostics = getImageDiagnostics(attemptContent);
      debugS3(
        `  attemptContent type: ${typeof attemptContent}, length: ${attemptContent?.length ?? 0}`
      );
      debugS3(
        `  attemptContent unresolved image refs AFTER pipeline: ${formatRemainingImageDiagnostics(afterDiagnostics)}`
      );
    }

    const diagnostics = getImageDiagnostics(attemptContent);
    retryTelemetry.push({
      attempt: attempt + 1,
      markdownMatches: diagnostics.markdownMatches,
      htmlMatches: diagnostics.htmlMatches,
      remainingS3: diagnostics.s3Matches,
      remainingDataUrls: diagnostics.dataUrlMatches ?? 0,
      successfulImages: imageStats.successfulImages,
      failedImages: imageStats.totalFailures,
    });

    // Log diagnostic information (helper consolidates repeated patterns)
    logRetryAttemptDiagnostics(attempt + 1, diagnostics, imageStats);

    // Accumulate bytes saved from this attempt
    cumulativeSavedBytes += savedDelta;

    const remainingS3 = (diagnostics.s3Matches ?? 0) > 0;
    const remainingDataUrl = (diagnostics.dataUrlMatches ?? 0) > 0;

    if (!remainingS3 && !remainingDataUrl) {
      processedContent = attemptContent;
      processedSavedDelta = cumulativeSavedBytes; // Use cumulative total
      processedFallbackEmojiCount = fallbackEmojiCount;
      console.log(
        chalk.green(
          `  ✅ Successfully replaced all unresolved image references after ${attempt + 1} attempt(s)`
        )
      );

      // Track retry metrics (only if we actually retried)
      if (attempt > 0 && retryMetrics) {
        retryMetrics.totalPagesWithRetries++;
        retryMetrics.totalRetryAttempts += attempt;
        retryMetrics.successfulRetries++;
      }
      break;
    }

    processedContent = attemptContent;
    processedSavedDelta = cumulativeSavedBytes; // Use cumulative total
    processedFallbackEmojiCount = fallbackEmojiCount;

    attempt += 1;
    if (attempt >= MAX_IMAGE_REFRESH_ATTEMPTS) {
      console.warn(
        chalk.yellow(
          `  ⚠️  Some images in ${pageTitle} still contain ${formatRemainingImageDiagnostics(diagnostics)} after ${MAX_IMAGE_REFRESH_ATTEMPTS} attempts.`
        )
      );
      console.warn(
        chalk.yellow(
          `  💡 Tip: Check image-failures.json for recovery information`
        )
      );

      // Track failed retry metrics
      if (retryMetrics) {
        retryMetrics.totalPagesWithRetries++;
        // Use actual retry count (attempt - 1) since we've incremented past the last retry
        retryMetrics.totalRetryAttempts += attempt - 1;
        retryMetrics.failedRetries++;
      }
      break;
    }

    // DEBUG: Track if currentSource is being updated
    if (DEBUG_S3_IMAGES) {
      debugS3(`  CRITICAL: About to retry. Will currentSource be updated?`);
      debugS3(
        `  currentSource === markdownContent: ${currentSource === markdownContent}`
      );
      debugS3(
        `  currentSource === attemptContent: ${currentSource === attemptContent}`
      );
      debugS3(
        `  Next iteration will use currentSource, which is currently: ${typeof currentSource} with ${formatRemainingImageDiagnostics(getImageDiagnostics(currentSource))}`
      );
    }

    console.warn(
      chalk.yellow(
        `  ↻ Retrying image processing for ${pageTitle} (attempt ${attempt + 1}/${MAX_IMAGE_REFRESH_ATTEMPTS})`
      )
    );
    console.info(
      chalk.gray(
        `     Processing stats: ${imageStats.successfulImages} successful, ${imageStats.totalFailures} failed`
      )
    );

    // DEBUG: Verify currentSource update
    if (DEBUG_S3_IMAGES) {
      const beforeUpdateDiagnostics = getImageDiagnostics(currentSource);
      debugS3(
        `  BEFORE potential update: currentSource has ${formatRemainingImageDiagnostics(beforeUpdateDiagnostics)}`
      );
    }

    // CRITICAL: Check if we're making progress before retrying
    // If content is identical, further retries won't help
    if (attempt > 0 && currentSource === attemptContent) {
      console.warn(
        chalk.yellow(
          `  ⚠️  No progress made in retry attempt ${attempt} for ${pageTitle}, aborting further attempts`
        )
      );
      console.warn(
        chalk.yellow(
          `  💡 This suggests image processing is genuinely stuck, not just a regex bug`
        )
      );
      processedContent = attemptContent;
      processedSavedDelta = cumulativeSavedBytes; // Use cumulative total
      processedFallbackEmojiCount = fallbackEmojiCount;
      break;
    }

    // CRITICAL: Update currentSource with attemptContent for next iteration
    currentSource = attemptContent;

    if (DEBUG_S3_IMAGES) {
      const afterUpdateDiagnostics = getImageDiagnostics(currentSource);
      debugS3(
        `  AFTER update: currentSource has ${formatRemainingImageDiagnostics(afterUpdateDiagnostics)}`
      );
      debugS3(
        `  currentSource was updated: ${currentSource === attemptContent ? "YES" : "NO"}`
      );
    }
  }

  // Log retry telemetry if unresolved image references persist
  if (
    retryTelemetry.length > 0 &&
    (retryTelemetry[retryTelemetry.length - 1].remainingS3 > 0 ||
      retryTelemetry[retryTelemetry.length - 1].remainingDataUrls > 0)
  ) {
    console.warn(chalk.yellow(`  🧪 Retry telemetry for ${pageTitle}:`));
    for (const entry of retryTelemetry) {
      console.warn(
        chalk.yellow(
          `     Attempt ${entry.attempt}: remaining S3=${entry.remainingS3}, remaining data URLs=${entry.remainingDataUrls}, successes=${entry.successfulImages}, failures=${entry.failedImages}`
        )
      );
    }
  }

  if (!processedContent) {
    throw new Error(
      `Failed to process markdown content for ${pageTitle}; unresolved image references persist.`
    );
  }

  const finalDiagnostics = getImageDiagnostics(processedContent);

  // Calculate actual number of retries (not total attempts)
  // The loop counter 'attempt' starts at 0 for the first try, then increments for each retry.
  // We need to ensure we return the correct count: 0 = no retries, 1 = one retry, etc.
  //
  // Exit paths and their attempt values:
  // 1. Success path (line 358): attempt = actual retry count (0, 1, 2, ...)
  // 2. Max attempts path (line 385): attempt = MAX after increment, need (attempt - 1)
  // 3. No progress path (line 437): attempt = incremented value, need (attempt - 1)
  //
  // Scenario 1: Success on first attempt (attempt=0, breaks before increment) → return 0 ✓
  // Scenario 2: Success after 1 retry (attempt=1, breaks before increment) → return 1 ✓
  // Scenario 3: Hit max attempts (attempt=3 after increment at line 365) → return 2 ✓
  // Scenario 4: No progress on first attempt (attempt=1 after increment at line 365) → return 0 ✓
  // Scenario 5: No progress after 1 retry (attempt=2 after increment at line 365) → return 1 ✓
  //
  // The success path breaks BEFORE the increment, so attempt is correct.
  // The max attempts and no-progress paths break AFTER the increment, so we need (attempt - 1).
  // We can detect this by checking if we exited with unresolved image references remaining.
  const exitedWithUnresolvedImages =
    finalDiagnostics.s3Matches > 0 || finalDiagnostics.dataUrlMatches > 0;
  const actualRetryCount = exitedWithUnresolvedImages ? attempt - 1 : attempt;

  return {
    content: processedContent,
    totalSaved: processedSavedDelta,
    fallbackEmojiCount: processedFallbackEmojiCount,
    containsS3: finalDiagnostics.s3Matches > 0,
    retryAttempts: actualRetryCount, // Number of retries (0 if succeeded on first attempt)
  };
}

/**
 * Process markdown content with simple single-pass image processing (no retries).
 *
 * This is the fallback function used when `ENABLE_RETRY_IMAGE_PROCESSING=false`.
 * It processes content in a single pass without retry logic, making it faster but
 * less robust to transient issues like regex bugs or timing problems.
 *
 * **Processing Pipeline** (single pass):
 * 1. Process and replace images (fetch S3 images and save locally)
 * 2. Process callouts (convert Notion callouts to Docusaurus admonitions)
 * 3. Apply emoji mappings (replace custom emoji references)
 * 4. Validate and fix remaining images (final S3 URL cleanup)
 *
 * **Compared to retry-based processing**:
 * - ✅ Faster execution (no retry overhead)
 * - ❌ No automatic recovery from transient failures
 * - ❌ No progress validation
 * - ❌ May leave S3 URLs in output if initial processing fails
 *
 * @param markdownContent - Initial markdown content to process (from Notion API)
 * @param pageContext - Page metadata for logging and debugging
 * @param pageContext.pageId - Notion page ID for emoji processing
 * @param pageContext.pageTitle - Page title for user-friendly logging
 * @param pageContext.safeFilename - Sanitized filename for image downloads
 * @param rawBlocks - Raw Notion blocks for callout and emoji processing
 * @param emojiMap - Pre-processed custom emoji mappings from block-level emojis
 * @param retryMetrics - Optional metrics tracking object (not used in single-pass mode)
 *
 * @returns Promise resolving to processing results
 * @returns result.content - Final processed markdown content
 * @returns result.totalSaved - Total bytes saved from image downloads
 * @returns result.fallbackEmojiCount - Number of fallback emojis processed
 * @returns result.containsS3 - Whether final content still contains S3 URLs
 * @returns result.retryAttempts - Always 0 (no retries in single-pass mode)
 *
 * @see {@link processMarkdownWithRetry} - Retry-based alternative (when flag enabled)
 * @see {@link ENABLE_RETRY_IMAGE_PROCESSING} - Feature flag controlling which function is used
 */
export async function processMarkdownSinglePass(
  markdownContent: string,
  pageContext: {
    pageId: string;
    pageTitle: string;
    safeFilename: string;
  },
  rawBlocks: any[],
  emojiMap: Map<string, string>,
  retryMetrics?: RetryMetrics
): Promise<{
  content: string;
  totalSaved: number;
  fallbackEmojiCount: number;
  containsS3: boolean;
  retryAttempts: number;
}> {
  const { pageId, pageTitle, safeFilename } = pageContext;

  let workingContent = markdownContent;
  let totalSaved = 0;
  let fallbackEmojiCount = 0;

  console.log(
    chalk.gray(`  ℹ️  Using single-pass processing (retry disabled)`)
  );

  // Process and replace images
  const imageResult = await processAndReplaceImages(
    workingContent,
    safeFilename
  );
  workingContent = imageResult.markdown;
  totalSaved += imageResult.stats.totalSaved;

  // Process callouts
  if (rawBlocks && rawBlocks.length > 0) {
    workingContent = await processCalloutsInMarkdown(workingContent, rawBlocks);
    console.log(chalk.blue(`  ↳ Processed callouts in markdown content`));
  }

  // Apply emoji mappings
  if (emojiMap.size > 0) {
    workingContent = EmojiProcessor.applyEmojiMappings(
      workingContent,
      emojiMap
    );
    console.log(
      chalk.green(
        `  ↳ Applied ${emojiMap.size} custom emoji mappings to markdown`
      )
    );
  }

  // Process fallback emojis
  if (emojiMap.size === 0) {
    const fallbackEmojiResult = await EmojiProcessor.processPageEmojis(
      pageId,
      workingContent
    );
    if (fallbackEmojiResult) {
      workingContent = fallbackEmojiResult.content;
      totalSaved += fallbackEmojiResult.totalSaved ?? 0;
      fallbackEmojiCount += fallbackEmojiResult.processedCount ?? 0;
    }
  }

  // Validate and fix remaining images (final pass)
  workingContent = await validateAndFixRemainingImages(
    workingContent,
    safeFilename
  );

  const finalDiagnostics = getImageDiagnostics(workingContent);

  // Warn if S3 URLs or data: image references remain (but don't retry in single-pass mode)
  if (finalDiagnostics.s3Matches > 0 || finalDiagnostics.dataUrlMatches > 0) {
    const parts: string[] = [];
    if (finalDiagnostics.s3Matches > 0) {
      parts.push(`${finalDiagnostics.s3Matches} S3 URL(s)`);
    }
    if (finalDiagnostics.dataUrlMatches > 0) {
      parts.push(`${finalDiagnostics.dataUrlMatches} data: image reference(s)`);
    }
    console.warn(
      chalk.yellow(
        `  ⚠️  ${parts.join(" and ")} remain in ${pageTitle} (single-pass mode, no retries)`
      )
    );
    console.warn(
      chalk.yellow(
        `  💡 Tip: Enable retry mode with ENABLE_RETRY_IMAGE_PROCESSING=true for automatic recovery`
      )
    );
  }

  return {
    content: workingContent,
    totalSaved,
    fallbackEmojiCount,
    containsS3: finalDiagnostics.s3Matches > 0,
    retryAttempts: 0, // No retries in single-pass mode
  };
}

/**
 * Process markdown content using the appropriate strategy based on feature flag.
 *
 * This is the main entry point for markdown processing. It automatically selects
 * between retry-based processing (default) and single-pass processing based on
 * the `ENABLE_RETRY_IMAGE_PROCESSING` environment variable.
 *
 * **Behavior**:
 * - If `ENABLE_RETRY_IMAGE_PROCESSING=true` (default): Uses {@link processMarkdownWithRetry}
 * - If `ENABLE_RETRY_IMAGE_PROCESSING=false`: Uses {@link processMarkdownSinglePass}
 *
 * **When to use which mode**:
 * - **Retry mode (default)**: Production use, handles transient failures automatically
 * - **Single-pass mode**: Debugging, performance testing, or emergency rollback
 *
 * @param markdownContent - Initial markdown content to process
 * @param pageContext - Page metadata for logging and debugging
 * @param rawBlocks - Raw Notion blocks for callout and emoji processing
 * @param emojiMap - Pre-processed custom emoji mappings
 * @param retryMetrics - Optional metrics tracking object
 *
 * @returns Promise resolving to processing results (same interface for both modes)
 *
 * @see {@link ENABLE_RETRY_IMAGE_PROCESSING} - Feature flag controlling behavior
 * @see {@link processMarkdownWithRetry} - Retry-based processing
 * @see {@link processMarkdownSinglePass} - Single-pass processing
 */
export async function processMarkdown(
  markdownContent: string,
  pageContext: {
    pageId: string;
    pageTitle: string;
    safeFilename: string;
  },
  rawBlocks: any[],
  emojiMap: Map<string, string>,
  retryMetrics?: RetryMetrics
): Promise<{
  content: string;
  totalSaved: number;
  fallbackEmojiCount: number;
  containsS3: boolean;
  retryAttempts: number;
}> {
  if (ENABLE_RETRY_IMAGE_PROCESSING) {
    return processMarkdownWithRetry(
      markdownContent,
      pageContext,
      rawBlocks,
      emojiMap,
      retryMetrics
    );
  } else {
    return processMarkdownSinglePass(
      markdownContent,
      pageContext,
      rawBlocks,
      emojiMap,
      retryMetrics
    );
  }
}
