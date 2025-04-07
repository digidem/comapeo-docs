import { notion, DATABASE_ID } from './notionClient.js';

export async function fetchNotionData() {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        {
          property: "Language",
          select: {
            equals: "English"
          }
        },
        {
          property: "Published",
          checkbox: {
            equals: true
          }
        }
      ]
    }
  });

  return response.results;
}

  // Example usage:
  // const pageId = '16d8004e5f6a42a6981151c22ddada12';
  // await fetchNotionPage(pageId);
export async function fetchNotionPage() {
  try {
    const response = await notion.blocks.children.list({
      block_id: DATABASE_ID,
    });
    console.log('Fetched page content:', response);
    return response;
  } catch (error) {
    console.error('Error fetching Notion page:', error);
    throw error;
  }
}

export async function fetchNotionBlocks(blockId) {
  try {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100
    });

    console.log(`Fetched ${response.results.length} blocks for block ID: ${blockId}`);

    // Recursively fetch nested blocks
    for (const block of response.results) {
      if (block.has_children) {
        block.children = await fetchNotionBlocks(block.id);
      }
    }

    return response.results;
  } catch (error) {
    console.error('Error fetching Notion blocks:', error);
    throw error;
  }
}
