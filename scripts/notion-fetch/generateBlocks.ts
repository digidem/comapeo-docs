import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BlockObjectResponse,
  CalloutBlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { n2m } from "../notionClient";
import { NOTION_PROPERTIES } from "../constants";
import chalk from "chalk";
import { sanitizeMarkdownContent } from "./utils";
import config from "../../docusaurus.config";
import SpinnerManager from "./spinnerManager";
import { convertCalloutToAdmonition, isCalloutBlock } from "./calloutProcessor";
import { EmojiProcessor } from "./emojiProcessor";
import { buildFrontmatter } from "./frontmatterBuilder";
import {
  ensureBlankLineAfterStandaloneBold,
  processCalloutsInMarkdown,
} from "./markdownTransform";
import {
  resolvePageTitle,
  groupPagesByLang,
  createStandalonePageGroup,
} from "./pageGrouping";
import { LRUCache, validateCacheSize } from "./cacheStrategies";
import { getImageCache, logImageFailure } from "./imageProcessing";
import { setTranslationString, getI18NPath } from "./translationManager";
import { loadBlocksForPage, loadMarkdownForPage } from "./cacheLoaders";
import { processAndReplaceImages } from "./imageReplacer";
import {
  processToggleSection,
  processHeadingSection,
} from "./sectionProcessors";
import {
  removeDuplicateTitle,
  writeMarkdownFile,
  writePlaceholderFile,
} from "./contentWriter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CalloutBlockNode = CalloutBlockObjectResponse & {
  children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
};

const CONTENT_PATH = path.join(__dirname, "../../docs");
const IMAGES_PATH = path.join(__dirname, "../../static/images/");
const locales = config.i18n.locales;
const DEFAULT_LOCALE = config.i18n.defaultLocale;

// I18N_PATH and getI18NPath moved to translationManager.ts

const LANGUAGE_NAME_TO_LOCALE: Record<string, string> = {
  English: "en",
  Spanish: "es",
  Portuguese: "pt",
};

const FALLBACK_TITLE_PREFIX = "untitled";

// Ensure directories exist (preserve existing content)
fs.mkdirSync(CONTENT_PATH, { recursive: true });
fs.mkdirSync(IMAGES_PATH, { recursive: true });
// fs.mkdirSync(I18N_PATH, { recursive: true });
for (const locale of locales.filter((l) => l !== DEFAULT_LOCALE)) {
  fs.mkdirSync(getI18NPath(locale), { recursive: true });
}

// Markdown transform functions moved to markdownTransform.ts
// Page grouping functions moved to pageGrouping.ts
// Frontmatter functions moved to frontmatterBuilder.ts
// Cache strategies moved to cacheStrategies.ts

const CACHE_MAX_SIZE = validateCacheSize();

const blockPrefetchCache = new LRUCache<any[]>(CACHE_MAX_SIZE);
const markdownPrefetchCache = new LRUCache<any>(CACHE_MAX_SIZE);

export function __resetPrefetchCaches(): void {
  blockPrefetchCache.clear();
  markdownPrefetchCache.clear();
}

// setTranslationString moved to translationManager.ts

export async function generateBlocks(pages, progressCallback) {
  // pages are already sorted by Order property in fetchNotion.ts
  let totalSaved = 0;
  let processedPages = 0;

  // Variables to track section folders and title metadata
  let currentSectionFolder = {};
  const currentHeading = new Map<string, string>();

  // Stats for reporting
  let sectionCount = 0;
  let titleSectionCount = 0;
  let emojiCount = 0;

  const pagesByLang = [];

  const subpageIdSet = new Set<string>();
  for (const page of pages) {
    const relations = page?.properties?.["Sub-item"]?.relation ?? [];
    for (const relation of relations) {
      if (relation?.id) {
        subpageIdSet.add(relation.id);
      }
    }
  }

  try {
    /*
     * group pages by language likeso:
     * {
     * mainTitle,
     * section: "Title" | "Heading" | "Toggle" | "Page"
     * content: { lang: page}
     * }
     */
    for (const page of pages) {
      const relations = page?.properties?.["Sub-item"]?.relation ?? [];

      if (subpageIdSet.has(page?.id)) {
        continue;
      }

      if (relations.length !== 0) {
        pagesByLang.push(groupPagesByLang(pages, page));
      } else {
        pagesByLang.push(createStandalonePageGroup(page));
      }
    }

    const totalPages = pagesByLang.reduce((count, pageGroup) => {
      return count + Object.keys(pageGroup.content).length;
    }, 0);
    let pageProcessingIndex = 0;

    const blocksMap = new Map<string, { key: string; data: any[] }>();
    const markdownMap = new Map<string, { key: string; data: any }>();
    const inFlightBlockFetches = new Map<string, Promise<any[]>>();
    const inFlightMarkdownFetches = new Map<string, Promise<any>>();
    const blockFetchCount = { value: 0 };
    const blockCacheHits = { value: 0 };
    const markdownFetchCount = { value: 0 };
    const markdownCacheHits = { value: 0 };

    for (let i = 0; i < pagesByLang.length; i++) {
      const pageByLang = pagesByLang[i];
      // pages share section type and filename
      const title = pageByLang.mainTitle;
      const sectionTypeRaw = pageByLang.section;
      const sectionTypeString =
        typeof sectionTypeRaw === "string"
          ? sectionTypeRaw.trim()
          : String(sectionTypeRaw ?? "").trim();
      const sectionType = sectionTypeString;
      const normalizedSectionType = sectionTypeString.toLowerCase();
      const filename = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      for (const lang of Object.keys(pageByLang.content)) {
        const PATH = lang == "en" ? CONTENT_PATH : getI18NPath(lang);
        const page = pageByLang.content[lang];
        const pageTitle = resolvePageTitle(page);
        const safeFallbackId = (page?.id ?? String(i + 1)).slice(0, 8);
        const safeFilename =
          filename || `${FALLBACK_TITLE_PREFIX}-${safeFallbackId}`;

        const fileName = `${safeFilename}.md`;
        const filePath = currentSectionFolder[lang]
          ? path.join(PATH, currentSectionFolder[lang], fileName)
          : path.join(PATH, fileName);
        const relativePath = currentSectionFolder[lang]
          ? `${currentSectionFolder[lang]}/${fileName}`
          : fileName;

        let tags = ["comapeo"];
        if (page.properties["Tags"] && page.properties["Tags"].multi_select) {
          tags = page.properties["Tags"].multi_select.map((tag) => tag.name);
        }

        let keywords = ["docs", "comapeo"];
        if (
          page.properties.Keywords?.multi_select &&
          page.properties.Keywords.multi_select.length > 0
        ) {
          keywords = page.properties.Keywords.multi_select.map(
            (keyword) => keyword.name
          );
        }

        let sidebarPosition = i + 1;
        if (page.properties["Order"] && page.properties["Order"].number) {
          sidebarPosition = page.properties["Order"].number;
        }

        const customProps: Record<string, unknown> = {};
        if (
          page.properties["Icon"] &&
          page.properties["Icon"].rich_text &&
          page.properties["Icon"].rich_text.length > 0
        ) {
          customProps.icon = page.properties["Icon"].rich_text[0].plain_text;
        }

        let pendingHeading: string | undefined;
        if (normalizedSectionType === "page") {
          pendingHeading = currentHeading.get(lang);
          if (pendingHeading) {
            customProps.title = pendingHeading;
          }
        }

        const frontmatter = buildFrontmatter(
          pageTitle,
          sidebarPosition,
          tags,
          keywords,
          customProps,
          relativePath,
          safeFilename,
          page
        );

        console.log(chalk.blue(`Processing page: ${page.id}, ${pageTitle}`));
        const pageSpinner = SpinnerManager.create(
          `Processing page ${processedPages + 1}/${totalPages}`,
          120000
        ); // 2 minute timeout per page

        try {
          if (lang !== "en")
            setTranslationString(lang, pageByLang.mainTitle, pageTitle);

          // TOGGLE
          if (normalizedSectionType === "toggle") {
            const sectionFolder = processToggleSection(
              page,
              filename,
              safeFilename,
              pageTitle,
              lang,
              i,
              PATH,
              currentHeading,
              pageSpinner
            );
            currentSectionFolder[lang] = sectionFolder;
            sectionCount++;
            // HEADING (Title)
          } else if (
            normalizedSectionType === "title" ||
            normalizedSectionType === "heading"
          ) {
            processHeadingSection(pageTitle, lang, currentHeading, pageSpinner);
            titleSectionCount++; // Increment title section counter
            currentSectionFolder = {};

            // PAGE
          } else if (normalizedSectionType === "page") {
            pageProcessingIndex += 1;

            // Fetch raw block data first for emoji and callout processing
            let rawBlocks: any[] = [];
            let emojiMap = new Map<string, string>();
            try {
              const { data: blockData, source: blockSource } =
                await loadBlocksForPage(
                  page,
                  pageProcessingIndex - 1,
                  totalPages,
                  pageTitle,
                  blocksMap,
                  blockPrefetchCache,
                  inFlightBlockFetches,
                  blockCacheHits,
                  blockFetchCount
                );
              rawBlocks = blockData;
              console.log(
                chalk.blue(
                  `  ↳ Loaded ${rawBlocks.length} raw blocks for processing (${blockSource})`
                )
              );

              // Process custom emojis from raw blocks before markdown conversion
              const blockEmojiResult = await EmojiProcessor.processBlockEmojis(
                page.id,
                rawBlocks
              );
              if (blockEmojiResult?.emojiMap instanceof Map) {
                emojiMap = blockEmojiResult.emojiMap;
                totalSaved += blockEmojiResult.totalSaved ?? 0;
                emojiCount += blockEmojiResult.emojiMap.size;
              }
            } catch (error) {
              const msg =
                error && typeof error === "object" && "message" in error
                  ? (error as any).message
                  : String(error);
              console.warn(
                chalk.yellow(
                  `  ⚠️  Failed to fetch raw blocks for processing: ${msg}`
                )
              );
            }

            // Load markdown lazily using the same caching mechanism
            const { data: markdownData, source: markdownSource } =
              await loadMarkdownForPage(
                page,
                pageProcessingIndex - 1,
                totalPages,
                pageTitle,
                markdownMap,
                markdownPrefetchCache,
                inFlightMarkdownFetches,
                markdownCacheHits,
                markdownFetchCount
              );
            const markdown = markdownData;
            if (markdownSource === "fetched") {
              console.log(chalk.blue(`  ↳ Markdown generated for page`));
            } else if (markdownSource === "cache") {
              console.log(chalk.blue(`  ↳ Markdown reused from cache`));
            }
            const markdownString = n2m.toMarkdownString(markdown);

            if (markdownString?.parent) {
              // Apply custom emoji mappings to the markdown content
              if (emojiMap.size > 0) {
                markdownString.parent = EmojiProcessor.applyEmojiMappings(
                  markdownString.parent,
                  emojiMap
                );
                console.log(
                  chalk.green(
                    `  ↳ Applied ${emojiMap.size} custom emoji mappings to markdown`
                  )
                );
              }

              // Process any remaining emoji URLs in the markdown (fallback)
              // Only run fallback if no emoji mappings were applied to avoid overwriting processed content
              if (emojiMap.size === 0) {
                const fallbackEmojiResult =
                  await EmojiProcessor.processPageEmojis(
                    page.id,
                    markdownString.parent
                  );
                if (fallbackEmojiResult) {
                  markdownString.parent = fallbackEmojiResult.content;
                  totalSaved += fallbackEmojiResult.totalSaved ?? 0;
                  emojiCount += fallbackEmojiResult.processedCount ?? 0;
                }
              }

              // Process callouts in the markdown to convert them to Docusaurus admonitions
              if (rawBlocks && rawBlocks.length > 0) {
                markdownString.parent = processCalloutsInMarkdown(
                  markdownString.parent,
                  rawBlocks
                );
                console.log(
                  chalk.blue(`  ↳ Processed callouts in markdown content`)
                );
              }

              // Enhanced image processing with comprehensive fallback handling
              const imageResult = await processAndReplaceImages(
                markdownString.parent,
                safeFilename
              );
              markdownString.parent = imageResult.markdown;
              totalSaved += imageResult.stats.totalSaved;

              // Sanitize content to fix malformed HTML/JSX tags
              markdownString.parent = sanitizeMarkdownContent(
                markdownString.parent
              );

              markdownString.parent = ensureBlankLineAfterStandaloneBold(
                markdownString.parent
              );

              // Remove duplicate title heading if it exists
              const contentBody = removeDuplicateTitle(
                markdownString.parent,
                pageTitle
              );

              // Write markdown file with frontmatter
              writeMarkdownFile(
                filePath,
                frontmatter,
                contentBody,
                pageTitle,
                processedPages,
                totalPages,
                pageSpinner,
                safeFilename,
                customProps,
                currentSectionFolder,
                lang
              );
            } else {
              // Write placeholder file when no content exists
              writePlaceholderFile(
                filePath,
                frontmatter,
                page.id,
                processedPages,
                totalPages,
                pageSpinner
              );
            }
            if (pendingHeading) {
              currentHeading.set(lang, null);
            }
          }

          processedPages++;
          progressCallback({ current: processedPages, total: totalPages });
        } catch (pageError) {
          console.error(
            chalk.red(
              `Failed to process page ${processedPages + 1}: ${page.id}`
            ),
            pageError
          );
          pageSpinner.fail(
            chalk.red(
              `Failed to process page ${processedPages + 1}/${totalPages}: ${page.id}`
            )
          );
          processedPages++; // Still increment to maintain progress tracking
          progressCallback({ current: processedPages, total: totalPages });
          // Continue with next page instead of failing completely
        } finally {
          SpinnerManager.remove(pageSpinner);
        }
      }
    }

    if (
      blockFetchCount.value ||
      blockCacheHits.value ||
      markdownFetchCount.value ||
      markdownCacheHits.value
    ) {
      const blockTotal = blockFetchCount.value + blockCacheHits.value;
      const markdownTotal = markdownFetchCount.value + markdownCacheHits.value;
      const blockHitRate =
        blockTotal > 0
          ? ((blockCacheHits.value / blockTotal) * 100).toFixed(1)
          : "0.0";
      const markdownHitRate =
        markdownTotal > 0
          ? ((markdownCacheHits.value / markdownTotal) * 100).toFixed(1)
          : "0.0";

      console.info(
        chalk.gray(
          `\n📦 Prefetch cache stats → blocks: ${blockFetchCount.value} fetched, ${blockCacheHits.value} cached (${blockHitRate}% hit rate); markdown: ${markdownFetchCount.value} fetched, ${markdownCacheHits.value} cached (${markdownHitRate}% hit rate)`
        )
      );
    }

    // Final cache cleanup and statistics
    const imageCache = getImageCache();
    imageCache.cleanup();
    const cacheStats = imageCache.getStats();

    console.info(chalk.green(`\n📊 Image Processing Summary:`));
    console.info(
      chalk.blue(
        `   💾 Cache: ${cacheStats.validEntries}/${cacheStats.totalEntries} entries valid`
      )
    );
    console.info(
      chalk.green(`   💰 Storage saved: ${Math.round(totalSaved / 1024)} KB`)
    );
    console.info(chalk.blue(`   📄 Sections created: ${sectionCount}`));
    console.info(chalk.blue(`   📝 Title sections: ${titleSectionCount}`));
    console.info(chalk.blue(`   🎨 Emojis processed: ${emojiCount}`));

    if (cacheStats.validEntries > 0) {
      console.info(
        chalk.green(
          `   🚀 Future runs will be faster with ${cacheStats.validEntries} cached images`
        )
      );
    }

    return { totalSaved, sectionCount, titleSectionCount, emojiCount };
  } catch (error) {
    console.error(chalk.red("Critical error in generateBlocks:"), error);

    try {
      const errObj = error instanceof Error ? error : new Error(String(error));
      const errorLog = {
        timestamp: new Date().toISOString(),
        error: errObj.message,
        stack: errObj.stack,
        type: "generateBlocks_critical_error",
      };
      logImageFailure(errorLog);
    } catch (logError) {
      console.warn(chalk.yellow("Failed to log critical error"));
    }

    throw error;
  } finally {
    // Ensure all spinners are cleaned up
    SpinnerManager.stopAll();

    // Final cache save
    try {
      getImageCache().cleanup();
    } catch (cacheError) {
      console.warn(chalk.yellow("Warning: Failed to cleanup image cache"));
    }
  }
}
