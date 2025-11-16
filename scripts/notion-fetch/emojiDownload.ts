/**
 * Emoji Download Module
 *
 * Handles emoji URL validation, image content validation,
 * downloading emojis with retry logic, and error handling.
 */

import fs from "node:fs";
import axios from "axios";
import chalk from "chalk";
import SpinnerManager from "./spinnerManager.js";
import {
  compressImageToFileWithFallback,
  isResizableFormat,
  detectFormatFromBuffer,
  extForFormat,
} from "./utils.js";
import type { EmojiFile } from "./emojiCache.js";
import { validatePath, generateFilename, generateHash } from "./emojiCache.js";

export interface EmojiProcessingResult {
  newPath: string;
  savedBytes: number;
  reused: boolean;
}

export interface EmojiProcessorConfig {
  emojiPath: string;
  cacheFile: string;
  maxEmojiSize: number;
  maxConcurrentDownloads: number;
  downloadTimeout: number;
  maxEmojisPerPage: number;
  enableProcessing: boolean;
  allowedHosts: string[];
}

interface ImageMagicNumbers {
  [key: string]: number[][];
}

const IMAGE_MAGIC_NUMBERS: ImageMagicNumbers = {
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  gif: [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  webp: [[0x52, 0x49, 0x46, 0x46]],
  svg: [
    [0x3c, 0x3f, 0x78, 0x6d, 0x6c],
    [0x3c, 0x73, 0x76, 0x67],
  ],
};

/**
 * Type guard for Node.js errors with code property
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Validate emoji URL for security
 */
export function validateEmojiUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    const { hostname, pathname } = parsed;

    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    // Must be from allowed hosts
    const isAllowedHost = allowedHosts.some((host) => hostname.endsWith(host));

    if (!isAllowedHost) {
      return false;
    }

    // Path validation - must be valid emoji/icon path with image extension
    const hasImageExtension = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(pathname);

    // Allow paths that contain 'emoji' (generic emoji URLs)
    const hasEmojiInPath = pathname.includes("emoji");

    // Allow Notion static URLs (for custom emojis from Notion)
    const isNotionStaticUrl =
      hostname.includes("notion-static.com") ||
      pathname.includes("notion-static.com");

    // Allow icon files (common pattern for Notion custom emojis)
    const isIconFile = /\/icon-[^\/]*\.(png|jpg|jpeg|gif|svg|webp)$/i.test(
      pathname
    );

    const isValidPath = hasEmojiInPath || isNotionStaticUrl || isIconFile;

    return isValidPath && hasImageExtension;
  } catch {
    return false;
  }
}

/**
 * Validate image content using magic numbers
 */
export function validateImageContent(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }

  // Check magic numbers for supported formats
  for (const [_format, magicNumbers] of Object.entries(IMAGE_MAGIC_NUMBERS)) {
    for (const magic of magicNumbers) {
      if (magic.length <= buffer.length) {
        // eslint-disable-next-line security/detect-object-injection -- index is from validated array iteration
        const matches = magic.every((byte, index) => buffer[index] === byte);
        if (matches) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Format error messages consistently
 */
export function formatError(
  operation: string,
  url: string,
  error: any
): string {
  const message = error?.message || String(error);
  return `${operation} failed for emoji: ${url} - ${message}`;
}

/**
 * Download and process a custom emoji
 */
export async function processEmoji(
  url: string,
  pageId: string,
  config: EmojiProcessorConfig,
  emojiCache: Map<string, EmojiFile>,
  saveCache: () => Promise<void>
): Promise<EmojiProcessingResult> {
  // Check if processing is enabled
  if (!config.enableProcessing) {
    return {
      newPath: url,
      savedBytes: 0,
      reused: false,
    };
  }

  // Validate URL first
  if (!validateEmojiUrl(url, config.allowedHosts)) {
    console.warn(chalk.yellow(`⚠️  Invalid emoji URL: ${url}`));
    return {
      newPath: url, // Fallback to original URL
      savedBytes: 0,
      reused: false,
    };
  }

  // Check if emoji is already cached
  const cached = emojiCache.get(url);
  if (cached) {
    try {
      const cachedPath = validatePath(config.emojiPath, cached.filename);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path validated by validatePath()
      if (fs.existsSync(cachedPath)) {
        const baseUrl = process.env.BASE_URL || "/";
        const basePath = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        return {
          newPath: `${basePath}/images/emojis/${cached.filename}`,
          savedBytes: 0,
          reused: true,
        };
      }
    } catch (error) {
      console.warn(
        chalk.yellow(`⚠️  Invalid cached file path: ${cached.filename}`)
      );
    }
  }

  const spinner = SpinnerManager.create(
    `Processing emoji for page ${pageId}`,
    config.downloadTimeout + 10000
  );

  try {
    spinner.text = `Downloading emoji: ${url}`;

    // Download emoji with configurable timeout
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: config.downloadTimeout,
      maxRedirects: 3,
      maxContentLength: config.maxEmojiSize,
      headers: {
        "User-Agent": "notion-emoji-fetch/1.0",
      },
    });

    const originalBuffer = Buffer.from(response.data, "binary");

    // Validate file size
    if (originalBuffer.length > config.maxEmojiSize) {
      throw new Error(
        `File too large: ${originalBuffer.length} bytes (max: ${config.maxEmojiSize})`
      );
    }

    // Validate content using magic numbers
    if (!validateImageContent(originalBuffer)) {
      throw new Error("Invalid image format - content validation failed");
    }

    // Detect format
    const bufferFormat = detectFormatFromBuffer(originalBuffer);
    const extension = extForFormat(bufferFormat) || ".png";

    // Generate filename with hash for deduplication
    const filename = generateFilename(url, originalBuffer, extension);
    const filePath = validatePath(config.emojiPath, filename);

    // Check if file with same content already exists (content-based deduplication)
    const hash = generateHash(originalBuffer);
    const existingEntry = Array.from(emojiCache.entries()).find(
      ([, info]) => info.hash === hash
    );

    if (existingEntry) {
      try {
        const existingPath = validatePath(
          config.emojiPath,
          existingEntry[1].filename
        );
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path validated by validatePath()
        if (fs.existsSync(existingPath)) {
          // Update cache with new URL pointing to existing file
          emojiCache.set(url, existingEntry[1]);
          await saveCache();

          spinner.succeed(
            chalk.green(
              `Emoji reused (content match): ${existingEntry[1].filename}`
            )
          );
          const baseUrl = process.env.BASE_URL || "/";
          const basePath = baseUrl.endsWith("/")
            ? baseUrl.slice(0, -1)
            : baseUrl;
          return {
            newPath: `${basePath}/images/emojis/${existingEntry[1].filename}`,
            savedBytes: 0,
            reused: true,
          };
        }
      } catch (error) {
        console.warn(
          chalk.yellow(
            `⚠️  Invalid existing entry path: ${existingEntry[1].filename}`
          )
        );
      }
    }

    spinner.text = `Processing emoji: ${filename}`;

    // For emoji, we usually want to preserve original quality but may compress
    let processedBuffer = originalBuffer;
    const originalSize = originalBuffer.length;

    // Only resize if it's a very large emoji (>1MB) and it's a resizable format
    if (originalSize > 1024 * 1024 && isResizableFormat(bufferFormat)) {
      spinner.text = `Resizing large emoji: ${filename}`;
      // We don't resize emojis typically, but we can compress them
    }

    // Compress/optimize the emoji
    spinner.text = `Optimizing emoji: ${filename}`;
    const { finalSize, usedFallback } = await compressImageToFileWithFallback(
      originalBuffer,
      processedBuffer,
      filePath,
      url
    );

    // Store in cache
    const emojiFile: EmojiFile = {
      url,
      filename,
      localPath: filePath,
      hash,
      size: finalSize,
    };

    emojiCache.set(url, emojiFile);
    await saveCache();

    const savedBytes = usedFallback ? 0 : Math.max(0, originalSize - finalSize);

    spinner.succeed(
      usedFallback
        ? chalk.green(`Emoji saved (uncompressed): ${filename}`)
        : chalk.green(`Emoji processed and saved: ${filename}`)
    );

    const baseUrl = process.env.BASE_URL || "/";
    const basePath = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return {
      newPath: `${basePath}/images/emojis/${filename}`,
      savedBytes,
      reused: false,
    };
  } catch (error: unknown) {
    let operation = "Processing emoji";

    // Use type guard for error checking
    if (isNodeError(error)) {
      if (error.code === "ECONNABORTED") {
        operation = "Download timeout";
      } else if (error.code === "ENOTFOUND") {
        operation = "DNS resolution";
      }
    } else if (
      typeof error === "object" &&
      error !== null &&
      "response" in error
    ) {
      const httpError = error as { response?: { status?: number } };
      if (httpError.response?.status) {
        operation = `HTTP ${httpError.response.status}`;
      }
    }

    // Check error message safely
    const errorMessage =
      error instanceof Error && error.message ? error.message : String(error);

    if (errorMessage.includes("too large")) {
      operation = "File size validation";
    } else if (errorMessage.includes("validation failed")) {
      operation = "Content validation";
    }

    const formattedError = formatError(operation, url, error);
    spinner.fail(chalk.red(formattedError));
    console.error(chalk.red("Emoji processing error details:"), error);

    // For emojis, we can be more lenient and continue with a fallback
    // Return a placeholder or the original URL
    return {
      newPath: url, // Keep original URL as fallback
      savedBytes: 0,
      reused: false,
    };
  } finally {
    SpinnerManager.remove(spinner);
  }
}
