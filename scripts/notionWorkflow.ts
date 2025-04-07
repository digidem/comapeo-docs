import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import { fetchNotionData } from './fetchNotionData.js';
import { generateBlocks } from './generateBlocks.js';
import { notion, DATABASE_ID, n2m } from './notionClient.js';
import { translateText } from './openaiTranslator.js';
import fs from 'fs/promises';
import path from 'path';
import { createNotionPageFromMarkdown } from './markdownToNotion.js';

// Load environment variables from .env file
dotenv.config();

interface TranslationConfig {
  language: string;
  notionLangCode: string;
  outputDir: string;
}

const LANGUAGES: TranslationConfig[] = [
  {
    language: 'pt-BR',
    notionLangCode: 'Portuguese',
    outputDir: './i18n/pt/docusaurus-plugin-content-docs'
  },
  // Add more languages as needed
];

// Directory for temporary translations
const TEMP_DIR = './temp_translations';

/**
 * Checks if a translation page exists for the given English page
 * @param englishPage The English page to check
 * @param targetLanguage The target language code
 * @returns The translation page if it exists, null otherwise
 */
async function findTranslationPage(englishPage, targetLanguage: string) {
  try {
    const title = englishPage.properties['Title'].title[0].plain_text;

    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: "Title",
            title: {
              equals: title
            }
          },
          {
            property: "Language",
            select: {
              equals: targetLanguage
            }
          }
        ]
      }
    });

    return response.results.length > 0 ? response.results[0] : null;
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
function needsTranslationUpdate(englishPage, translationPage) {
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

    if (!markdown || !markdown.parent) {
      console.warn(`Warning: No markdown content found for page ${pageId}`);
      return "# Empty Page\n\nThis page has no content.";
    }

    return markdown.parent;
  } catch (error) {
    console.error(`Error converting page ${pageId} to markdown:`, error);
    throw error;
  }
}

/**
 * Creates a translation page in Notion
 * @param englishPage The English page
 * @param translatedContent The translated content
 * @param config The translation configuration
 * @returns The ID of the created page
 */
async function createTranslationPage(englishPage, translatedContent: string, config: TranslationConfig): Promise<string> {
  const spinner = ora(`Creating translation page in ${config.notionLangCode}`).start();

  try {
    const title = englishPage.properties['Title'].title[0].plain_text;

    // SAFETY CHECK: Never modify English pages
    if (englishPage.properties['Language']?.select?.name === 'English' && config.notionLangCode === 'English') {
      spinner.fail(chalk.bold.red(`⛔ SAFETY ERROR: Attempted to modify an English page: ${title}`));
      throw new Error('Safety check failed: Cannot modify English pages');
    }

    // Check if a translation page already exists
    const existingPage = await findTranslationPage(englishPage, config.notionLangCode);

    // Prepare properties for the translation page
    const properties: Record<string, unknown> = {
      Language: {
        select: {
          name: config.notionLangCode
        }
      },
      // Set Published to false for new pages, keep existing value for updates
      Published: {
        checkbox: existingPage ? existingPage.properties.Published.checkbox : false
      }
    };

    // Copy other properties from the English page
    if (englishPage.properties['Order'] && englishPage.properties['Order'].number) {
      properties["Order"] = {
        number: englishPage.properties['Order'].number
      };
    }

    if (englishPage.properties['Tags'] && englishPage.properties['Tags'].multi_select) {
      properties["Tags"] = {
        multi_select: englishPage.properties['Tags'].multi_select.map(tag => ({ name: tag.name }))
      };
    }

    if (englishPage.properties['Section'] && englishPage.properties['Section'].select) {
      properties["Section"] = {
        select: { name: englishPage.properties['Section'].select.name }
      };
    }

    // Create or update the translation page
    const pageId = await createNotionPageFromMarkdown(
      notion,
      DATABASE_ID,
      title,
      translatedContent,
      properties,
      true, // Pass content directly
      config.notionLangCode // Pass the language to ensure we don't modify English pages
    );

    const status = existingPage ? "Updated existing" : "Created new";
    spinner.succeed(chalk.green(`${status} translation page for ${title} in ${config.notionLangCode}`));

    return pageId;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to create translation page: ${error.message}`));
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
async function saveTranslatedContent(englishPage, translatedContent: string, config: TranslationConfig): Promise<string> {
  try {
    // Safety check 1: Never save to the English docs directory
    if (config.outputDir.includes('/docs') && !config.outputDir.includes('/i18n/')) {
      console.error(chalk.bold.red(`⛔ SAFETY ERROR: Attempted to save translated content to English docs directory: ${config.outputDir}`));
      console.error(chalk.bold.red(`This is not allowed to prevent overwriting English content.`));
      throw new Error('Safety check failed: Cannot save translated content to English docs directory');
    }

    // Safety check 2: Never save English content to any directory
    if (englishPage.properties['Language']?.select?.name === 'English' && config.notionLangCode === 'English') {
      console.error(chalk.bold.red(`⛔ SAFETY ERROR: Attempted to save English content to directory: ${config.outputDir}`));
      console.error(chalk.bold.red(`This is not allowed to prevent duplicate English content.`));
      throw new Error('Safety check failed: Cannot save English content to translation directories');
    }

    // Create a sanitized filename from the title
    const title = englishPage.properties['Title'].title[0].plain_text;
    const filename = title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') + '.md';

    // Determine the output path
    const outputPath = path.join(config.outputDir, filename);

    // Handle section folders
    if (englishPage.properties['Section'] && englishPage.properties['Section'].select) {
      const sectionType = englishPage.properties['Section'].select.name.toLowerCase();

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
          position: englishPage.properties['Order']?.number || 1,
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
 * Translates English pages to the target languages
 * @param englishPages The English pages to translate
 */
async function translatePages(englishPages) {
  console.log(chalk.bold.cyan('\n🌐 Starting translation process'));

  try {
    // Create temp directory
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Process each language
    for (const config of LANGUAGES) {
      console.log(chalk.yellow(`\nProcessing ${config.language} translations:`));

      // Create language output directory
      // Safety check: Never save to the English docs directory
      if (config.outputDir.includes('/docs') && !config.outputDir.includes('/i18n/')) {
        console.error(chalk.bold.red(`⛔ SAFETY ERROR: Attempted to save translated content to English docs directory: ${config.outputDir}`));
        console.error(chalk.bold.red(`This is not allowed to prevent overwriting English content.`));
        throw new Error('Safety check failed: Cannot save translated content to English docs directory');
      }

      await fs.mkdir(config.outputDir, { recursive: true });

      // Track statistics
      let newTranslations = 0;
      let updatedTranslations = 0;
      let skippedTranslations = 0;

      // Process each English page
      for (const englishPage of englishPages) {
        const title = englishPage.properties['Title'].title[0].plain_text;
        console.log(chalk.blue(`Processing: ${title}`));

        // Find existing translation
        const translationPage = await findTranslationPage(englishPage, config.notionLangCode);

        // Check if translation needs update
        if (!needsTranslationUpdate(englishPage, translationPage)) {
          console.log(chalk.gray(`Skipping ${title} (translation is up-to-date)`));
          skippedTranslations++;
          continue;
        }

        try {
          // Convert English page to markdown
          const markdownContent = await convertPageToMarkdown(englishPage.id);

          // Translate the content
          const translatedContent = await translateText(markdownContent, config.language);

          // Create or update translation page in Notion
          // IMPORTANT: We're creating a NEW page for the translation, never modifying the English page
          const translationPageId = await createTranslationPage(englishPage, translatedContent, config);

          if (!translationPageId) {
            console.error(chalk.red(`Failed to create translation page for ${title}`));
            continue;
          }

          // Save translated content to output directory
          await saveTranslatedContent(englishPage, translatedContent, config);

          // Update statistics
          if (translationPage) {
            updatedTranslations++;
            console.log(chalk.green(`✅ Updated translation page for ${title}`));
          } else {
            newTranslations++;
            console.log(chalk.green(`✅ Created new translation page for ${title}`));
          }
        } catch (error) {
          console.error(chalk.red(`Error processing ${title}:`, error.message));
          // Continue with next page even if this one fails
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
  }
}

/**
 * Main function to run the Notion workflow
 */
async function main() {
  console.log(chalk.bold.cyan('🚀 Starting Notion workflow: Fetch, Generate, and Translate\n'));

  // Check if required environment variables are defined
  if (!process.env.NOTION_API_KEY) {
    console.error(chalk.bold.red("Error: NOTION_API_KEY is not defined in the environment variables."));
    process.exit(1);
  }

  if (!process.env.DATABASE_ID) {
    console.error(chalk.bold.red("Error: DATABASE_ID is not defined in the environment variables."));
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.bold.red("Error: OPENAI_API_KEY is not defined in the environment variables."));
    process.exit(1);
  }

  try {
    // Step 1: Fetch data from Notion
    const fetchSpinner = ora('Fetching data from Notion').start();
    let data = await fetchNotionData();

    // Sort data by Order property
    data = data.sort((a, b) => {
      const orderA = a.properties['Order']?.number ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.properties['Order']?.number ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });

    fetchSpinner.succeed(chalk.green(`Fetched ${data.length} pages from Notion`));

    // Step 2: Generate blocks (English content)
    const generateSpinner = ora('Generating blocks for English content').start();
    const { totalSaved, sectionCount, titleSectionCount } = await generateBlocks(data, (progress) => {
      generateSpinner.text = chalk.blue(`Generating blocks: ${progress.current}/${progress.total} - ${progress.title}`);
    });
    generateSpinner.succeed(chalk.green('English content generated successfully'));

    console.log(chalk.bold.cyan(`A total of ${(totalSaved / 1024).toFixed(2)} KB was saved on image compression.`));
    console.log(chalk.bold.yellow(`Created ${sectionCount} section folders with _category_.json files.`));
    console.log(chalk.bold.magenta(`Applied ${titleSectionCount} title sections to content items.`));

    // Step 3: Translate content
    // Filter only English pages that are published
    const englishPages = data.filter(page => {
      const language = page.properties['Language']?.select?.name || 'English';
      const isPublished = page.properties['Published']?.checkbox || false;
      return language === 'English' && isPublished;
    });

    if (englishPages.length > 0) {
      await translatePages(englishPages);
    } else {
      console.log(chalk.yellow('\nNo published English pages found for translation.'));
    }

    console.log(chalk.bold.green('\n✨ Notion workflow completed successfully!'));
  } catch (error) {
    console.error(chalk.bold.red("\n❌ Error in Notion workflow:"), error);
    process.exit(1);
  }
}

// Run the main function
main();
