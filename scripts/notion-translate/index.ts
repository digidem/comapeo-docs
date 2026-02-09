import { pathToFileURL } from "url";
import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { notion, DATA_SOURCE_ID, DATABASE_ID, n2m } from "../notionClient";
import { translateText, TranslationError } from "./translateFrontMatter";
import {
  translateJson,
  extractTranslatableText,
  getLanguageName,
} from "./translateCodeJson";
import { createNotionPageFromMarkdown } from "./markdownToNotion";
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

const LEGACY_SECTION_PROPERTY = "Section";
const PARENT_ITEM_PROPERTY = "Parent item";

// Type helpers for Notion properties
type NotionTitleProperty = { title: Array<{ plain_text: string }> };
type NotionSelectProperty = { select: { name: string } | null };
type NotionNumberProperty = { number: number };
type NotionMultiSelectProperty = { multi_select: Array<{ name: string }> };
type NotionRelationProperty = { relation: Array<{ id: string }> };
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
  themeFailures: number;
  failures: TranslationFailure[];
};

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

// Load environment variables from .env file
dotenv.config();

// Translation config is imported from constants.js

function validateRequiredEnvironment(): void {
  const requiredVariables = ["NOTION_API_KEY", "OPENAI_API_KEY"];
  const missingVariables = requiredVariables.filter(
    // eslint-disable-next-line security/detect-object-injection -- keys come from trusted static array
    (name) => !process.env[name]
  );
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
export async function fetchPublishedEnglishPages() {
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

    const sortedPages = await sortAndExpandNotionData(pages);
    // Filter sortedPages according to language
    const filteredPages = sortedPages.filter((page) => {
      const langProp = page.properties?.[NOTION_PROPERTIES.LANGUAGE]?.select;
      return langProp && langProp.name === MAIN_LANGUAGE;
    });

    spinner.succeed(
      chalk.green(`Fetched ${filteredPages.length} published English pages`)
    );
    return filteredPages;
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
  targetLanguage: string
): Promise<NotionPage | null> {
  try {
    const parentId = getParentRelationId(englishPage);
    if (!parentId) {
      return null;
    }

    const englishOrder = getOrder(englishPage);
    const englishElementType =
      getElementTypeProperty(englishPage)?.select?.name?.toLowerCase();

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
  } catch (error) {
    console.error(
      `Error finding translation page for ${englishPage.id}:`,
      error
    );
    return null;
  }
}

/**
 * Checks if a translation page needs to be updated
 * @param englishPage The English page
 * @param translationPage The translation page
 * @returns True if the translation needs to be updated, false otherwise
 */
export function needsTranslationUpdate(
  englishPage: NotionPage,
  translationPage: NotionPage | null
) {
  if (!translationPage) {
    return true; // No translation exists, so it needs to be created
  }

  // Compare last edited times
  const englishLastEdited = new Date(englishPage.last_edited_time);
  const translationLastEdited = new Date(translationPage.last_edited_time);

  // If the English page was edited after the translation, it needs an update
  return englishLastEdited > translationLastEdited;
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
export async function saveTranslatedContentToDisk(
  englishPage: NotionPage,
  translatedContent: string,
  config: TranslationConfig
): Promise<string> {
  try {
    // Create a sanitized filename from the title
    const title = getTitle(englishPage);

    // Build deterministic filename from stable page ID to keep reruns idempotent.
    const baseSlug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const stablePageId = englishPage.id.toLowerCase().replace(/[^a-z0-9]/g, "");
    const deterministicBase = baseSlug || "untitled";
    const deterministicName = `${deterministicBase}-${stablePageId}`;

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
  englishPages: NotionPage[]
): Promise<LanguageTranslationSummary> {
  console.log(chalk.yellow(`\nProcessing ${config.language} translations:`));

  let newTranslations = 0;
  let updatedTranslations = 0;
  let skippedTranslations = 0;
  let failedTranslations = 0;
  const failures: TranslationFailure[] = [];

  for (const englishPage of englishPages) {
    const originalTitle = (
      englishPage.properties[NOTION_PROPERTIES.TITLE] as NotionTitleProperty
    ).title[0].plain_text;
    console.log(chalk.blue(`Processing: ${originalTitle}`));

    // Find existing translation
    const translationPage = await findTranslationPage(
      englishPage,
      config.notionLangCode
    );

    // Check if translation needs update
    if (!needsTranslationUpdate(englishPage, translationPage)) {
      console.log(
        chalk.gray(`Skipping ${originalTitle} (translation is up-to-date)`)
      );
      skippedTranslations++;
      continue;
    }

    try {
      await processSinglePageTranslation({
        englishPage,
        config,
        translationPage,
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
  console.log(chalk.gray(`  - Skipped (up-to-date): ${skippedTranslations}`));
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
  onNew,
  onUpdate,
}: {
  englishPage: NotionPage;
  config: TranslationConfig;
  translationPage: NotionPage | null;
  onNew: () => void;
  onUpdate: () => void;
}) {
  const originalTitle = getTitle(englishPage);

  // Check if this is a title page
  const elementType = getElementTypeProperty(englishPage);
  const isTitlePage = elementType?.select?.name?.toLowerCase() === "title";

  // Convert English page to markdown
  const markdownContent = await convertPageToMarkdown(englishPage.id);

  // Translate the content
  let translatedContent: string;
  let translatedTitle: string;

  if (isTitlePage) {
    // For title pages, create a minimal content with just the title
    translatedContent = `# ${originalTitle}`;
    translatedTitle = originalTitle;
  } else {
    // For regular pages, translate the full content
    const translated = await translateText(
      markdownContent,
      originalTitle,
      config.language
    );
    translatedContent = translated.markdown;
    translatedTitle = translated.title;
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
  const parentInfo = (
    englishPage.properties["Parent item"] as NotionRelationProperty | undefined
  )?.relation?.[0]?.id;
  if (!parentInfo) {
    throw new Error(
      `Missing required Parent item relation for page "${originalTitle}" (${englishPage.id})`
    );
  }
  // Create or update translation page in Notion as a sibling (child of the same parent)
  await createNotionPageFromMarkdown(
    notion,
    parentInfo,
    DATA_SOURCE_ID || DATABASE_ID,
    translatedTitle,
    translatedContent,
    properties,
    true,
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
export async function main() {
  console.log(chalk.bold.cyan("🚀 Starting Notion translation workflow\n"));
  validateRequiredEnvironment();
  const failures: TranslationFailure[] = [];
  const summary: TranslationRunSummary = {
    totalEnglishPages: 0,
    processedLanguages: 0,
    newTranslations: 0,
    updatedTranslations: 0,
    skippedTranslations: 0,
    failedTranslations: 0,
    codeJsonFailures: 0,
    themeFailures: 0,
    failures,
  };

  try {
    // Fetch published English pages
    const englishPages = await fetchPublishedEnglishPages();
    summary.totalEnglishPages = englishPages.length;

    if (englishPages.length === 0) {
      throw new Error(
        "No English pages found with status 'Ready for translation'."
      );
    }

    // Translate code.json for each language
    const englishCodeJsonPath = path.join(
      process.cwd(),
      "i18n",
      "en",
      "code.json"
    );
    let englishCodeJson: string;
    try {
      englishCodeJson = await fs.readFile(englishCodeJsonPath, "utf8");
      JSON.parse(englishCodeJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`Error reading or parsing English code.json: ${message}`)
      );
      throw new Error(`English code.json is required and invalid: ${message}`);
    }

    const codeJsonFailures = await translateAllCodeJsons(englishCodeJson);
    failures.push(...codeJsonFailures);
    summary.codeJsonFailures = codeJsonFailures.length;

    // Translate theme config (navbar and footer)
    const themeFailures = await translateThemeConfig();
    failures.push(...themeFailures);
    summary.themeFailures = themeFailures.length;

    // Process each language
    for (const config of LANGUAGES) {
      const languageSummary = await processLanguageTranslations(
        config,
        englishPages as NotionPage[]
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
    if (hasFailures) {
      throw new Error(
        `Translation workflow completed with failures (docs: ${summary.failedTranslations}, code.json: ${summary.codeJsonFailures}, theme: ${summary.themeFailures})`
      );
    }

    console.log(
      chalk.bold.green(
        `\n✅ Translation workflow completed successfully: ${summary.newTranslations + summary.updatedTranslations} translated, ${summary.skippedTranslations} skipped`
      )
    );
    console.log(`TRANSLATION_SUMMARY ${JSON.stringify(summary)}`);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      chalk.bold.red("\n❌ Fatal error during translation process:"),
      message
    );
    console.log(`TRANSLATION_SUMMARY ${JSON.stringify(summary)}`);
    throw error;
  } finally {
    console.log(chalk.blue("\nCleaned up temporary files"));
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
