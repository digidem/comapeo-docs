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
import { writeFileSync } from "node:fs";
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

const DEBUG_S3_IMAGES =
  (process.env.DEBUG_S3_IMAGES ?? "").toLowerCase() === "true";

const LARGE_MARKDOWN_THRESHOLD = 700_000;

function debugS3(message: string): void {
  if (DEBUG_S3_IMAGES) {
    console.log(chalk.magenta(`[s3-debug] ${message}`));
  }
}

/**
 * Extracts all image matches from markdown content
 *
 * Uses an improved regex pattern that:
 * - Matches until ')' not preceded by '\'
 * - Allows spaces (trimmed)
 * - Handles escaped parentheses in URLs
 *
 * @param sourceMarkdown - Source markdown content
 * @returns Array of image matches with position information
 */
export function extractImageMatches(sourceMarkdown: string): ImageMatch[] {
  if (DEBUG_S3_IMAGES) {
    debugS3(
      `extractImageMatches called with type: ${typeof sourceMarkdown}, length: ${sourceMarkdown?.length ?? 0}`
    );
    if (typeof sourceMarkdown !== "string") {
      debugS3(
        `WARNING: sourceMarkdown is not a string! It's a ${typeof sourceMarkdown}`
      );
    }
  }

  const plainString = String(sourceMarkdown);

  if (DEBUG_S3_IMAGES && sourceMarkdown.length !== plainString.length) {
    debugS3(
      `WARNING: String() conversion changed length from ${sourceMarkdown.length} to ${plainString.length}`
    );
  }

  const imageMatches: ImageMatch[] = [];
  let tmpIndex = 0;
  let safetyCounter = 0;
  let m: RegExpExecArray | null;

  const hyperlinkedImgRegex =
    /\[!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;

  while ((m = hyperlinkedImgRegex.exec(plainString)) !== null) {
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

  const imgRegex = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;

  if (DEBUG_S3_IMAGES && plainString.length > LARGE_MARKDOWN_THRESHOLD) {
    debugS3(
      `About to execute regex on ${plainString.length} chars, regex pattern: ${imgRegex.source}`
    );

    try {
      writeFileSync("/tmp/test-regex-input.md", plainString, "utf-8");
      debugS3(`Saved actual input to /tmp/test-regex-input.md`);
    } catch (e) {
      debugS3(`Failed to save debug file: ${e}`);
    }

    const imagePos = plainString.indexOf("![");
    if (imagePos >= 0) {
      debugS3(`Found image marker at position ${imagePos}`);
      debugS3(
        `Context around image marker: "${plainString.substring(imagePos, imagePos + 100)}"`
      );
    }
    const testRegex = /!\[([^\]]*)\]/g;
    const testMatch = testRegex.exec(plainString);
    debugS3(
      `Manual regex test (just the ![...] part): ${testMatch ? "MATCH" : "NO MATCH"}`
    );
    if (testMatch) {
      debugS3(
        `  Match found at position ${testMatch.index}, alt text: "${testMatch[1]}"`
      );
    }
  }

  if (DEBUG_S3_IMAGES && plainString.length > LARGE_MARKDOWN_THRESHOLD) {
    debugS3(`Testing alternative matching methods...`);
    const matchAllTest = Array.from(plainString.matchAll(imgRegex));
    debugS3(`matchAll() found ${matchAllTest.length} matches`);
    if (matchAllTest.length > 0) {
      debugS3(
        `First matchAll result: alt="${matchAllTest[0][1]}", url start="${matchAllTest[0][2].substring(0, 50)}"`
      );
    }
  }

  while ((m = imgRegex.exec(plainString)) !== null) {
    if (DEBUG_S3_IMAGES && plainString.length > LARGE_MARKDOWN_THRESHOLD) {
      debugS3(
        `Found match #${tmpIndex + 1}: alt="${m[1]}", url start="${m[2].substring(0, 50)}"`
      );
    }
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

  const shouldAugmentWithManual =
    plainString.length > LARGE_MARKDOWN_THRESHOLD &&
    plainString.includes("![") &&
    imageMatches.length < SAFETY_LIMIT;

  if (shouldAugmentWithManual) {
    debugS3(`⚠️  Bun regex bug detected! Falling back to manual parsing...`);
    const remainingCapacity = SAFETY_LIMIT - imageMatches.length;
    if (remainingCapacity > 0) {
      const existingStarts = new Set<number>();
      for (const match of imageMatches) {
        existingStarts.add(match.start);
      }
      const { matches: manualMatches, nextIndex } = extractImagesManually(
        plainString,
        tmpIndex,
        existingStarts,
        remainingCapacity
      );

      if (manualMatches.length > 0) {
        if (DEBUG_S3_IMAGES) {
          debugS3(
            `⚠️  Manual parsing fallback added ${manualMatches.length} image match(es)`
          );
        }
        imageMatches.push(...manualMatches);
        tmpIndex = nextIndex;
      }
    }
  }

  if (imageMatches.length > 1) {
    imageMatches.sort((a, b) => a.start - b.start);
    imageMatches.forEach((match, index) => {
      match.idx = index;
    });
  }

  if (DEBUG_S3_IMAGES && plainString.length > LARGE_MARKDOWN_THRESHOLD) {
    debugS3(
      `extractImageMatches returning ${imageMatches.length} matches after ${safetyCounter} iterations`
    );
  }

  return imageMatches;
}

function findClosingParenIndex(source: string, startIndex: number): number {
  let escaped = false;
  for (let i = startIndex; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (char === ")" && !escaped) {
      return i;
    }
    escaped = false;
  }
  return -1;
}

function extractImagesManually(
  source: string,
  startingIndex: number,
  existingStarts: Set<number>,
  remainingCapacity: number
): { matches: ImageMatch[]; nextIndex: number } {
  const matches: ImageMatch[] = [];
  let nextIndex = startingIndex;
  let position = 0;

  while (position < source.length && matches.length < remainingCapacity) {
    const imageStart = source.indexOf("![", position);
    if (imageStart === -1) break;

    const altEnd = source.indexOf("]", imageStart + 2);
    if (altEnd === -1) break;

    const urlStart = source.indexOf("(", altEnd);
    if (urlStart === -1 || urlStart !== altEnd + 1) {
      position = imageStart + 2;
      continue;
    }

    const urlEnd = findClosingParenIndex(source, urlStart + 1);
    if (urlEnd === -1) break;

    if (!existingStarts.has(imageStart)) {
      const rawUrl = source.substring(urlStart + 1, urlEnd).trim();
      const unescapedUrl = rawUrl.replace(/\\\)/g, ")");
      const full = source.substring(imageStart, urlEnd + 1);

      matches.push({
        full,
        url: unescapedUrl,
        alt: source.substring(imageStart + 2, altEnd),
        idx: nextIndex++,
        start: imageStart,
        end: urlEnd + 1,
      });
      existingStarts.add(imageStart);
    }

    position = urlEnd + 1;
  }

  return { matches, nextIndex };
}

function extractHtmlImageMatches(
  sourceMarkdown: string,
  startIndex: number
): ImageMatch[] {
  const htmlMatches: ImageMatch[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  let idx = startIndex;

  while ((match = imgRegex.exec(sourceMarkdown)) !== null) {
    const full = match[0];
    const url = match[1];
    const altMatch = full.match(/alt=["']([^"']*)["']/i);
    htmlMatches.push({
      full,
      url,
      alt: altMatch?.[1] ?? "",
      idx: idx++,
      start: match.index,
      end: match.index + full.length,
    });
  }

  return htmlMatches;
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
  if (DEBUG_S3_IMAGES) {
    const s3Count = imageMatches.filter((match) =>
      isExpiringS3Url(match.url)
    ).length;
    debugS3(
      `[${safeFilename}] initial markdown image matches: ${imageMatches.length} (S3: ${s3Count})`
    );
  }

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

    // DEBUG: Log validation result for each image
    if (DEBUG_S3_IMAGES) {
      const isS3 = isExpiringS3Url(match.url);
      debugS3(`[${safeFilename}] Image #${match.idx}:`);
      debugS3(`  URL (first 100 chars): ${match.url.substring(0, 100)}`);
      debugS3(`  Is S3 URL: ${isS3}`);
      debugS3(
        `  Validation result: ${urlValidation.isValid ? "VALID" : "INVALID"}`
      );
      if (!urlValidation.isValid) {
        debugS3(`  Validation error: ${urlValidation.error}`);
      }
      if (urlValidation.sanitizedUrl) {
        debugS3(
          `  Sanitized URL starts with 'http': ${urlValidation.sanitizedUrl.startsWith("http")}`
        );
        debugS3(
          `  Sanitized URL (first 100 chars): ${urlValidation.sanitizedUrl.substring(0, 100)}`
        );
      }
    }

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

      if (DEBUG_S3_IMAGES) {
        debugS3(`  -> Categorized as INVALID (validation failed)`);
      }
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

      if (DEBUG_S3_IMAGES) {
        debugS3(
          `  -> Categorized as INVALID (local image - doesn't start with 'http')`
        );
      }
      continue;
    }

    validImages.push({
      match,
      sanitizedUrl: urlValidation.sanitizedUrl!,
    });

    if (DEBUG_S3_IMAGES) {
      debugS3(`  -> Categorized as VALID for processing`);
    }
  }

  // DEBUG: Log categorization summary
  if (DEBUG_S3_IMAGES) {
    const validS3Count = validImages.filter((vi) =>
      isExpiringS3Url(vi.sanitizedUrl)
    ).length;
    const invalidS3Count = invalidResults.filter((ir) =>
      isExpiringS3Url(ir.imageUrl)
    ).length;
    debugS3(`[${safeFilename}] Categorization complete:`);
    debugS3(`  Total images detected: ${imageMatches.length}`);
    debugS3(
      `  Valid images (to be processed): ${validImages.length} (S3: ${validS3Count})`
    );
    debugS3(
      `  Invalid images (skipped): ${invalidResults.length} (S3: ${invalidS3Count})`
    );
    if (validImages.length === 0) {
      debugS3(
        `  WARNING: No images will be processed! All were categorized as invalid.`
      );
    }
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

  // DEBUG: Log replacement summary
  if (DEBUG_S3_IMAGES) {
    debugS3(`[${safeFilename}] Replacement summary:`);
    debugS3(`  Total replacements to apply: ${indexedReplacements.length}`);
    const originalS3Count = imageMatches.filter((m) =>
      isExpiringS3Url(m.url)
    ).length;
    debugS3(`  Original markdown S3 URLs: ${originalS3Count}`);
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

  // DEBUG: Check if S3 URLs remain after replacement
  if (DEBUG_S3_IMAGES) {
    const finalDiagnostics = getImageDiagnostics(processedMarkdown);
    debugS3(`[${safeFilename}] After replacement:`);
    debugS3(`  Final markdown S3 URLs: ${finalDiagnostics.s3Matches}`);
    if (finalDiagnostics.s3Matches > 0) {
      debugS3(`  WARNING: S3 URLs still remain after replacement!`);
      debugS3(
        `  Sample remaining S3 URL: ${finalDiagnostics.s3Samples[0]?.substring(0, 100)}`
      );
    } else {
      debugS3(`  SUCCESS: All S3 URLs have been replaced`);
    }
  }

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
 * Checks if markdown content contains AWS S3 URLs (expiring links).
 *
 * @param content - Markdown content to check
 * @returns true if S3 URLs are found
 */
export function hasS3Urls(content: string): boolean {
  return getImageDiagnostics(content).s3Matches > 0;
}

export interface ImageDiagnostics {
  totalMatches: number;
  markdownMatches: number;
  htmlMatches: number;
  s3Matches: number;
  s3Samples: string[];
}

function isExpiringS3Url(url: string): boolean {
  if (typeof url !== "string") {
    return false;
  }

  const PROD_FILES_S3_REGEX =
    /https:\/\/prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com\//i;
  const SECURE_NOTION_STATIC_S3_REGEX =
    /https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/secure\.notion-static\.com\//i;
  const AMAZON_S3_SIGNED_REGEX =
    /https?:\/\/[\w.-]*amazonaws\.com[^\s)"']*(?:X-Amz-Algorithm|X-Amz-Expires)[^\s)"']*/i;
  const NOTION_IMAGE_PROXY_REGEX =
    /https:\/\/www\.notion\.so\/image\/[^\s)"']+/i;

  return (
    PROD_FILES_S3_REGEX.test(url) ||
    SECURE_NOTION_STATIC_S3_REGEX.test(url) ||
    AMAZON_S3_SIGNED_REGEX.test(url) ||
    NOTION_IMAGE_PROXY_REGEX.test(url)
  );
}

/**
 * Checks if an S3 URL is close to expiring (within threshold seconds).
 * Returns true if:
 * 1. It is an expiring S3 URL
 * 2. It has expiration params (X-Amz-Expires + X-Amz-Date, or Expires)
 * 3. Time until expiration is less than thresholdSeconds
 *
 * @param url - The URL to check
 * @param thresholdSeconds - Threshold in seconds (default: 300 = 5 minutes)
 * @returns boolean
 */
export function isUrlExpiringSoon(
  url: string,
  thresholdSeconds: number = 300
): boolean {
  if (!isExpiringS3Url(url)) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    const now = Date.now();
    const thresholdMs = thresholdSeconds * 1000;

    // Method 1: X-Amz-Expires + X-Amz-Date
    // X-Amz-Date format: YYYYMMDDTHHMMSSZ (ISO-8601 basic format)
    const amzDate = params.get("X-Amz-Date");
    const amzExpires = params.get("X-Amz-Expires");

    if (amzDate && amzExpires) {
      // Parse YYYYMMDDTHHMMSSZ manually to ensure cross-platform consistency
      // and avoid issues with Date.parse on non-standard formats
      const year = parseInt(amzDate.substring(0, 4));
      const month = parseInt(amzDate.substring(4, 6)) - 1; // 0-indexed
      const day = parseInt(amzDate.substring(6, 8));
      const hour = parseInt(amzDate.substring(9, 11));
      const minute = parseInt(amzDate.substring(11, 13));
      const second = parseInt(amzDate.substring(13, 15));

      const signatureTime = new Date(
        Date.UTC(year, month, day, hour, minute, second)
      ).getTime();
      const expirationSeconds = parseInt(amzExpires);
      const expirationTime = signatureTime + expirationSeconds * 1000;
      const timeLeft = expirationTime - now;

      return timeLeft < thresholdMs;
    }

    // Method 2: Expires (Unix timestamp)
    const expires = params.get("Expires");
    if (expires) {
      const expirationTime = parseInt(expires) * 1000;
      const timeLeft = expirationTime - now;
      return timeLeft < thresholdMs;
    }

    // Method 3: Signature param is present but we can't determine expiration
    // If it has Signature/Date but we failed to parse above, it might be expiring.
    // However, without explicit expiration info, we can't be sure it's *soon*.
    // Notion URLs usually follow Method 1 or 2.
    // If we assume all signed URLs expire in 1 hour (common default), we might guess,
    // but better to be conservative and rely on explicit params.
  } catch (e) {
    // If URL parsing fails, logic safely falls through to return false
    // (assume valid or effectively infinite if we can't parse expiration)
  }

  return false;
}

export function getImageDiagnostics(content: string): ImageDiagnostics {
  const source = content || "";
  const markdownMatches = extractImageMatches(source);
  const htmlMatches = extractHtmlImageMatches(source, markdownMatches.length);
  const allMatches = [...markdownMatches, ...htmlMatches];
  const s3Matches = allMatches.filter((match) => isExpiringS3Url(match.url));

  return {
    totalMatches: allMatches.length,
    markdownMatches: markdownMatches.length,
    htmlMatches: htmlMatches.length,
    s3Matches: s3Matches.length,
    s3Samples: s3Matches.slice(0, 5).map((match) => match.url),
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
  const diagnostics = getImageDiagnostics(markdown);
  if (diagnostics.s3Matches === 0) {
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
  if (hasS3Urls(result.markdown)) {
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
