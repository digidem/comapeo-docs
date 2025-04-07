import { Client } from '@notionhq/client';
import ora from 'ora';
import chalk from 'chalk';
import { markdownToNotionBlocks } from './markdownToNotion.js';

/**
 * Creates a new translation page in Notion without modifying any existing pages
 * @param notion The Notion client
 * @param databaseId The ID of the Notion database
 * @param title The title of the page
 * @param translatedContent The translated content
 * @param properties Additional properties for the page
 * @param targetLanguage The target language
 * @returns The ID of the created page
 */
export async function createTranslationPage(
  notion: Client,
  databaseId: string,
  title: string,
  translatedContent: string,
  properties: Record<string, unknown>,
  targetLanguage: string
): Promise<string> {
  // CRITICAL SAFETY CHECK: Never translate to English
  if (targetLanguage === 'English') {
    throw new Error('SAFETY ERROR: Cannot create or update English pages. This is a critical safety measure to prevent data loss.');
  }
  const spinner = ora(`Creating translation page in ${targetLanguage}`).start();

  // Maximum number of retries
  const MAX_RETRIES = 3;
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < MAX_RETRIES) {
    try {
      // CRITICAL SAFETY CHECK: Never modify English pages
      // First, get all pages with this title
      const allPagesWithTitle = await notion.databases.query({
        database_id: databaseId,
        filter: {
          property: "Title",
          title: {
            equals: title
          }
        }
      });

      // Check if any of these pages are English pages
      for (const page of allPagesWithTitle.results) {
        // @ts-expect-error - We know the page has properties
        const pageLanguage = page.properties?.Language?.select?.name;
        if (pageLanguage === 'English') {
          // We found an English page with this title
          // Log a warning and continue with creating a new translation page
          console.warn(chalk.yellow(`⚠️ Found English page with title "${title}". Will create a separate translation page.`));
          // Do not modify this page under any circumstances
          break;
        }
      }

      // Now, check if a translation page already exists with this title and language
      const response = await notion.databases.query({
        database_id: databaseId,
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

      // Filter out any English pages from the results (extra safety check)
      const nonEnglishResults = response.results.filter(page => {
        // @ts-expect-error - We know the page has properties
        const pageLanguage = page.properties?.Language?.select?.name;
        return pageLanguage !== 'English';
      });

      // Convert markdown to Notion blocks
      const blocks = await markdownToNotionBlocks(translatedContent);

      let pageId: string;

      if (nonEnglishResults.length > 0) {
        // Update existing translation page
        pageId = nonEnglishResults[0].id;

        spinner.text = chalk.blue(`Updating existing translation page for ${title} in ${targetLanguage}`);

        // Update page properties
        await notion.pages.update({
          page_id: pageId,
          properties: {
            Title: {
              title: [
                {
                  text: {
                    content: title
                  }
                }
              ]
            },
            ...properties
          }
        });

        // Delete existing blocks
        const existingBlocks = await notion.blocks.children.list({
          block_id: pageId
        });

        for (const block of existingBlocks.results) {
          try {
            await notion.blocks.delete({
              block_id: block.id
            });
          } catch (deleteError) {
            console.warn(`Warning: Failed to delete block ${block.id}: ${deleteError.message}`);
            // Continue with other blocks even if one fails
          }
        }
      } else {
        // Create a new translation page
        spinner.text = chalk.blue(`Creating new translation page for ${title} in ${targetLanguage}`);

        // Create a new page
        const newPage = await notion.pages.create({
          parent: {
            database_id: databaseId,
          },
          properties: {
            Title: {
              title: [
                {
                  text: {
                    content: title
                  }
                }
              ]
            },
            ...properties
          }
        });

        pageId = newPage.id;
      }

      // Add content blocks in chunks to avoid API limits
      const CHUNK_SIZE = 50; // Notion API has a limit of 100 blocks per request, using 50 to be safe
      for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const blockChunk = blocks.slice(i, i + CHUNK_SIZE);
        await notion.blocks.children.append({
          block_id: pageId,
          children: blockChunk
        });

        // Add a small delay between chunks to avoid rate limiting
        if (i + CHUNK_SIZE < blocks.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      const status = nonEnglishResults.length > 0 ? "Updated existing" : "Created new";
      spinner.succeed(chalk.green(`${status} translation page for ${title} in ${targetLanguage}`));

      return pageId;
    } catch (error) {
      lastError = error;
      retryCount++;

      if (retryCount < MAX_RETRIES) {
        spinner.text = chalk.yellow(`Attempt ${retryCount}/${MAX_RETRIES} failed: ${error.message}. Retrying...`);
        // Exponential backoff: wait longer between retries
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      } else {
        spinner.fail(chalk.red(`Failed to create translation page: ${error.message}`));
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  // This should never be reached due to the throw in the catch block above
  throw lastError;
}
