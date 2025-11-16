/**
 * Emoji Processor
 *
 * Main orchestration module for emoji processing.
 * Provides configuration management, initialization, and public API.
 */

import fs from "node:fs";
import path from "node:path";
import type { EmojiFile } from "./emojiCache.js";
import { loadCache, saveCache, getCacheStats, cleanup } from "./emojiCache.js";
import type {
  EmojiProcessingResult,
  EmojiProcessorConfig,
} from "./emojiDownload.js";
import { processEmoji } from "./emojiDownload.js";
import {
  extractCustomEmojiUrls,
  processBlockEmojis,
  processPageEmojis,
} from "./emojiExtraction.js";
import { applyEmojiMappings } from "./emojiMapping.js";

export interface EmojiProcessorResetOptions {
  resetConfig?: boolean;
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

  private static config: Required<EmojiProcessorConfig> = {
    ...EmojiProcessor.DEFAULT_CONFIG,
  };
  private static emojiCache: Map<string, EmojiFile> = new Map();
  private static initialized = false;

  /**
   * Configure the emoji processor with custom settings
   */
  static configure(userConfig: Partial<EmojiProcessorConfig>): void {
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
    await loadCache(
      this.config.cacheFile,
      this.config.emojiPath,
      this.emojiCache
    );
    this.initialized = true;
  }

  /**
   * Download and process a custom emoji
   */
  static async processEmoji(
    url: string,
    pageId: string
  ): Promise<EmojiProcessingResult> {
    await this.initialize();
    return processEmoji(url, pageId, this.config, this.emojiCache, () =>
      this.saveCache()
    );
  }

  /**
   * Extract custom emoji URLs from raw Notion blocks
   */
  static extractCustomEmojiUrls(
    blocks: any[]
  ): Array<{ url: string; name: string; plainText: string }> {
    return extractCustomEmojiUrls(blocks);
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
    return processBlockEmojis(
      pageId,
      blocks,
      this.config,
      this.emojiCache,
      () => this.saveCache()
    );
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
    return processPageEmojis(
      pageId,
      markdownContent,
      this.config,
      this.emojiCache,
      () => this.saveCache()
    );
  }

  /**
   * Apply custom emoji mappings to markdown content
   */
  static applyEmojiMappings(
    markdownContent: string,
    emojiMap: Map<string, string>
  ): string {
    return applyEmojiMappings(markdownContent, emojiMap);
  }

  /**
   * Get statistics about the emoji cache
   */
  static getCacheStats(): {
    totalEmojis: number;
    totalSize: number;
    uniqueEmojis: number;
  } {
    return getCacheStats(this.emojiCache);
  }

  /**
   * Clean up unused emojis (remove files not referenced in cache)
   */
  static async cleanup(): Promise<void> {
    await this.initialize();
    return cleanup(this.config.emojiPath, this.emojiCache);
  }

  /**
   * Get current configuration
   */
  static getConfig(): Required<EmojiProcessorConfig> {
    return { ...this.config };
  }

  /**
   * Save emoji cache to disk
   */
  private static async saveCache(): Promise<void> {
    return saveCache(this.config.cacheFile, this.emojiCache);
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
