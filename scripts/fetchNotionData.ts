import { notion, DATABASE_ID } from './notionClient.js';
import ora from 'ora';
import chalk from 'chalk';
import { MAIN_LANGUAGE, NOTION_PROPERTIES } from './constants.js';

/**
 * Fetches published pages from Notion for a specific language
 * @param language The language to fetch pages for (e.g., 'English', 'Portuguese')
 * @returns Array of Notion page objects
 */
export async function fetchNotionDataByLanguage(language: string) {
  const spinner = ora(`Fetching published ${language} pages from Notion`).start();

  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: NOTION_PROPERTIES.LANGUAGE,
            select: {
              equals: language
            }
          },
          {
            property: NOTION_PROPERTIES.PUBLISHED,
            checkbox: {
              equals: true
            }
          }
        ]
      }
    });

    spinner.succeed(chalk.green(`Fetched ${response.results.length} published ${language} pages`));
    return response.results;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to fetch published ${language} pages: ${error.message}`));
    throw error;
  }
}

/**
 * Fetches published English pages from Notion
 * @returns Array of Notion page objects
 */
export async function fetchNotionData() {
  return fetchNotionDataByLanguage(MAIN_LANGUAGE);
}

/**
 * Fetches a specific Notion page by ID
 * @param pageId The ID of the Notion page to fetch
 * @returns The page content
 */
export async function fetchNotionPage(pageId: string) {
  const spinner = ora(`Fetching Notion page ${pageId}`).start();

  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
    });
    spinner.succeed(chalk.green(`Fetched page content for ${pageId}`));
    return response;
  } catch (error) {
    spinner.fail(chalk.red(`Error fetching Notion page: ${error.message}`));
    throw error;
  }
}

/**
 * Recursively fetches all blocks from a Notion block, including nested blocks
 * @param blockId The ID of the block to fetch
 * @returns Array of block objects
 */
export async function fetchNotionBlocks(blockId: string) {
  try {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100
    });

    // Recursively fetch nested blocks
    for (const block of response.results) {
      // @ts-expect-error - We know the property structure
      if (block.has_children) {
        // @ts-expect-error - Adding children property to block
        block.children = await fetchNotionBlocks(block.id);
      }
    }

    return response.results;
  } catch (error) {
    console.error(`Error fetching Notion blocks for ${blockId}:`, error);
    throw error;
  }
}
