import fs from "node:fs";
import chalk from "chalk";
import {
  processAndReplaceImages,
  validateAndFixRemainingImages,
  hasS3Urls,
  getImageDiagnostics,
  type ImageProcessingStats,
} from "./imageReplacer";
import { processCalloutsInMarkdown } from "./markdownTransform";
import { EmojiProcessor } from "./emojiProcessor";

const DEBUG_S3_IMAGES =
  (process.env.DEBUG_S3_IMAGES ?? "").toLowerCase() === "true";

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

  // Only log if there are issues or we're past the first attempt
  if (
    diagnostics.s3Matches > 0 ||
    imageStats.totalFailures > 0 ||
    attemptNumber > 1
  ) {
    const prefix = pageTitle ? `[${pageTitle}] ` : "";
    console.info(
      chalk.gray(
        `     ${prefix}Attempt ${attemptNumber}: images=${diagnostics.totalMatches} (md=${diagnostics.markdownMatches}, html=${diagnostics.htmlMatches}), remaining S3=${diagnostics.s3Matches}, successes=${imageStats.successfulImages}, failures=${imageStats.totalFailures}`
      )
    );

    if (showSamples && diagnostics.s3Samples.length > 0) {
      console.info(
        chalk.gray(`       Sample S3 URLs: ${diagnostics.s3Samples.join(", ")}`)
      );
    }
  }
}

interface RetryAttemptStats {
  attempt: number;
  markdownMatches: number;
  htmlMatches: number;
  remainingS3: number;
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
 * 1. Process callouts (convert Notion callouts to Docusaurus admonitions)
 * 2. Process and replace images (fetch S3 images and save locally)
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
   * Processes callouts → images → emojis → validation in sequence.
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
    const warnIfS3 = (stage: string, content: string): boolean => {
      const containsS3 = hasS3Urls(content);
      if (containsS3) {
        console.warn(
          chalk.yellow(`  ⚠️  ${stage} still contains expiring S3 image URLs`)
        );
      }
      return containsS3;
    };

    let workingContent = initialContent;
    let savedDelta = 0;
    let fallbackEmojiCount = 0;

    // DEBUG: Log image count BEFORE callout processing
    if (DEBUG_S3_IMAGES) {
      const beforeDiagnostics = getImageDiagnostics(workingContent);
      console.log(
        chalk.magenta(
          `[s3-debug] BEFORE callout processing: ${beforeDiagnostics.totalMatches} images (S3: ${beforeDiagnostics.s3Matches})`
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

    if (rawBlocks && rawBlocks.length > 0) {
      workingContent = processCalloutsInMarkdown(workingContent, rawBlocks);
      console.log(chalk.blue(`  ↳ Processed callouts in markdown content`));
    }

    // DEBUG: Log image count AFTER callout processing
    if (DEBUG_S3_IMAGES) {
      const afterDiagnostics = getImageDiagnostics(workingContent);
      console.log(
        chalk.magenta(
          `[s3-debug] AFTER callout processing: ${afterDiagnostics.totalMatches} images (S3: ${afterDiagnostics.s3Matches})`
        )
      );
    }

    const imageResult = await processAndReplaceImages(
      workingContent,
      attemptLabel
    );
    workingContent = imageResult.markdown;
    savedDelta += imageResult.stats.totalSaved;
    warnIfS3("Image processing stage", workingContent);

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
        `  currentSource S3 URLs BEFORE pipeline: ${beforeDiagnostics.s3Matches}`
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
        `  attemptContent S3 URLs AFTER pipeline: ${afterDiagnostics.s3Matches}`
      );
    }

    const diagnostics = getImageDiagnostics(attemptContent);
    retryTelemetry.push({
      attempt: attempt + 1,
      markdownMatches: diagnostics.markdownMatches,
      htmlMatches: diagnostics.htmlMatches,
      remainingS3: diagnostics.s3Matches,
      successfulImages: imageStats.successfulImages,
      failedImages: imageStats.totalFailures,
    });

    // Log diagnostic information (helper consolidates repeated patterns)
    logRetryAttemptDiagnostics(attempt + 1, diagnostics, imageStats);

    // Accumulate bytes saved from this attempt
    cumulativeSavedBytes += savedDelta;

    const remainingS3 = diagnostics.s3Matches > 0;

    if (!remainingS3) {
      processedContent = attemptContent;
      processedSavedDelta = cumulativeSavedBytes; // Use cumulative total
      processedFallbackEmojiCount = fallbackEmojiCount;
      console.log(
        chalk.green(
          `  ✅ Successfully replaced all S3 URLs after ${attempt + 1} attempt(s)`
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
          `  ⚠️  Some images in ${pageTitle} still reference expiring URLs after ${MAX_IMAGE_REFRESH_ATTEMPTS} attempts.`
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
        `  Next iteration will use currentSource, which is currently: ${typeof currentSource} with ${getImageDiagnostics(currentSource).s3Matches} S3 URLs`
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
        `  BEFORE potential update: currentSource has ${beforeUpdateDiagnostics.s3Matches} S3 URLs`
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
        `  AFTER update: currentSource has ${afterUpdateDiagnostics.s3Matches} S3 URLs`
      );
      debugS3(
        `  currentSource was updated: ${currentSource === attemptContent ? "YES" : "NO"}`
      );
    }
  }

  // Log retry telemetry if S3 URLs persist
  if (
    retryTelemetry.length > 0 &&
    retryTelemetry[retryTelemetry.length - 1].remainingS3 > 0
  ) {
    console.warn(chalk.yellow(`  🧪 Retry telemetry for ${pageTitle}:`));
    for (const entry of retryTelemetry) {
      console.warn(
        chalk.yellow(
          `     Attempt ${entry.attempt}: remaining S3=${entry.remainingS3}, successes=${entry.successfulImages}, failures=${entry.failedImages}`
        )
      );
    }
  }

  if (!processedContent) {
    throw new Error(
      `Failed to process markdown content for ${pageTitle}; expiring URLs persist.`
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
  // We can detect this by checking if we exited with S3 URLs remaining.
  const exitedWithS3 = finalDiagnostics.s3Matches > 0;
  const actualRetryCount = exitedWithS3 ? attempt - 1 : attempt;

  return {
    content: processedContent,
    totalSaved: processedSavedDelta,
    fallbackEmojiCount: processedFallbackEmojiCount,
    containsS3: finalDiagnostics.s3Matches > 0,
    retryAttempts: actualRetryCount, // Number of retries (0 if succeeded on first attempt)
  };
}
