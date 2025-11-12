import { enhancedNotion, DATABASE_ID, DATA_SOURCE_ID } from "./notionClient";
import {
  BlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { perfTelemetry } from "./perfTelemetry";

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

    // Use DATA_SOURCE_ID with fallback to DATABASE_ID
    // Note: notionClient.ts will warn if DATA_SOURCE_ID is not set
    const dataSourceId = DATA_SOURCE_ID || DATABASE_ID;

    const response = await enhancedNotion.databasesQuery({
      // v5 API: database_id parameter is mapped to data_source_id by the legacy method
      database_id: dataSourceId,
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

    const anomaly =
      hasMore &&
      (duplicateDetected ||
        !startCursor ||
        startCursor === prevCursor ||
        prevCount === 0);
    if (anomaly) {
      // One retry attempt to recover from transient anomaly
      console.warn("Notion API pagination anomaly detected; retrying once...");
      const retryResp = await enhancedNotion.databasesQuery({
        database_id: dataSourceId,
        filter,
        start_cursor: prevCursor,
        page_size: 100,
      });
      const retryResults = Array.isArray(retryResp.results)
        ? retryResp.results
        : [];
      for (const r of retryResults) {
        const id = (r as any)?.id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        results.push(r);
      }
      const retryCursor = retryResp.next_cursor ?? undefined;
      if (retryCursor && retryCursor !== prevCursor) {
        hasMore = Boolean(retryResp.has_more);
        startCursor = retryCursor;
        continue;
      }
      console.warn(
        "Anomaly persisted after retry; stopping early with partial results."
      );
      break;
    }
  }

  perfTelemetry.recordDataset({ parentPages: results.length });
  return results;
}

/**
 * Sorts Notion data by the "Order" property, fetches sub-pages for each parent page,
 * and logs each item's URL. Returns the updated data array.
 *
 * OPTIMIZED: Uses batched fetching with rate limiting to prevent timeouts
 *
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

  // Collect all sub-item relations across ALL parent pages for batched fetching
  const allRelations: Array<{
    parentId: string;
    subId: string;
    parentTitle: string;
  }> = [];

  for (const item of data) {
    const relations = item?.properties?.["Sub-item"]?.relation ?? [];
    const parentTitle =
      item?.properties?.["Title"]?.title?.[0]?.plain_text ??
      item?.properties?.["Name"]?.title?.[0]?.plain_text ??
      "Unknown";

    for (const rel of relations) {
      allRelations.push({
        parentId: item.id as string,
        subId: rel.id,
        parentTitle,
      });
    }
  }

  // Early return if no sub-items to fetch
  if (allRelations.length === 0) {
    data.forEach((item, index) => {
      console.log(`Item ${index + 1}:`, item?.url);
    });
    return data;
  }

  console.log(
    `📥 Fetching ${allRelations.length} sub-pages across ${data.length} parent pages...`
  );

  // Fetch sub-pages in controlled batches to prevent overwhelming the API or environment
  // GitHub Actions can struggle with 100+ concurrent connections
  const startTime = Date.now();
  perfTelemetry.recordDataset({
    parentPages: data.length,
    subpageRelations: allRelations.length,
  });

  const BATCH_SIZE = 10; // Process 10 concurrent requests at a time
  const subpages: any[] = [];
  let processedCount = 0;

  try {
    // Process in batches
    for (let i = 0; i < allRelations.length; i += BATCH_SIZE) {
      const batch = allRelations.slice(
        i,
        Math.min(i + BATCH_SIZE, allRelations.length)
      );
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allRelations.length / BATCH_SIZE);

      console.log(
        `  📦 Batch ${batchIndex}/${totalBatches}: fetching ${batch.length} sub-pages...`
      );

      const batchResults = await Promise.all(
        batch.map(async (rel, idx) => {
          try {
            // Add explicit timeout to prevent hanging indefinitely
            // GitHub Actions seems to have issues with Notion API calls hanging
            const TIMEOUT_MS = 10000; // 10 second timeout
            const timeoutPromise = new Promise((_resolve, reject) =>
              setTimeout(
                () =>
                  reject(new Error(`API call timeout after ${TIMEOUT_MS}ms`)),
                TIMEOUT_MS
              )
            );

            const result = await Promise.race([
              enhancedNotion.pagesRetrieve({ page_id: rel.subId }),
              timeoutPromise,
            ]);

            // Validate response
            if (!result || typeof result !== "object") {
              throw new Error(
                `Invalid response from pagesRetrieve: ${JSON.stringify(result)}`
              );
            }

            processedCount++;
            // Progress logging every 10 items
            if (
              processedCount % 10 === 0 ||
              processedCount === allRelations.length
            ) {
              console.log(
                `    ✓ Fetched ${processedCount}/${allRelations.length} sub-pages`
              );
            }
            return result;
          } catch (pageError) {
            console.error(
              `❌ Failed to fetch sub-page ${rel.subId} (parent: "${rel.parentTitle}"):`,
              pageError
            );
            console.error(
              `❌ Error details:`,
              JSON.stringify(pageError, null, 2)
            );
            throw pageError;
          }
        })
      );

      subpages.push(...batchResults);
      console.log(
        `  ✅ Batch ${batchIndex}/${totalBatches} complete (${batch.length} pages)`
      );
    }
  } catch (batchError) {
    console.error(
      `❌ [ERROR] Batched fetch failed at ${processedCount}/${allRelations.length}:`,
      batchError
    );
    throw batchError;
  }

  const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Fetched ${subpages.length} sub-pages in ${fetchDuration}s`);

  // Add all fetched sub-pages to data array
  for (const subpage of subpages) {
    data.push(subpage);
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
