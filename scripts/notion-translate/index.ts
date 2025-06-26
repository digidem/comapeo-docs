
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { notion, DATABASE_ID, n2m } from '../notionClient.js';
import { translateText } from './translateFrontMatter.js';
import { createNotionPageFromMarkdown } from './markdownToNotion.js';
import { fetchNotionData, sortAndExpandNotionData } from '../fetchNotionData.js';
import { LANGUAGES, MAIN_LANGUAGE, NOTION_PROPERTIES, NotionPage, TEMP_DIR, TranslationConfig } from '../constants.js';

// Load environment variables from .env file
dotenv.config();

// Translation config is imported from constants.js

/**
 * Fetches published English pages from Notion
 */
export async function fetchPublishedEnglishPages() {
  const spinner = ora('Fetching published English pages from Notion').start();

  try {
    const filter = {
      and: [
        {
          property: NOTION_PROPERTIES.STATUS,
          select: {
            equals: NOTION_PROPERTIES.READY_FOR_TRANSLATION
          }
        }
      ]
    };

    const pages = await fetchNotionData(filter) as NotionPage[];

    const sortedPages = await sortAndExpandNotionData(pages);
    // Filter sortedPages according to language
    const filteredPages = sortedPages.filter(page => {
      const langProp = page.properties?.[NOTION_PROPERTIES.LANGUAGE]?.select;
      return langProp && langProp.name === MAIN_LANGUAGE;
    });

    spinner.succeed(chalk.green(`Fetched ${filteredPages.length} published English pages`));
    return filteredPages;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to fetch published English pages: ${error.message}`));
    throw error;
  }
}
/**
 * Checks if a translation page exists for the given English page
 * @param englishPage The English page to check
 * @param targetLanguage The target language code
 * @returns The translation page if it exists, null otherwise
 */
export async function findTranslationPage(englishPage: NotionPage, targetLanguage: string): Promise<NotionPage | null> {
  try {
    // @ts-expect-error - We know the property structure
    const title = englishPage.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;

    const filter = {
      and: [
        {
          property: NOTION_PROPERTIES.TITLE,
          title: {
            equals: title
          }
        },
        {
          property: NOTION_PROPERTIES.LANGUAGE,
          select: {
            equals: targetLanguage
          }
        }
      ]
    };

    const results = await fetchNotionData(filter) as NotionPage[];
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error(`Error finding translation page for ${englishPage.id}:`, error);
    return null;
  }
}

/**
 * Checks if a translation page needs to be updated
 * @param englishPage The English page
 * @param translationPage The translation page
 * @returns True if the translation needs to be updated, false otherwise
 */
export function needsTranslationUpdate(englishPage: NotionPage, translationPage: NotionPage | null) {
  if (!translationPage) {
    return true; // No translation exists, so it needs to be created
  }

  // Compare last edited times
  // @ts-expect-error - We know the property structure
  const englishLastEdited = new Date(englishPage.last_edited_time);
  // @ts-expect-error - We know the property structure
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
export async function saveTranslatedContent(englishPage: NotionPage, translatedContent: string, config: TranslationConfig): Promise<string> {
  try {
    // Create a sanitized filename from the title
    // @ts-expect-error - We know the property structure
    const title = englishPage.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;
    const filename = title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') + '.md';

    // Determine the output path
    const outputPath = path.join(config.outputDir, filename);

    // Handle section folders
    // @ts-expect-error - We know the property structure
    if (englishPage.properties[NOTION_PROPERTIES.SECTION] && englishPage.properties[NOTION_PROPERTIES.SECTION].select) {
      // @ts-expect-error - We know the property structure
      const sectionType = englishPage.properties[NOTION_PROPERTIES.SECTION].select.name.toLowerCase();

      if (sectionType === 'toggle') {
        // For toggle sections, create a folder with the same name
        const sectionFolder = title
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        const sectionPath = path.join(config.outputDir, sectionFolder);
        await fs.mkdir(sectionPath, { recursive: true });

        // Create _category_.json file
        const categoryContent = {
          label: title,
          // @ts-expect-error - We know the property structure
          position: englishPage.properties[NOTION_PROPERTIES.ORDER]?.number || 1,
          collapsible: true,
          collapsed: true,
          link: {
            type: "generated-index"
          },
          customProps: {
            title: title
          }
        };

        const categoryFilePath = path.join(sectionPath, "_category_.json");
        await fs.writeFile(categoryFilePath, JSON.stringify(categoryContent, null, 2), 'utf8');

        // Skip creating a markdown file for toggle sections
        return categoryFilePath;
      }

      // For other section types, continue with normal file creation
    }

    // Ensure the output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write the translated content to the output file
    await fs.writeFile(outputPath, translatedContent, 'utf8');

    return outputPath;
  } catch (error) {
    console.error(`Error saving translated content for ${englishPage.id}:`, error);
    throw error;
  }
}

/**
 * Main function to run the translation workflow
 */
export async function main() {
  console.log(chalk.bold.cyan('🚀 Starting Notion translation workflow\n'));

  try {
    // Create temp directory
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Fetch published English pages
    const englishPages = await fetchPublishedEnglishPages();

    if (englishPages.length === 0) {
      console.log(chalk.yellow('No published English pages found. Exiting.'));
      return;
    }

    // Process each language
    for (const config of LANGUAGES) {
      console.log(chalk.yellow(`\nProcessing ${config.language} translations:`));

      // Create language output directory
      // await fs.mkdir(config.outputDir, { recursive: true });

      // Track statistics
      let newTranslations = 0;
      let updatedTranslations = 0;
      let skippedTranslations = 0;
      // Process each English page
      for (const englishPage of englishPages as NotionPage[]) {
        // @ts-expect-error - We know the property structure
        const originalTitle = englishPage.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;
        console.log(chalk.blue(`Processing: ${originalTitle}`));

        // Find existing translation
        const translationPage = await findTranslationPage(englishPage, config.notionLangCode);

        // Check if translation needs update
        if (!needsTranslationUpdate(englishPage, translationPage)) {
          console.log(chalk.gray(`Skipping ${originalTitle} (translation is up-to-date)`));
          skippedTranslations++;
          continue;
        }

        try {
          // @ts-expect-error - We know the property structure
          const originalTitle = englishPage.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;

          // Check if this is a title page
          // @ts-expect-error - We know the property structure
          const isTitlePage = englishPage.properties[NOTION_PROPERTIES.SECTION]?.select?.name.toLowerCase() === 'title';

          // Convert English page to markdown
          // TODO: Analyze if this is the best approach, as the content could also directly created using Notion objects
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
            const translated = await translateText(markdownContent, originalTitle, config.language);
            translatedContent = translated.markdown;
            translatedTitle = translated.title;
          }

          // Prepare properties for the translation page
          const properties: Record<string, unknown> = {
            Language: {
              select: {
                name: config.notionLangCode
              }
            },
          };

          // Copy other properties from the English page
          // @ts-expect-error - We know the property structure
          if (englishPage.properties[NOTION_PROPERTIES.ORDER] && englishPage.properties[NOTION_PROPERTIES.ORDER].number) {
            properties[NOTION_PROPERTIES.ORDER] = {
              number: englishPage.properties[NOTION_PROPERTIES.ORDER].number
            };
          }
          // @ts-expect-error - We know the property structure
          if (englishPage.properties[NOTION_PROPERTIES.TAGS] && englishPage.properties[NOTION_PROPERTIES.TAGS].multi_select) {
            properties[NOTION_PROPERTIES.TAGS] = {
              multi_select: englishPage.properties[NOTION_PROPERTIES.TAGS].multi_select.map((tag: { name: string }) => ({ name: tag.name }))
            };
          }
          // @ts-expect-error - We know the property structure
          if (englishPage.properties[NOTION_PROPERTIES.SECTION] && englishPage.properties[NOTION_PROPERTIES.SECTION].select) {
            properties[NOTION_PROPERTIES.SECTION] = {
              select: { name: englishPage.properties[NOTION_PROPERTIES.SECTION].select.name }
            };
          }

          // Find the parent of the English page to nest the translation as a sibling
          const parentInfo = englishPage.properties['Parent item'].relation[0].id;
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
          await saveTranslatedContent(englishPage, translatedContent, config);

          // Update statistics
          if (translationPage) {
            updatedTranslations++;
          } else {
            newTranslations++;
          }
        } catch (error) {
          console.error(chalk.red(`Error processing ${originalTitle}:`, error.message));
        }
      }

      // Report statistics
      console.log(chalk.green(`\n✅ ${config.language} translation summary:`));
      console.log(chalk.green(`  - New translations: ${newTranslations}`));
      console.log(chalk.green(`  - Updated translations: ${updatedTranslations}`));
      console.log(chalk.gray(`  - Skipped (up-to-date): ${skippedTranslations}`));
    }
  } catch (error) {
    console.error(chalk.bold.red('\n❌ Fatal error during translation process:'), error);
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
      console.log(chalk.blue('\nCleaned up temporary files'));
    } catch (error) {
      console.error(chalk.yellow('\n⚠️ Failed to clean up temporary directory:'), error.message);
    }

    console.log(chalk.bold.green('\n✨ Translation workflow completed!'));
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
