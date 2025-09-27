import { enhancedNotion, DATABASE_ID } from "./notionClient";
import {
  BlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Type guard to check if a block is a complete BlockObjectResponse
function isFullBlock(
  block: PartialBlockObjectResponse | BlockObjectResponse
): block is BlockObjectResponse {
  return "has_children" in block;
}

export async function fetchNotionData(filter) {
  const results: Array<Record<string, unknown>> = [];
  let hasMore = true;
  let startCursor: string | undefined;
  let safetyCounter = 0;
  const MAX_PAGES = 10_000; // Safety limit to prevent infinite loops

  const seenIds = new Set<string>();
  while (hasMore) {
    if (++safetyCounter > MAX_PAGES) {
      console.warn(
        "Pagination safety limit exceeded; returning partial results."
      );
      break;
    }

    const response = await enhancedNotion.databasesQuery({
      database_id: DATABASE_ID,
      filter,
      start_cursor: startCursor,
      page_size: 100,
    });

    const pageResults = Array.isArray(response.results) ? response.results : [];

    // Detect duplicate IDs to avoid stalling and data corruption
    let duplicateDetected = false;
    for (const r of pageResults) {
      const id = (r as any)?.id;
      if (id && seenIds.has(id)) {
        duplicateDetected = true;
        break;
      }
      if (id) seenIds.add(id);
    }

    results.push(...pageResults);

    const prevCursor = startCursor;
    const prevCount = pageResults.length;
    hasMore = Boolean(response.has_more);
    startCursor = response.next_cursor ?? undefined;

    if (
      hasMore &&
      (duplicateDetected ||
        !startCursor ||
        startCursor === prevCursor ||
        prevCount === 0)
    ) {
      console.warn(
        "Notion API pagination anomaly detected; stopping early with partial results."
      );
      break;
    }
  }

  return results;
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
    const orderA = a.properties?.["Order"]?.number ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.properties?.["Order"]?.number ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  // Get every sub-page for every parent page
  for (const item of data) {
    const relations = item?.properties?.["Sub-item"]?.relation ?? [];
    const subpages = await Promise.all(
      relations.map(async (rel: { id: string }) => {
        return await enhancedNotion.pagesRetrieve({ page_id: rel.id });
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
    const response = await enhancedNotion.blocksChildrenList({
      block_id: DATABASE_ID,
    });
    console.log("Fetched page content:", response);
    return response;
  } catch (error) {
    console.error("Error fetching Notion page:", error);
    throw error;
  }
}

export async function fetchNotionBlocks(blockId) {
  try {
    const response = await enhancedNotion.blocksChildrenList({
      block_id: blockId,
      page_size: 100,
    });

    console.log(
      `Fetched ${response.results.length} blocks for block ID: ${blockId}`
    );

    // Recursively fetch nested blocks
    for (const block of response.results) {
      if (isFullBlock(block) && block.has_children) {
        (block as any).children = await fetchNotionBlocks(block.id);
      }
    }

    return response.results;
  } catch (error) {
    console.error("Error fetching Notion blocks:", error);
    throw error;
  }
}
