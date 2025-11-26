import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import axios from "axios";
import chalk from "chalk";
import sharp from "sharp";
import { processImage } from "./imageProcessor";
import {
  compressImageToFileWithFallback,
  detectFormatFromBuffer,
  formatFromContentType,
  chooseFormat,
  extForFormat,
  isResizableFormat,
  type ImgFormat,
} from "./utils";
import SpinnerManager from "./spinnerManager";
import {
  validateAndSanitizeImageUrl,
  createFallbackImageMarkdown,
} from "./imageValidation";
import { withTimeout, TimeoutError } from "./timeoutUtils";

/**
 * Check if image buffer contains optimization markers indicating it's already optimized
 * Works across different image formats (PNG, JPEG, WebP, etc.)
 */
function hasOptimizationMarkers(buffer: Buffer, format: ImgFormat): boolean {
  const markers = [
    "pngquant", // pngquant optimizer
    "OptiPNG", // OptiPNG optimizer
    "ImageOptim", // ImageOptim
    "TinyPNG", // TinyPNG service
    "pngcrush", // pngcrush optimizer
    "mozjpeg", // MozJPEG optimizer
    "jpegoptim", // jpegoptim
    "libjpeg-turbo", // libjpeg-turbo
  ];

  // Convert buffer to string for searching (check first 4KB for performance)
  const header = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));

  return markers.some((marker) => header.includes(marker));
}

/**
 * Detect PNG bit depth from IHDR chunk
 * Returns bit depth (1, 2, 4, 8, 16) or null if not found
 */
function detectPngBitDepth(buffer: Buffer): number | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 30) return null;
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return null;
  }

  // IHDR chunk starts at byte 8
  // Chunk structure: 4 bytes length, 4 bytes type, N bytes data, 4 bytes CRC
  // IHDR type: 49 48 44 52 ("IHDR")
  if (
    buffer[12] === 0x49 &&
    buffer[13] === 0x48 &&
    buffer[14] === 0x44 &&
    buffer[15] === 0x52
  ) {
    // Bit depth is at offset 24 (8 + 4 + 4 + 4 + 4)
    // Width (4 bytes) + Height (4 bytes) + Bit depth (1 byte)
    return buffer[24];
  }

  return null;
}

/**
 * Determine if image should skip compression based on heuristics
 * Returns reason string if should skip, null if should attempt compression
 */
function shouldSkipOptimization(
  buffer: Buffer,
  format: ImgFormat
): string | null {
  // Check for optimization markers
  if (hasOptimizationMarkers(buffer, format)) {
    return "already optimized (contains optimizer markers)";
  }

  // PNG-specific checks
  if (format === "png") {
    // Check bit depth - low bit depth images are typically already optimized
    const bitDepth = detectPngBitDepth(buffer);
    if (bitDepth !== null && bitDepth <= 4) {
      return `already optimized (low bit depth: ${bitDepth}-bit)`;
    }
  }

  return null; // Should attempt compression
}

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const IMAGES_PATH = path.join(__dirname, "../../static/images/");

/**

 * Performance metrics for image processing skip optimizations

 */
export interface ImageProcessingMetrics {
  totalProcessed: number;
  skippedSmallSize: number;
  skippedAlreadyOptimized: number;
  skippedResize: number;
  fullyProcessed: number;
}

/**
 * Create a new metrics object for per-call tracking
 * Use this to avoid race conditions in parallel processing
 */
export function createProcessingMetrics(): ImageProcessingMetrics {
  return {
    totalProcessed: 0,
    skippedSmallSize: 0,
    skippedAlreadyOptimized: 0,
    skippedResize: 0,
    fullyProcessed: 0,
  };
}

// Legacy shared metrics for backward compatibility
const processingMetrics: ImageProcessingMetrics = createProcessingMetrics();

/**
 * Get current processing metrics
 * @deprecated Use createProcessingMetrics() for per-call metrics instead
 */
export function getProcessingMetrics(): ImageProcessingMetrics {
  return { ...processingMetrics };
}

/**
 * Reset processing metrics (useful for testing)
 * @deprecated Use createProcessingMetrics() for per-call metrics instead
 */
export function resetProcessingMetrics(): void {
  processingMetrics.totalProcessed = 0;
  processingMetrics.skippedSmallSize = 0;
  processingMetrics.skippedAlreadyOptimized = 0;
  processingMetrics.skippedResize = 0;
  processingMetrics.fullyProcessed = 0;
}

/**
 * Log processing metrics summary
 * @param metrics - Optional metrics object to log. If not provided, uses legacy shared metrics.
 */
export function logProcessingMetrics(
  metrics: ImageProcessingMetrics = processingMetrics
): void {
  const total = metrics.totalProcessed;
  if (total === 0) return;

  const skippedTotal =
    metrics.skippedSmallSize + metrics.skippedAlreadyOptimized;
  const skipRate = ((skippedTotal / total) * 100).toFixed(1);

  console.info(
    chalk.blue(
      `\n📊 Image Processing Performance Metrics:\n` +
        `   Total images: ${total}\n` +
        `   Skipped (small size): ${metrics.skippedSmallSize} (${((metrics.skippedSmallSize / total) * 100).toFixed(1)}%)\n` +
        `   Skipped (already optimized): ${metrics.skippedAlreadyOptimized} (${((metrics.skippedAlreadyOptimized / total) * 100).toFixed(1)}%)\n` +
        `   Resize skipped: ${metrics.skippedResize} (${((metrics.skippedResize / total) * 100).toFixed(1)}%)\n` +
        `   Fully processed: ${metrics.fullyProcessed} (${((metrics.fullyProcessed / total) * 100).toFixed(1)}%)\n` +
        `   Overall skip rate: ${skipRate}%`
    )
  );
}

/**
 * Result of image processing operation
 */
export interface ImageProcessingResult {
  success: boolean;
  newPath?: string;
  savedBytes?: number;
  error?: string;
  fallbackUsed?: boolean;
}

/**
 * Image cache entry structure
 */
export interface ImageCacheEntry {
  url: string;
  localPath: string;
  timestamp: string;
  blockName: string;
  checksum?: string;
  /** Notion's last_edited_time for freshness checking */
  notionLastEdited?: string;
}

/** Default TTL for cache entries without notionLastEdited (30 days in ms) */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Enhanced image processing with comprehensive fallback handling
 *
 * @param imageUrl - URL of the image to process
 * @param blockName - Name of the block containing the image
 * @param index - Index of the image in the block
 * @param originalMarkdown - Original markdown content (for fallback)
 * @returns Processing result with success status and optional new path
 */
export async function processImageWithFallbacks(
  imageUrl: string,
  blockName: string,
  index: number,
  originalMarkdown: string,
  metrics: ImageProcessingMetrics = processingMetrics
): Promise<ImageProcessingResult> {
  // Step 1: Validate URL
  const validation = validateAndSanitizeImageUrl(imageUrl);
  if (!validation.isValid) {
    console.warn(
      chalk.yellow(
        `⚠️  Invalid image URL for image ${index + 1}: ${validation.error}`
      )
    );
    return {
      success: false,
      error: validation.error,
      fallbackUsed: true,
    };
  }

  // Step 2: Attempt download with caching and retries
  try {
    const result = await downloadAndProcessImageWithCache(
      validation.sanitizedUrl!,
      blockName,
      index,
      metrics
    );
    return {
      success: true,
      newPath: result.newPath,
      savedBytes: result.savedBytes,
      fallbackUsed: false,
    };
  } catch (err: unknown) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as any).message)
        : String(err ?? "Unknown error");
    console.warn(
      chalk.yellow(`⚠️  Image download failed for ${imageUrl}: ${message}`)
    );

    const logEntry = {
      timestamp: new Date().toISOString(),
      pageBlock: blockName,
      imageIndex: index,
      originalUrl: imageUrl,
      error: message,
      fallbackUsed: true,
    };

    logImageFailure(logEntry);

    return {
      success: false,
      error: message,
      fallbackUsed: true,
    };
  }
}

/**
 * Logs image failures for manual recovery
 * Note: Fire-and-forget async to avoid blocking image processing
 * IMPORTANT: Disabled in CI environments to prevent script hanging due to
 * synchronous file I/O blocking in GitHub Actions. Console logs provide
 * sufficient debugging information for CI runs.
 *
 * @param logEntry - Log entry containing failure details
 */
export function logImageFailure(logEntry: any): void {
  // Skip logging in CI to prevent hanging due to sync I/O blocking
  // CI environments like GitHub Actions have I/O limitations that cause
  // synchronous file operations to block the event loop indefinitely
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    // Console output is still available in CI logs
    return;
  }

  const logPath = path.join(process.cwd(), "image-failures.json");
  const logDir = path.dirname(logPath);
  const tmpPath = `${logPath}.tmp`;
  const MAX_ENTRIES = 5000;
  const MAX_FIELD_LEN = 2000;

  // Run async but don't wait for completion
  (async () => {
    const safeEntry = (() => {
      try {
        const clone: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(logEntry ?? {})) {
          let val = v;
          if (typeof val === "string") val = val.slice(0, MAX_FIELD_LEN);
          else if (typeof val === "object")
            val = JSON.parse(JSON.stringify(val));
          clone[k] = val;
        }
        return clone;
      } catch {
        return { message: "non-serializable log entry" };
      }
    })();

    try {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch {
        // ignore
      }

      let existingLogs: any[] = [];
      try {
        if (fs.existsSync(logPath)) {
          const content = fs.readFileSync(logPath, "utf-8");
          const parsed = JSON.parse(content);
          existingLogs = Array.isArray(parsed) ? parsed : [];
        }
      } catch {
        existingLogs = [];
      }
      existingLogs.push(safeEntry);
      if (existingLogs.length > MAX_ENTRIES) {
        existingLogs = existingLogs.slice(-MAX_ENTRIES);
      }

      const payload = JSON.stringify(existingLogs, null, 2);
      try {
        fs.writeFileSync(tmpPath, payload);
        fs.renameSync(tmpPath, logPath);
      } catch {
        console.warn(
          chalk.yellow("Failed to write image failure log atomically")
        );
        try {
          fs.writeFileSync(logPath, payload);
        } catch {
          console.warn(chalk.yellow("Failed to write image failure log"));
        }
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // best-effort cleanup
        }
      }
    } catch (e) {
      console.warn(chalk.yellow("Image failure log write error"), e);
    }
  })().catch(() => {
    // Silently ignore errors to prevent unhandled promise rejections
  });
}

/**
 * Image cache system to prevent re-downloading and provide recovery options
 */
/**
 * Lazy-loading image cache using per-entry files.
 *
 * Instead of loading the entire cache at startup, each entry is stored
 * as a separate JSON file in `.cache/images/[md5hash].json`.
 *
 * Benefits:
 * - Instant startup (no bulk loading)
 * - Lower memory footprint (only load entries as needed)
 * - Atomic operations (file-per-entry is naturally safe for concurrency)
 */
export class ImageCache {
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.join(process.cwd(), ".cache", "images");
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  /**
   * Hash URL to create a cache filename
   */
  private hashUrl(url: string): string {
    return createHash("md5").update(url).digest("hex");
  }

  /**
   * Get the cache file path for a URL
   */
  private getCachePath(url: string): string {
    const hash = this.hashUrl(url);
    return path.join(this.cacheDir, `${hash}.json`);
  }

  private getAbsoluteImagePath(fileNameOrWebPath: string): string {
    const baseName = path.basename(fileNameOrWebPath || "");
    // reject suspicious names
    if (!baseName || baseName.includes("..") || baseName.includes(path.sep)) {
      return path.join(IMAGES_PATH, "_invalid-image-name_");
    }
    return path.join(IMAGES_PATH, baseName);
  }

  /**
   * Check if a valid cache entry exists for the URL
   * @param url - The image URL
   * @param notionLastEdited - Optional Notion last_edited_time for freshness check
   */
  has(url: string, notionLastEdited?: string): boolean {
    const cachePath = this.getCachePath(url);

    if (!fs.existsSync(cachePath)) return false;

    try {
      const content = fs.readFileSync(cachePath, "utf-8");
      const entry = JSON.parse(content) as ImageCacheEntry;
      const fullPath = this.getAbsoluteImagePath(entry.localPath);

      // Check if image file exists
      if (!fs.existsSync(fullPath)) return false;

      // Check freshness if notionLastEdited is provided
      if (notionLastEdited && entry.notionLastEdited) {
        const cacheTime = new Date(entry.notionLastEdited).getTime();
        const notionTime = new Date(notionLastEdited).getTime();

        // Content is stale if Notion was edited after cache was created
        if (notionTime > cacheTime) {
          // Delete stale cache entry
          try {
            fs.unlinkSync(cachePath);
          } catch {
            // Ignore deletion errors
          }
          return false;
        }
      } else if (!entry.notionLastEdited) {
        // No notionLastEdited - use TTL fallback
        const cacheAge = Date.now() - new Date(entry.timestamp).getTime();
        if (cacheAge > CACHE_TTL_MS) {
          // Cache entry is too old
          try {
            fs.unlinkSync(cachePath);
          } catch {
            // Ignore deletion errors
          }
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  get(url: string): ImageCacheEntry | undefined {
    const cachePath = this.getCachePath(url);

    if (!fs.existsSync(cachePath)) return undefined;

    try {
      const content = fs.readFileSync(cachePath, "utf-8");
      const entry = JSON.parse(content) as ImageCacheEntry;

      // Verify the actual image file exists
      const fullPath = this.getAbsoluteImagePath(entry.localPath);
      if (!fs.existsSync(fullPath)) {
        // Clean up orphaned cache entry
        fs.unlinkSync(cachePath);
        return undefined;
      }

      return entry;
    } catch {
      return undefined;
    }
  }

  set(
    url: string,
    localPath: string,
    blockName: string,
    notionLastEdited?: string
  ): void {
    const safeBase = path.basename(localPath || "");
    const entry: ImageCacheEntry = {
      url,
      localPath: safeBase,
      timestamp: new Date().toISOString(),
      blockName,
      notionLastEdited,
    };

    const cachePath = this.getCachePath(url);
    try {
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to save cache entry for ${url}`));
    }
  }

  getStats(): { totalEntries: number; validEntries: number } {
    try {
      const files = fs
        .readdirSync(this.cacheDir)
        .filter((f) => f.endsWith(".json"));
      let validEntries = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.cacheDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const entry = JSON.parse(content) as ImageCacheEntry;
          const fullPath = this.getAbsoluteImagePath(entry.localPath);
          if (fs.existsSync(fullPath)) {
            validEntries++;
          }
        } catch {
          // Skip invalid entries
        }
      }

      return { totalEntries: files.length, validEntries };
    } catch {
      return { totalEntries: 0, validEntries: 0 };
    }
  }

  cleanup(): void {
    try {
      const files = fs
        .readdirSync(this.cacheDir)
        .filter((f) => f.endsWith(".json"));
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const entry = JSON.parse(content) as ImageCacheEntry;
          const fullPath = this.getAbsoluteImagePath(entry.localPath);

          if (!fs.existsSync(fullPath)) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch {
          // Remove invalid cache files
          try {
            fs.unlinkSync(filePath);
            cleanedCount++;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      if (cleanedCount > 0) {
        console.info(
          chalk.blue(`🧹 Cleaned up ${cleanedCount} stale cache entries`)
        );
      }
    } catch (error) {
      console.warn(chalk.yellow("⚠️  Failed to cleanup image cache"));
    }
  }
}

// Global image cache instance
const imageCache = new ImageCache();

/**
 * Enhanced download function with caching
 *
 * @param url - URL of the image to download
 * @param blockName - Name of the block containing the image
 * @param index - Index of the image in the block
 * @param metrics - Optional metrics object for per-call tracking. If not provided, uses legacy shared metrics.
 * @returns Object with newPath, savedBytes, and fromCache flag
 */
export async function downloadAndProcessImageWithCache(
  url: string,
  blockName: string,
  index: number,
  metrics: ImageProcessingMetrics = processingMetrics
): Promise<{ newPath: string; savedBytes: number; fromCache: boolean }> {
  const cachedEntry = imageCache.get(url);
  if (cachedEntry) {
    const fileName = path.basename(cachedEntry.localPath);
    const webPath = `/images/${fileName}`;
    console.info(chalk.green(`💾 Using cached image: ${webPath}`));
    return {
      newPath: webPath,
      savedBytes: 0,
      fromCache: true,
    };
  }

  const result = await downloadAndProcessImage(url, blockName, index, metrics);
  imageCache.set(url, result.newPath, blockName);

  return {
    newPath: result.newPath,
    savedBytes: result.savedBytes,
    fromCache: false,
  };
}

/**
 * Downloads and processes an image with retry logic
 *
 * IMPORTANT: Each attempt has an overall timeout to prevent indefinite hangs.
 * - Download: 30s (axios timeout)
 * - Sharp processing: 30s (withTimeout)
 * - Compression: 45s (withTimeout)
 * - Overall per-attempt limit: 90s (catches any combination of delays)
 *
 * @param url - URL of the image to download
 * @param blockName - Name of the block containing the image
 * @param index - Index of the image in the block
 * @param metrics - Optional metrics object for per-call tracking. If not provided, uses legacy shared metrics.
 * @returns Object with newPath and savedBytes
 * @throws Error if all retry attempts fail
 */
export async function downloadAndProcessImage(
  url: string,
  blockName: string,
  index: number,
  metrics: ImageProcessingMetrics = processingMetrics
): Promise<{ newPath: string; savedBytes: number }> {
  let attempt = 0;
  let lastError: unknown;

  // Track metrics once per URL before retries
  // Increment total here so each URL is only counted once, regardless of retries
  metrics.totalProcessed++;

  // Track the previous attempt's promise and timeout status to prevent race conditions.
  // JavaScript promises are not cancellable - when withTimeout() rejects,
  // the underlying operation keeps running and can still write to disk.
  // We must wait for the timed-out promise to fully settle before starting
  // the next retry, otherwise a slow attempt can overwrite a successful retry.
  let previousAttempt: Promise<any> | null = null;
  let previousTimedOut = false;

  // Overall timeout per attempt: 120 seconds
  // Must be LONGER than sum of individual timeouts to avoid false positives:
  // - Download: 30s (axios timeout)
  // - Sharp resize: 30s (withTimeout in imageProcessor.ts)
  // - Compression: 45s (withTimeout in utils.ts)
  // - Worst case total: 105s
  // - Overall timeout: 120s (safety buffer for legitimate slow images)
  const OVERALL_TIMEOUT_MS = 120000;

  // Grace period for timed-out operations to finish disk writes
  // If the operation is truly deadlocked, we give up after this period
  const GRACE_PERIOD_MS = 30000;

  while (attempt < 3) {
    // Wait for the previous attempt to fully settle (including all disk I/O)
    // before starting a new one. This prevents timed-out attempts from
    // overwriting files written by successful retries.
    //
    // IMPORTANT: If the previous attempt timed out, it might be deadlocked.
    // We give it a grace period to finish disk writes, but if it doesn't
    // complete within that window, we proceed anyway to avoid indefinite blocking.
    if (previousAttempt) {
      if (previousTimedOut) {
        // Previous attempt timed out - might be deadlocked
        // Give it a grace period to finish, but don't wait forever
        await Promise.race([
          previousAttempt.catch(() => {
            // Ignore errors - we just care about completion
          }),
          new Promise((resolve) => setTimeout(resolve, GRACE_PERIOD_MS)),
        ]);
      } else {
        // Previous attempt completed normally (success or non-timeout error)
        // It's already settled, so this returns immediately
        await previousAttempt.catch(() => {
          // Ignore errors - we just need to wait for the promise to settle
        });
      }
      previousAttempt = null;
      previousTimedOut = false;
    }

    const attemptNumber = attempt + 1;

    // Spinner timeout must be longer than operation timeout to avoid premature warnings
    const spinner = SpinnerManager.create(
      `Processing image ${index + 1} (attempt ${attemptNumber}/3)`,
      150000 // 2.5 minutes (longer than 120s operation timeout)
    );

    // Create AbortController for actual request cancellation
    const abortController = new AbortController();

    // Capture the entire async operation so we can track when it fully settles
    const currentAttempt = (async () => {
      spinner.text = `Processing image ${index + 1}: Downloading`;
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxRedirects: 5,
        signal: abortController.signal,
        headers: {
          "User-Agent": "notion-fetch-script/1.0",
        },
      });

      const originalBuffer = Buffer.from(response.data, "binary");
      const cleanUrl = url.split("?")[0];

      const rawCT = (response.headers as Record<string, unknown>)[
        "content-type"
      ];
      const normalizedCT =
        typeof rawCT === "string"
          ? rawCT
          : Array.isArray(rawCT)
            ? rawCT[0]
            : undefined;
      const headerFmt = formatFromContentType(normalizedCT);
      const bufferFmt = detectFormatFromBuffer(originalBuffer);
      const chosenFmt = chooseFormat(bufferFmt, headerFmt);

      const urlExt = (path.extname(cleanUrl) || "").toLowerCase();
      let extension = extForFormat(chosenFmt);
      if (!extension) {
        extension = urlExt || ".jpg";
      }

      const sanitizedBlockName = blockName
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .slice(0, 20);
      const filename = `${sanitizedBlockName}_${index}${extension}`;
      const filepath = path.join(IMAGES_PATH, filename);

      // Phase 1: Skip processing for small images (< 50KB)
      const MIN_SIZE_FOR_PROCESSING = 50 * 1024; // 50KB
      if (originalBuffer.length < MIN_SIZE_FOR_PROCESSING) {
        spinner.text = `Processing image ${index + 1}: Skipping (already small: ${Math.round(originalBuffer.length / 1024)}KB)`;
        fs.writeFileSync(filepath, originalBuffer);
        const imagePath = `/images/${filename}`;

        return {
          filepath,
          imagePath,
          savedBytes: 0,
          usedFallback: false,
          skippedSmallSize: true,
        };
      }

      // Phase 2: Skip processing for already-optimized images
      const skipReason = shouldSkipOptimization(originalBuffer, chosenFmt);
      if (skipReason) {
        spinner.text = `Processing image ${index + 1}: Skipping (${skipReason})`;
        fs.writeFileSync(filepath, originalBuffer);
        const imagePath = `/images/${filename}`;

        return {
          filepath,
          imagePath,
          savedBytes: 0,
          usedFallback: false,
          skippedAlreadyOptimized: true,
        };
      }

      let resizedBuffer = originalBuffer;
      let originalSize = originalBuffer.length;
      let skippedResize = false;

      if (isResizableFormat(chosenFmt)) {
        // Phase 3: Check dimensions before resize - skip if already acceptable
        const maxWidth = 1280;
        try {
          const metadata = await sharp(originalBuffer).metadata();
          if (metadata.width && metadata.width <= maxWidth) {
            skippedResize = true;
            spinner.text = `Processing image ${index + 1}: Skipping resize (dimensions OK: ${metadata.width}x${metadata.height})`;
            resizedBuffer = originalBuffer;
            originalSize = originalBuffer.length;
          } else {
            spinner.text = `Processing image ${index + 1}: Resizing (${metadata.width}x${metadata.height} -> max ${maxWidth}px)`;
            const processed = await processImage(originalBuffer, filepath);
            resizedBuffer = processed.outputBuffer;
            originalSize = processed.originalSize;
          }
        } catch (error) {
          // If metadata reading fails, proceed with resize as fallback
          spinner.text = `Processing image ${index + 1}: Resizing (metadata check failed, proceeding)`;
          const processed = await processImage(originalBuffer, filepath);
          resizedBuffer = processed.outputBuffer;
          originalSize = processed.originalSize;
        }
      } else {
        spinner.text = `Processing image ${index + 1}: Skipping resize for ${chosenFmt || "unknown"} format`;
        resizedBuffer = originalBuffer;
        originalSize = originalBuffer.length;
      }

      spinner.text = `Processing image ${index + 1}: Compressing`;
      const { finalSize, usedFallback } = await compressImageToFileWithFallback(
        originalBuffer,
        resizedBuffer,
        filepath,
        url
      );

      const savedBytes = usedFallback
        ? 0
        : Math.max(0, originalSize - finalSize);
      const imagePath = `/images/${filename}`;

      return {
        filepath,
        imagePath,
        savedBytes,
        usedFallback,
        skippedResize,
        fullyProcessed: true,
      };
    })();

    // Store reference to this attempt for race condition prevention
    previousAttempt = currentAttempt;

    try {
      // Wrap the ENTIRE operation with timeout
      // This ensures we never hang indefinitely even if individual timeouts fail
      const result = await withTimeout(
        currentAttempt,
        OVERALL_TIMEOUT_MS,
        `image ${index + 1} processing`
      );

      spinner.succeed(
        result.usedFallback
          ? chalk.green(
              `Image ${index + 1} saved with fallback (original, unmodified): ${result.filepath}`
            )
          : chalk.green(
              `Image ${index + 1} processed and saved: ${result.filepath}`
            )
      );

      SpinnerManager.remove(spinner);
      abortController.abort(); // Clean up

      // Increment metrics only on successful completion (outside retry loop)
      if (result.skippedSmallSize) {
        metrics.skippedSmallSize++;
      } else if (result.skippedAlreadyOptimized) {
        metrics.skippedAlreadyOptimized++;
      } else if (result.fullyProcessed) {
        metrics.fullyProcessed++;
        if (result.skippedResize) {
          metrics.skippedResize++;
        }
      }

      return {
        newPath: result.imagePath,
        savedBytes: result.savedBytes,
      };
    } catch (error) {
      lastError = error;
      let errorMessage = `Error processing image ${index + 1} from ${url}`;

      if (error instanceof TimeoutError) {
        errorMessage = `Overall timeout (${OVERALL_TIMEOUT_MS}ms) processing image ${index + 1} from ${url}`;
        // Mark that this attempt timed out - the underlying promise might be deadlocked
        previousTimedOut = true;
      } else if ((error as any)?.code === "ECONNABORTED") {
        errorMessage = `Timeout downloading image ${index + 1} from ${url}`;
      } else if ((error as any)?.response) {
        errorMessage = `HTTP ${(error as any).response.status} error for image ${index + 1}: ${url}`;
      } else if ((error as any)?.code === "ENOTFOUND") {
        errorMessage = `DNS resolution failed for image ${index + 1}: ${url}`;
      }

      spinner.fail(chalk.red(`${errorMessage} (attempt ${attemptNumber}/3)`));

      // Only log full error details in verbose mode or non-test environments
      // This reduces noise in test output while preserving debugging capability
      const isTestEnv =
        process.env.NODE_ENV === "test" || process.env.VITEST === "true";
      const isVerbose =
        process.env.VERBOSE === "true" || process.env.DEBUG === "true";

      if (!isTestEnv || isVerbose) {
        console.error(chalk.red("Image processing error details:"), error);
      }

      // Abort the request if it's still in progress
      abortController.abort();

      if (attemptNumber < 3) {
        // Test-environment-aware retry delays
        const baseDelayMs = isTestEnv ? 10 : 1000;
        const jitter = Math.floor(Math.random() * (isTestEnv ? 5 : 250));
        const delayMs =
          Math.min(
            isTestEnv ? 50 : 4000,
            baseDelayMs * 2 ** (attemptNumber - 1)
          ) + jitter;

        console.warn(
          chalk.yellow(
            `Retrying image ${index + 1} in ${delayMs}ms (attempt ${attemptNumber + 1}/3)`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } finally {
      SpinnerManager.remove(spinner);
      // Ensure abort controller is cleaned up
      abortController.abort();
    }

    attempt++;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Unknown image processing error"));
}

/**
 * Get the global image cache instance
 * @returns The global ImageCache instance
 */
export function getImageCache(): ImageCache {
  return imageCache;
}
