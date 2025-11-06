import dotenv from "dotenv";
import chalk from "chalk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchNotionData } from "../fetchNotionData";
import { runFetchPipeline } from "../notion-fetch/runFetch";
import {
  gracefulShutdown,
  initializeGracefulShutdownHandlers,
} from "../notion-fetch/runtime";

// Load environment variables
dotenv.config();

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (resolvedDatabaseId) {
  process.env.DATABASE_ID = resolvedDatabaseId;
}

initializeGracefulShutdownHandlers();

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching page names
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalize a string for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Collapse multiple spaces into one
 * - Remove special characters
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

/**
 * Calculate fuzzy match score between two strings
 * Higher score = better match
 * Uses combination of:
 * - Exact match bonus
 * - Substring match bonus
 * - Levenshtein distance
 */
function fuzzyMatchScore(search: string, target: string): number {
  const normalizedSearch = normalizeString(search);
  const normalizedTarget = normalizeString(target);

  // Exact match (after normalization)
  if (normalizedSearch === normalizedTarget) {
    return 1000;
  }

  // Substring match
  if (normalizedTarget.includes(normalizedSearch)) {
    return 500 + (normalizedSearch.length / normalizedTarget.length) * 100;
  }

  // Levenshtein distance based score
  const distance = levenshteinDistance(normalizedSearch, normalizedTarget);
  const maxLen = Math.max(normalizedSearch.length, normalizedTarget.length);
  const similarity = 1 - distance / maxLen;

  return similarity * 100;
}

/**
 * Find the best matching page by title
 */
function findBestMatch(
  searchTerm: string,
  pages: Array<Record<string, any>>
): { page: Record<string, any>; score: number } | null {
  if (pages.length === 0) {
    return null;
  }

  let bestMatch: { page: Record<string, any>; score: number } | null = null;

  for (const page of pages) {
    const properties = page.properties || {};
    const titleProperty = properties["Title"] || properties["Name"];
    const title =
      titleProperty?.title?.[0]?.plain_text ||
      titleProperty?.name?.[0]?.plain_text ||
      "Untitled";

    const score = fuzzyMatchScore(searchTerm, title);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { page, score };
    }
  }

  return bestMatch;
}

/**
 * Extract page title from a Notion page object
 */
function getPageTitle(page: Record<string, any>): string {
  const properties = page.properties || {};
  const titleProperty = properties["Title"] || properties["Name"];
  return (
    titleProperty?.title?.[0]?.plain_text ||
    titleProperty?.name?.[0]?.plain_text ||
    "Untitled"
  );
}

/**
 * Main execution function
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2);

  // Show help if no arguments or --help flag
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }

  // Get the page name from arguments (join all args to support multi-word names)
  const pageName = args.join(" ");

  console.log(
    chalk.bold.cyan(
      `🔍 Searching for Notion page: "${chalk.yellow(pageName)}"\n`
    )
  );

  if (!process.env.NOTION_API_KEY) {
    console.error(
      chalk.red("Error: NOTION_API_KEY not found in environment variables")
    );
    await gracefulShutdown(1);
    return 1;
  }

  if (!process.env.DATABASE_ID) {
    console.error(
      chalk.red("Error: DATABASE_ID not found in environment variables")
    );
    await gracefulShutdown(1);
    return 1;
  }

  try {
    // Step 1: Fetch all pages to search through them
    console.log(chalk.gray("📥 Fetching pages from Notion database..."));
    const allPages = await fetchNotionData(undefined); // No filter - fetch all pages

    if (!Array.isArray(allPages) || allPages.length === 0) {
      console.error(chalk.red("❌ No pages found in the database"));
      await gracefulShutdown(1);
      return 1;
    }

    console.log(
      chalk.green(`✅ Found ${allPages.length} pages in the database\n`)
    );

    // Step 2: Find the best matching page using fuzzy search
    const match = findBestMatch(pageName, allPages);

    if (!match) {
      console.error(chalk.red(`❌ No matching page found for "${pageName}"`));
      await gracefulShutdown(1);
      return 1;
    }

    const matchedTitle = getPageTitle(match.page);
    const matchedId = match.page.id;

    console.log(chalk.bold.green("✅ Best match found:"));
    console.log(chalk.cyan(`   Title: ${matchedTitle}`));
    console.log(chalk.gray(`   Score: ${match.score.toFixed(2)}`));
    console.log(chalk.gray(`   ID: ${matchedId}\n`));

    // Step 3: Fetch and process only the matched page (+ its children)
    // Create a filter that matches only this specific page ID
    const filter = {
      or: [
        {
          property: "Parent item",
          relation: {
            contains: matchedId,
          },
        },
      ],
    };

    console.log(
      chalk.bold.cyan(
        `🚀 Fetching and processing "${chalk.yellow(matchedTitle)}" and its children...\n`
      )
    );

    // Use the existing pipeline but with:
    // 1. A transform that includes our matched page
    // 2. A filter that gets its children
    const { metrics } = await runFetchPipeline({
      filter,
      fetchSpinnerText: `Fetching children of "${matchedTitle}"`,
      generateSpinnerText: "Generating blocks",
      transform: async (childPages) => {
        // Include the parent page itself + its children
        const allRelatedPages = [match.page, ...childPages];
        console.log(
          chalk.gray(
            `  Found ${childPages.length} child page(s) for "${matchedTitle}"`
          )
        );
        return allRelatedPages;
      },
    });

    console.log(chalk.bold.green("\n✨ Fetch complete!"));

    if (metrics) {
      const totalSavedKb = Number(metrics.totalSaved) / 1024;
      const sectionCount = Number(metrics.sectionCount);
      const titleSectionCount = Number(metrics.titleSectionCount);
      const emojiCount = Number(metrics.emojiCount);

      console.log(
        chalk.bold.cyan(
          `Image compression saved ${isFinite(totalSavedKb) ? totalSavedKb.toFixed(2) : "0.00"} KB`
        )
      );
      console.log(
        chalk.bold.yellow(
          `Created ${isFinite(sectionCount) ? sectionCount : 0} section folders`
        )
      );
      console.log(
        chalk.bold.magenta(
          `Applied ${isFinite(titleSectionCount) ? titleSectionCount : 0} title sections`
        )
      );
      console.log(
        chalk.bold.blue(
          `Processed ${isFinite(emojiCount) ? emojiCount : 0} custom emojis`
        )
      );
    }

    await gracefulShutdown(0);
    return 0;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Process exit called with code:")
    ) {
      throw error;
    }

    console.error(chalk.bold.red("❌ Fatal error:"), error);
    await gracefulShutdown(1);
    return 1;
  }
}

function printHelp() {
  console.log(
    chalk.bold("CoMapeo Notion Fetch One - Fetch a Single Page by Name\n")
  );
  console.log(
    "Searches for a page by name using fuzzy matching and fetches only that page + its children.\n"
  );
  console.log(chalk.bold("Usage:"));
  console.log('  bun run notion:fetch-one "page name"\n');
  console.log(chalk.bold("Examples:"));
  console.log('  bun run notion:fetch-one "understanding how exchange works"');
  console.log('  bun run notion:fetch-one "exchange"');
  console.log('  bun run notion:fetch-one "EXCHANGE WORKS"\n');
  console.log(chalk.bold("Notes:"));
  console.log("  - Page name matching is case-insensitive");
  console.log("  - Ignores extra whitespace and special characters");
  console.log("  - Uses fuzzy matching to find the best match");
  console.log("  - Fetches the matched page and all its child pages");
  console.log(
    "  - Saves to the normal docs/ location like other fetch commands\n"
  );
}

export { main };

// Run if executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExec && process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      await main();
    } catch (error) {
      console.error(chalk.red("❌ Fatal error:"), error);
      await gracefulShutdown(1);
    }
  })().catch(async (err) => {
    console.error(chalk.red("❌ Unhandled fatal error:"), err);
    await gracefulShutdown(1);
  });
}
