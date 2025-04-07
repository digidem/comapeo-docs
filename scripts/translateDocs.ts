import dotenv from 'dotenv';
import { spawn } from 'child_process';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { notion, DATABASE_ID } from './notionClient.js';
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
  }
  // Add more languages as needed
];

// Directory for temporary translations
const TEMP_DIR = './temp_translations';

// Function to get all markdown files recursively
async function getMarkdownFiles(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const mdFiles: string[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      // Skip directories starting with _ or .
      if (!file.name.startsWith('_') && !file.name.startsWith('.')) {
        const nestedFiles = await getMarkdownFiles(fullPath);
        mdFiles.push(...nestedFiles);
      }
    } else if (file.name.endsWith('.md')) {
      mdFiles.push(fullPath);
    }
  }

  return mdFiles;
}

// Extract frontmatter from markdown file
async function extractFrontmatter(filePath: string): Promise<Record<string, string | number | boolean>> {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    // Look for frontmatter between --- markers
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

    if (frontmatterMatch && frontmatterMatch[1]) {
      const frontmatterString = frontmatterMatch[1];
      const frontmatter: Record<string, string | number | boolean> = {};

      // Extract key-value pairs
      const lines = frontmatterString.split('\n');
      for (const line of lines) {
        const keyValueMatch = line.match(/^(\w+):\s*(.+)$/);
        if (keyValueMatch) {
          const [, key, value] = keyValueMatch;

          // Clean up the value (remove quotes if present)
          let cleanValue = value.trim();
          if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
              (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
          }

          frontmatter[key] = cleanValue;
        }
      }

      return frontmatter;
    }

    // If no frontmatter is found, return empty object
    return {};
  } catch (error) {
    console.error(`Failed to extract frontmatter from ${filePath}:`, error);
    return {};
  }
}

// Extract the title from a markdown file
async function extractTitleFromFile(filePath: string): Promise<string> {
  try {
    const frontmatter = await extractFrontmatter(filePath);

    // Try to get title from frontmatter
    if (frontmatter.title) {
      return frontmatter.title;
    }

    // If not in frontmatter, try first heading
    const content = await fs.readFile(filePath, 'utf8');
    const headingMatch = content.match(/^#\s+(.*)/m);

    if (headingMatch && headingMatch[1]) {
      return headingMatch[1].trim();
    }

    // Fallback to filename without extension
    return path.basename(filePath, '.md');
  } catch (error) {
    console.error(`Failed to extract title from ${filePath}:`, error);
    return path.basename(filePath, '.md');
  }
}

// Get the relative path from docs directory
function getRelativePath(filePath: string): string {
  return path.relative('./docs', filePath);
}

// Translate a single markdown file
async function translateFile(filePath: string, config: TranslationConfig): Promise<string> {
  const spinner = ora(`Translating ${filePath} to ${config.language}`).start();

  // Create temp directory if it doesn't exist
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // Create the same directory structure in temp dir
  const relativePath = getRelativePath(filePath);
  const tempOutputDir = path.join(TEMP_DIR, path.dirname(relativePath));
  await fs.mkdir(tempOutputDir, { recursive: true });

  const outputPath = path.join(TEMP_DIR, relativePath);

  // Read the original file's frontmatter to preserve it in the translation
  const originalFrontmatter = await extractFrontmatter(filePath);

  return new Promise<string>((resolve, reject) => {
    const translator = spawn('npx', [
      'ai-markdown-translator',
      '-i', filePath,
      '-o', outputPath,
      '-l', config.language
    ]);

    translator.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        spinner.text = `Translating ${path.basename(filePath)}: ${output}`;
      }
    });

    translator.stderr.on('data', (data) => {
      spinner.text = `Translating ${path.basename(filePath)}: ${data.toString().trim()}`;
    });

    translator.on('close', async (code) => {
      if (code === 0) {
        try {
          // Preserve original frontmatter in the translated file
          // Read the translated content
          let translatedContent = await fs.readFile(outputPath, 'utf8');

          // Handle both cases: the translator might keep frontmatter or remove it
          // Remove any existing frontmatter first
          translatedContent = translatedContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

          // Recreate frontmatter from original but with updated language field
          let newFrontmatter = '---\n';
          for (const [key, value] of Object.entries(originalFrontmatter)) {
            // Skip the language field as we'll add our own
            if (key !== 'language') {
              newFrontmatter += `${key}: ${value}\n`;
            }
          }
          // Add the target language
          newFrontmatter += `language: ${config.language}\n`;
          newFrontmatter += '---\n\n';

          // Combine frontmatter with translated content
          const finalContent = newFrontmatter + translatedContent;

          // Write the final file with preserved frontmatter
          await fs.writeFile(outputPath, finalContent, 'utf8');

          spinner.succeed(`Translated ${path.basename(filePath)} to ${config.language}`);
          resolve(outputPath);
        } catch (error) {
          spinner.fail(`Error processing translated file: ${error.message}`);
          reject(error);
        }
      } else {
        spinner.fail(`Failed to translate ${path.basename(filePath)}`);
        reject(new Error(`Translation failed with code ${code}`));
      }
    });
  });
}

// Check if a file needs translation based on Notion database
async function needsTranslation(filePath: string, config: TranslationConfig): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    const fileModified = stats.mtime;
    const title = await extractTitleFromFile(filePath);

    // Check if there's already a page with this title in the target language
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
              equals: config.notionLangCode
            }
          }
        ]
      }
    });

    if (response.results.length === 0) {
      // No matching page exists
      return true;
    }

    // Check if the file is newer than the Notion page
    const page = response.results[0] as { last_edited_time: string };
    const pageLastEdited = new Date(page.last_edited_time);

    return fileModified > pageLastEdited;
  } catch (error) {
    console.error(`Error checking if ${filePath} needs translation:`, error);
    // If there's an error, assume it needs translation
    return true;
  }
}

// Create or update a Notion page with translated content
async function createNotionPage(originalPath: string, translatedPath: string, config: TranslationConfig): Promise<void> {
  const spinner = ora(`Creating Notion page for ${path.basename(translatedPath)}`).start();
  let tempNotionFilePath = "";

  try {
    // Extract title and frontmatter from original document
    const title = await extractTitleFromFile(originalPath);
    const originalFrontmatter = await extractFrontmatter(originalPath);

    // Check if the page already exists to determine if this is a new page or an update
    const existingPages = await notion.databases.query({
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
              equals: config.notionLangCode
            }
          }
        ]
      }
    });

    const isNewPage = existingPages.results.length === 0;

    // Start with language property
    const properties: Record<string, unknown> = {
      Language: {
        select: {
          name: config.notionLangCode
        }
      },
      // Set Published based on whether this is a new page
      Published: {
        checkbox: !isNewPage // true for existing pages, false for new pages
      }
    };

    // Map frontmatter properties to Notion properties
    // This depends on your specific Notion database structure
    // Here's a simple example assuming some common properties

    if (originalFrontmatter.sidebar_position) {
      properties["Order"] = {
        number: parseInt(originalFrontmatter.sidebar_position)
      };
    }

    if (originalFrontmatter.description) {
      properties["Description"] = {
        rich_text: [
          {
            text: {
              content: originalFrontmatter.description
            }
          }
        ]
      };
    }

    // You can add more property mappings based on your Notion database structure
    // For example, for tags, categories, etc.

    // We need to create a temporary copy without frontmatter for Notion import
    // This ensures we don't modify the original translated file
    tempNotionFilePath = `${translatedPath}.notion.md`;
    let translatedContent = await fs.readFile(translatedPath, 'utf8');

    // Remove frontmatter before sending to Notion
    translatedContent = translatedContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

    // Process markdown to fix potential issues that might cause Notion API errors
    // 1. Replace image paths with valid URLs or remove them
    translatedContent = fixImagePaths(translatedContent);

    await fs.writeFile(tempNotionFilePath, translatedContent, 'utf8');

    // Use our markdown to Notion converter to create or update the page
    // This handles all the conversion of markdown to Notion blocks
    spinner.text = isNewPage ?
      `Creating new page for ${title} in ${config.notionLangCode}` :
      `Updating existing page for ${title} in ${config.notionLangCode}`;

    const pageId = await createNotionPageFromMarkdown(
      notion,
      DATABASE_ID,
      title,
      tempNotionFilePath,
      properties
    );

    // Clean up the temporary file
    if (tempNotionFilePath) {
      try {
        await fs.unlink(tempNotionFilePath);
      } catch (unlinkError) {
        console.warn(`Warning: Could not delete temporary file ${tempNotionFilePath}:`, unlinkError);
      }
    }

    const status = isNewPage ?
      `Created new page (Published: false)` :
      `Updated existing page`;

    spinner.succeed(`${status} for ${title} in ${config.notionLangCode} (Page ID: ${pageId})`);
  } catch (error) {
    spinner.fail(`Failed to create Notion page for ${path.basename(translatedPath)}`);

    // Detailed error handling for specific API errors
    if (error.name === 'APIResponseError') {
      console.error(`Notion API Error (${path.basename(translatedPath)}): ${error.message}`);

      // Check for specific error types
      if (error.message.includes('Invalid image url')) {
        console.error('Error details: Invalid image URLs in the markdown. Images will be skipped.');
      } else if (error.message.includes('rate_limited')) {
        console.error('Error details: Rate limited by Notion API. Wait a few minutes and try again.');
      } else {
        console.error('Full error details:', error);
      }
    } else {
      console.error(`Error creating Notion page for ${translatedPath}:`, error);
    }

    // Always clean up temporary files on error
    if (tempNotionFilePath) {
      try {
        await fs.unlink(tempNotionFilePath);
      } catch (unlinkError) {
        // Just log and continue if cleanup fails
        console.warn(`Warning: Could not delete temporary file ${tempNotionFilePath}:`, unlinkError);
      }
    }
  }
}

// Helper function to fix common issues that might cause Notion API errors
function fixImagePaths(content: string): string {
  // 1. Convert relative image paths to absolute or remove them
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  return content.replace(imageRegex, (match, altText, path) => {
    // Check if it's a valid URL
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return match; // Keep valid URLs
    }

    // Return just the alt text for invalid paths to avoid Notion API errors
    return `[${altText}]`;
  });
}

async function main() {
  console.log(chalk.bold.cyan('🚀 Starting documentation translation process\n'));
  let tempDirCreated = false;

  try {
    // Create temp directory
    await fs.mkdir(TEMP_DIR, { recursive: true });
    tempDirCreated = true;

    // Get all markdown files in docs directory
    const mdFiles = await getMarkdownFiles('./docs');
    console.log(chalk.blue(`Found ${mdFiles.length} markdown files`));

    for (const config of LANGUAGES) {
      console.log(chalk.yellow(`\nProcessing ${config.language} translations:`));

      // First pass: translate files that need translation
      const translatedFiles = [];
      const failedTranslations = [];

      // Create language output directory if it doesn't exist
      await fs.mkdir(config.outputDir, { recursive: true }).catch(err => {
        console.warn(chalk.yellow(`Warning: Could not create output directory ${config.outputDir}:`, err.message));
      });

      for (const file of mdFiles) {
        try {
          const needsUpdate = await needsTranslation(file, config);
          if (needsUpdate) {
            try {
              console.log(chalk.blue(`Translating ${path.basename(file)} to ${config.language}...`));
              const translatedPath = await translateFile(file, config);
              translatedFiles.push({ original: file, translated: translatedPath });
            } catch (error) {
              console.error(chalk.red(`Failed to translate ${path.basename(file)}:`, error.message));
              failedTranslations.push({ file, error });
              // Continue with other files
            }
          } else {
            console.log(chalk.gray(`Skipping ${path.basename(file)} (already up-to-date in Notion)`));
          }
        } catch (error) {
          console.error(chalk.red(`Error checking if ${path.basename(file)} needs translation:`, error.message));
          failedTranslations.push({ file, error });
          // Continue with other files
        }
      }

      // Report translation status
      if (translatedFiles.length === 0 && failedTranslations.length === 0) {
        console.log(chalk.blue(`\nNo files needed translation to ${config.language}`));
        continue; // Skip to next language
      }

      if (failedTranslations.length > 0) {
        console.log(chalk.yellow(`\n⚠️ ${failedTranslations.length} files failed translation to ${config.language}`));
      }

      if (translatedFiles.length === 0) {
        console.log(chalk.yellow(`\nNo successful translations for ${config.language}, skipping Notion updates`));
        continue; // Skip to next language
      }

      // Second pass: create Notion pages for translated files
      console.log(chalk.yellow(`\nCreating ${translatedFiles.length} Notion pages for ${config.language}:`));

      const notionSuccesses = [];
      const notionFailures = [];

      // Process in batches to avoid rate limiting
      const BATCH_SIZE = 5;
      for (let i = 0; i < translatedFiles.length; i += BATCH_SIZE) {
        const batch = translatedFiles.slice(i, i + BATCH_SIZE);

        // Use Promise.allSettled to handle errors for each page individually
        const results = await Promise.allSettled(
          batch.map(({ original, translated }) => createNotionPage(original, translated, config))
        );

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            notionSuccesses.push(batch[index].translated);
          } else {
            console.error(chalk.red(`Failed to create Notion page: ${result.reason}`));
            notionFailures.push({
              path: batch[index].translated,
              error: result.reason
            });
          }
        });

        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < translatedFiles.length) {
          console.log(chalk.blue(`Waiting 2 seconds before next batch...`));
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Report Notion creation status
      if (notionFailures.length > 0) {
        console.log(chalk.yellow(`\n⚠️ ${notionFailures.length} Notion pages failed to create`));
      }

      if (notionSuccesses.length === 0) {
        console.log(chalk.yellow(`\nNo successful Notion page creations for ${config.language}, but will still save translations`));
      }

      // Third pass: copy successfully translated files to output directory
      console.log(chalk.yellow(`\nCopying translated files to ${config.outputDir}:`));

      let copySuccessCount = 0;

      for (const { original, translated } of translatedFiles) {
        try {
          const relativePath = getRelativePath(original);
          const outputPath = path.join(config.outputDir, relativePath);

          // Create directory if it doesn't exist
          await fs.mkdir(path.dirname(outputPath), { recursive: true });

          // Copy the file
          await fs.copyFile(translated, outputPath);
          copySuccessCount++;
          console.log(chalk.green(`Copied ${path.basename(translated)} to ${path.dirname(outputPath)}`));
        } catch (error) {
          console.error(chalk.red(`Failed to copy ${path.basename(translated)}:`, error.message));
        }
      }

      console.log(chalk.green(`\n✓ Copied ${copySuccessCount} files to ${config.outputDir}`));
    }
  } catch (error) {
    console.error(chalk.bold.red('\n❌ Fatal error during translation process:'), error);
  } finally {
    // Clean up temp directory in all cases, even if there were errors
    if (tempDirCreated) {
      try {
        await fs.rm(TEMP_DIR, { recursive: true, force: true });
        console.log(chalk.blue('\nCleaned up temporary files'));
      } catch (error) {
        console.error(chalk.yellow('\n⚠️ Failed to clean up temporary directory:'), error.message);
      }
    }

    console.log(chalk.bold.green('\n✨ Translation process completed!'));
  }
}

main();