import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import chalk from "chalk";
import SpinnerManager from "./spinnerManager.js";
import {
  compressImageToFileWithFallback,
  isResizableFormat,
  detectFormatFromBuffer,
  extForFormat,
} from "./utils.js";

// Constants for emoji processing
const INLINE_EMOJI_STYLE =
  'className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}}';

const MAX_EMOJI_NAME_LENGTH = 15;
const TIMESTAMP_LENGTH = 8;
const HASH_LENGTH = 16;

const normalizeEmojiName = (plainText: string): string =>
  plainText.replace(/:/g, "").trim();

const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildInlineEmoji = (src: string, alt: string): string =>
  `<img src="${src}" alt="${alt}" ${INLINE_EMOJI_STYLE} />`;

/**
 * Type guard for Node.js errors with code property
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Validates and sanitizes a filename to prevent path traversal
 */
function sanitizeFilename(filename: string): string {
  // Remove any path separators and parent directory references
  const sanitized = filename
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "")
    .replace(/^\.+/, "");

  // Ensure the filename doesn't start with a dot (hidden file)
  if (sanitized.startsWith(".") && sanitized !== ".emoji-cache.json") {
    return sanitized.substring(1);
  }

  return sanitized;
}

/**
 * Safely validates a path to ensure it's within the allowed directory
 */
function validatePath(basePath: string, filename: string): string {
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

interface EmojiFile {
  url: string;
  filename: string;
  localPath: string;
  hash: string;
  size: number;
}

interface EmojiProcessingResult {
  newPath: string;
  savedBytes: number;
  reused: boolean;
}

interface EmojiProcessorConfig {
  emojiPath?: string;
  cacheFile?: string;
  maxEmojiSize?: number;
  maxConcurrentDownloads?: number;
  downloadTimeout?: number;
  maxEmojisPerPage?: number;
  enableProcessing?: boolean;
  allowedHosts?: string[];
}

interface EmojiProcessorResetOptions {
  resetConfig?: boolean;
}

interface ImageMagicNumbers {
  [key: string]: number[][];
}

export class EmojiProcessor {
  private static readonly DEFAULT_CONFIG: Required<EmojiProcessorConfig> = {
    emojiPath: path.join(process.cwd(), "static/images/emojis/"),
    cacheFile: path.join(
      process.cwd(),
      "static/images/emojis/.emoji-cache.json"
    ),
    maxEmojiSize: 5 * 1024 * 1024, // 5MB
    maxConcurrentDownloads: 3,
    downloadTimeout: 15000,
    maxEmojisPerPage: 50,
    enableProcessing: true,
    allowedHosts: ["amazonaws.com", "notion.site"],
  };

  private static readonly IMAGE_MAGIC_NUMBERS: ImageMagicNumbers = {
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

  private static config: Required<EmojiProcessorConfig> = {
    ...EmojiProcessor.DEFAULT_CONFIG,
  };
  private static emojiCache: Map<string, EmojiFile> = new Map();
  private static initialized = false;

  /**
   * Configure the emoji processor with custom settings
   */
  static configure(userConfig: EmojiProcessorConfig): void {
    this.config = { ...this.config, ...userConfig };
    this.initialized = false; // Force re-initialization with new config
  }

  /**
   * Initialize the emoji processor by loading the cache and ensuring directories exist
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure emoji directory exists (emojiPath is validated in configure())
    const normalizedPath = path.normalize(this.config.emojiPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is normalized and validated
    fs.mkdirSync(normalizedPath, { recursive: true });

    // Load existing cache
    await this.loadCache();
    this.initialized = true;
  }

  /**
   * Validate emoji URL for security
   */
  private static validateEmojiUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const { hostname, pathname } = parsed;

      // Must be HTTPS
      if (parsed.protocol !== "https:") {
        return false;
      }

      // Must be from allowed hosts
      const isAllowedHost = this.config.allowedHosts.some((host) =>
        hostname.endsWith(host)
      );

      if (!isAllowedHost) {
        return false;
      }

      // Path validation - must be valid emoji/icon path with image extension
      const hasImageExtension = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(
        pathname
      );

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
  private static validateImageContent(buffer: Buffer): boolean {
    if (buffer.length < 8) {
      return false;
    }

    // Check magic numbers for supported formats
    for (const [_format, magicNumbers] of Object.entries(
      this.IMAGE_MAGIC_NUMBERS
    )) {
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
  private static formatError(
    operation: string,
    url: string,
    error: any
  ): string {
    const message = error?.message || String(error);
    return `${operation} failed for emoji: ${url} - ${message}`;
  }

  /**
   * Load emoji cache from disk with validation
   */
  private static async loadCache(): Promise<void> {
    try {
      this.emojiCache.clear();
      const normalizedCacheFile = path.normalize(this.config.cacheFile);

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
          if (!this.isValidCacheEntry(fileInfo)) {
            console.warn(
              chalk.yellow(`⚠️  Invalid cache entry for ${url}, skipping`)
            );
            continue;
          }

          const typedFileInfo = fileInfo as EmojiFile;
          // Use path validation to prevent path traversal
          const fullPath = validatePath(
            this.config.emojiPath,
            typedFileInfo.filename
          );

          // Only add to cache if file still exists
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path validated by validatePath()
          if (fs.existsSync(fullPath)) {
            this.emojiCache.set(url, typedFileInfo);
          } else {
            console.warn(
              chalk.yellow(
                `⚠️  Cached file not found: ${fullPath}, removing from cache`
              )
            );
          }
        }

        console.log(
          chalk.green(`✅ Loaded ${this.emojiCache.size} cached emojis`)
        );
      }
    } catch (error) {
      console.warn(
        chalk.yellow("⚠️  Could not load emoji cache, starting fresh:"),
        error
      );
      this.emojiCache.clear();
    }
  }

  /**
   * Validate cache entry structure
   */
  private static isValidCacheEntry(entry: unknown): entry is EmojiFile {
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
   * Save emoji cache to disk
   */
  private static async saveCache(): Promise<void> {
    try {
      const cacheObject = Object.fromEntries(this.emojiCache);
      const normalizedCacheFile = path.normalize(this.config.cacheFile);
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
   * Generate a hash for content deduplication
   */
  private static generateHash(buffer: Buffer): string {
    return crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex")
      .substring(0, HASH_LENGTH);
  }

  /**
   * Generate a sanitized filename for an emoji
   */
  private static generateFilename(
    url: string,
    buffer: Buffer,
    extension: string
  ): string {
    const hash = this.generateHash(buffer);
    const urlParts = new URL(url).pathname.split("/");
    const originalName =
      urlParts[urlParts.length - 1]?.split(".")[0] || "emoji";

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
   * Download and process a custom emoji
   */
  static async processEmoji(
    url: string,
    pageId: string
  ): Promise<EmojiProcessingResult> {
    await this.initialize();

    // Check if processing is enabled
    if (!this.config.enableProcessing) {
      return {
        newPath: url,
        savedBytes: 0,
        reused: false,
      };
    }

    // Validate URL first
    if (!this.validateEmojiUrl(url)) {
      console.warn(chalk.yellow(`⚠️  Invalid emoji URL: ${url}`));
      return {
        newPath: url, // Fallback to original URL
        savedBytes: 0,
        reused: false,
      };
    }

    // Check if emoji is already cached
    const cached = this.emojiCache.get(url);
    if (cached) {
      try {
        const cachedPath = validatePath(this.config.emojiPath, cached.filename);
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
      this.config.downloadTimeout + 10000
    );

    try {
      spinner.text = `Downloading emoji: ${url}`;

      // Download emoji with configurable timeout
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: this.config.downloadTimeout,
        maxRedirects: 3,
        maxContentLength: this.config.maxEmojiSize,
        headers: {
          "User-Agent": "notion-emoji-fetch/1.0",
        },
      });

      const originalBuffer = Buffer.from(response.data, "binary");

      // Validate file size
      if (originalBuffer.length > this.config.maxEmojiSize) {
        throw new Error(
          `File too large: ${originalBuffer.length} bytes (max: ${this.config.maxEmojiSize})`
        );
      }

      // Validate content using magic numbers
      if (!this.validateImageContent(originalBuffer)) {
        throw new Error("Invalid image format - content validation failed");
      }

      // Detect format
      const bufferFormat = detectFormatFromBuffer(originalBuffer);
      const extension = extForFormat(bufferFormat) || ".png";

      // Generate filename with hash for deduplication
      const filename = this.generateFilename(url, originalBuffer, extension);
      const filePath = validatePath(this.config.emojiPath, filename);

      // Check if file with same content already exists (content-based deduplication)
      const hash = this.generateHash(originalBuffer);
      const existingEntry = Array.from(this.emojiCache.entries()).find(
        ([, info]) => info.hash === hash
      );

      if (existingEntry) {
        try {
          const existingPath = validatePath(
            this.config.emojiPath,
            existingEntry[1].filename
          );
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path validated by validatePath()
          if (fs.existsSync(existingPath)) {
            // Update cache with new URL pointing to existing file
            this.emojiCache.set(url, existingEntry[1]);
            await this.saveCache();

            spinner.succeed(
              chalk.green(
                `Emoji reused (content match): ${existingEntry[1].filename}`
              )
            );
            const baseUrl = process.env.BASE_URL || "/";
            const basePath = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
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

      this.emojiCache.set(url, emojiFile);
      await this.saveCache();

      const savedBytes = usedFallback
        ? 0
        : Math.max(0, originalSize - finalSize);

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

      const formattedError = this.formatError(operation, url, error);
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

  /**
   * Extract custom emoji URLs from raw Notion blocks
   */
  static extractCustomEmojiUrls(
    blocks: any[]
  ): Array<{ url: string; name: string; plainText: string }> {
    const emojis: Array<{ url: string; name: string; plainText: string }> = [];

    const processRichText = (richTextArray: any[]) => {
      if (!Array.isArray(richTextArray)) return;

      for (const item of richTextArray) {
        if (
          item?.type === "mention" &&
          item?.mention?.type === "custom_emoji" &&
          item?.mention?.custom_emoji
        ) {
          const emoji = item.mention.custom_emoji;
          if (emoji.url && emoji.name && item.plain_text) {
            emojis.push({
              url: emoji.url,
              name: emoji.name,
              plainText: item.plain_text,
            });
          }
        }
      }
    };

    const processBlock = (block: any) => {
      if (!block || typeof block !== "object") return;

      // Process different block types that can contain rich_text
      const blockTypes = [
        "paragraph",
        "heading_1",
        "heading_2",
        "heading_3",
        "callout",
        "quote",
        "bulleted_list_item",
        "numbered_list_item",
        "to_do",
        "toggle",
        "child_page",
      ] as const;

      for (const blockType of blockTypes) {
        // Safely access block properties
        if (
          Object.hasOwn(block, blockType) &&
          // eslint-disable-next-line security/detect-object-injection -- blockType is from const array
          block[blockType]?.rich_text &&
          // eslint-disable-next-line security/detect-object-injection -- blockType is from const array
          Array.isArray(block[blockType].rich_text)
        ) {
          // eslint-disable-next-line security/detect-object-injection -- blockType is from const array
          processRichText(block[blockType].rich_text);
        }
      }

      // Process properties (for page properties)
      if (block.properties && typeof block.properties === "object") {
        for (const [key, property] of Object.entries(block.properties)) {
          if (
            property &&
            typeof property === "object" &&
            Object.hasOwn(block.properties, key)
          ) {
            const prop = property as any;
            if (Array.isArray(prop.rich_text)) {
              processRichText(prop.rich_text);
            }
            if (Array.isArray(prop.title)) {
              processRichText(prop.title);
            }
          }
        }
      }

      // Recursively process children
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          processBlock(child);
        }
      }
    };

    // Process all blocks
    for (const block of blocks) {
      processBlock(block);
    }

    return emojis;
  }

  /**
   * Process custom emojis from raw Notion blocks before markdown conversion
   */
  static async processBlockEmojis(
    pageId: string,
    blocks: any[]
  ): Promise<{
    processedBlocks: any[];
    totalSaved: number;
    emojiMap: Map<string, string>;
  }> {
    await this.initialize();

    let totalSaved = 0;
    const emojiMap = new Map<string, string>(); // plainText -> localPath mapping

    // Check if processing is enabled
    if (!this.config.enableProcessing) {
      return { processedBlocks: blocks, totalSaved: 0, emojiMap };
    }

    // Extract all custom emojis from blocks
    const customEmojis = this.extractCustomEmojiUrls(blocks);

    if (customEmojis.length === 0) {
      return { processedBlocks: blocks, totalSaved: 0, emojiMap };
    }

    // Apply emoji limit per page
    const emojiCount = Math.min(
      customEmojis.length,
      this.config.maxEmojisPerPage
    );
    if (customEmojis.length > this.config.maxEmojisPerPage) {
      console.warn(
        chalk.yellow(
          `⚠️  Page ${pageId} has ${customEmojis.length} custom emojis, limiting to ${this.config.maxEmojisPerPage}`
        )
      );
    }

    console.log(
      chalk.blue(
        `Found ${emojiCount} custom emoji(s) to process in page ${pageId}`
      )
    );

    // Process emojis with concurrency limit
    const emojisToProcess = customEmojis.slice(0, emojiCount);
    const results: Array<{ emoji: any; result: EmojiProcessingResult }> = [];

    // Process in batches to respect concurrency limits
    for (
      let i = 0;
      i < emojisToProcess.length;
      i += this.config.maxConcurrentDownloads
    ) {
      const batch = emojisToProcess.slice(
        i,
        i + this.config.maxConcurrentDownloads
      );

      const batchResults = await Promise.allSettled(
        batch.map(async (emoji) => {
          const result = await this.processEmoji(emoji.url, pageId);
          return { emoji, result };
        })
      );

      // Process batch results
      for (const promiseResult of batchResults) {
        if (promiseResult.status === "fulfilled") {
          const { emoji, result } = promiseResult.value;
          results.push({ emoji, result });

          // Store mapping for later use in markdown processing
          emojiMap.set(emoji.plainText, result.newPath);
          totalSaved += result.savedBytes;

          if (result.reused) {
            console.log(
              chalk.cyan(
                `  ↳ Reused existing custom emoji: ${emoji.name} -> ${result.newPath}`
              )
            );
          } else {
            console.log(
              chalk.green(
                `  ↳ Processed new custom emoji: ${emoji.name} -> ${result.newPath}`
              )
            );
          }
        } else {
          console.error(
            chalk.red(`  ↳ Failed to process custom emoji batch:`),
            promiseResult.reason
          );
        }
      }
    }

    return { processedBlocks: blocks, totalSaved, emojiMap };
  }

  /**
   * Extract and process all emojis from a Notion page
   */
  static async processPageEmojis(
    pageId: string,
    markdownContent: string
  ): Promise<{
    content: string;
    totalSaved: number;
    processedCount: number;
  }> {
    await this.initialize();

    let totalSaved = 0;
    let processedContent = markdownContent;
    let processedCount = 0;

    // Check if processing is enabled
    if (!this.config.enableProcessing) {
      return { content: processedContent, totalSaved: 0, processedCount: 0 };
    }

    // Extract all HTTPS URLs and filter by emoji validation rules
    const urlRegex = /https:\/\/[^\s\)]+/gi;
    const emojiUrls = [...markdownContent.matchAll(urlRegex)]
      .map((match) => match[0].replace(/[),.;:]+$/, ""))
      .filter((candidate) => this.validateEmojiUrl(candidate));

    if (emojiUrls.length === 0) {
      return { content: processedContent, totalSaved: 0, processedCount: 0 };
    }

    // Apply emoji limit per page
    const emojiCount = Math.min(emojiUrls.length, this.config.maxEmojisPerPage);
    if (emojiUrls.length > this.config.maxEmojisPerPage) {
      console.warn(
        chalk.yellow(
          `⚠️  Page ${pageId} has ${emojiUrls.length} emojis, limiting to ${this.config.maxEmojisPerPage}`
        )
      );
    }

    console.log(
      chalk.blue(`Found ${emojiCount} emoji(s) to process in page ${pageId}`)
    );

    // Process emojis with concurrency limit
    const emojisToProcess = emojiUrls.slice(0, emojiCount);
    const results: Array<{ url: string; result: EmojiProcessingResult }> = [];

    // Process in batches to respect concurrency limits
    for (
      let i = 0;
      i < emojisToProcess.length;
      i += this.config.maxConcurrentDownloads
    ) {
      const batch = emojisToProcess.slice(
        i,
        i + this.config.maxConcurrentDownloads
      );

      const batchResults = await Promise.allSettled(
        batch.map(async (emojiUrl) => {
          const result = await this.processEmoji(emojiUrl, pageId);
          return { url: emojiUrl, result };
        })
      );

      // Process batch results
      for (const promiseResult of batchResults) {
        if (promiseResult.status === "fulfilled") {
          const { url, result } = promiseResult.value;
          results.push({ url, result });

          // Replace the emoji URL in content with the new local path
          processedContent = processedContent.replace(url, result.newPath);
          totalSaved += result.savedBytes;
          processedCount += 1;

          if (result.reused) {
            console.log(
              chalk.cyan(`  ↳ Reused existing emoji: ${result.newPath}`)
            );
          } else {
            console.log(
              chalk.green(`  ↳ Processed new emoji: ${result.newPath}`)
            );
          }
        } else {
          console.error(
            chalk.red(`  ↳ Failed to process emoji batch:`),
            promiseResult.reason
          );
        }
      }
    }

    return { content: processedContent, totalSaved, processedCount };
  }

  /**
   * Apply custom emoji mappings to markdown content
   */
  static applyEmojiMappings(
    markdownContent: string,
    emojiMap: Map<string, string>
  ): string {
    let processedContent = markdownContent;

    // Pre-validate and sanitize emoji names before creating RegExp patterns
    const emojiEntries = Array.from(emojiMap.entries())
      .filter(([plainText, _localPath]) => {
        // Only process valid emoji names (alphanumeric, hyphens, underscores, colons)
        return /^[:a-zA-Z0-9_-]+$/.test(plainText);
      })
      .map(([plainText, localPath]) => {
        const name = normalizeEmojiName(plainText);
        const escapedPlainText = escapeForRegExp(plainText);
        const escapedName = escapeForRegExp(name);

        return {
          inline: buildInlineEmoji(localPath, name),
          plainText: escapedPlainText,
          escapedName: escapedName,
        };
      });

    // Replace plain text emoji references
    for (const { inline, plainText } of emojiEntries) {
      // Use string replace with escaped pattern for safety
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern is pre-validated and escaped
      const plainTextPattern = new RegExp(plainText, "g");
      processedContent = processedContent.replace(plainTextPattern, inline);
    }

    // Replace [img] markdown patterns
    for (const { escapedName, inline } of emojiEntries) {
      // Build safe regex patterns with validated, escaped names
      const patterns = [
        // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
        new RegExp(`\\[img\\]\\(#img\\)\\s*\\[\\s*${escapedName}\\s*\\]`, "gi"),
        // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
        new RegExp(`\\[img\\]\\(#img\\)\\[${escapedName}\\]`, "gi"),
        // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
        new RegExp(`\\[img\\]\\(#img\\)\\s+\\[\\s*${escapedName}\\s*\\]`, "gi"),
        // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
        new RegExp(`\\[img\\]\\s*\\[\\s*${escapedName}\\s*\\]`, "gi"),
        // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
        new RegExp(`\\[img\\]\\[${escapedName}\\]`, "gi"),
      ];

      for (const pattern of patterns) {
        processedContent = processedContent.replace(pattern, inline);
      }
    }

    return processedContent;
  }

  /**
   * Get statistics about the emoji cache
   */
  static getCacheStats(): {
    totalEmojis: number;
    totalSize: number;
    uniqueEmojis: number;
  } {
    const uniqueHashes = new Set(
      Array.from(this.emojiCache.values()).map((emoji) => emoji.hash)
    );
    const totalSize = Array.from(this.emojiCache.values()).reduce(
      (sum, emoji) => sum + emoji.size,
      0
    );

    return {
      totalEmojis: this.emojiCache.size,
      totalSize,
      uniqueEmojis: uniqueHashes.size,
    };
  }

  /**
   * Clean up unused emojis (remove files not referenced in cache)
   */
  static async cleanup(): Promise<void> {
    await this.initialize();

    try {
      const normalizedPath = path.normalize(this.config.emojiPath);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is normalized and validated
      const files = fs.readdirSync(normalizedPath);
      const cachedFiles = new Set(
        Array.from(this.emojiCache.values()).map((emoji) => emoji.filename)
      );
      let cleanedCount = 0;

      for (const file of files) {
        if (file === ".emoji-cache.json" || file === ".gitkeep") continue; // Skip cache file and gitkeep

        if (!cachedFiles.has(file)) {
          try {
            const filePath = validatePath(this.config.emojiPath, file);
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

  /**
   * Get current configuration
   */
  static getConfig(): Required<EmojiProcessorConfig> {
    return { ...this.config };
  }

  /**
   * Reset the processor (for testing)
   */
  static reset(options: EmojiProcessorResetOptions = {}): void {
    this.emojiCache.clear();
    this.initialized = false;
    if (options.resetConfig) {
      this.config = { ...this.DEFAULT_CONFIG };
    }
  }
}
