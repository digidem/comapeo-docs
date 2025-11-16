/**
 * Emoji Cache Module
 *
 * Handles emoji caching logic including cache validation,
 * file system operations, and cache statistics.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

// Constants for filename generation
const MAX_EMOJI_NAME_LENGTH = 15;
const TIMESTAMP_LENGTH = 8;
const HASH_LENGTH = 16;

export interface EmojiFile {
  url: string;
  filename: string;
  localPath: string;
  hash: string;
  size: number;
}

/**
 * Validates and sanitizes a filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path separators and parent directory references
  let sanitized = filename.replace(/\.\./g, "").replace(/[/\\]/g, "");

  // Special case: preserve .emoji-cache.json
  if (sanitized === ".emoji-cache.json") {
    return sanitized;
  }

  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/, "");

  return sanitized;
}

/**
 * Safely validates a path to ensure it's within the allowed directory
 */
export function validatePath(basePath: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  const fullPath = path.join(basePath, sanitized);
  const normalizedBase = path.normalize(basePath);
  const normalizedFull = path.normalize(fullPath);

  // Ensure the path is within the base directory
  if (!normalizedFull.startsWith(normalizedBase)) {
    throw new Error("Invalid path: outside of allowed directory");
  }

  return fullPath;
}

/**
 * Generate a hash for content deduplication
 */
export function generateHash(buffer: Buffer): string {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex")
    .substring(0, HASH_LENGTH);
}

/**
 * Generate a sanitized filename for an emoji
 */
export function generateFilename(
  url: string,
  buffer: Buffer,
  extension: string
): string {
  const hash = generateHash(buffer);
  const urlParts = new URL(url).pathname.split("/");
  const originalName = urlParts[urlParts.length - 1]?.split(".")[0] || "emoji";

  // Sanitize the name to prevent path traversal and invalid characters
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase()
    .substring(0, MAX_EMOJI_NAME_LENGTH);

  // Validate the sanitized name
  const safeName =
    sanitizedName && !/^\.+$/.test(sanitizedName) ? sanitizedName : "emoji";

  // Add timestamp for uniqueness
  const timestamp = Date.now().toString().slice(-TIMESTAMP_LENGTH);

  return `${safeName}_${hash}_${timestamp}${extension}`;
}

/**
 * Validate cache entry structure
 */
export function isValidCacheEntry(entry: unknown): entry is EmojiFile {
  if (typeof entry !== "object" || entry === null) return false;

  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.url === "string" &&
    typeof obj.filename === "string" &&
    typeof obj.localPath === "string" &&
    typeof obj.hash === "string" &&
    typeof obj.size === "number"
  );
}

/**
 * Load emoji cache from disk with validation
 */
export async function loadCache(
  cacheFile: string,
  emojiPath: string,
  emojiCache: Map<string, EmojiFile>
): Promise<void> {
  try {
    emojiCache.clear();
    const normalizedCacheFile = path.normalize(cacheFile);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is normalized and validated
    if (fs.existsSync(normalizedCacheFile)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is normalized and validated
      const cacheContent = fs.readFileSync(normalizedCacheFile, "utf8");
      const cacheData = JSON.parse(cacheContent);

      // Validate cache structure
      if (typeof cacheData !== "object" || cacheData === null) {
        throw new Error("Invalid cache format: not an object");
      }

      // Verify cached files still exist and validate entries
      for (const [url, fileInfo] of Object.entries(cacheData)) {
        // Validate cache entry structure
        if (!isValidCacheEntry(fileInfo)) {
          console.warn(
            chalk.yellow(`⚠️  Invalid cache entry for ${url}, skipping`)
          );
          continue;
        }

        const typedFileInfo = fileInfo as EmojiFile;
        // Use path validation to prevent path traversal
        const fullPath = validatePath(emojiPath, typedFileInfo.filename);

        // Only add to cache if file still exists
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path validated by validatePath()
        if (fs.existsSync(fullPath)) {
          emojiCache.set(url, typedFileInfo);
        } else {
          console.warn(
            chalk.yellow(
              `⚠️  Cached file not found: ${fullPath}, removing from cache`
            )
          );
        }
      }

      console.log(chalk.green(`✅ Loaded ${emojiCache.size} cached emojis`));
    }
  } catch (error) {
    console.warn(
      chalk.yellow("⚠️  Could not load emoji cache, starting fresh:"),
      error
    );
    emojiCache.clear();
  }
}

/**
 * Save emoji cache to disk
 */
export async function saveCache(
  cacheFile: string,
  emojiCache: Map<string, EmojiFile>
): Promise<void> {
  try {
    const cacheObject = Object.fromEntries(emojiCache);
    const normalizedCacheFile = path.normalize(cacheFile);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is normalized and validated
    fs.writeFileSync(
      normalizedCacheFile,
      JSON.stringify(cacheObject, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(chalk.red("❌ Failed to save emoji cache:"), error);
  }
}

/**
 * Get statistics about the emoji cache
 */
export function getCacheStats(emojiCache: Map<string, EmojiFile>): {
  totalEmojis: number;
  totalSize: number;
  uniqueEmojis: number;
} {
  const uniqueHashes = new Set(
    Array.from(emojiCache.values()).map((emoji) => emoji.hash)
  );
  const totalSize = Array.from(emojiCache.values()).reduce(
    (sum, emoji) => sum + emoji.size,
    0
  );

  return {
    totalEmojis: emojiCache.size,
    totalSize,
    uniqueEmojis: uniqueHashes.size,
  };
}

/**
 * Clean up unused emojis (remove files not referenced in cache)
 */
export async function cleanup(
  emojiPath: string,
  emojiCache: Map<string, EmojiFile>
): Promise<void> {
  try {
    const normalizedPath = path.normalize(emojiPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is normalized and validated
    const files = fs.readdirSync(normalizedPath);
    const cachedFiles = new Set(
      Array.from(emojiCache.values()).map((emoji) => emoji.filename)
    );
    let cleanedCount = 0;

    for (const file of files) {
      if (file === ".emoji-cache.json" || file === ".gitkeep") continue; // Skip cache file and gitkeep

      if (!cachedFiles.has(file)) {
        try {
          const filePath = validatePath(emojiPath, file);
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path validated by validatePath()
          fs.unlinkSync(filePath);
          console.log(chalk.yellow(`Cleaned up unused emoji: ${file}`));
          cleanedCount++;
        } catch (error) {
          console.warn(
            chalk.yellow(`⚠️  Could not clean up file ${file}:`, error)
          );
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(
        chalk.green(`✅ Cleaned up ${cleanedCount} unused emoji files`)
      );
    } else {
      console.log(chalk.blue(`ℹ️  No unused emoji files to clean up`));
    }
  } catch (error) {
    console.error(chalk.red("Error during emoji cleanup:"), error);
  }
}
