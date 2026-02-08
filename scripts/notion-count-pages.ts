/**
 * Count pages in Notion database
 *
 * This script counts pages matching the provided filters,
 * accounting for sub-pages and status filtering to match
 * the count shown in the Notion UI.
 */

import {
  fetchAllNotionData,
  type FetchAllOptions,
} from "./notion-fetch-all/fetchAll";

interface CountOptions extends FetchAllOptions {
  json?: boolean;
}

interface CountResult {
  count: number;
  fetchedCount: number;
  processedCount: number;
  statusFilter?: string;
  includeRemoved: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CountOptions {
  const args = process.argv.slice(2);
  const options: CountOptions = {
    includeRemoved: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    // The command line options map is controlled by known flags; suppress security false positive.
    // eslint-disable-next-line security/detect-object-injection
    switch (args[i]) {
      case "--include-removed":
        options.includeRemoved = true;
        break;
      case "--status-filter":
        options.statusFilter = args[++i];
        break;
      case "--max-pages":
        options.maxPages = parseInt(args[++i], 10);
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log("CoMapeo Notion Count Pages\n");
  console.log(
    "Count pages in Notion database matching the provided filters.\n"
  );
  console.log("Usage:");
  console.log("  bun run notion-count-pages [options]\n");
  console.log("Options:");
  console.log(
    '  --include-removed          Include pages with "Remove" status'
  );
  console.log("  --status-filter <status>   Filter by specific status");
  console.log("  --max-pages <number>       Limit count (for testing)");
  console.log("  --json                     Output as JSON");
  console.log("  --help, -h                 Show this help message\n");
  console.log("Examples:");
  console.log("  bun run notion-count-pages");
  console.log('  bun run notion-count-pages --status-filter "Draft"');
  console.log(
    '  bun run notion-count-pages --status-filter "Ready to publish" --json'
  );
  console.log("  bun run notion-count-pages --include-removed");
}

/**
 * Format count result for output
 */
function formatResult(result: CountResult, json: boolean): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  let output = `Count: ${result.count}`;

  if (result.statusFilter) {
    output += `\nStatus filter: ${result.statusFilter}`;
  }

  if (result.includeRemoved) {
    output += `\nInclude removed: true`;
  }

  if (result.fetchedCount !== result.processedCount) {
    output += `\nFetched: ${result.fetchedCount}`;
    output += `\nAfter filtering: ${result.processedCount}`;
  }

  return output;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  if (!process.env.NOTION_API_KEY) {
    console.error("Error: NOTION_API_KEY not found in environment variables");
    process.exit(1);
  }

  if (!process.env.DATABASE_ID) {
    console.error("Error: DATABASE_ID not found in environment variables");
    process.exit(1);
  }

  try {
    const fetchResult = await fetchAllNotionData({
      includeRemoved: options.includeRemoved,
      statusFilter: options.statusFilter,
      maxPages: options.maxPages,
      exportFiles: false,
      fetchSpinnerText: "Fetching pages from Notion...",
      generateSpinnerText: undefined,
    });

    const result: CountResult = {
      count: fetchResult.processedCount,
      fetchedCount: fetchResult.fetchedCount,
      processedCount: fetchResult.processedCount,
      statusFilter: options.statusFilter,
      includeRemoved: options.includeRemoved,
    };

    console.log(formatResult(result, options.json || false));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
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

export { main, parseArgs, formatResult, type CountOptions, type CountResult };
