import { pathToFileURL } from "url";
import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { notion, DATABASE_ID, n2m } from "../notionClient";
import { translateText } from "./translateFrontMatter";
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

// Type helpers for Notion properties
type NotionTitleProperty = { title: Array<{ plain_text: string }> };
type NotionSelectProperty = { select: { name: string } | null };
type NotionNumberProperty = { number: number };
type NotionMultiSelectProperty = { multi_select: Array<{ name: string }> };
type NotionRelationProperty = { relation: Array<{ id: string }> };

const getElementTypeProperty = (page: NotionPage) =>
  page.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE] ??
  (page.properties as Record<string, any>)?.[LEGACY_SECTION_PROPERTY];

// Load environment variables from .env file
dotenv.config();

// Translation config is imported from constants.js

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
    const title = (
      englishPage.properties[NOTION_PROPERTIES.TITLE] as NotionTitleProperty
    ).title[0].plain_text;

    const filter = {
      and: [
        {
          property: NOTION_PROPERTIES.TITLE,
          title: {
            equals: title,
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
    return results.length > 0 ? results[0] : null;
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
    const title = (
      englishPage.properties[NOTION_PROPERTIES.TITLE] as NotionTitleProperty
    ).title[0].plain_text;

    // Create collision-safe filename
    const baseSlug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    let filename = `${baseSlug}.md`;
    let outputPath = path.join(config.outputDir, filename);

    // Handle filename collisions by adding counter
    let counter = 1;
    while (
      await fs.access(outputPath).then(
        () => true,
        () => false
      )
    ) {
      filename = `${baseSlug}-${counter}.md`;
      outputPath = path.join(config.outputDir, filename);
      counter++;
    }

    // Handle section folders
    const elementType = getElementTypeProperty(englishPage);
    const sectionType = elementType?.select?.name?.toLowerCase();

    if (sectionType) {
      if (sectionType === "toggle") {
        // For toggle sections, create a folder with the same name
        const sectionFolder = baseSlug;

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
      console.error(
        chalk.red(
          `✗ Error translating code.json for ${config.language}: ${error.message}`
        )
      );
    }
  }
}

/**
 * Translate navbar and footer from docusaurus.config.ts for all languages except English.
 */
async function translateThemeConfig() {
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
        console.error(
          chalk.red(
            `✗ Error translating navbar for ${languageName}: ${error.message}`
          )
        );
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
        console.error(
          chalk.red(
            `✗ Error translating footer for ${languageName}: ${error.message}`
          )
        );
      }
    }
  }
}
/**
 * Process all translations for a single language.
 */
async function processLanguageTranslations(
  config: TranslationConfig,
  englishPages: NotionPage[]
) {
  console.log(chalk.yellow(`\nProcessing ${config.language} translations:`));

  let newTranslations = 0;
  let updatedTranslations = 0;
  let skippedTranslations = 0;

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
      console.error(
        chalk.red(`Error processing ${originalTitle}:`, error.message)
      );
    }
  }

  // Report statistics
  console.log(chalk.green(`\n✅ ${config.language} translation summary:`));
  console.log(chalk.green(`  - New translations: ${newTranslations}`));
  console.log(chalk.green(`  - Updated translations: ${updatedTranslations}`));
  console.log(chalk.gray(`  - Skipped (up-to-date): ${skippedTranslations}`));
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
  const originalTitle = (
    englishPage.properties[NOTION_PROPERTIES.TITLE] as NotionTitleProperty
  ).title[0].plain_text;

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
    englishPage.properties["Parent item"] as NotionRelationProperty
  ).relation[0].id;
  // Create or update translation page in Notion as a sibling (child of the same parent)
  await createNotionPageFromMarkdown(
    notion,
    parentInfo,
    DATABASE_ID,
    translatedTitle,
    translatedContent,
    properties,
    true,
    config.notionLangCode
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

  try {
    // Fetch published English pages
    const englishPages = await fetchPublishedEnglishPages();

    if (englishPages.length === 0) {
      console.log(chalk.yellow("No published English pages found. Exiting."));
      return;
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
      console.error(
        chalk.red(
          `Error reading or parsing English code.json: ${error.message}`
        )
      );
      process.exit(1);
    }

    await translateAllCodeJsons(englishCodeJson);

    // Translate theme config (navbar and footer)
    await translateThemeConfig();

    // Process each language
    for (const config of LANGUAGES) {
      await processLanguageTranslations(config, englishPages as NotionPage[]);
    }
  } catch (error) {
    console.error(
      chalk.bold.red("\n❌ Fatal error during translation process:"),
      error
    );
  } finally {
    // Clean up temp directory
    try {
      console.log(chalk.blue("\nCleaned up temporary files"));
    } catch (error) {
      console.error(
        chalk.yellow("\n⚠️ Failed to clean up temporary directory:"),
        error.message
      );
    }

    console.log(chalk.bold.green("\n✨ Translation workflow completed!"));
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
