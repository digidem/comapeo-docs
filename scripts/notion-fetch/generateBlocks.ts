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
  getOrderedLocales,
} from "./pageGrouping";
import { LRUCache, validateCacheSize } from "./cacheStrategies";
import { getImageCache, logImageFailure } from "./imageProcessing";
import { setTranslationString, getI18NPath } from "./translationManager";
import { loadBlocksForPage, loadMarkdownForPage } from "./cacheLoaders";
import {
  processAndReplaceImages,
  validateAndFixRemainingImages,
  hasS3Urls,
  getImageDiagnostics,
  type ImageProcessingStats,
} from "./imageReplacer";
import { processMarkdown, type RetryMetrics } from "./markdownRetryProcessor";
import {
  processToggleSection,
  processHeadingSection,
} from "./sectionProcessors";
import {
  removeDuplicateTitle,
  writeMarkdownFile,
  writePlaceholderFile,
} from "./contentWriter";
import { processBatch } from "./timeoutUtils";
import { ProgressTracker } from "./progressTracker";
import { computeScriptHash, formatScriptHashSummary } from "./scriptHasher";
import {
  loadPageMetadataCache,
  savePageMetadataCache,
  createEmptyCache,
  determineSyncMode,
  filterChangedPages,
  findDeletedPages,
  updatePageInCache,
  removePageFromCache,
  getCacheStats,
  hasMissingOutputs,
  PROJECT_ROOT,
  normalizePath,
  type PageMetadataCache,
} from "./pageMetadataCache";

/**
 * Context captured for each page task during sequential pre-processing.
 * Contains all data needed to process a page independently.
 */
interface PageTask {
  pageByLang: any;
  lang: string;
  page: any;
  pageTitle: string;
  filename: string;
  safeFilename: string;
  filePath: string;
  relativePath: string;
  frontmatter: string;
  customProps: Record<string, unknown>;
  pageGroupIndex: number;
  pageProcessingIndex: number;
  totalPages: number;
  PATH: string;
  // Shared caches (passed by reference for deduplication)
  blocksMap: Map<string, { key: string; data: any[] }>;
  markdownMap: Map<string, { key: string; data: any }>;
  blockPrefetchCache: any;
  markdownPrefetchCache: any;
  inFlightBlockFetches: Map<string, Promise<any[]>>;
  inFlightMarkdownFetches: Map<string, Promise<any>>;
  // Current section folder for this page (captured at task creation time)
  currentSectionFolderForLang: string | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CalloutBlockNode = CalloutBlockObjectResponse & {
  children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
};

const CONTENT_PATH =
  process.env.CONTENT_PATH || path.join(__dirname, "../../docs");
const IMAGES_PATH =
  process.env.IMAGES_PATH || path.join(__dirname, "../../static/images/");
const locales = config.i18n.locales;

// Global retry metrics tracking across all pages in a batch
const retryMetrics: RetryMetrics = {
  totalPagesWithRetries: 0,
  totalRetryAttempts: 0,
  successfulRetries: 0,
  failedRetries: 0,
  averageAttemptsPerPage: 0,
};
const DEFAULT_LOCALE = config.i18n.defaultLocale;

const resolveSectionFolderForLocale = (
  sectionFolders: Record<string, string>,
  locale: string
): string | undefined => {
  // eslint-disable-next-line security/detect-object-injection -- locale keys are controlled by configured locales and DEFAULT_LOCALE fallback
  return sectionFolders[locale] ?? sectionFolders[DEFAULT_LOCALE];
};

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

function extractSidebarPositionFromFrontmatter(content: string): number | null {
  if (!content) {
    return null;
  }

  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const endMarkerIndex = normalized.indexOf("\n---", 4);
  if (endMarkerIndex === -1) {
    return null;
  }

  const frontmatter = normalized.slice(4, endMarkerIndex);
  const lines = frontmatter.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("sidebar_position:")) {
      continue;
    }

    let value = trimmed.slice("sidebar_position:".length).trim();
    const commentIndex = value.indexOf("#");
    if (commentIndex !== -1) {
      value = value.slice(0, commentIndex).trim();
    }
    value = value.replace(/^["']|["']$/g, "");

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function findExistingSidebarPosition(
  pageId: string,
  filePath: string,
  metadataCache: PageMetadataCache,
  existingCache?: PageMetadataCache,
  preferExistingCache = false
): number | null {
  const candidatePaths: string[] = [];
  const addCandidate = (candidate?: string) => {
    if (!candidate || candidatePaths.includes(candidate)) {
      return;
    }
    candidatePaths.push(candidate);
  };
  const addCandidates = (candidates?: string[]) => {
    if (!candidates?.length) {
      return;
    }
    for (const candidate of candidates) {
      addCandidate(candidate);
    }
  };

  // eslint-disable-next-line security/detect-object-injection -- pageId comes from current Notion page metadata index
  const cachedPage = metadataCache.pages?.[pageId];
  // eslint-disable-next-line security/detect-object-injection -- pageId comes from current Notion page metadata index
  const existingCachedPage = existingCache?.pages?.[pageId];
  const existingOutputPaths = existingCachedPage?.outputPaths;
  const cachedOutputPaths = cachedPage?.outputPaths;

  if (preferExistingCache) {
    addCandidates(existingOutputPaths);
  }

  addCandidates(cachedOutputPaths);
  addCandidate(filePath);

  if (!preferExistingCache) {
    addCandidates(existingOutputPaths);
  }

  for (const candidate of candidatePaths) {
    const resolvedPath = normalizePath(candidate);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      continue;
    }
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const position = extractSidebarPositionFromFrontmatter(content);
    if (position !== null) {
      return position;
    }
  }

  return null;
}

// setTranslationString moved to translationManager.ts

/**
 * Options for generateBlocks function
 */
export interface GenerateBlocksOptions {
  /** Force full rebuild, ignoring cache */
  force?: boolean;
  /** Show what would be processed without actually doing it */
  dryRun?: boolean;
  /**
   * Enable deletion of orphaned files. Only set to true when you're certain
   * the pages array contains the FULL dataset (not filtered by --max-pages,
   * --status-filter, or single-page fetch). Defaults to false for safety.
   */
  enableDeletion?: boolean;
}

/**
 * Result returned from processSinglePage for aggregation.
 * Includes cache stats to avoid race conditions on shared counters.
 */
interface PageProcessingResult {
  success: boolean;
  totalSaved: number;
  emojiCount: number;
  pageTitle: string;
  pageId: string;
  lastEdited: string;
  outputPath: string;
  // Cache stats returned per-page to avoid race conditions
  blockFetches: number;
  blockCacheHits: number;
  markdownFetches: number;
  markdownCacheHits: number;
  containsS3: boolean;
}

function createFailedPageProcessingResult(
  task: PageTask,
  error: unknown
): PageProcessingResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(
    chalk.red(
      `Unexpected failure before page processing could complete for ${task.page.id}: ${errorMessage}`
    )
  );

  return {
    success: false,
    totalSaved: 0,
    emojiCount: 0,
    pageTitle: task.pageTitle,
    pageId: task.page.id,
    lastEdited: task.page.last_edited_time,
    outputPath: task.filePath,
    blockFetches: 0,
    blockCacheHits: 0,
    markdownFetches: 0,
    markdownCacheHits: 0,
    containsS3: true,
  };
}

/**
 * Process a single page task. This function is designed to be called in parallel.
 * All dependencies are passed in via the task object to avoid shared state issues.
 */
async function processSinglePage(
  task: PageTask
): Promise<PageProcessingResult> {
  const {
    lang,
    page,
    pageTitle,
    safeFilename,
    filePath,
    frontmatter,
    customProps,
    pageProcessingIndex,
    totalPages,
    blocksMap,
    markdownMap,
    inFlightBlockFetches,
    inFlightMarkdownFetches,
    currentSectionFolderForLang,
  } = task;

  let totalSaved = 0;
  let emojiCount = 0;
  // Track cache stats locally to avoid race conditions on shared counters
  let localBlockFetches = 0;
  let localBlockCacheHits = 0;
  let localMarkdownFetches = 0;
  let localMarkdownCacheHits = 0;
  let contentHasS3 = false;

  console.log(chalk.blue(`Processing page: ${page.id}, ${pageTitle}`));
  const pageSpinner = SpinnerManager.create(
    `Processing page ${pageProcessingIndex}/${totalPages}`,
    300000
  ); // 5 minute timeout per page

  try {
    // Fetch raw block data first for emoji and callout processing
    let rawBlocks: any[] = [];
    let emojiMap = new Map<string, string>();
    try {
      // Use local counters to track this page's cache stats
      const localBlockCacheHitsCounter = { value: 0 };
      const localBlockFetchCounter = { value: 0 };
      const { data: blockData, source: blockSource } = await loadBlocksForPage(
        page,
        pageProcessingIndex - 1,
        totalPages,
        pageTitle,
        blocksMap,
        blockPrefetchCache,
        inFlightBlockFetches,
        localBlockCacheHitsCounter,
        localBlockFetchCounter
      );
      localBlockCacheHits += localBlockCacheHitsCounter.value;
      localBlockFetches += localBlockFetchCounter.value;
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
        chalk.yellow(`  ⚠️  Failed to fetch raw blocks for processing: ${msg}`)
      );
    }

    // Load markdown lazily using the same caching mechanism
    // Use local counters to track this page's cache stats
    const localMarkdownCacheHitsCounter = { value: 0 };
    const localMarkdownFetchCounter = { value: 0 };
    const { data: markdownData, source: markdownSource } =
      await loadMarkdownForPage(
        page,
        pageProcessingIndex - 1,
        totalPages,
        pageTitle,
        markdownMap,
        markdownPrefetchCache,
        inFlightMarkdownFetches,
        localMarkdownCacheHitsCounter,
        localMarkdownFetchCounter
      );
    localMarkdownCacheHits += localMarkdownCacheHitsCounter.value;
    localMarkdownFetches += localMarkdownFetchCounter.value;
    const markdown = markdownData;
    if (markdownSource === "fetched") {
      console.log(chalk.blue(`  ↳ Markdown generated for page`));
    } else if (markdownSource === "cache") {
      console.log(chalk.blue(`  ↳ Markdown reused from cache`));
    }
    const markdownString = n2m.toMarkdownString(markdown);

    if (markdownString?.parent) {
      // Use the markdown processing function (automatically selects retry or single-pass based on feature flag)
      const result = await processMarkdown(
        markdownString.parent,
        {
          pageId: page.id,
          pageTitle,
          safeFilename,
        },
        rawBlocks,
        emojiMap,
        retryMetrics
      );

      markdownString.parent = result.content;
      totalSaved += result.totalSaved;
      emojiCount += result.fallbackEmojiCount;
      contentHasS3 = result.containsS3;

      markdownString.parent = sanitizeMarkdownContent(markdownString.parent);

      markdownString.parent = ensureBlankLineAfterStandaloneBold(
        markdownString.parent
      );

      const contentBody = removeDuplicateTitle(
        markdownString.parent,
        pageTitle
      );

      const sectionFolderForWrite: Record<string, string | undefined> = {};
      // eslint-disable-next-line security/detect-object-injection -- lang is constrained to locale values from grouped content
      sectionFolderForWrite[lang] = currentSectionFolderForLang;

      const finalDiagnostics = getImageDiagnostics(markdownString.parent ?? "");
      contentHasS3 = finalDiagnostics.s3Matches > 0;

      writeMarkdownFile(
        filePath,
        frontmatter,
        contentBody,
        pageTitle,
        pageProcessingIndex - 1,
        totalPages,
        pageSpinner,
        safeFilename,
        customProps,
        sectionFolderForWrite,
        lang
      );

      try {
        if (fs.existsSync(filePath)) {
          const writtenContent = fs.readFileSync(filePath, "utf-8");
          const postWriteDiagnostics = getImageDiagnostics(writtenContent);
          if (postWriteDiagnostics.s3Matches > 0) {
            contentHasS3 = true;
            console.warn(
              chalk.yellow(
                `  ⚠️  Post-write validation detected ${postWriteDiagnostics.s3Matches} S3 URL(s) in ${filePath}`
              )
            );
            if (postWriteDiagnostics.s3Samples.length > 0) {
              console.warn(
                chalk.gray(
                  `     Sample URLs: ${postWriteDiagnostics.s3Samples.join(", ")}`
                )
              );
            }
            logImageFailure({
              timestamp: new Date().toISOString(),
              pageBlock: safeFilename,
              pageId: page.id,
              pageTitle,
              outputPath: filePath,
              leftoverS3Count: postWriteDiagnostics.s3Matches,
              samples: postWriteDiagnostics.s3Samples,
              type: "post_write_validation_failure",
            });
          } else {
            contentHasS3 = false;
          }
        }
      } catch (validationError) {
        console.warn(
          chalk.yellow(
            `  ⚠️  Failed to run post-write validation for ${filePath}: ${validationError instanceof Error ? validationError.message : String(validationError)}`
          )
        );
      }

      pageSpinner.succeed(
        chalk.green(
          `Processed page ${pageProcessingIndex}/${totalPages}: ${pageTitle}`
        )
      );
    } else {
      // Write placeholder file when no content exists
      // Note: writePlaceholderFile sets spinner to warn state, don't overwrite it
      writePlaceholderFile(
        filePath,
        frontmatter,
        page.id,
        pageProcessingIndex - 1, // processedPages
        totalPages,
        pageSpinner
      );
    }

    return {
      success: true,
      totalSaved,
      emojiCount,
      pageTitle,
      pageId: page.id,
      lastEdited: page.last_edited_time,
      outputPath: filePath,
      blockFetches: localBlockFetches,
      blockCacheHits: localBlockCacheHits,
      markdownFetches: localMarkdownFetches,
      markdownCacheHits: localMarkdownCacheHits,
      containsS3: contentHasS3,
    };
  } catch (pageError) {
    console.error(
      chalk.red(`Failed to process page ${pageProcessingIndex}: ${page.id}`),
      pageError
    );
    pageSpinner.fail(
      chalk.red(
        `Failed to process page ${pageProcessingIndex}/${totalPages}: ${page.id}`
      )
    );
    return {
      success: false,
      totalSaved,
      emojiCount,
      pageTitle,
      pageId: page.id,
      lastEdited: page.last_edited_time,
      outputPath: filePath,
      blockFetches: localBlockFetches,
      blockCacheHits: localBlockCacheHits,
      markdownFetches: localMarkdownFetches,
      markdownCacheHits: localMarkdownCacheHits,
      containsS3: true,
    };
  } finally {
    SpinnerManager.remove(pageSpinner);
  }
}

export async function generateBlocks(
  pages,
  progressCallback,
  options: GenerateBlocksOptions = {}
) {
  // pages are already sorted by Order property in fetchNotion.ts
  let totalSaved = 0;
  let processedPages = 0;

  // Variables to track section folders and title metadata
  let currentSectionFolder: Record<string, string> = {};
  const currentHeading = new Map<string, string>();

  // Stats for reporting
  let sectionCount = 0;
  let titleSectionCount = 0;
  let emojiCount = 0;

  const pagesByLang = [];

  // --- Incremental Sync Setup ---
  const { force = false, dryRun = false, enableDeletion = false } = options;

  // Compute script hash
  console.log(chalk.blue("\n🔍 Computing script hash for incremental sync..."));
  const scriptHashResult = await computeScriptHash();
  console.log(chalk.gray(formatScriptHashSummary(scriptHashResult)));

  // Load existing cache for deletion detection (even if we do a full rebuild)
  const existingCache = loadPageMetadataCache();

  // Determine sync mode
  const syncMode = determineSyncMode(scriptHashResult.hash, force);
  let metadataCache: PageMetadataCache;

  if (syncMode.fullRebuild || !syncMode.cache) {
    console.log(
      chalk.yellow(`\n⚠️  Full rebuild required: ${syncMode.reason}`)
    );
    metadataCache = createEmptyCache(scriptHashResult.hash);
  } else {
    metadataCache = syncMode.cache;
    const stats = getCacheStats(metadataCache);
    console.log(
      chalk.green(
        `\n✅ Incremental sync enabled: ${stats.totalPages} pages in cache`
      )
    );
    if (stats.lastSync) {
      console.log(chalk.gray(`   Last sync: ${stats.lastSync}`));
    }
  }

  // Build set of current page IDs for deleted page detection
  const currentPageIds = new Set<string>();
  for (const page of pages) {
    if (page?.id) {
      currentPageIds.add(page.id);
    }
  }

  // Find and handle deleted pages (only when explicitly enabled with full dataset)
  if (!enableDeletion) {
    console.log(
      chalk.gray(
        "\n⏭️  Skipping deleted page detection (use full fetch without filters to enable)"
      )
    );
  } else if (currentPageIds.size === 0) {
    console.log(
      chalk.yellow(
        "\n⚠️  Deletion skipped: enableDeletion=true but zero pages were fetched. This typically indicates a temporary Notion/API issue or an overly strict filter. No files will be removed."
      )
    );
  } else {
    // Use existingCache for deletion detection to handle cases where metadataCache
    // is a fresh empty cache (e.g., during full rebuild due to script changes)
    const deletedPages = findDeletedPages(currentPageIds, existingCache);
    if (deletedPages.length > 0) {
      console.log(
        chalk.yellow(`\n🗑️  Found ${deletedPages.length} deleted pages`)
      );
      for (const deleted of deletedPages) {
        for (const outputPath of deleted.outputPaths) {
          if (dryRun) {
            console.log(chalk.gray(`   Would delete: ${outputPath}`));
          } else {
            try {
              if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
                console.log(chalk.gray(`   Deleted: ${outputPath}`));
              }
            } catch (err) {
              console.warn(chalk.yellow(`   Failed to delete: ${outputPath}`));
            }
          }
        }
        removePageFromCache(metadataCache, deleted.pageId);
      }
    }
  }

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

    // Collect page tasks for parallel processing
    const pageTasks: PageTask[] = [];

    // Phase 1: Process Toggle/Heading sequentially (they modify shared state)
    // and collect Page tasks with their captured context
    for (let i = 0; i < pagesByLang.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i iterates array bounds of pagesByLang
      const pageByLang = pagesByLang[i];
      // pages share section type and filename
      const title = pageByLang.mainTitle;
      const sectionTypeRaw = pageByLang.section;
      const sectionTypeString =
        typeof sectionTypeRaw === "string"
          ? sectionTypeRaw.trim()
          : String(sectionTypeRaw ?? "").trim();
      const normalizedSectionType = sectionTypeString.toLowerCase();
      const filename = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const orderedLocales = getOrderedLocales(Object.keys(pageByLang.content));
      for (const lang of orderedLocales) {
        const PATH = lang == "en" ? CONTENT_PATH : getI18NPath(lang);
        // eslint-disable-next-line security/detect-object-injection -- lang is from ordered locale keys of pageByLang.content
        const page = pageByLang.content[lang];
        const pageTitle = resolvePageTitle(page);
        const safeFallbackId = (page?.id ?? String(i + 1)).slice(0, 8);
        const safeFilename =
          filename || `${FALLBACK_TITLE_PREFIX}-${safeFallbackId}`;
        const sectionFolderForLang = resolveSectionFolderForLocale(
          currentSectionFolder,
          lang
        );

        const fileName = `${safeFilename}.md`;
        const filePath = sectionFolderForLang
          ? path.join(PATH, sectionFolderForLang, fileName)
          : path.join(PATH, fileName);
        const relativePath = sectionFolderForLang
          ? `${sectionFolderForLang}/${fileName}`
          : fileName;

        // Set translation string for non-English pages
        if (lang !== "en") {
          setTranslationString(lang, pageByLang.mainTitle, pageTitle);
        }

        // TOGGLE - process sequentially (modifies currentSectionFolder)
        if (normalizedSectionType === "toggle") {
          const pageSpinner = SpinnerManager.create(
            `Processing toggle section: ${pageTitle}`,
            30000
          );
          try {
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
            // eslint-disable-next-line security/detect-object-injection -- lang is constrained locale key during sequential toggle processing
            currentSectionFolder[lang] = sectionFolder;
            sectionCount++;
            processedPages++;
            progressCallback({ current: processedPages, total: totalPages });
          } finally {
            SpinnerManager.remove(pageSpinner);
          }
          // HEADING (Title) - process sequentially (modifies currentHeading)
        } else if (
          normalizedSectionType === "title" ||
          normalizedSectionType === "heading"
        ) {
          const pageSpinner = SpinnerManager.create(
            `Processing heading: ${pageTitle}`,
            30000
          );
          try {
            processHeadingSection(pageTitle, lang, currentHeading, pageSpinner);
            titleSectionCount++;
            currentSectionFolder = {};
            processedPages++;
            progressCallback({ current: processedPages, total: totalPages });
          } finally {
            SpinnerManager.remove(pageSpinner);
          }
          // PAGE - collect task for parallel processing
        } else if (normalizedSectionType === "page") {
          pageProcessingIndex += 1;

          // Guard against malformed pages with null/undefined properties
          const props = page.properties;

          let tags = ["comapeo"];
          if (props?.["Tags"]?.multi_select) {
            tags = props["Tags"].multi_select.map((tag) => tag.name);
          }

          let keywords = ["docs", "comapeo"];
          if (
            props?.Keywords?.multi_select &&
            props.Keywords.multi_select.length > 0
          ) {
            keywords = props.Keywords.multi_select.map(
              (keyword) => keyword.name
            );
          }

          const orderValue = props?.["Order"]?.number;
          let sidebarPosition = Number.isFinite(orderValue) ? orderValue : null;
          if (sidebarPosition === null && !enableDeletion) {
            sidebarPosition = findExistingSidebarPosition(
              page.id,
              filePath,
              metadataCache,
              existingCache,
              syncMode.fullRebuild
            );
          }
          if (sidebarPosition === null) {
            sidebarPosition = i + 1;
          }

          const customProps: Record<string, unknown> = {};
          if (
            props?.["Icon"]?.rich_text &&
            props["Icon"].rich_text.length > 0
          ) {
            customProps.icon = props["Icon"].rich_text[0].plain_text;
          }

          const pendingHeading = currentHeading.get(lang);
          if (pendingHeading) {
            customProps.title = pendingHeading;
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

          // Check if this page needs processing (incremental sync)
          const cachedPage = metadataCache.pages[page.id];
          // Normalize filePath for consistent comparison with cached paths
          const normalizedFilePath = normalizePath(filePath);
          const needsProcessing =
            syncMode.fullRebuild ||
            !cachedPage ||
            hasMissingOutputs(metadataCache, page.id) ||
            // If path changed (e.g. moved/renamed), we must re-process even if timestamp is same
            !cachedPage.outputPaths?.includes(normalizedFilePath) ||
            new Date(page.last_edited_time).getTime() >
              new Date(cachedPage.lastEdited).getTime();

          if (!needsProcessing) {
            // OPTIMIZATION: Check if ANY of the existing output files contain S3 URLs
            // We use the cached output paths because they represent exactly what is on disk
            let hasExpiringLinks = false;
            if (cachedPage && cachedPage.outputPaths) {
              for (const outputPath of cachedPage.outputPaths) {
                // Handle both absolute and relative paths from cache
                // Use PROJECT_ROOT for consistency with pageMetadataCache normalization
                const absPath = path.isAbsolute(outputPath)
                  ? outputPath
                  : path.join(PROJECT_ROOT, outputPath);

                if (fs.existsSync(absPath)) {
                  const content = fs.readFileSync(absPath, "utf-8");
                  if (hasS3Urls(content)) {
                    hasExpiringLinks = true;
                    console.warn(
                      chalk.yellow(
                        `  ⚠️  Found expiring S3 URLs in ${path.basename(absPath)}, forcing update: ${pageTitle}`
                      )
                    );
                    break; // Found one, that's enough to force update
                  }
                }
              }
            }

            if (!hasExpiringLinks) {
              // Page unchanged, skip processing but still count it
              console.log(
                chalk.gray(`  ⏭️  Skipping unchanged page: ${pageTitle}`)
              );
              processedPages++;
              progressCallback({ current: processedPages, total: totalPages });
            } else {
              // Force processing because of bad content
              pageTasks.push({
                pageByLang,
                lang,
                page,
                pageTitle,
                filename,
                safeFilename,
                filePath,
                relativePath,
                frontmatter,
                customProps,
                pageGroupIndex: i,
                pageProcessingIndex,
                totalPages,
                PATH,
                blocksMap,
                markdownMap,
                blockPrefetchCache,
                markdownPrefetchCache,
                inFlightBlockFetches,
                inFlightMarkdownFetches,
                currentSectionFolderForLang: sectionFolderForLang,
              });
            }
          } else if (dryRun) {
            // Dry run - show what would be processed
            console.log(chalk.cyan(`  📋 Would process: ${pageTitle}`));
            processedPages++;
            progressCallback({ current: processedPages, total: totalPages });
          } else {
            // Capture current context for this page task
            pageTasks.push({
              pageByLang,
              lang,
              page,
              pageTitle,
              filename,
              safeFilename,
              filePath,
              relativePath,
              frontmatter,
              customProps,
              pageGroupIndex: i,
              pageProcessingIndex,
              totalPages,
              PATH,
              blocksMap,
              markdownMap,
              blockPrefetchCache,
              markdownPrefetchCache,
              inFlightBlockFetches,
              inFlightMarkdownFetches,
              currentSectionFolderForLang: sectionFolderForLang,
            });
          }

          // Clear pending heading after capturing it
          if (pendingHeading) {
            currentHeading.set(lang, null);
          }
        }
      }
    }

    // Phase 2: Process all Page tasks in parallel
    if (pageTasks.length > 0) {
      const skippedCount =
        totalPages - pageTasks.length - sectionCount - titleSectionCount;
      if (skippedCount > 0 && !syncMode.fullRebuild) {
        console.log(
          chalk.green(
            `\n⏭️  Skipped ${skippedCount} unchanged pages (incremental sync)`
          )
        );
      }

      console.log(
        chalk.blue(
          `\n🚀 Processing ${pageTasks.length} pages in parallel (max 5 concurrent)...`
        )
      );

      // Create progress tracker for parallel page processing
      const progressTracker = new ProgressTracker({
        total: pageTasks.length,
        operation: "pages",
        spinnerTimeoutMs: 300000, // 5 minutes for all pages
      });

      // Track failed count for summary
      let failedCount = 0;

      const pageResults = await processBatch(
        pageTasks,
        async (task) => {
          try {
            return await processSinglePage(task);
          } catch (error) {
            return createFailedPageProcessingResult(task, error);
          }
        },
        {
          // TODO: Make concurrency configurable via environment variable or config
          // See Issue #6 (Adaptive Batch) in IMPROVEMENT_ISSUES.md
          maxConcurrent: 5,
          timeoutMs: 600000, // 10 minutes per batch item (allows for 5 min page timeout + buffer)
          operation: "page processing",
          progressTracker,
          // Stream progress updates as each page completes
          onItemComplete: (index, result) => {
            // Aggregate stats from this page's result
            if (result.status === "fulfilled") {
              const value = result.value as PageProcessingResult;
              totalSaved += value.totalSaved;
              emojiCount += value.emojiCount;
              blockFetchCount.value += value.blockFetches;
              blockCacheHits.value += value.blockCacheHits;
              markdownFetchCount.value += value.markdownFetches;
              markdownCacheHits.value += value.markdownCacheHits;
              if (!value.success) {
                failedCount++;
              } else {
                // Update cache with successful page processing
                updatePageInCache(
                  metadataCache,
                  value.pageId,
                  value.lastEdited,
                  [value.outputPath],
                  value.containsS3
                );
              }
            } else {
              failedCount++;
              // Include page title for better error context
              // eslint-disable-next-line security/detect-object-injection -- index is produced by iterating settled promise results
              const failedTask = pageTasks[index];
              console.error(
                chalk.red(
                  `Page processing failed: ${failedTask?.pageTitle || "unknown"}: ${result.reason}`
                )
              );
            }
            // Emit progress update immediately as each page settles
            processedPages++;
            progressCallback({ current: processedPages, total: totalPages });
          },
        }
      );

      if (failedCount > 0) {
        console.warn(
          chalk.yellow(
            `\n⚠️  ${failedCount}/${pageTasks.length} pages failed to process`
          )
        );
      } else {
        console.log(
          chalk.green(
            `\n✅ All ${pageTasks.length} pages processed successfully`
          )
        );
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

    // Report retry metrics if any retries occurred
    if (retryMetrics.totalPagesWithRetries > 0) {
      retryMetrics.averageAttemptsPerPage =
        retryMetrics.totalRetryAttempts / retryMetrics.totalPagesWithRetries;

      console.info(chalk.cyan(`\n🔄 Retry Metrics:`));
      console.info(
        chalk.blue(
          `   📊 Pages with retries: ${retryMetrics.totalPagesWithRetries}`
        )
      );
      console.info(
        chalk.blue(
          `   🔁 Total retry attempts: ${retryMetrics.totalRetryAttempts}`
        )
      );
      console.info(
        chalk.green(
          `   ✅ Successful retries: ${retryMetrics.successfulRetries}`
        )
      );
      if (retryMetrics.failedRetries > 0) {
        console.info(
          chalk.yellow(`   ⚠️  Failed retries: ${retryMetrics.failedRetries}`)
        );
      }
      console.info(
        chalk.blue(
          `   📈 Avg attempts/page: ${retryMetrics.averageAttemptsPerPage.toFixed(1)}`
        )
      );

      // Save retry metrics to JSON file for production monitoring
      try {
        const metricsPath = path.join(__dirname, "../../retry-metrics.json");
        const retryEnabled =
          (
            process.env.ENABLE_RETRY_IMAGE_PROCESSING ?? "true"
          ).toLowerCase() === "true";
        const maxRetries = parseInt(process.env.MAX_IMAGE_RETRIES ?? "3", 10);

        const metricsData = {
          timestamp: new Date().toISOString(),
          configuration: {
            retryEnabled,
            maxRetries,
            concurrency: 5,
          },
          summary: {
            totalPagesProcessed: totalPages,
            totalPagesWithRetries: retryMetrics.totalPagesWithRetries,
            retrySuccessRate:
              retryMetrics.totalPagesWithRetries > 0
                ? (
                    (retryMetrics.successfulRetries /
                      retryMetrics.totalPagesWithRetries) *
                    100
                  ).toFixed(1) + "%"
                : "N/A",
          },
          metrics: {
            ...retryMetrics,
            retryFrequency:
              totalPages > 0
                ? (
                    (retryMetrics.totalPagesWithRetries / totalPages) *
                    100
                  ).toFixed(1) + "%"
                : "0%",
          },
        };

        fs.writeFileSync(
          metricsPath,
          JSON.stringify(metricsData, null, 2),
          "utf-8"
        );
        console.info(
          chalk.gray(
            `   💾 Retry metrics saved to ${path.basename(metricsPath)}`
          )
        );
      } catch (metricsError) {
        console.warn(
          chalk.yellow(
            `   ⚠️  Failed to save retry metrics: ${metricsError instanceof Error ? metricsError.message : String(metricsError)}`
          )
        );
      }
    }

    if (cacheStats.validEntries > 0) {
      console.info(
        chalk.green(
          `   🚀 Future runs will be faster with ${cacheStats.validEntries} cached images`
        )
      );
    }

    // Save page metadata cache for incremental sync
    if (!dryRun) {
      metadataCache.lastSync = new Date().toISOString();
      savePageMetadataCache(metadataCache);
      const finalCacheStats = getCacheStats(metadataCache);
      console.info(
        chalk.green(
          `\n💾 Saved incremental sync cache with ${finalCacheStats.totalPages} pages`
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
