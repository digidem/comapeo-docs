/**
 * Image replacement utilities for markdown content
 *
 * Handles comprehensive image processing:
 * - Regex-based image detection with safety limits
 * - URL validation and sanitization
 * - Concurrent image downloading with fallbacks
 * - Deterministic markdown replacement
 */

import chalk from "chalk";
import {
  validateAndSanitizeImageUrl,
  createFallbackImageMarkdown,
} from "./imageValidation";
import { sanitizeMarkdownImages } from "./markdownTransform";
import {
  processImageWithFallbacks,
  logImageFailure,
  logProcessingMetrics,
  createProcessingMetrics,
  type ImageProcessingResult,
  type ImageProcessingMetrics,
} from "./imageProcessing";
import { processBatch } from "./timeoutUtils";
import { ProgressTracker } from "./progressTracker";

/**
 * Image match information extracted from markdown
 */
export interface ImageMatch {
  /** Full markdown image syntax (including link wrapper if present) */
  full: string;
  /** Image URL */
  url: string;
  /** Alt text */
  alt: string;
  /** Sequential index for tracking */
  idx: number;
  /** Start position in source markdown */
  start: number;
  /** End position in source markdown */
  end: number;
  /** Hyperlink URL if image is wrapped in a link */
  linkUrl?: string;
}

/**
 * Image processing statistics
 */
export interface ImageProcessingStats {
  /** Number of images successfully downloaded */
  successfulImages: number;
  /** Number of images that failed with fallbacks */
  totalFailures: number;
  /** Total bytes saved from successful downloads */
  totalSaved: number;
}

/**
 * Result of image replacement operation
 */
export interface ImageReplacementResult {
  /** Processed markdown with image URLs replaced */
  markdown: string;
  /** Processing statistics */
  stats: ImageProcessingStats;
  /** Performance metrics for image processing optimizations */
  metrics: ImageProcessingMetrics;
}

const SAFETY_LIMIT = 500; // cap images processed per page to avoid runaway loops

// Maximum concurrent image downloads to prevent resource exhaustion
// Matches emoji processing pattern for consistency
const MAX_CONCURRENT_IMAGES = 5;

/**
 * Extracts all image matches from markdown content
 *
 * Handles both regular images and hyperlinked images:
 * - Regular: ![alt](url)
 * - Hyperlinked: [![alt](img-url)](link-url)
 *
 * Uses improved regex patterns that:
 * - Match until ')' not preceded by '\'
 * - Allow spaces (trimmed)
 * - Handle escaped parentheses in URLs
 *
 * @param sourceMarkdown - Source markdown content
 * @returns Array of image matches with position information
 */
export function extractImageMatches(sourceMarkdown: string): ImageMatch[] {
  const imageMatches: ImageMatch[] = [];
  let tmpIndex = 0;
  let safetyCounter = 0;

  // First, extract hyperlinked images: [![alt](img-url)](link-url)
  const hyperlinkedImgRegex =
    /\[!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
  let m: RegExpExecArray | null;

  while ((m = hyperlinkedImgRegex.exec(sourceMarkdown)) !== null) {
    if (++safetyCounter > SAFETY_LIMIT) {
      console.warn(
        chalk.yellow(
          `⚠️  Image match limit (${SAFETY_LIMIT}) reached; skipping remaining.`
        )
      );
      break;
    }
    const start = m.index;
    const full = m[0];
    const end = start + full.length;
    const rawImgUrl = m[2];
    const rawLinkUrl = m[3];
    const unescapedImgUrl = rawImgUrl.replace(/\\\)/g, ")");
    const unescapedLinkUrl = rawLinkUrl.replace(/\\\)/g, ")");

    imageMatches.push({
      full,
      url: unescapedImgUrl,
      alt: m[1],
      idx: tmpIndex++,
      start,
      end,
      linkUrl: unescapedLinkUrl,
    });
  }

  // Then, extract regular images: ![alt](url)
  // But skip positions already matched by hyperlinked images
  const imgRegex = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;

  while ((m = imgRegex.exec(sourceMarkdown)) !== null) {
    if (++safetyCounter > SAFETY_LIMIT) {
      console.warn(
        chalk.yellow(
          `⚠️  Image match limit (${SAFETY_LIMIT}) reached; skipping remaining.`
        )
      );
      break;
    }

    const start = m.index;
    const full = m[0];
    const end = start + full.length;

    // Skip if this position overlaps with a hyperlinked image
    const overlaps = imageMatches.some(
      (existing) => start >= existing.start && start < existing.end
    );

    if (overlaps) {
      continue;
    }

    const rawUrl = m[2];
    const unescapedUrl = rawUrl.replace(/\\\)/g, ")");

    imageMatches.push({
      full,
      url: unescapedUrl,
      alt: m[1],
      idx: tmpIndex++,
      start,
      end,
    });
  }

  // Sort by start position to maintain order
  imageMatches.sort((a, b) => a.start - b.start);

  // Reassign indices after sorting
  imageMatches.forEach((match, index) => {
    match.idx = index;
  });

  return imageMatches;
}

/**
 * Processes and replaces all images in markdown content
 *
 * Workflow:
 * 1. Extract image matches with regex
 * 2. Validate all images upfront
 * 3. Process valid images in batches with concurrency control
 * 4. Apply replacements deterministically (end-to-start)
 * 5. Sanitize final markdown
 * 6. Report statistics
 *
 * IMPORTANT: Uses batch processing to prevent resource exhaustion.
 * Processing all images concurrently (Promise.allSettled) can hang the script
 * when pages have many images (10-15+). Batch size of 5 balances performance
 * and stability.
 *
 * @param markdown - Source markdown content
 * @param safeFilename - Safe filename for logging/caching
 * @returns Processed markdown and statistics
 */
export async function processAndReplaceImages(
  markdown: string,
  safeFilename: string
): Promise<ImageReplacementResult> {
  // Create per-call metrics to avoid race conditions in parallel processing
  const metrics = createProcessingMetrics();

  const sourceMarkdown = markdown;
  const imageMatches = extractImageMatches(sourceMarkdown);

  if (imageMatches.length === 0) {
    // No images found, just sanitize
    return {
      markdown: sanitizeMarkdownImages(markdown),
      stats: {
        successfulImages: 0,
        totalFailures: 0,
        totalSaved: 0,
      },
      metrics,
    };
  }

  // Phase 1: Validate all images upfront and separate valid from invalid
  interface ValidatedImage {
    match: ImageMatch;
    sanitizedUrl: string;
  }

  const validImages: ValidatedImage[] = [];
  const invalidResults: Array<{
    success: false;
    originalMarkdown: string;
    imageUrl: string;
    index: number;
    error: string;
    fallbackUsed: true;
  }> = [];

  for (const match of imageMatches) {
    const urlValidation = validateAndSanitizeImageUrl(match.url);

    if (!urlValidation.isValid) {
      console.warn(
        chalk.yellow(`⚠️  Invalid image URL detected: ${urlValidation.error}`)
      );

      logImageFailure({
        timestamp: new Date().toISOString(),
        pageBlock: safeFilename,
        imageIndex: match.idx,
        originalUrl: match.url,
        error: urlValidation.error,
        fallbackUsed: true,
        validationFailed: true,
      });

      invalidResults.push({
        success: false,
        originalMarkdown: match.full,
        imageUrl: match.url,
        index: match.idx,
        error: urlValidation.error,
        fallbackUsed: true,
      });
      continue;
    }

    if (!urlValidation.sanitizedUrl!.startsWith("http")) {
      console.info(chalk.blue(`ℹ️  Skipping local image: ${match.url}`));
      invalidResults.push({
        success: false,
        originalMarkdown: match.full,
        imageUrl: match.url,
        index: match.idx,
        error: "Local image skipped",
        fallbackUsed: true,
      });
      continue;
    }

    validImages.push({
      match,
      sanitizedUrl: urlValidation.sanitizedUrl!,
    });
  }

  // Phase 2: Process valid images in batches with concurrency control
  // This prevents resource exhaustion when pages have many images
  let successfulImages = 0;
  let totalFailures = 0;
  let totalSaved = 0;

  // Create progress tracker only when there are images to process
  // to avoid leaking a spinner when validImages.length is 0
  const progressTracker =
    validImages.length > 0
      ? new ProgressTracker({
          total: validImages.length,
          operation: "images",
          spinnerTimeoutMs: 150000, // 2.5 minutes
        })
      : undefined;

  const batchResults = await processBatch(
    validImages,
    async (validImage) => {
      const result = await processImageWithFallbacks(
        validImage.sanitizedUrl,
        safeFilename,
        validImage.match.idx,
        validImage.match.full,
        metrics
      );
      return {
        ...result,
        originalMarkdown: validImage.match.full,
        imageUrl: validImage.sanitizedUrl,
        index: validImage.match.idx,
      };
    },
    {
      maxConcurrent: MAX_CONCURRENT_IMAGES,
      // No timeout here - individual operations have their own timeouts
      operation: "image processing",
      progressTracker: progressTracker,
    }
  );

  // Combine invalid (pre-validated) results with batch processing results
  const imageResults = [
    ...invalidResults.map((r) => ({ status: "fulfilled" as const, value: r })),
    ...batchResults,
  ];

  // Build deterministic replacements using recorded match indices
  const indexedReplacements: Array<{
    start: number;
    end: number;
    text: string;
  }> = [];

  for (const result of imageResults) {
    if (result.status !== "fulfilled") {
      // Promise rejection - should not happen with our error handling
      console.error(
        chalk.red(`Unexpected image processing failure: ${result.reason}`)
      );
      totalFailures++;
      continue;
    }
    const processResult = result.value;
    const match = imageMatches.find((im) => im.idx === processResult.index);
    if (!match) continue;

    let replacementText: string;
    if (processResult.success && processResult.newPath) {
      // Replace the image URL with the new local path
      // This preserves the hyperlink wrapper if present, as match.full
      // contains the complete markdown syntax: [![alt](url)](link) or ![alt](url)
      replacementText = match.full.replace(
        processResult.imageUrl!,
        processResult.newPath
      );
      totalSaved += processResult.savedBytes || 0;
      successfulImages++;
    } else {
      replacementText = createFallbackImageMarkdown(
        match.full,
        match.url,
        match.idx
      );
      totalFailures++;
    }
    indexedReplacements.push({
      start: match.start,
      end: match.end,
      text: replacementText,
    });
  }

  // Apply replacements from end to start to keep indices stable
  indexedReplacements.sort((a, b) => b.start - a.start);
  let processedMarkdown = markdown;
  for (const rep of indexedReplacements) {
    processedMarkdown =
      processedMarkdown.slice(0, rep.start) +
      rep.text +
      processedMarkdown.slice(rep.end);
  }

  // Final sanitization
  processedMarkdown = sanitizeMarkdownImages(processedMarkdown);

  // Phase 3: Report results
  const totalImages = imageMatches.length;
  console.info(
    chalk.green(
      `📸 Processed ${totalImages} images: ${successfulImages} successful, ${totalFailures} failed`
    )
  );
  if (totalFailures > 0) {
    console.warn(
      chalk.yellow(
        `⚠️  ${totalFailures} images failed but have been replaced with informative placeholders`
      )
    );
    console.info(
      chalk.blue(`💡 Check 'image-failures.json' for recovery information`)
    );
  }

  // Log performance metrics for skip optimizations
  logProcessingMetrics(metrics);

  return {
    markdown: processedMarkdown,
    stats: {
      successfulImages,
      totalFailures,
      totalSaved,
    },
    metrics,
  };
}

/**
 * Validates final markdown for remaining S3 URLs and attempts to fix them.
 * This acts as a safety net for images missed by the initial pass or re-introduced
 * by subsequent processing (e.g. callouts).
 *
 * @param markdown - The final markdown content to check
 * @param safeFilename - Safe filename for logging
 * @returns The processed markdown (potentially with fixes applied)
 */
export async function validateAndFixRemainingImages(
  markdown: string,
  safeFilename: string
): Promise<string> {
  // Regex for AWS S3 URLs in markdown image syntax
  // Matches: ![alt](https://prod-files-secure.s3...amazonaws.com/...)
  const s3Regex =
    /!\[.*?\]\((https:\/\/prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com\/[^\)]+)\)/;

  if (!s3Regex.test(markdown)) {
    return markdown;
  }

  console.warn(
    chalk.yellow(
      `⚠️  Found AWS S3 URLs in final markdown for ${safeFilename}. Running final replacement pass...`
    )
  );

  // Re-run processAndReplaceImages
  const result = await processAndReplaceImages(markdown, safeFilename);

  // Check if any remain (indicating persistent failure)
  if (s3Regex.test(result.markdown)) {
    console.warn(
      chalk.red(
        `❌ Failed to replace all S3 URLs in final pass for ${safeFilename}. Some images may expire.`
      )
    );
  } else {
    console.info(
      chalk.green(`✅ Successfully fixed remaining S3 URLs in ${safeFilename}`)
    );
  }

  return result.markdown;
}
