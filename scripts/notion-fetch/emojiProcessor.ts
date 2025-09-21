import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import chalk from "chalk";
import SpinnerManager from "./spinnerManager.js";
import { compressImageToFileWithFallback, isResizableFormat, detectFormatFromBuffer, extForFormat } from "./utils.js";

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

export class EmojiProcessor {
  private static readonly EMOJI_PATH = path.join(process.cwd(), "static/images/emojis/");
  private static readonly EMOJI_CACHE_FILE = path.join(process.cwd(), "static/images/emojis/.emoji-cache.json");
  private static emojiCache: Map<string, EmojiFile> = new Map();
  private static initialized = false;

  /**
   * Initialize the emoji processor by loading the cache and ensuring directories exist
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure emoji directory exists
    fs.mkdirSync(this.EMOJI_PATH, { recursive: true });

    // Load existing cache
    await this.loadCache();
    this.initialized = true;
  }

  /**
   * Load emoji cache from disk
   */
  private static async loadCache(): Promise<void> {
    try {
      if (fs.existsSync(this.EMOJI_CACHE_FILE)) {
        const cacheData = JSON.parse(fs.readFileSync(this.EMOJI_CACHE_FILE, 'utf8'));
        
        // Verify cached files still exist and populate cache
        for (const [url, fileInfo] of Object.entries(cacheData as Record<string, EmojiFile>)) {
          const fullPath = path.join(this.EMOJI_PATH, fileInfo.filename);
          if (fs.existsSync(fullPath)) {
            this.emojiCache.set(url, fileInfo);
          }
        }
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Could not load emoji cache, starting fresh'), error);
      this.emojiCache.clear();
    }
  }

  /**
   * Save emoji cache to disk
   */
  private static async saveCache(): Promise<void> {
    try {
      const cacheObject = Object.fromEntries(this.emojiCache);
      fs.writeFileSync(this.EMOJI_CACHE_FILE, JSON.stringify(cacheObject, null, 2), 'utf8');
    } catch (error) {
      console.error(chalk.red('❌ Failed to save emoji cache'), error);
    }
  }

  /**
   * Generate a hash for content deduplication
   */
  private static generateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  /**
   * Generate a sanitized filename for an emoji
   */
  private static generateFilename(url: string, buffer: Buffer, extension: string): string {
    const hash = this.generateHash(buffer);
    const urlParts = new URL(url).pathname.split('/');
    const originalName = urlParts[urlParts.length - 1]?.split('.')[0] || 'emoji';
    
    // Sanitize the name
    const sanitizedName = originalName
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .toLowerCase()
      .substring(0, 20);
    
    return `${sanitizedName}_${hash}${extension}`;
  }

  /**
   * Download and process a custom emoji
   */
  static async processEmoji(url: string, pageId: string): Promise<EmojiProcessingResult> {
    await this.initialize();

    // Check if emoji is already cached
    const cached = this.emojiCache.get(url);
    if (cached && fs.existsSync(path.join(this.EMOJI_PATH, cached.filename))) {
      return {
        newPath: `/images/emojis/${cached.filename}`,
        savedBytes: 0,
        reused: true
      };
    }

    const spinner = SpinnerManager.create(`Processing emoji for page ${pageId}`, 30000);

    try {
      spinner.text = `Downloading emoji: ${url}`;
      
      // Download emoji with timeout
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
        maxRedirects: 3,
        headers: {
          "User-Agent": "notion-emoji-fetch/1.0",
        },
      });

      const originalBuffer = Buffer.from(response.data, "binary");
      
      // Detect format
      const bufferFormat = detectFormatFromBuffer(originalBuffer);
      const extension = extForFormat(bufferFormat) || '.png';
      
      // Generate filename with hash for deduplication
      const filename = this.generateFilename(url, originalBuffer, extension);
      const filePath = path.join(this.EMOJI_PATH, filename);

      // Check if file with same content already exists (content-based deduplication)
      const hash = this.generateHash(originalBuffer);
      const existingEntry = Array.from(this.emojiCache.entries()).find(([, info]) => info.hash === hash);
      
      if (existingEntry && fs.existsSync(path.join(this.EMOJI_PATH, existingEntry[1].filename))) {
        // Update cache with new URL pointing to existing file
        this.emojiCache.set(url, existingEntry[1]);
        await this.saveCache();
        
        spinner.succeed(chalk.green(`Emoji reused (content match): ${existingEntry[1].filename}`));
        return {
          newPath: `/images/emojis/${existingEntry[1].filename}`,
          savedBytes: 0,
          reused: true
        };
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
        size: finalSize
      };
      
      this.emojiCache.set(url, emojiFile);
      await this.saveCache();

      const savedBytes = usedFallback ? 0 : Math.max(0, originalSize - finalSize);
      
      spinner.succeed(
        usedFallback
          ? chalk.green(`Emoji saved (uncompressed): ${filename}`)
          : chalk.green(`Emoji processed and saved: ${filename}`)
      );

      return {
        newPath: `/images/emojis/${filename}`,
        savedBytes,
        reused: false
      };

    } catch (error) {
      let errorMessage = `Error processing emoji from ${url}`;
      
      if (error.code === "ECONNABORTED") {
        errorMessage = `Timeout downloading emoji from ${url}`;
      } else if (error.response) {
        errorMessage = `HTTP ${error.response.status} error for emoji: ${url}`;
      } else if (error.code === "ENOTFOUND") {
        errorMessage = `DNS resolution failed for emoji: ${url}`;
      }

      spinner.fail(chalk.red(errorMessage));
      console.error(chalk.red("Emoji processing error details:"), error);
      
      // For emojis, we can be more lenient and continue with a fallback
      // Return a placeholder or the original URL
      return {
        newPath: url, // Keep original URL as fallback
        savedBytes: 0,
        reused: false
      };
    } finally {
      SpinnerManager.remove(spinner);
    }
  }

  /**
   * Extract and process all emojis from a Notion page
   */
  static async processPageEmojis(pageId: string, markdownContent: string): Promise<{ content: string; totalSaved: number }> {
    await this.initialize();

    let totalSaved = 0;
    let processedContent = markdownContent;

    // Notion emoji pattern - look for emoji URLs in content
    // This regex looks for typical Notion emoji URLs
    const emojiRegex = /https:\/\/[^\s\)]+\.(?:amazonaws\.com|notion\.site)[^\s\)]*emoji[^\s\)]*\.(?:png|svg|gif|webp|jpg|jpeg)/gi;
    
    const matches = [...markdownContent.matchAll(emojiRegex)];
    
    if (matches.length === 0) {
      return { content: processedContent, totalSaved: 0 };
    }

    console.log(chalk.blue(`Found ${matches.length} emoji(s) in page ${pageId}`));

    // Process each emoji
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const emojiUrl = match[0];
      
      try {
        const result = await this.processEmoji(emojiUrl, pageId);
        
        // Replace the emoji URL in content with the new local path
        processedContent = processedContent.replace(emojiUrl, result.newPath);
        totalSaved += result.savedBytes;
        
        if (result.reused) {
          console.log(chalk.cyan(`  ↳ Reused existing emoji: ${result.newPath}`));
        } else {
          console.log(chalk.green(`  ↳ Processed new emoji: ${result.newPath}`));
        }
        
      } catch (error) {
        console.error(chalk.red(`  ↳ Failed to process emoji ${i + 1}: ${emojiUrl}`), error);
      }
    }

    return { content: processedContent, totalSaved };
  }

  /**
   * Get statistics about the emoji cache
   */
  static getCacheStats(): { totalEmojis: number; totalSize: number; uniqueEmojis: number } {
    const uniqueHashes = new Set(Array.from(this.emojiCache.values()).map(emoji => emoji.hash));
    const totalSize = Array.from(this.emojiCache.values()).reduce((sum, emoji) => sum + emoji.size, 0);
    
    return {
      totalEmojis: this.emojiCache.size,
      totalSize,
      uniqueEmojis: uniqueHashes.size
    };
  }

  /**
   * Clean up unused emojis (remove files not referenced in cache)
   */
  static async cleanup(): Promise<void> {
    await this.initialize();
    
    try {
      const files = fs.readdirSync(this.EMOJI_PATH);
      const cachedFiles = new Set(Array.from(this.emojiCache.values()).map(emoji => emoji.filename));
      
      for (const file of files) {
        if (file === '.emoji-cache.json') continue; // Skip cache file
        
        if (!cachedFiles.has(file)) {
          const filePath = path.join(this.EMOJI_PATH, file);
          fs.unlinkSync(filePath);
          console.log(chalk.yellow(`Cleaned up unused emoji: ${file}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error during emoji cleanup:'), error);
    }
  }
}