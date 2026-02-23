#!/usr/bin/env bun
/**
 * notion-count-pages: Count pages from Notion database with same filters as fetch-all.
 *
 * Usage:
 *   bun scripts/notion-count-pages [--include-removed] [--status-filter STATUS]
 *
 * Outputs JSON to stdout:
 *   {
 *     "total": N,
 *     "parents": N,
 *     "subPages": N,
 *     "byStatus": { "Ready to publish": N, ... },
 *     "byElementType": { "Page": N, "Toggle": N, "Title": N, ... },
 *     "expectedDocs": N
 *   }
 *
 * Notes:
 *   - expectedDocs counts only parent pages with elementType "Page"
 *     (these are the ones that generate actual English markdown files)
 *   - byElementType breaks down parent pages by their Element Type property
 *
 * Exit codes:
 *   0 = success
 *   1 = error (Notion API failure, missing env vars, etc.)
 */

import "dotenv/config";

// Notion property name for status (must match fetchAll.ts)
const STATUS_PROPERTY = "Publish Status";

// Validate environment variables BEFORE importing notionClient to ensure graceful exit
const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (!process.env.NOTION_API_KEY) {
  console.error(
    "Error: NOTION_API_KEY environment variable is not set.\n" +
      "Please set NOTION_API_KEY in your .env file or environment."
  );
  process.exit(1);
}

if (!resolvedDatabaseId) {
  console.error(
    "Error: DATABASE_ID or NOTION_DATABASE_ID environment variable is not set.\n" +
      "Please set DATABASE_ID in your .env file or environment."
  );
  process.exit(1);
}

// Build the same filter as fetch-all without importing from fetchAll.ts
// to avoid triggering Docusaurus initialization
function buildStatusFilter(includeRemoved: boolean) {
  if (includeRemoved) {
    return undefined;
  }

  return {
    or: [
      {
        property: STATUS_PROPERTY,
        select: { is_empty: true },
      },
      {
        property: STATUS_PROPERTY,
        select: { does_not_equal: "Remove" },
      },
    ],
  };
}

interface CountOptions {
  includeRemoved: boolean;
  statusFilter?: string;
}

function parseArgs(): CountOptions {
  const args = process.argv.slice(2);
  const options: CountOptions = {
    includeRemoved: false,
  };

  for (let i = 0; i < args.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- args[i] is controlled by loop index
    switch (args[i]) {
      case "--include-removed":
        options.includeRemoved = true;
        break;
      case "--status-filter":
        options.statusFilter = args[++i];
        break;
      default:
        // eslint-disable-next-line security/detect-object-injection -- args[i] is controlled by loop index
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

async function countPages(options: CountOptions) {
  // Import modules inside the function to avoid top-level execution
  const { fetchNotionData, sortAndExpandNotionData } = await import(
    "../fetchNotionData"
  );
  const { getStatusFromRawPage, resolveChildrenByStatus } = await import(
    "../notionPageUtils"
  );
  const { NOTION_PROPERTIES } = await import("../constants");

  // Step 1: Build the same filter as fetch-all (using local function)
  const filter = buildStatusFilter(options.includeRemoved);

  // Step 2: Fetch all parent pages from Notion (with pagination)
  const parentPages = await fetchNotionData(filter);
  const parentCount = parentPages.length;

  // Step 3: Expand sub-pages (same as fetch-all pipeline)
  const expandedPages = await sortAndExpandNotionData(parentPages);
  const totalAfterExpansion = expandedPages.length;
  const subPageCount = totalAfterExpansion - parentCount;

  // Step 4: Apply defensive status filter (mirrors applyFetchAllTransform in fetchAll.ts)
  let filtered = expandedPages.filter((p) => {
    const status = getStatusFromRawPage(p);
    if (!options.includeRemoved && status === "Remove") return false;
    return true;
  });

  // When statusFilter is provided, resolve children from parent pages (same as fetchAll.ts)
  if (options.statusFilter) {
    filtered = resolveChildrenByStatus(filtered, options.statusFilter);
  }

  // Step 5: Count by status
  const byStatus: Record<string, number> = {};
  for (const page of filtered) {
    const status = getStatusFromRawPage(page) || "(empty)";
    // eslint-disable-next-line security/detect-object-injection -- status is from our own data
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  // Step 6: Count by element type (using parent pages only)
  // and calculate expectedDocs (English markdown files)
  const byElementType: Record<string, number> = {};
  let expectedDocsCount = 0;

  // Build lookup map for sub-page language checking
  const pageById = new Map<string, Record<string, unknown>>();
  for (const page of expandedPages) {
    if (page?.id) {
      pageById.set(page.id as string, page);
    }
  }

  // Build subpageIdSet matching generateBlocks.ts logic:
  // Any page referenced as a Sub-item by another page is a sub-page
  // and won't generate its own markdown file (it gets merged into its parent).
  const subpageIdSet = new Set<string>();
  for (const page of expandedPages) {
    const relations = (page as any)?.properties?.["Sub-item"]?.relation ?? [];
    for (const relation of relations) {
      if (relation?.id) {
        subpageIdSet.add(relation.id);
      }
    }
  }

  const LANGUAGE_TO_LOCALE: Record<string, string> = {
    English: "en",
    Spanish: "es",
    Portuguese: "pt",
  };

  function getPageLocale(page: Record<string, unknown>): string {
    const props = page.properties as Record<string, any> | undefined;
    const langProp = props?.[NOTION_PROPERTIES.LANGUAGE] ?? props?.["Language"];
    const langName = langProp?.select?.name;
    // eslint-disable-next-line security/detect-object-injection -- langName is from Notion select property
    if (langName && LANGUAGE_TO_LOCALE[langName]) {
      // eslint-disable-next-line security/detect-object-injection -- langName is from Notion select property
      return LANGUAGE_TO_LOCALE[langName];
    }
    return "en"; // default locale
  }

  for (const page of parentPages) {
    // Get element type with fallback to legacy "Section" property
    const elementTypeProp =
      page.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE] ??
      page.properties?.["Section"];

    const elementType = elementTypeProp?.select?.name || "(unknown)";

    // eslint-disable-next-line security/detect-object-injection -- elementType is from our own data
    byElementType[elementType] = (byElementType[elementType] || 0) + 1;

    // Skip pages that are sub-items of other pages — generateBlocks.ts
    // merges these into their parent rather than creating separate files.
    if (subpageIdSet.has(page.id as string)) {
      continue;
    }

    // Count "Page" type parents that will produce English markdown.
    // A page produces English markdown if:
    // - Its locale is "en" (Language not set or set to "English"), OR
    // - Any of its sub-pages has locale "en"
    if (elementType === "Page") {
      const parentLocale = getPageLocale(page);
      let hasEnglish = parentLocale === "en";

      if (!hasEnglish) {
        const subItems = (page.properties as any)?.["Sub-item"]?.relation ?? [];
        for (const rel of subItems) {
          const subPage = pageById.get(rel.id);
          if (subPage && getPageLocale(subPage) === "en") {
            hasEnglish = true;
            break;
          }
        }
      }

      if (hasEnglish) {
        expectedDocsCount++;
      }
    }
  }

  return {
    total: filtered.length,
    parents: parentCount,
    subPages: subPageCount,
    byStatus,
    byElementType,
    expectedDocs: expectedDocsCount,
  };
}

async function main() {
  const options = parseArgs();

  try {
    const result = await countPages(options);
    // Output JSON to stdout (this is what the job executor captures)
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error(
      "Failed to count pages:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

// Run if executed directly
const isDirectExec =
  process.argv[1] &&
  require("node:path").resolve(process.argv[1]) ===
    require("node:url").fileURLToPath(import.meta.url);

if (isDirectExec && process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      await main();
    } catch (error) {
      console.error("Fatal error:", error);
      process.exit(1);
    }
  })().catch((err) => {
    console.error("Unhandled fatal error:", err);
    process.exit(1);
  });
}

// Export for testing
export { main, parseArgs, buildStatusFilter };
export type { CountOptions };
