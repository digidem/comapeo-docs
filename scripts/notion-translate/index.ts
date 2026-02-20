import { pathToFileURL } from "url";
import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import {
  notion,
  DATA_SOURCE_ID,
  DATABASE_ID,
  n2m,
  enhancedNotion,
} from "../notionClient";
import { translateText, TranslationError } from "./translateFrontMatter.js";
import {
  translateJson,
  extractTranslatableText,
  getLanguageName,
} from "./translateCodeJson.js";
import {
  createNotionPageWithBlocks,
  translateNotionBlocksDirectly,
} from "./translateBlocks.js";
import {
  fetchNotionData,
  sortAndExpandNotionData,
} from "../fetchNotionData.js";
import {
  LANGUAGES,
  MAIN_LANGUAGE,
  NOTION_PROPERTIES,
  NotionPage,
  TranslationConfig,
} from "../constants.js";
import {
  processAndReplaceImages,
  getImageDiagnostics,
  validateAndFixRemainingImages,
} from "../notion-fetch/imageReplacer.js";

const LEGACY_SECTION_PROPERTY = "Section";
const PARENT_ITEM_PROPERTY = "Parent item";

// Type helpers for Notion properties
type NotionTitleProperty = { title: Array<{ plain_text: string }> };
type NotionSelectProperty = {
  type?: "select";
  select: { name: string } | null;
};
type NotionNumberProperty = { number: number };
type NotionMultiSelectProperty = { multi_select: Array<{ name: string }> };
type NotionRelationProperty = { relation: Array<{ id: string }> };

// Type for Notion page parent (API hierarchy structure)
interface NotionPageParent {
  type?: "database_id" | "page_id" | "block_id" | "workspace";
  database_id?: string;
  page_id?: string;
  block_id?: string;
}

// Type guard for NotionSelectProperty
function isSelectProperty(prop: unknown): prop is NotionSelectProperty {
  return (
    prop !== null &&
    typeof prop === "object" &&
    "select" in prop &&
    (prop as NotionSelectProperty).select !== undefined
  );
}

// Type guard for child page blocks
interface ChildPageBlock {
  id: string;
  type?: string;
  object?: string;
}

function isChildPageBlock(block: unknown): block is ChildPageBlock {
  if (!block || typeof block !== "object") return false;
  const b = block as Record<string, unknown>;
  return (
    typeof b.id === "string" && (b.type === "child_page" || b.object === "page")
  );
}

/**
 * Extracts the parent block ID from a Notion page's parent property
 */
function getParentBlockIdFromPage(page: NotionPage): string | null {
  const parent = (page as NotionPage & { parent?: NotionPageParent }).parent;
  if (!parent) return null;
  return parent.block_id ?? parent.page_id ?? parent.database_id ?? null;
}

/**
 * Finds sibling translation pages by traversing the parent block hierarchy
 * @param englishPage The English page to find siblings for
 * @param targetLanguage The target language name (e.g., "Portuguese", "Spanish")
 * @returns The sibling translation page if found, null otherwise
 */
export async function findSiblingTranslations(
  englishPage: NotionPage,
  targetLanguage: string
): Promise<NotionPage | null> {
  // 1. Get parent block ID from page.parent (API hierarchy, not relation property)
  const parentBlockId = getParentBlockIdFromPage(englishPage);

  if (!parentBlockId) {
    return null;
  }

  // 2. Query parent's children using blocks.children.list with pagination
  let nextCursor: string | null = null;

  do {
    const childrenResponse = await enhancedNotion.blocksChildrenList({
      block_id: parentBlockId,
      start_cursor: nextCursor || undefined,
    });

    // 3. Filter children that are pages (not blocks) with matching language
    const pageChildren = childrenResponse.results.filter(isChildPageBlock);

    for (const childRef of pageChildren) {
      // Need to fetch full page to check language property
      const childPage = (await enhancedNotion.pagesRetrieve({
        page_id: childRef.id,
      })) as NotionPage;

      const langProp = childPage.properties?.[NOTION_PROPERTIES.LANGUAGE];
      const childLanguage = isSelectProperty(langProp)
        ? langProp.select?.name
        : undefined;
      if (childLanguage === targetLanguage) {
        return childPage;
      }
    }

    nextCursor = childrenResponse.next_cursor;
  } while (nextCursor);

  return null;
}
type TranslationFailure = {
  language: string;
  title: string;
  pageId?: string;
  error: string;
  isCritical: boolean;
};

type LanguageTranslationSummary = {
  language: string;
  newTranslations: number;
  updatedTranslations: number;
  skippedTranslations: number;
  failedTranslations: number;
  failures: TranslationFailure[];
};

type TranslationRunSummary = {
  totalEnglishPages: number;
  processedLanguages: number;
  newTranslations: number;
  updatedTranslations: number;
  skippedTranslations: number;
  failedTranslations: number;
  codeJsonFailures: number;
  codeJsonSourceFileMissing: boolean; // Indicates source file was missing/malformed (soft-fail)
  themeFailures: number;
  failures: TranslationFailure[];
};

type CliOptions = {
  pageId?: string;
};

export interface TranslationUpdateResult {
  needsUpdate: boolean;
  reason?: string;
  blockCount?: number;
}

const getElementTypeProperty = (page: NotionPage) =>
  page.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE] ??
  // eslint-disable-next-line security/detect-object-injection -- legacy property fallback is static and controlled
  (page.properties as Record<string, any>)?.[LEGACY_SECTION_PROPERTY];

const getTitle = (page: NotionPage): string =>
  (
    page.properties[NOTION_PROPERTIES.TITLE] as
      | NotionTitleProperty
      | undefined
      | null
  )?.title?.[0]?.plain_text || "untitled";

const getOrder = (page: NotionPage): number | undefined =>
  (page.properties[NOTION_PROPERTIES.ORDER] as NotionNumberProperty | undefined)
    ?.number;

const getParentRelationId = (page: NotionPage): string | undefined => {
  const parentRelation = page.properties["Parent item"] as
    | NotionRelationProperty
    | undefined;
  return parentRelation?.relation?.[0]?.id;
};

const normalizePageId = (pageId: string): string =>
  pageId.replace(/-/g, "").toLowerCase();

const isValidNotionPageId = (pageId: string): boolean =>
  /^[0-9a-f]{32}$/i.test(pageId);

// Summary file path for CI parsing (avoids brittle log grep)
const SUMMARY_FILE_PATH = "translation-summary.json";

/**
 * Writes the translation summary to a JSON file for reliable CI parsing.
 * This avoids brittle log parsing with grep/jq in workflows.
 */
async function writeSummaryFile(summary: TranslationRunSummary): Promise<void> {
  try {
    await fs.writeFile(
      SUMMARY_FILE_PATH,
      JSON.stringify(summary, null, 2),
      "utf8"
    );
    console.log(
      chalk.blue(`📄 Summary written to ${SUMMARY_FILE_PATH} for CI parsing`)
    );
  } catch (error) {
    // Non-fatal: log but don't throw to preserve backward compatibility
    const message = error instanceof Error ? error.message : String(error);
    console.warn(chalk.yellow(`⚠ Failed to write summary file: ${message}`));
  }
}

// Load environment variables from .env file
dotenv.config({ override: true });

// Translation config is imported from constants.js

function validateRequiredEnvironment(): void {
  const requiredVariables = ["NOTION_API_KEY", "OPENAI_API_KEY"];
  const missingVariables = requiredVariables.filter(
    // eslint-disable-next-line security/detect-object-injection -- keys come from trusted static array
    (name) => !process.env[name]
  );
  // DATA_SOURCE_ID is the primary variable for Notion API v5 (2025-09-03)
  // DATABASE_ID is accepted as a fallback for backward compatibility
  // See: scripts/migration/discoverDataSource.ts for migration guidance
  if (!process.env.DATA_SOURCE_ID && !process.env.DATABASE_ID) {
    missingVariables.push("DATA_SOURCE_ID (or DATABASE_ID fallback)");
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`
    );
  }
}

/**
 * Fetches published English pages from Notion
 */
export async function fetchPublishedEnglishPages(pageId?: string) {
  const spinner = ora("Fetching published English pages from Notion").start();

  try {
    const filter = {
      and: [
        {
          property: NOTION_PROPERTIES.STATUS,
          select: {
            equals: NOTION_PROPERTIES.READY_FOR_TRANSLATION,
          },
        },
      ],
    };

    const pages = (await fetchNotionData(filter)) as NotionPage[];

    const sortedPages = (await sortAndExpandNotionData(pages)) as NotionPage[];
    // Filter sortedPages according to language
    const filteredPages = sortedPages.filter((page) => {
      const langProp = (
        page.properties?.[NOTION_PROPERTIES.LANGUAGE] as
          | NotionSelectProperty
          | undefined
      )?.select;
      return langProp && langProp.name === MAIN_LANGUAGE;
    });

    const filteredByPageId = pageId
      ? filteredPages.filter(
          (page) => normalizePageId(page.id) === normalizePageId(pageId)
        )
      : filteredPages;

    spinner.succeed(
      chalk.green(
        `Fetched ${filteredByPageId.length} published English page${filteredByPageId.length === 1 ? "" : "s"}`
      )
    );
    return filteredByPageId;
  } catch (error) {
    spinner.fail(
      chalk.red(`Failed to fetch published English pages: ${error.message}`)
    );
    throw error;
  }
}
/**
 * Checks if a translation page exists for the given English page
 * @param englishPage The English page to check
 * @param targetLanguage The target language code
 * @returns The translation page if it exists, null otherwise
 */
export async function findTranslationPage(
  englishPage: NotionPage,
  targetLanguage: string,
  options: {
    sourcePageId?: string;
  } = {}
): Promise<NotionPage | null> {
  try {
    const englishOrder = getOrder(englishPage);
    const englishElementType =
      getElementTypeProperty(englishPage)?.select?.name?.toLowerCase();

    const rankCandidates = (results: NotionPage[]): NotionPage | null => {
      if (results.length === 0) {
        return null;
      }
      const orderMatched =
        englishOrder === undefined
          ? results
          : results.filter((page) => getOrder(page) === englishOrder);

      const elementTypeMatched = orderMatched.filter(
        (page) =>
          getElementTypeProperty(page)?.select?.name?.toLowerCase() ===
          englishElementType
      );

      if (elementTypeMatched.length > 0) {
        return elementTypeMatched[0];
      }
      if (orderMatched.length > 0) {
        return orderMatched[0];
      }
      return results[0];
    };

    const realParentRelationId = getParentRelationId(englishPage);
    const candidateParentIds = realParentRelationId
      ? [realParentRelationId]
      : [options.sourcePageId].filter((id): id is string => Boolean(id));

    for (const parentId of candidateParentIds) {
      const filter = {
        and: [
          {
            property: PARENT_ITEM_PROPERTY,
            relation: {
              contains: parentId,
            },
          },
          {
            property: NOTION_PROPERTIES.LANGUAGE,
            select: {
              equals: targetLanguage,
            },
          },
        ],
      };

      const results = (await fetchNotionData(filter)) as NotionPage[];
      const matched = rankCandidates(results);
      if (matched) {
        return matched;
      }
    }

    const fallbackFilter = {
      and: [
        {
          property: NOTION_PROPERTIES.LANGUAGE,
          select: {
            equals: targetLanguage,
          },
        },
      ],
    };
    const languageMatches = (await fetchNotionData(
      fallbackFilter
    )) as NotionPage[];
    const idMatched = languageMatches.find(
      (page) => normalizePageId(page.id) === normalizePageId(englishPage.id)
    );
    if (idMatched) {
      return idMatched;
    }

    // Sibling lookup: try finding translation via parent block hierarchy
    if (!getParentRelationId(englishPage)) {
      const sibling = await findSiblingTranslations(
        englishPage,
        targetLanguage
      );
      if (sibling) {
        return sibling;
      }
    }
    return null;
  } catch (error) {
    console.error(
      `Error finding translation page for ${englishPage.id}:`,
      error
    );
    return null;
  }
}

/**
 * Fetches translation page blocks and returns a count of meaningful content blocks.
 * Empty paragraph blocks (Notion spacers) are excluded.
 */
export async function fetchPageBlockCount(pageId: string): Promise<number> {
  const allBlocks: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined;
  let safetyCounter = 0;
  const MAX_PAGES = 100;

  while (hasMore) {
    if (++safetyCounter > MAX_PAGES) {
      console.warn(
        `Block pagination safety limit exceeded for page ${pageId}; using partial block count.`
      );
      break;
    }

    const response = await enhancedNotion.blocksChildrenList({
      block_id: pageId,
      page_size: 100,
      ...(startCursor ? { start_cursor: startCursor } : {}),
    });

    const pageResults = Array.isArray(response.results) ? response.results : [];
    allBlocks.push(...pageResults);
    hasMore = Boolean(response.has_more);
    startCursor = response.next_cursor ?? undefined;
  }

  const meaningfulBlocks = allBlocks.filter((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }

    if (block.type === "paragraph" && !block.has_children) {
      const richText = block.paragraph?.rich_text;
      if (!Array.isArray(richText) || richText.length === 0) {
        return false;
      }

      const hasText = richText.some((item) => {
        const plainText =
          typeof item?.plain_text === "string"
            ? item.plain_text
            : typeof item?.text?.content === "string"
              ? item.text.content
              : "";
        return plainText.trim().length > 0;
      });
      return hasText;
    }

    return true;
  });

  return meaningfulBlocks.length;
}

/**
 * Checks if a translation page needs to be updated
 * @param englishPage The English page
 * @param translationPage The translation page
 * @returns Metadata describing whether translation update is needed
 */
export async function needsTranslationUpdate(
  englishPage: NotionPage,
  translationPage: NotionPage | null
): Promise<TranslationUpdateResult> {
  if (!translationPage) {
    return {
      needsUpdate: true,
      reason: "No translation exists",
      blockCount: 0,
    };
  }

  const englishLastEdited = new Date(englishPage.last_edited_time);
  const translationLastEdited = new Date(translationPage.last_edited_time);
  const englishNewer = englishLastEdited > translationLastEdited;

  // Short-circuit before block inspection to avoid unnecessary API calls.
  if (englishNewer) {
    return {
      needsUpdate: true,
      reason: "English page has newer edits",
    };
  }

  try {
    const blockCount = await fetchPageBlockCount(translationPage.id);
    const hasMeaningfulContent = blockCount > 0;

    const needsUpdate = !hasMeaningfulContent;
    const reason = hasMeaningfulContent
      ? "Translation has content"
      : "Translation is empty";

    return {
      needsUpdate,
      reason,
      blockCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      chalk.yellow(
        `Unable to inspect translation page content for ${translationPage.id}: ${message}. Proceeding with update to avoid stale translations.`
      )
    );
    return {
      needsUpdate: true,
      reason: "Unable to verify translation content",
    };
  }
}

/**
 * Converts a Notion page to markdown
 * @param pageId The Notion page ID
 * @returns The markdown content
 */
async function convertPageToMarkdown(pageId: string): Promise<string> {
  try {
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const markdown = n2m.toMarkdownString(mdBlocks);
    return markdown.parent;
  } catch (error) {
    console.error(`Error converting page ${pageId} to markdown:`, error);
    throw error;
  }
}

/**
 * Saves translated content to the output directory
 * @param englishPage The English page
 * @param translatedContent The translated content
 * @param config The translation configuration
 * @returns The path to the saved file
 */
// Maximum slug length to prevent path length issues on Windows/CI (MAX_PATH = 260)
const MAX_SLUG_LENGTH = 50;
const NOTION_IMAGE_URL_FAMILY_REGEX_SOURCE =
  "https?:\\/\\/(?:prod-files-secure\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com\\/[^\\s)\"'<>]+|s3\\.[a-z0-9-]+\\.amazonaws\\.com\\/secure\\.notion-static\\.com\\/[^\\s)\"'<>]+|(?:www\\.)?notion\\.so\\/image\\/[^\\s)\"'<>]+)";
const RAW_NOTION_S3_URL_REGEX = new RegExp(
  NOTION_IMAGE_URL_FAMILY_REGEX_SOURCE,
  "gi"
);
const NOTION_IMAGE_URL_FAMILY_REGEX = new RegExp(
  NOTION_IMAGE_URL_FAMILY_REGEX_SOURCE,
  "i"
);

/**
 * Generates a deterministic, filesystem-safe filename from a title and page ID.
 * Reuses the exact slug logic from saveTranslatedContentToDisk() to ensure
 * image filenames remain consistent with markdown filenames.
 */
function generateSafeFilename(title: string, pageId: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, MAX_SLUG_LENGTH);
  const stablePageId = pageId.toLowerCase().replace(/[^a-z0-9]/g, "");
  const deterministicBase = baseSlug || "untitled";
  return `${deterministicBase}-${stablePageId}`;
}

function collectRawNotionS3Matches(content: string): {
  count: number;
  samples: string[];
} {
  const matches = content.match(RAW_NOTION_S3_URL_REGEX) ?? [];
  return {
    count: matches.length,
    samples: Array.from(new Set(matches)).slice(0, 5),
  };
}

function redactPotentiallySignedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hasSensitiveQuery = parsed.search.length > 0;
    const decodedPath = (() => {
      try {
        return decodeURIComponent(parsed.pathname);
      } catch {
        return parsed.pathname;
      }
    })();
    const hasEmbeddedSensitiveQuery =
      /[?&](?:x-amz-[a-z0-9-]+|awsaccesskeyid|signature|expires)=/i.test(
        decodedPath
      );

    let safePathname = parsed.pathname;
    if (hasEmbeddedSensitiveQuery) {
      // Encoded Notion image URLs can embed signed query params in the path.
      // Replace the dynamic payload entirely to avoid leaking credentials.
      safePathname = /^\/image\//i.test(parsed.pathname)
        ? "/image/<redacted>"
        : "/<redacted-path>";
    }

    return `${parsed.origin}${safePathname}${hasSensitiveQuery ? "?<redacted>" : ""}`;
  } catch {
    const MAX_DISPLAY_LENGTH = 160;
    if (url.length <= MAX_DISPLAY_LENGTH) {
      return url;
    }
    return `${url.slice(0, MAX_DISPLAY_LENGTH - 3)}...`;
  }
}

function formatRedactedS3Urls(urls: string[]): string {
  if (urls.length === 0) {
    return "none";
  }
  return urls.map((url) => redactPotentiallySignedUrl(url)).join(", ");
}

function isNotionImageUrlFamily(url: string): boolean {
  return NOTION_IMAGE_URL_FAMILY_REGEX.test(url);
}

export async function saveTranslatedContentToDisk(
  englishPage: NotionPage,
  translatedContent: string,
  config: TranslationConfig
): Promise<string> {
  try {
    // Create a sanitized filename from the title
    const title = getTitle(englishPage);

    // Build deterministic filename from stable page ID to keep reruns idempotent.
    // Truncate slug to avoid path length limits on Windows/CI environments
    const deterministicName = generateSafeFilename(title, englishPage.id);

    let filename = `${deterministicName}.md`;
    let outputPath = path.join(config.outputDir, filename);

    // Handle section folders
    const elementType = getElementTypeProperty(englishPage);
    const sectionType = elementType?.select?.name?.toLowerCase();

    if (sectionType) {
      if (sectionType === "toggle") {
        // For toggle sections, create a folder with the same name
        const sectionFolder = deterministicName;

        const sectionPath = path.join(config.outputDir, sectionFolder);
        await fs.mkdir(sectionPath, { recursive: true });

        // Create _category_.json file
        const categoryContent = {
          label: title,
          position:
            (
              englishPage.properties[NOTION_PROPERTIES.ORDER] as
                | NotionNumberProperty
                | undefined
            )?.number || 1,
          collapsible: true,
          collapsed: true,
          link: {
            type: "generated-index",
          },
          customProps: {
            title: title,
          },
        };

        const categoryFilePath = path.join(sectionPath, "_category_.json");
        await fs.writeFile(
          categoryFilePath,
          JSON.stringify(categoryContent, null, 2),
          "utf8"
        );

        // Skip creating a markdown file for toggle sections
        return categoryFilePath;
      }

      // For other section types, continue with normal file creation
    }

    // Ensure the output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write the translated content to the output file
    await fs.writeFile(outputPath, translatedContent, "utf8");

    return outputPath;
  } catch (error) {
    console.error(
      `Error saving translated content for ${englishPage.id}:`,
      error
    );
    throw error;
  }
}

/**
 * Translate code.json for all languages except English.
 */
async function translateAllCodeJsons(englishCodeJson: string) {
  const failures: TranslationFailure[] = [];

  for await (const config of LANGUAGES) {
    if (config.language === "en") continue; // skip English
    const codeJsonPath = path.join(
      process.cwd(),
      config.outputDir
        .split("docusaurus-plugin-content-docs/current")[0]
        .replace(/\/+$/, ""),
      "code.json"
    );
    try {
      const translatedJson = await translateJson(
        englishCodeJson,
        config.notionLangCode
      );
      await fs.writeFile(codeJsonPath, translatedJson, "utf8");
      console.log(
        chalk.green(
          `✓ Successfully saved translated code.json for ${config.language}`
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(
          `✗ Error translating code.json for ${config.language}: ${message}`
        )
      );
      failures.push({
        language: config.language,
        title: "code.json",
        error: message,
        isCritical: error instanceof TranslationError && error.isCritical,
      });
    }
  }

  return failures;
}

/**
 * Translate navbar and footer from docusaurus.config.ts for all languages except English.
 */
async function translateThemeConfig() {
  const failures: TranslationFailure[] = [];
  // Import docusaurus config
  const configPath = path.join(process.cwd(), "docusaurus.config.ts");
  const configModule = await import(configPath);
  const config = configModule.default;

  // Extract navbar and footer configs
  const navbarConfig = config.themeConfig.navbar;
  const footerConfig = config.themeConfig.footer;

  // Convert to i18n format
  const navbarTranslations = extractTranslatableText(navbarConfig, "navbar");
  const footerTranslations = extractTranslatableText(footerConfig, "footer");

  // Get language directories
  const i18nDir = path.join(process.cwd(), "i18n");
  const langDirs = await fs.readdir(i18nDir);

  for (const langDir of langDirs) {
    if (langDir === "en") continue; // Skip English

    const langPath = path.join(i18nDir, langDir);
    const langStat = await fs.stat(langPath);

    if (!langStat.isDirectory()) continue;

    const themeClassicDir = path.join(langPath, "docusaurus-theme-classic");
    await fs.mkdir(themeClassicDir, { recursive: true });

    const languageName = getLanguageName(langDir);

    // Translate and save navbar
    if (Object.keys(navbarTranslations).length > 0) {
      try {
        const translatedNavbar = await translateJson(
          JSON.stringify(navbarTranslations, null, 2),
          languageName
        );
        const navbarPath = path.join(themeClassicDir, "navbar.json");
        await fs.writeFile(navbarPath, translatedNavbar, "utf8");
        console.log(
          chalk.green(
            `✓ Successfully saved translated navbar.json for ${languageName}`
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(
            `✗ Error translating navbar for ${languageName}: ${message}`
          )
        );
        failures.push({
          language: langDir,
          title: "navbar.json",
          error: message,
          isCritical: error instanceof TranslationError && error.isCritical,
        });
      }
    }

    // Translate and save footer
    if (Object.keys(footerTranslations).length > 0) {
      try {
        const translatedFooter = await translateJson(
          JSON.stringify(footerTranslations, null, 2),
          languageName
        );
        const footerPath = path.join(themeClassicDir, "footer.json");
        await fs.writeFile(footerPath, translatedFooter, "utf8");
        console.log(
          chalk.green(
            `✓ Successfully saved translated footer.json for ${languageName}`
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(
            `✗ Error translating footer for ${languageName}: ${message}`
          )
        );
        failures.push({
          language: langDir,
          title: "footer.json",
          error: message,
          isCritical: error instanceof TranslationError && error.isCritical,
        });
      }
    }
  }

  return failures;
}
/**
 * Process all translations for a single language.
 */
async function processLanguageTranslations(
  config: TranslationConfig,
  englishPages: NotionPage[],
  pageId?: string,
  stabilizedMarkdownCache?: Map<string, string>
): Promise<LanguageTranslationSummary> {
  console.log(chalk.yellow(`\nProcessing ${config.language} translations:`));
  if (pageId) {
    console.log(
      chalk.cyan(
        `Single-page mode: processing only source page ${normalizePageId(pageId)}`
      )
    );
  }

  let newTranslations = 0;
  let updatedTranslations = 0;
  let skippedTranslations = 0;
  let failedTranslations = 0;
  const failures: TranslationFailure[] = [];

  const pagesToProcess = pageId
    ? englishPages.filter(
        (englishPage) =>
          normalizePageId(englishPage.id) === normalizePageId(pageId)
      )
    : englishPages;

  for (const englishPage of pagesToProcess) {
    const originalTitle = (
      englishPage.properties[NOTION_PROPERTIES.TITLE] as NotionTitleProperty
    ).title[0].plain_text;
    console.log(chalk.blue(`Processing: ${originalTitle}`));

    // Pre-flight validation: Check for required Parent item relation
    /* eslint-disable security/detect-object-injection -- PARENT_ITEM_PROPERTY is a constant */
    const parentRelation = (
      englishPage.properties[PARENT_ITEM_PROPERTY] as
        | NotionRelationProperty
        | undefined
    )?.relation?.[0]?.id;
    /* eslint-enable security/detect-object-injection */

    if (!parentRelation && !pageId) {
      console.warn(
        chalk.yellow(
          `⚠️  Skipping "${originalTitle}" - missing required Parent item relation`
        )
      );
      skippedTranslations++;
      failures.push({
        language: config.language,
        title: originalTitle,
        pageId: englishPage.id,
        error: "Missing required Parent item relation",
        isCritical: false,
      });
      continue;
    }

    // Find existing translation
    if (!parentRelation && pageId) {
      console.log(
        chalk.gray(
          `Bypassing Parent item relation check for "${originalTitle}" because --page-id is set`
        )
      );
    }

    const translationPage = await findTranslationPage(
      englishPage,
      config.notionLangCode,
      {
        sourcePageId: !parentRelation && pageId ? englishPage.id : undefined,
      }
    );

    // Check if translation needs update
    const updateCheck = await needsTranslationUpdate(
      englishPage,
      translationPage
    );
    if (!updateCheck.needsUpdate) {
      console.log(
        chalk.gray(
          `Skipping ${originalTitle} (${updateCheck.reason}${typeof updateCheck.blockCount === "number" ? `, blocks: ${updateCheck.blockCount}` : ""})`
        )
      );
      skippedTranslations++;
      continue;
    }

    try {
      await processSinglePageTranslation({
        englishPage,
        config,
        translationPage,
        stabilizedMarkdownCache,
        relationParentId:
          parentRelation ?? (pageId ? englishPage.id : undefined),
        onNew: () => newTranslations++,
        onUpdate: () => updatedTranslations++,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error processing ${originalTitle}:`, message));
      failedTranslations++;
      failures.push({
        language: config.language,
        title: originalTitle,
        pageId: englishPage.id,
        error: message,
        isCritical: error instanceof TranslationError && error.isCritical,
      });
    }
  }

  // Report statistics
  console.log(chalk.green(`\n✅ ${config.language} translation summary:`));
  console.log(chalk.green(`  - New translations: ${newTranslations}`));
  console.log(chalk.green(`  - Updated translations: ${updatedTranslations}`));
  console.log(chalk.gray(`  - Skipped: ${skippedTranslations}`));
  console.log(chalk.red(`  - Failed: ${failedTranslations}`));

  return {
    language: config.language,
    newTranslations,
    updatedTranslations,
    skippedTranslations,
    failedTranslations,
    failures,
  };
}

/**
 * Process translation for a single Notion page.
 */
async function processSinglePageTranslation({
  englishPage,
  config,
  translationPage,
  stabilizedMarkdownCache,
  relationParentId,
  onNew,
  onUpdate,
}: {
  englishPage: NotionPage;
  config: TranslationConfig;
  translationPage: NotionPage | null;
  stabilizedMarkdownCache?: Map<string, string>;
  relationParentId?: string;
  onNew: () => void;
  onUpdate: () => void;
}) {
  const originalTitle = getTitle(englishPage);

  // Check if this is a title page
  const elementType = getElementTypeProperty(englishPage);
  const isTitlePage = elementType?.select?.name?.toLowerCase() === "title";

  // Translate the content
  let translatedContent: string;
  let translatedTitle: string;

  if (isTitlePage) {
    // For title pages, create a minimal content with just the title
    translatedContent = `# ${originalTitle}`;
    translatedTitle = originalTitle;
  } else {
    const safeFilename = generateSafeFilename(originalTitle, englishPage.id);
    let markdownContent = stabilizedMarkdownCache?.get(englishPage.id);
    if (markdownContent === undefined) {
      // Convert English page to markdown only when translation needs full content
      const rawMarkdownContent = await convertPageToMarkdown(englishPage.id);

      // Stabilize images: replace expiring S3 URLs with /images/... paths
      const imageResult = await processAndReplaceImages(
        rawMarkdownContent,
        safeFilename
      );

      // Fail page if any images failed to download (no broken placeholders)
      if (imageResult.stats.totalFailures > 0) {
        throw new Error(
          `Image stabilization failed for "${originalTitle}": ` +
            `${imageResult.stats.totalFailures} image(s) failed to download. ` +
            "Cannot proceed with translation - images would be broken."
        );
      }

      markdownContent = imageResult.markdown;
      stabilizedMarkdownCache?.set(englishPage.id, markdownContent);

      if (imageResult.stats.successfulImages > 0) {
        console.log(
          chalk.blue(
            `  Images: processed=${imageResult.stats.successfulImages} failed=${imageResult.stats.totalFailures}`
          )
        );
      }
    }
    // For regular pages, translate the full content
    const translated = await translateText(
      markdownContent,
      originalTitle,
      config.language
    );
    translatedContent = translated.markdown;
    translatedTitle = translated.title;

    // Helper to detect S3 URLs in content
    const detectNotionS3Urls = (content: string) => {
      const diagnostics = getImageDiagnostics(content);
      const rawMatches = collectRawNotionS3Matches(content);
      const notionSamples = diagnostics.s3Samples.filter(
        isNotionImageUrlFamily
      );
      const urls = Array.from(
        new Set([...notionSamples, ...rawMatches.samples])
      ).slice(0, 5);
      const count = Math.max(rawMatches.count, notionSamples.length);
      return { urls, count };
    };

    // Post-translation validation: ensure no S3 URLs survive translation
    let { urls: detectedS3Urls, count: totalS3Matches } =
      detectNotionS3Urls(translatedContent);

    // Safety net: attempt a final image-fix pass for markdown/image-based S3 URLs.
    if (totalS3Matches > 0) {
      translatedContent = await validateAndFixRemainingImages(
        translatedContent,
        safeFilename
      );
      ({ urls: detectedS3Urls, count: totalS3Matches } =
        detectNotionS3Urls(translatedContent));
    }

    if (totalS3Matches > 0) {
      throw new Error(
        `Translation for "${originalTitle}" still contains ` +
          `${totalS3Matches} Notion/S3 URLs.\n` +
          `Offending URLs (redacted): ${formatRedactedS3Urls(detectedS3Urls)}`
      );
    }
  }

  // Prepare properties for the translation page
  const properties: Record<string, unknown> = {
    Language: {
      select: {
        name: config.notionLangCode,
      },
    },
  };

  // Copy other properties from the English page
  const orderProp = englishPage.properties[NOTION_PROPERTIES.ORDER] as
    | NotionNumberProperty
    | undefined;
  if (orderProp && orderProp.number) {
    properties[NOTION_PROPERTIES.ORDER] = {
      number: orderProp.number,
    };
  }
  const tagsProp = englishPage.properties[NOTION_PROPERTIES.TAGS] as
    | NotionMultiSelectProperty
    | undefined;
  if (tagsProp && tagsProp.multi_select) {
    properties[NOTION_PROPERTIES.TAGS] = {
      multi_select: tagsProp.multi_select.map((tag: { name: string }) => ({
        name: tag.name,
      })),
    };
  }
  const englishElementType = getElementTypeProperty(englishPage);
  if (englishElementType?.select?.name) {
    properties[NOTION_PROPERTIES.ELEMENT_TYPE] = {
      select: { name: englishElementType.select.name },
    };
  }

  // Find the parent of the English page to nest the translation as a sibling
  const parentInfo =
    relationParentId ??
    (
      englishPage.properties["Parent item"] as
        | NotionRelationProperty
        | undefined
    )?.relation?.[0]?.id;
  if (!parentInfo) {
    throw new Error(
      `Missing required Parent item relation for page "${originalTitle}" (${englishPage.id})`
    );
  }
  // Create or update translation page in Notion as a sibling (child of the same parent)
  // Use DATA_SOURCE_ID as primary (Notion API v5), fall back to DATABASE_ID for compatibility
  let translatedBlocks: any[] = [];
  if (!isTitlePage) {
    translatedBlocks = await translateNotionBlocksDirectly(
      englishPage.id,
      config.language
    );
  } else {
    // Restore regression: title pages previously got a minimal heading block
    translatedBlocks = [
      {
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [
            {
              type: "text",
              text: { content: translatedTitle },
            },
          ],
        },
      },
    ];
  }

  await createNotionPageWithBlocks(
    notion,
    parentInfo,
    DATA_SOURCE_ID || DATABASE_ID, // Primary: DATA_SOURCE_ID, Fallback: DATABASE_ID
    translatedTitle,
    translatedBlocks,
    properties,
    config.notionLangCode,
    translationPage?.id
  );

  // Save translated content to output directory
  await saveTranslatedContentToDisk(englishPage, translatedContent, config);

  // Update statistics
  if (translationPage) {
    onUpdate();
  } else {
    onNew();
  }
}

/**
 * Main function to run the translation workflow
 */
export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- iterating over trusted CLI args array
    const arg = args[i];
    if (arg === "--page-id") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --page-id");
      }
      const normalizedPageId = normalizePageId(value);
      if (!isValidNotionPageId(normalizedPageId)) {
        throw new Error(
          `Invalid --page-id value "${value}". Expected a Notion page ID (32 hex chars, with or without dashes).`
        );
      }
      options.pageId = normalizedPageId;
      i++;
      continue;
    }

    if (arg.startsWith("--page-id=")) {
      const value = arg.slice("--page-id=".length);
      const normalizedPageId = normalizePageId(value);
      if (!isValidNotionPageId(normalizedPageId)) {
        throw new Error(
          `Invalid --page-id value "${value}". Expected a Notion page ID (32 hex chars, with or without dashes).`
        );
      }
      options.pageId = normalizedPageId;
      continue;
    }

    throw new Error(`Unknown flag: ${arg}`);
  }

  return options;
}

export async function main(options: CliOptions = {}) {
  console.log(chalk.bold.cyan("🚀 Starting Notion translation workflow\n"));

  // Log which ID type is being used (v5 API validation)
  if (process.env.DATA_SOURCE_ID) {
    console.log(chalk.blue("ℹ️  Using DATA_SOURCE_ID (Notion API v5)"));
  } else {
    console.log(
      chalk.yellow(
        "⚠️  Using DATABASE_ID fallback (legacy). Consider setting DATA_SOURCE_ID for Notion API v5."
      )
    );
  }

  const failures: TranslationFailure[] = [];
  const summary: TranslationRunSummary = {
    totalEnglishPages: 0,
    processedLanguages: 0,
    newTranslations: 0,
    updatedTranslations: 0,
    skippedTranslations: 0,
    failedTranslations: 0,
    codeJsonFailures: 0,
    codeJsonSourceFileMissing: false,
    themeFailures: 0,
    failures,
  };

  try {
    validateRequiredEnvironment();

    const normalizedPageId = options.pageId
      ? normalizePageId(options.pageId)
      : undefined;
    if (normalizedPageId) {
      console.log(
        chalk.bold.cyan(
          `Single-page mode enabled for page ID: ${normalizedPageId}`
        )
      );
    }

    // Fetch published English pages
    const englishPages = await fetchPublishedEnglishPages(normalizedPageId);
    summary.totalEnglishPages = englishPages.length;

    if (normalizedPageId && englishPages.length === 0) {
      throw new Error(
        `No English page found for --page-id ${normalizedPageId} with status 'Ready for translation'.`
      );
    }

    if (englishPages.length === 0) {
      throw new Error(
        "No English pages found with status 'Ready for translation'."
      );
    }

    // Translate code.json for each language (soft-fail if missing/malformed)
    const englishCodeJsonPath = path.join(
      process.cwd(),
      "i18n",
      "en",
      "code.json"
    );
    let codeJsonFailures: TranslationFailure[] = [];
    let codeJsonSkipped = false;

    try {
      const englishCodeJson = await fs.readFile(englishCodeJsonPath, "utf8");
      // Validate JSON syntax
      JSON.parse(englishCodeJson);

      // If we get here, file exists and is valid JSON
      codeJsonFailures = await translateAllCodeJsons(englishCodeJson);
      failures.push(...codeJsonFailures);
      summary.codeJsonFailures = codeJsonFailures.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNotFound =
        error instanceof Error &&
        ("code" in error
          ? error.code === "ENOENT"
          : message.includes("ENOENT"));

      // Check if this is a SyntaxError from JSON.parse (malformed JSON)
      const isMalformedJson = error instanceof SyntaxError;

      // Only soft-fail for ENOENT (file not found) or SyntaxError (malformed JSON)
      // Re-throw system errors like EACCES, EIO, etc.
      if (!isNotFound && !isMalformedJson) {
        throw error;
      }

      if (isNotFound) {
        console.warn(
          chalk.yellow(
            "⚠ English code.json not found. Skipping UI string translation (continuing with doc translation)."
          )
        );
      } else {
        console.warn(
          chalk.yellow(
            `⚠ English code.json is malformed. Skipping UI string translation (continuing with doc translation). Error: ${message}`
          )
        );
      }

      // Add a special failure entry to indicate code.json was skipped
      const skippedFailure: TranslationFailure = {
        language: "en",
        title: "code.json (source file)",
        error: isNotFound
          ? "Source file not found - UI string translation skipped"
          : `Source file malformed - UI string translation skipped: ${message}`,
        isCritical: false, // Non-critical: doc translation continues
      };
      failures.push(skippedFailure);
      summary.codeJsonSourceFileMissing = true; // Mark source file as missing (soft-fail)
      codeJsonSkipped = true;
    }

    // Translate theme config (navbar and footer)
    const themeFailures = await translateThemeConfig();
    failures.push(...themeFailures);
    summary.themeFailures = themeFailures.length;

    // Process each language
    const stabilizedMarkdownCache = new Map<string, string>();
    for (const config of LANGUAGES) {
      const languageSummary = await processLanguageTranslations(
        config,
        englishPages as NotionPage[],
        normalizedPageId,
        stabilizedMarkdownCache
      );
      summary.processedLanguages++;
      summary.newTranslations += languageSummary.newTranslations;
      summary.updatedTranslations += languageSummary.updatedTranslations;
      summary.skippedTranslations += languageSummary.skippedTranslations;
      summary.failedTranslations += languageSummary.failedTranslations;
      failures.push(...languageSummary.failures);
    }

    const hasFailures =
      summary.failedTranslations > 0 ||
      summary.codeJsonFailures > 0 ||
      summary.themeFailures > 0;

    // Only throw if there are actual failures (excluding soft-fail source file issues)
    // Source file missing is a soft-fail - it's tracked but doesn't cause workflow to fail
    const hasActualFailures =
      summary.failedTranslations > 0 ||
      (summary.codeJsonFailures > 0 && !summary.codeJsonSourceFileMissing) ||
      summary.themeFailures > 0;

    if (hasActualFailures) {
      throw new Error(
        `Translation workflow completed with failures (docs: ${summary.failedTranslations}, code.json: ${summary.codeJsonFailures}, theme: ${summary.themeFailures})`
      );
    }

    console.log(
      chalk.bold.green(
        `\n✅ Translation workflow completed successfully: ${summary.newTranslations + summary.updatedTranslations} translated, ${summary.skippedTranslations} skipped`
      )
    );
    // Write summary to file for reliable CI parsing (avoids brittle log grep)
    await writeSummaryFile(summary);
    // Keep console output for backward compatibility
    console.log(`TRANSLATION_SUMMARY ${JSON.stringify(summary)}`);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      chalk.bold.red("\n❌ Fatal error during translation process:"),
      message
    );
    // Write summary to file even on failure for CI parsing
    await writeSummaryFile(summary);
    // Keep console output for backward compatibility
    console.log(`TRANSLATION_SUMMARY ${JSON.stringify(summary)}`);
    throw error;
  } finally {
    console.log(chalk.blue("\nCleaned up temporary files"));
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let cliOptions: CliOptions | null = null;
  try {
    cliOptions = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.bold.red("\n❌ Invalid CLI arguments:"), message);
    process.exitCode = 1;
  }

  if (process.exitCode !== 1 && cliOptions) {
    main(cliOptions).catch(() => {
      process.exitCode = 1;
    });
  }
}
