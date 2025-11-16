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
import axios from "axios";
import chalk from "chalk";
import { processImage } from "./imageProcessor";
import {
  sanitizeMarkdownContent,
  compressImageToFileWithFallback,
  detectFormatFromBuffer,
  formatFromContentType,
  chooseFormat,
  extForFormat,
  isResizableFormat,
} from "./utils";
import config from "../../docusaurus.config";
import SpinnerManager from "./spinnerManager";
import { convertCalloutToAdmonition, isCalloutBlock } from "./calloutProcessor";
import { fetchNotionBlocks } from "../fetchNotionData";
import { EmojiProcessor } from "./emojiProcessor";
import {
  quoteYamlValue,
  getPublishedDate,
  buildFrontmatter,
} from "./frontmatterBuilder";
import {
  sanitizeMarkdownImages,
  ensureBlankLineAfterStandaloneBold,
  processCalloutsInMarkdown,
} from "./markdownTransform";
import {
  validateAndSanitizeImageUrl,
  createFallbackImageMarkdown,
} from "./imageValidation";
import {
  getElementTypeProperty,
  resolvePageTitle,
  resolvePageLocale,
  groupPagesByLang,
  createStandalonePageGroup,
} from "./pageGrouping";
import { LRUCache, validateCacheSize, buildCacheKey } from "./cacheStrategies";

// Enhanced image handling utilities for robust processing
interface ImageProcessingResult {
  success: boolean;
  newPath?: string;
  savedBytes?: number;
  error?: string;
  fallbackUsed?: boolean;
}

interface ImageUrlValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

// validateAndSanitizeImageUrl moved to imageValidation.ts

// createFallbackImageMarkdown moved to imageValidation.ts

/**
 * Enhanced image processing with comprehensive fallback handling
 */
async function processImageWithFallbacks(
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
 */
function logImageFailure(logEntry: any): void {
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

// sanitizeMarkdownImages moved to markdownTransform.ts
// ensureBlankLineAfterStandaloneBold moved to markdownTransform.ts

/**
 * Image cache system to prevent re-downloading and provide recovery options
 */
interface ImageCacheEntry {
  url: string;
  localPath: string;
  timestamp: string;
  blockName: string;
  checksum?: string;
}

class ImageCache {
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
 */
async function downloadAndProcessImageWithCache(
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

// getPublishedDate is now imported from frontmatterBuilder.ts

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CalloutBlockNode = CalloutBlockObjectResponse & {
  children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
};

const CONTENT_PATH = path.join(__dirname, "../../docs");
const IMAGES_PATH = path.join(__dirname, "../../static/images/");
const I18N_PATH = path.join(__dirname, "../../i18n/");
const getI18NPath = (locale: string) =>
  path.join(I18N_PATH, locale, "docusaurus-plugin-content-docs", "current");
const locales = config.i18n.locales;
const DEFAULT_LOCALE = config.i18n.defaultLocale;

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

// Markdown transform functions (processCalloutsInMarkdown, extractTextFromCalloutBlock,
// normalizeForMatch, findMatchingBlockquote) are now imported from markdownTransform.ts

async function downloadAndProcessImage(
  url: string,
  blockName: string,
  index: number
) {
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

// Page grouping functions (getElementTypeProperty, resolvePageTitle, resolvePageLocale,
// groupPagesByLang, createStandalonePageGroup) are now imported from pageGrouping.ts

// Frontmatter functions (quoteYamlValue, buildFrontmatter) are now imported from frontmatterBuilder.ts

// Cache strategies (LRUCache, validateCacheSize, buildCacheKey) are now imported from cacheStrategies.ts

const CACHE_MAX_SIZE = validateCacheSize();

const blockPrefetchCache = new LRUCache<any[]>(CACHE_MAX_SIZE);
const markdownPrefetchCache = new LRUCache<any>(CACHE_MAX_SIZE);

export function __resetPrefetchCaches(): void {
  blockPrefetchCache.clear();
  markdownPrefetchCache.clear();
}

function setTranslationString(
  lang: string,
  original: string,
  translated: string
) {
  const lPath = path.join(I18N_PATH, lang, "code.json");
  const dir = path.dirname(lPath);
  fs.mkdirSync(dir, { recursive: true });

  let fileContents = "{}";
  try {
    const existing = fs.readFileSync(lPath, "utf8");
    if (typeof existing === "string" && existing.trim().length > 0) {
      fileContents = existing;
    }
  } catch {
    console.warn(
      chalk.yellow(
        `Translation file missing for ${lang}, creating a new one at ${lPath}`
      )
    );
  }

  let file: Record<string, any>;
  try {
    file = JSON.parse(fileContents);
  } catch (parseError) {
    console.warn(
      chalk.yellow(
        `Failed to parse translation file for ${lang}, resetting content`
      ),
      parseError
    );
    file = {};
  }

  const safeKey =
    typeof original === "string"
      ? original.slice(0, 2000)
      : String(original).slice(0, 2000);
  const safeMessage =
    typeof translated === "string"
      ? translated.slice(0, 5000)
      : String(translated).slice(0, 5000);

  file[safeKey] = { message: safeMessage };
  fs.writeFileSync(lPath, JSON.stringify(file, null, 4));
}

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

    const logProgress = (
      index: number,
      total: number,
      prefix: string,
      title: string
    ) => {
      if (
        total > 0 &&
        (index === 0 ||
          index === total - 1 ||
          ((index + 1) % 10 === 0 && index + 1 < total))
      ) {
        console.log(
          chalk.gray(`    ${prefix} ${index + 1}/${total} for "${title}"`)
        );
      }
    };

    /**
     * Generic cache loader that handles:
     * 1. Main map cache lookup
     * 2. Prefetch cache lookup
     * 3. In-flight request deduplication
     * 4. Cache hit/miss tracking
     */
    const loadWithCache = async <T>(
      pageRecord: Record<string, any>,
      pageIndex: number,
      totalCount: number,
      title: string,
      config: {
        mainMap: Map<string, { key: string; data: T }>;
        prefetchCache: LRUCache<T>;
        inFlightMap: Map<string, Promise<T>>;
        cacheHits: { value: number };
        fetchCount: { value: number };
        fetchFn: (pageId: string) => Promise<T>;
        normalizeResult: (result: any) => T;
        logPrefix: string;
      }
    ): Promise<{ data: T; source: "cache" | "fetched" }> => {
      const pageId = pageRecord?.id;
      if (!pageId) {
        return { data: config.normalizeResult([]), source: "cache" };
      }

      const cacheKey = buildCacheKey(pageId, pageRecord?.last_edited_time);

      // Check main map cache
      const existing = config.mainMap.get(pageId);
      if (existing && existing.key === cacheKey) {
        config.cacheHits.value += 1;
        return { data: existing.data, source: "cache" };
      }

      // Check prefetch cache
      if (config.prefetchCache.has(cacheKey)) {
        config.cacheHits.value += 1;
        const cached = config.prefetchCache.get(cacheKey);
        const normalized = config.normalizeResult(cached);
        config.mainMap.set(pageId, { key: cacheKey, data: normalized });
        return { data: normalized, source: "cache" };
      }

      // Check in-flight requests or start new fetch
      let inFlight = config.inFlightMap.get(cacheKey);
      if (!inFlight) {
        config.fetchCount.value += 1;
        logProgress(pageIndex, totalCount, config.logPrefix, title);
        inFlight = (async () => {
          const result = await config.fetchFn(pageId);
          const normalized = config.normalizeResult(result);
          config.prefetchCache.set(cacheKey, normalized);
          return normalized;
        })()
          .catch((error) => {
            config.prefetchCache.delete(cacheKey);
            throw error;
          })
          .finally(() => {
            config.inFlightMap.delete(cacheKey);
          });
        config.inFlightMap.set(cacheKey, inFlight);
      }

      const result = await inFlight;
      const normalized = config.normalizeResult(result);
      config.mainMap.set(pageId, { key: cacheKey, data: normalized });
      return { data: normalized, source: "fetched" };
    };

    const loadBlocksForPage = async (
      pageRecord: Record<string, any>,
      pageIndex: number,
      totalCount: number,
      title: string
    ): Promise<{ data: any[]; source: "cache" | "fetched" }> => {
      return loadWithCache<any[]>(pageRecord, pageIndex, totalCount, title, {
        mainMap: blocksMap,
        prefetchCache: blockPrefetchCache,
        inFlightMap: inFlightBlockFetches,
        cacheHits: blockCacheHits,
        fetchCount: blockFetchCount,
        fetchFn: fetchNotionBlocks,
        normalizeResult: (result) => (Array.isArray(result) ? result : []),
        logPrefix: "Fetching blocks",
      });
    };

    const loadMarkdownForPage = async (
      pageRecord: Record<string, any>,
      pageIndex: number,
      totalCount: number,
      title: string
    ): Promise<{ data: any; source: "cache" | "fetched" }> => {
      return loadWithCache<any>(pageRecord, pageIndex, totalCount, title, {
        mainMap: markdownMap,
        prefetchCache: markdownPrefetchCache,
        inFlightMap: inFlightMarkdownFetches,
        cacheHits: markdownCacheHits,
        fetchCount: markdownFetchCount,
        fetchFn: (pageId) => n2m.pageToMarkdown(pageId),
        normalizeResult: (result) =>
          Array.isArray(result) ? result : (result ?? []),
        logPrefix: "Converting markdown",
      });
    };

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
            const sectionName =
              page.properties?.["Title"]?.title?.[0]?.plain_text ?? pageTitle;
            if (!page.properties?.["Title"]?.title?.[0]?.plain_text) {
              console.warn(
                chalk.yellow(
                  `Missing 'Title' property for toggle page ${page.id}; falling back to page title.`
                )
              );
            }
            const sectionFolder = filename || safeFilename;
            const sectionFolderPath = path.join(PATH, sectionFolder);
            fs.mkdirSync(sectionFolderPath, { recursive: true });
            currentSectionFolder[lang] = sectionFolder;
            pageSpinner.succeed(
              chalk.green(`Section folder created: ${sectionFolder}`)
            );
            sectionCount++;
            if (lang === "en") {
              const categoryContent = {
                label: sectionName,
                position: i + 1,
                collapsible: true,
                collapsed: true,
                link: {
                  type: "generated-index",
                },
                customProps: { title: null },
              };
              if (currentHeading.get(lang)) {
                categoryContent.customProps.title = currentHeading.get(lang);
                currentHeading.set(lang, null);
              }
              const categoryFilePath = path.join(
                sectionFolderPath,
                "_category_.json"
              );
              fs.writeFileSync(
                categoryFilePath,
                JSON.stringify(categoryContent, null, 2),
                "utf8"
              );
              pageSpinner.succeed(
                chalk.green(`added _category_.json to ${sectionFolder}`)
              );
            }
            // HEADING (Title)
          } else if (
            normalizedSectionType === "title" ||
            normalizedSectionType === "heading"
          ) {
            currentHeading.set(lang, pageTitle);
            titleSectionCount++; // Increment title section counter
            currentSectionFolder = {};
            pageSpinner.succeed(
              chalk.green(
                `Title section detected: ${currentHeading.get(lang)}, will be applied to next item`
              )
            );

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
                  pageTitle
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
                pageTitle
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
              // Collect matches first without mutating the source
              const sourceMarkdown = markdownString.parent;
              // Improved URL pattern: match until a ')' not preceded by '\', allow spaces trimmed
              const imgRegex = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
              const imageMatches: Array<{
                full: string;
                url: string;
                alt: string;
                idx: number;
                start: number;
                end: number;
              }> = [];
              let m: RegExpExecArray | null;
              let tmpIndex = 0;
              let safetyCounter = 0;
              const SAFETY_LIMIT = 500; // cap images processed per page to avoid runaway loops

              while ((m = imgRegex.exec(sourceMarkdown)) !== null) {
                if (++safetyCounter > SAFETY_LIMIT) {
                  console.warn(
                    chalk.yellow(
                      `⚠️  Image match limit (${SAFETY_LIMIT}) reached; skipping remaining.`
                    )
                  );
                  break;
                }
                const start = m.index;
                const full = m[0];
                const end = start + full.length;
                const rawUrl = m[2];
                const unescapedUrl = rawUrl.replace(/\\\)/g, ")");
                imageMatches.push({
                  full,
                  url: unescapedUrl,
                  alt: m[1],
                  idx: tmpIndex++,
                  start,
                  end,
                });
              }

              const imageReplacements: Array<{
                original: string;
                replacement: string;
              }> = [];

              // Phase 1: Validate and queue all images for processing
              const imageProcessingTasks = imageMatches.map((match) => {
                const urlValidation = validateAndSanitizeImageUrl(match.url);
                if (!urlValidation.isValid) {
                  console.warn(
                    chalk.yellow(
                      `⚠️  Invalid image URL detected: ${urlValidation.error}`
                    )
                  );
                  const fallbackMarkdown = createFallbackImageMarkdown(
                    match.full,
                    match.url,
                    match.idx
                  );
                  imageReplacements.push({
                    original: match.full,
                    replacement: fallbackMarkdown,
                  });

                  logImageFailure({
                    timestamp: new Date().toISOString(),
                    pageBlock: safeFilename,
                    imageIndex: match.idx,
                    originalUrl: match.url,
                    error: urlValidation.error,
                    fallbackUsed: true,
                    validationFailed: true,
                  });

                  return Promise.resolve({
                    success: false,
                    originalMarkdown: match.full,
                    imageUrl: match.url,
                    index: match.idx,
                    error: urlValidation.error,
                    fallbackUsed: true,
                  });
                }

                if (!urlValidation.sanitizedUrl!.startsWith("http")) {
                  console.info(
                    chalk.blue(`ℹ️  Skipping local image: ${match.url}`)
                  );
                  return Promise.resolve({
                    success: false,
                    originalMarkdown: match.full,
                    imageUrl: match.url,
                    index: match.idx,
                    error: "Local image skipped",
                    fallbackUsed: true,
                  });
                }

                return processImageWithFallbacks(
                  urlValidation.sanitizedUrl!,
                  safeFilename,
                  match.idx,
                  match.full
                ).then((result) => ({
                  ...result,
                  originalMarkdown: match.full,
                  imageUrl: urlValidation.sanitizedUrl!,
                  index: match.idx,
                }));
              });

              // Phase 2: Process all valid images concurrently
              let successfulImages = 0;
              let totalFailures = 0;

              if (imageProcessingTasks.length > 0) {
                const imageResults =
                  await Promise.allSettled(imageProcessingTasks);

                // Build deterministic replacements using recorded match indices
                const indexedReplacements: Array<{
                  start: number;
                  end: number;
                  text: string;
                }> = [];
                for (const result of imageResults) {
                  if (result.status !== "fulfilled") {
                    // Promise rejection - should not happen with our error handling
                    console.error(
                      chalk.red(
                        `Unexpected image processing failure: ${result.reason}`
                      )
                    );
                    totalFailures++;
                    continue;
                  }
                  const processResult = result.value;
                  const match = imageMatches.find(
                    (im) => im.idx === processResult.index
                  );
                  if (!match) continue;
                  let replacementText: string;
                  if (processResult.success && processResult.newPath) {
                    replacementText = match.full.replace(
                      processResult.imageUrl!,
                      processResult.newPath
                    );
                    totalSaved += processResult.savedBytes || 0;
                    successfulImages++;
                  } else {
                    replacementText = createFallbackImageMarkdown(
                      match.full,
                      match.url,
                      match.idx
                    );
                    totalFailures++;
                  }
                  indexedReplacements.push({
                    start: match.start,
                    end: match.end,
                    text: replacementText,
                  });
                }
                // Apply from end to start to keep indices stable
                indexedReplacements.sort((a, b) => b.start - a.start);
                let processedMarkdown = markdownString.parent;
                for (const rep of indexedReplacements) {
                  processedMarkdown =
                    processedMarkdown.slice(0, rep.start) +
                    rep.text +
                    processedMarkdown.slice(rep.end);
                }
                // Continue with final sanitation
                processedMarkdown = sanitizeMarkdownImages(processedMarkdown);
                markdownString.parent = processedMarkdown;
              } else {
                // Phase 3: No image replacements needed, just sanitize
                let processedMarkdown = sanitizeMarkdownImages(
                  markdownString.parent
                );
                markdownString.parent = processedMarkdown;
              }

              // Phase 5: Report results
              const totalImages = imageMatches.length;
              if (totalImages > 0) {
                console.info(
                  chalk.green(
                    `📸 Processed ${totalImages} images: ${successfulImages} successful, ${totalFailures} failed`
                  )
                );
                if (totalFailures > 0) {
                  console.warn(
                    chalk.yellow(
                      `⚠️  ${totalFailures} images failed but have been replaced with informative placeholders`
                    )
                  );
                  console.info(
                    chalk.blue(
                      `💡 Check 'image-failures.json' for recovery information`
                    )
                  );
                }
              }

              // Sanitize content to fix malformed HTML/JSX tags
              markdownString.parent = sanitizeMarkdownContent(
                markdownString.parent
              );

              markdownString.parent = ensureBlankLineAfterStandaloneBold(
                markdownString.parent
              );
              // Remove duplicate title heading if it exists
              // The first H1 heading often duplicates the title in Notion exports
              let contentBody = markdownString.parent;

              // Find the first H1 heading pattern at the beginning of the content
              const firstH1Regex = /^\s*# (.+?)(?:\n|$)/;
              const firstH1Match = contentBody.match(firstH1Regex);

              if (firstH1Match) {
                const firstH1Text = firstH1Match[1].trim();
                // Check if this heading is similar to the page title (exact match or contains)
                if (
                  firstH1Text === pageTitle ||
                  pageTitle.includes(firstH1Text) ||
                  firstH1Text.includes(pageTitle)
                ) {
                  // Remove the duplicate heading
                  contentBody = contentBody.replace(firstH1Match[0], "");

                  // Also remove any empty lines at the beginning
                  contentBody = contentBody.replace(/^\s+/, "");
                }
              }

              // Add frontmatter to markdown content
              const contentWithFrontmatter = frontmatter + contentBody;
              fs.writeFileSync(filePath, contentWithFrontmatter, "utf8");

              pageSpinner.succeed(
                chalk.green(
                  `Page ${processedPages + 1}/${totalPages} processed: ${filePath}`
                )
              );
              console.log(
                chalk.blue(
                  `  ↳ Added frontmatter with id: doc-${safeFilename}, title: ${pageTitle}`
                )
              );

              // Log information about custom properties
              if (Object.keys(customProps).length > 0) {
                console.log(
                  chalk.yellow(
                    `  ↳ Added custom properties: ${JSON.stringify(customProps)}`
                  )
                );
              }

              // Log information about section folder placement
              if (currentSectionFolder[lang]) {
                console.log(
                  chalk.cyan(
                    `  ↳ Placed in section folder: ${currentSectionFolder[lang]}`
                  )
                );
              }
            } else {
              const placeholderBody = `\n<!-- Placeholder content generated automatically because the Notion page is missing a Website Block. -->\n\n:::note\nContent placeholder – add blocks in Notion to replace this file.\n:::\n`;

              fs.writeFileSync(
                filePath,
                `${frontmatter}${placeholderBody}`,
                "utf8"
              );

              pageSpinner.warn(
                chalk.yellow(
                  `No 'Website Block' property found for page ${processedPages + 1}/${totalPages}: ${page.id}. Placeholder content generated.`
                )
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
      imageCache.cleanup();
    } catch (cacheError) {
      console.warn(chalk.yellow("Warning: Failed to cleanup image cache"));
    }
  }
}
