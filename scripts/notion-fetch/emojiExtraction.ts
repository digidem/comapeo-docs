/**
 * Emoji Extraction Module
 *
 * Handles extracting custom emojis from raw Notion blocks and pages,
 * processing them, and managing batch operations with concurrency limits.
 */

import chalk from "chalk";
import type { EmojiFile } from "./emojiCache.js";
import type {
  EmojiProcessingResult,
  EmojiProcessorConfig,
} from "./emojiDownload.js";
import { processEmoji, validateEmojiUrl } from "./emojiDownload.js";

/**
 * Extract custom emoji URLs from raw Notion blocks
 */
export function extractCustomEmojiUrls(
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
export async function processBlockEmojis(
  pageId: string,
  blocks: any[],
  config: EmojiProcessorConfig,
  emojiCache: Map<string, EmojiFile>,
  saveCache: () => Promise<void>
): Promise<{
  processedBlocks: any[];
  totalSaved: number;
  emojiMap: Map<string, string>;
}> {
  let totalSaved = 0;
  const emojiMap = new Map<string, string>(); // plainText -> localPath mapping

  // Check if processing is enabled
  if (!config.enableProcessing) {
    return { processedBlocks: blocks, totalSaved: 0, emojiMap };
  }

  // Extract all custom emojis from blocks
  const customEmojis = extractCustomEmojiUrls(blocks);

  if (customEmojis.length === 0) {
    return { processedBlocks: blocks, totalSaved: 0, emojiMap };
  }

  // Apply emoji limit per page
  const emojiCount = Math.min(customEmojis.length, config.maxEmojisPerPage);
  if (customEmojis.length > config.maxEmojisPerPage) {
    console.warn(
      chalk.yellow(
        `⚠️  Page ${pageId} has ${customEmojis.length} custom emojis, limiting to ${config.maxEmojisPerPage}`
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
    i += config.maxConcurrentDownloads
  ) {
    const batch = emojisToProcess.slice(i, i + config.maxConcurrentDownloads);

    const batchResults = await Promise.allSettled(
      batch.map(async (emoji) => {
        const result = await processEmoji(
          emoji.url,
          pageId,
          config,
          emojiCache,
          saveCache
        );
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
export async function processPageEmojis(
  pageId: string,
  markdownContent: string,
  config: EmojiProcessorConfig,
  emojiCache: Map<string, EmojiFile>,
  saveCache: () => Promise<void>
): Promise<{
  content: string;
  totalSaved: number;
  processedCount: number;
}> {
  let totalSaved = 0;
  let processedContent = markdownContent;
  let processedCount = 0;

  // Check if processing is enabled
  if (!config.enableProcessing) {
    return { content: processedContent, totalSaved: 0, processedCount: 0 };
  }

  // Extract all HTTPS URLs and filter by emoji validation rules
  const urlRegex = /https:\/\/[^\s\)]+/gi;
  const emojiUrls = [...markdownContent.matchAll(urlRegex)]
    .map((match) => match[0].replace(/[),.;:]+$/, ""))
    .filter((candidate) => validateEmojiUrl(candidate, config.allowedHosts));

  if (emojiUrls.length === 0) {
    return { content: processedContent, totalSaved: 0, processedCount: 0 };
  }

  // Apply emoji limit per page
  const emojiCount = Math.min(emojiUrls.length, config.maxEmojisPerPage);
  if (emojiUrls.length > config.maxEmojisPerPage) {
    console.warn(
      chalk.yellow(
        `⚠️  Page ${pageId} has ${emojiUrls.length} emojis, limiting to ${config.maxEmojisPerPage}`
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
    i += config.maxConcurrentDownloads
  ) {
    const batch = emojisToProcess.slice(i, i + config.maxConcurrentDownloads);

    const batchResults = await Promise.allSettled(
      batch.map(async (emojiUrl) => {
        const result = await processEmoji(
          emojiUrl,
          pageId,
          config,
          emojiCache,
          saveCache
        );
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
