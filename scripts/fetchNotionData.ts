import { notion, DATABASE_ID } from './notionClient.js';

export async function fetchNotionData(filter) {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: filter
  });
  return response.results;
}

/**
     * Sorts Notion data by the "Order" property, fetches sub-pages for each parent page,
     * and logs each item's URL. Returns the updated data array.
     * @param {any[]} data - Array of Notion page objects
     * @returns {Promise<any[]>} - The updated data array including sub-pages
     */
export async function sortAndExpandNotionData(
  data: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  // Sort data by Order property if available to ensure proper sequencing
  data = data.sort((a, b) => {
    const orderA = a.properties?.['Order']?.number ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.properties?.['Order']?.number ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  // Get every sub-page for every parent page
  for (const item of data) {
    const relations = item?.properties?.["Sub-item"]?.relation ?? [];
    const subpages = await Promise.all(
      relations.map(async (rel: { id: string }) => {
        return await notion.pages.retrieve({ page_id: rel.id });
      })
    );
    for (const subpage of subpages) {
      data.push(subpage);
    }
  }

  data.forEach((item, index) => {
    // Use optional chaining in case url is missing
    console.log(`Item ${index + 1}:`, item?.url);
  });

  return data;
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
