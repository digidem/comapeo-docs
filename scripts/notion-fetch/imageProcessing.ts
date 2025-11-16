import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import chalk from "chalk";
import { processImage } from "./imageProcessor";
import {
  compressImageToFileWithFallback,
  detectFormatFromBuffer,
  formatFromContentType,
  chooseFormat,
  extForFormat,
  isResizableFormat,
} from "./utils";
import SpinnerManager from "./spinnerManager";
import {
  validateAndSanitizeImageUrl,
  createFallbackImageMarkdown,
} from "./imageValidation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_PATH = path.join(__dirname, "../../static/images/");

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
}

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
  originalMarkdown: string
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
      index
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
export class ImageCache {
  private cacheFile: string;
  private cache: Map<string, ImageCacheEntry>;

  constructor() {
    this.cacheFile = path.join(process.cwd(), "image-cache.json");
    this.cache = new Map();
    this.loadCache();
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const content = fs.readFileSync(this.cacheFile, "utf-8");
        const cacheData = JSON.parse(content);
        Object.entries(cacheData).forEach(([url, entry]) => {
          this.cache.set(url, entry as ImageCacheEntry);
        });
        console.info(
          chalk.blue(`📦 Loaded image cache with ${this.cache.size} entries`)
        );
      }
    } catch (error) {
      console.warn(
        chalk.yellow("⚠️  Failed to load image cache, starting fresh")
      );
    }
  }

  private saveCache(): void {
    try {
      const cacheData = Object.fromEntries(this.cache);
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn(chalk.yellow("⚠️  Failed to save image cache"));
    }
  }

  private getAbsoluteImagePath(fileNameOrWebPath: string): string {
    const baseName = path.basename(fileNameOrWebPath || "");
    // reject suspicious names
    if (!baseName || baseName.includes("..") || baseName.includes(path.sep)) {
      return path.join(IMAGES_PATH, "_invalid-image-name_");
    }
    return path.join(IMAGES_PATH, baseName);
  }

  has(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) return false;
    const fullPath = this.getAbsoluteImagePath(entry.localPath);
    return fs.existsSync(fullPath);
  }

  get(url: string): ImageCacheEntry | undefined {
    if (this.has(url)) {
      return this.cache.get(url);
    }
    this.cache.delete(url);
    return undefined;
  }

  set(url: string, localPath: string, blockName: string): void {
    const safeBase = path.basename(localPath || "");
    const entry: ImageCacheEntry = {
      url,
      localPath: safeBase,
      timestamp: new Date().toISOString(),
      blockName,
    };
    this.cache.set(url, entry);
    this.saveCache();
  }

  getStats(): { totalEntries: number; validEntries: number } {
    let validEntries = 0;
    for (const [url] of this.cache) {
      if (this.has(url)) validEntries++;
    }
    return { totalEntries: this.cache.size, validEntries };
  }

  cleanup(): void {
    // Remove stale entries where local files no longer exist
    const staleUrls = [];
    for (const [url] of this.cache) {
      if (!this.has(url)) {
        staleUrls.push(url);
      }
    }
    staleUrls.forEach((url) => this.cache.delete(url));
    if (staleUrls.length > 0) {
      this.saveCache();
      console.info(
        chalk.blue(`🧹 Cleaned up ${staleUrls.length} stale cache entries`)
      );
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
 * @returns Object with newPath, savedBytes, and fromCache flag
 */
export async function downloadAndProcessImageWithCache(
  url: string,
  blockName: string,
  index: number
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

  const result = await downloadAndProcessImage(url, blockName, index);
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
 * @param url - URL of the image to download
 * @param blockName - Name of the block containing the image
 * @param index - Index of the image in the block
 * @returns Object with newPath and savedBytes
 * @throws Error if all retry attempts fail
 */
export async function downloadAndProcessImage(
  url: string,
  blockName: string,
  index: number
): Promise<{ newPath: string; savedBytes: number }> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 3) {
    const attemptNumber = attempt + 1;
    const spinner = SpinnerManager.create(
      `Processing image ${index + 1} (attempt ${attemptNumber}/3)`,
      60000
    );

    try {
      spinner.text = `Processing image ${index + 1}: Downloading`;
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxRedirects: 5,
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

      let resizedBuffer = originalBuffer;
      let originalSize = originalBuffer.length;

      if (isResizableFormat(chosenFmt)) {
        spinner.text = `Processing image ${index + 1}: Resizing`;
        const processed = await processImage(originalBuffer, filepath);
        resizedBuffer = processed.outputBuffer;
        originalSize = processed.originalSize;
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

      spinner.succeed(
        usedFallback
          ? chalk.green(
              `Image ${index + 1} saved with fallback (original, unmodified): ${filepath}`
            )
          : chalk.green(`Image ${index + 1} processed and saved: ${filepath}`)
      );

      const savedBytes = usedFallback
        ? 0
        : Math.max(0, originalSize - finalSize);
      const imagePath = `/images/${filename}`;
      return { newPath: imagePath, savedBytes };
    } catch (error) {
      lastError = error;
      let errorMessage = `Error processing image ${index + 1} from ${url}`;

      if ((error as any)?.code === "ECONNABORTED") {
        errorMessage = `Timeout downloading image ${index + 1} from ${url}`;
      } else if ((error as any)?.response) {
        errorMessage = `HTTP ${(error as any).response.status} error for image ${index + 1}: ${url}`;
      } else if ((error as any)?.code === "ENOTFOUND") {
        errorMessage = `DNS resolution failed for image ${index + 1}: ${url}`;
      }

      spinner.fail(chalk.red(`${errorMessage} (attempt ${attemptNumber}/3)`));
      console.error(chalk.red("Image processing error details:"), error);

      if (attemptNumber < 3) {
        // Test-environment-aware retry delays
        // Standardized test environment detection
        const isTestEnv =
          process.env.NODE_ENV === "test" || process.env.VITEST === "true";
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
