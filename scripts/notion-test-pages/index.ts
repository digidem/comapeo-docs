/**
 * Notion Test Pages Setup Script
 *
 * This script finds or creates English test pages with realistic content blocks
 * for testing the translation workflow. It ensures:
 * - At least two English test pages exist
 * - Pages have realistic content blocks (paragraphs, headings, lists, etc.)
 * - Pages can be set to "Ready for translation" status
 * - Translation siblings (Spanish, Portuguese) are identified
 */

import { Client } from "@notionhq/client";
import ora from "ora";
import chalk from "chalk";
import {
  NOTION_PROPERTIES,
  MAIN_LANGUAGE,
  type NotionPage,
} from "../constants";

// Test page identifiers - used to find existing test pages
const TEST_PAGE_PREFIX = "[TEST]";

// Realistic content blocks for test pages
const TEST_CONTENT = {
  installation: {
    title: `${TEST_PAGE_PREFIX} Installation Guide`,
    blocks: [
      {
        type: "heading_1",
        content: "Getting Started",
      },
      {
        type: "paragraph",
        content:
          "This guide will help you install and configure the application on your device. Follow the steps below to get started quickly.",
      },
      {
        type: "heading_2",
        content: "System Requirements",
      },
      {
        type: "bulleted_list_item",
        content: "Operating System: Windows 10+, macOS 10.15+, or Linux",
      },
      {
        type: "bulleted_list_item",
        content: "RAM: Minimum 4GB, recommended 8GB",
      },
      {
        type: "bulleted_list_item",
        content: "Storage: 500MB available disk space",
      },
      {
        type: "heading_2",
        content: "Installation Steps",
      },
      {
        type: "numbered_list_item",
        content: "Download the installer from the official website",
      },
      {
        type: "numbered_list_item",
        content: "Run the installer and follow the setup wizard",
      },
      {
        type: "numbered_list_item",
        content: "Launch the application after installation completes",
      },
      {
        type: "callout",
        content:
          "Make sure to restart your device after installation for all changes to take effect.",
        emoji: "💡",
      },
    ],
  },
  features: {
    title: `${TEST_PAGE_PREFIX} Feature Overview`,
    blocks: [
      {
        type: "heading_1",
        content: "Key Features",
      },
      {
        type: "paragraph",
        content:
          "Our application provides a comprehensive set of features designed to help you manage your projects efficiently.",
      },
      {
        type: "heading_2",
        content: "Data Collection",
      },
      {
        type: "paragraph",
        content:
          "Collect data offline in the field with our mobile application. All data syncs automatically when you regain connectivity.",
      },
      {
        type: "heading_2",
        content: "Team Collaboration",
      },
      {
        type: "paragraph",
        content:
          "Work together with your team in real-time. Share observations, assign tasks, and track progress across all devices.",
      },
      {
        type: "heading_2",
        content: "Map Visualization",
      },
      {
        type: "paragraph",
        content:
          "View all your data on an interactive map. Filter by location, category, or date to find exactly what you need.",
      },
      {
        type: "callout",
        content:
          "All features work offline - your data is always available, even without an internet connection.",
        emoji: "🌐",
      },
      {
        type: "divider",
        content: "",
      },
      {
        type: "paragraph",
        content:
          "Contact support if you have questions about any of these features.",
      },
    ],
  },
};

export interface TestPageResult {
  page: NotionPage;
  siblings: {
    spanish?: NotionPage;
    portuguese?: NotionPage;
  };
  isNew: boolean;
  originalStatus: string | null;
}

interface SetupResult {
  pages: TestPageResult[];
  summary: {
    totalPages: number;
    newPages: number;
    existingPages: number;
    readyForTranslation: number;
    withSiblings: number;
  };
}

/**
 * Query the Notion database for existing test pages
 */
async function findExistingTestPages(
  notion: Client,
  databaseId: string
): Promise<NotionPage[]> {
  const response = await notion.dataSources.query({
    data_source_id: databaseId,
    filter: {
      and: [
        {
          property: NOTION_PROPERTIES.TITLE,
          title: {
            starts_with: TEST_PAGE_PREFIX,
          },
        },
        {
          property: NOTION_PROPERTIES.LANGUAGE,
          select: {
            equals: MAIN_LANGUAGE,
          },
        },
      ],
    },
    page_size: 10,
  });

  return response.results as NotionPage[];
}

/**
 * Find translation siblings for a given page
 */
async function findTranslationSiblings(
  notion: Client,
  databaseId: string,
  pageTitle: string
): Promise<{ spanish?: NotionPage; portuguese?: NotionPage }> {
  // Remove [TEST] prefix for matching sibling pages
  const baseTitle = pageTitle.replace(TEST_PAGE_PREFIX, "").trim();

  const response = await notion.dataSources.query({
    data_source_id: databaseId,
    filter: {
      and: [
        {
          property: NOTION_PROPERTIES.TITLE,
          title: {
            contains: baseTitle,
          },
        },
        {
          property: NOTION_PROPERTIES.LANGUAGE,
          select: {
            equals: "Spanish",
          },
        },
      ],
    },
    page_size: 1,
  });

  const spanish = response.results[0] as NotionPage | undefined;

  // Query for Portuguese
  const ptResponse = await notion.dataSources.query({
    data_source_id: databaseId,
    filter: {
      and: [
        {
          property: NOTION_PROPERTIES.TITLE,
          title: {
            contains: baseTitle,
          },
        },
        {
          property: NOTION_PROPERTIES.LANGUAGE,
          select: {
            equals: "Portuguese",
          },
        },
      ],
    },
    page_size: 1,
  });

  const portuguese = ptResponse.results[0] as NotionPage | undefined;

  return { spanish, portuguese };
}

/**
 * Create a new test page with realistic content
 */
async function createTestPage(
  notion: Client,
  databaseId: string,
  contentKey: keyof typeof TEST_CONTENT
): Promise<NotionPage> {
  // eslint-disable-next-line security/detect-object-injection -- contentKey is type-safe (keyof typeof TEST_CONTENT)
  const content = TEST_CONTENT[contentKey];

  // Create the page
  const page = await notion.pages.create({
    parent: {
      type: "data_source_id",
      data_source_id: databaseId,
    },
    properties: {
      [NOTION_PROPERTIES.TITLE]: {
        title: [{ text: { content: content.title } }],
      },
      [NOTION_PROPERTIES.LANGUAGE]: {
        select: { name: MAIN_LANGUAGE },
      },
      [NOTION_PROPERTIES.STATUS]: {
        select: { name: "Not started" },
      },
    },
  });

  // Add content blocks
  const blocks = content.blocks.map((block) => {
    switch (block.type) {
      case "heading_1":
        return {
          type: "heading_1",
          heading_1: {
            rich_text: [{ type: "text", text: { content: block.content } }],
          },
        };
      case "heading_2":
        return {
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: block.content } }],
          },
        };
      case "paragraph":
        return {
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: block.content } }],
          },
        };
      case "bulleted_list_item":
        return {
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: block.content } }],
          },
        };
      case "numbered_list_item":
        return {
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: [{ type: "text", text: { content: block.content } }],
          },
        };
      case "callout":
        return {
          type: "callout",
          callout: {
            rich_text: [{ type: "text", text: { content: block.content } }],
            icon: { type: "emoji", emoji: block.emoji || "💡" },
          },
        };
      case "divider":
        return {
          type: "divider",
          divider: {},
        };
      default:
        return null;
    }
  });

  // Filter out null blocks and append to page
  const validBlocks = blocks.filter(Boolean);
  if (validBlocks.length > 0) {
    await notion.blocks.children.append({
      block_id: page.id,
      children: validBlocks as any[],
    });
  }

  return page as NotionPage;
}

/**
 * Get the current status of a page
 */
function getPageStatus(page: NotionPage): string | null {
  const statusProp = page.properties[NOTION_PROPERTIES.STATUS];
  if (statusProp && typeof statusProp === "object" && "select" in statusProp) {
    const select = (statusProp as any).select;
    return select?.name || null;
  }
  return null;
}

/**
 * Set up test pages for translation workflow testing
 */
export async function setupTestPages(options?: {
  dryRun?: boolean;
  setReadyForTranslation?: boolean;
}): Promise<SetupResult> {
  const { dryRun = false, setReadyForTranslation = false } = options || {};

  // Initialize Notion client
  const token = process.env.NOTION_API_KEY;
  const databaseId =
    process.env.DATA_SOURCE_ID ||
    process.env.DATABASE_ID ||
    process.env.NOTION_DATABASE_ID;

  if (!token) {
    throw new Error("NOTION_API_KEY is required in environment variables");
  }
  if (!databaseId) {
    throw new Error(
      "DATA_SOURCE_ID or DATABASE_ID is required in environment variables"
    );
  }

  const notion = new Client({ auth: token });
  const spinner = ora("Setting up test pages...").start();

  const results: TestPageResult[] = [];
  const contentKeys = Object.keys(
    TEST_CONTENT
  ) as (keyof typeof TEST_CONTENT)[];

  try {
    // Find existing test pages
    spinner.text = "Searching for existing test pages...";
    const existingPages = await findExistingTestPages(notion, databaseId);
    spinner.succeed(
      chalk.gray(`Found ${existingPages.length} existing test page(s)`)
    );

    // Process each content type
    for (const contentKey of contentKeys) {
      // eslint-disable-next-line security/detect-object-injection -- contentKey is type-safe (keyof typeof TEST_CONTENT)
      const content = TEST_CONTENT[contentKey];
      spinner.start(`Processing "${content.title}"...`);

      // Check if page already exists
      const existingPage = existingPages.find((p) => {
        const titleProp = p.properties[NOTION_PROPERTIES.TITLE];
        if (
          titleProp &&
          typeof titleProp === "object" &&
          "title" in titleProp
        ) {
          const title = (titleProp as any).title;
          return title?.[0]?.plain_text === content.title;
        }
        return false;
      });

      let page: NotionPage;
      let isNew: boolean;

      if (existingPage) {
        page = existingPage;
        isNew = false;
        spinner.text = `Found existing page "${content.title}"`;
      } else if (dryRun) {
        // In dry run, simulate creating the page
        spinner.warn(
          chalk.yellow(
            `[DRY RUN] Would create page "${content.title}" with ${content.blocks.length} blocks`
          )
        );
        continue;
      } else {
        // Create new test page
        page = await createTestPage(notion, databaseId, contentKey);
        isNew = true;
        spinner.succeed(
          chalk.green(
            `Created page "${content.title}" with ${content.blocks.length} blocks`
          )
        );
      }

      // Find translation siblings
      spinner.start(`Finding translation siblings for "${content.title}"...`);
      const siblings = await findTranslationSiblings(
        notion,
        databaseId,
        content.title
      );

      const siblingCount = [siblings.spanish, siblings.portuguese].filter(
        Boolean
      ).length;
      spinner.succeed(
        chalk.gray(`Found ${siblingCount} translation sibling(s)`)
      );

      // Get original status
      const originalStatus = getPageStatus(page);

      // Set to Ready for translation if requested
      if (setReadyForTranslation && !dryRun) {
        spinner.start(`Setting "${content.title}" to Ready for translation...`);
        await notion.pages.update({
          page_id: page.id,
          properties: {
            [NOTION_PROPERTIES.STATUS]: {
              select: { name: NOTION_PROPERTIES.READY_FOR_TRANSLATION },
            },
          },
        });
        spinner.succeed(
          chalk.green(`Set "${content.title}" to Ready for translation`)
        );
      }

      results.push({
        page,
        siblings,
        isNew,
        originalStatus,
      });
    }

    // Generate summary
    const summary = {
      totalPages: results.length,
      newPages: results.filter((r) => r.isNew).length,
      existingPages: results.filter((r) => !r.isNew).length,
      readyForTranslation: setReadyForTranslation
        ? results.length
        : results.filter(
            (r) => r.originalStatus === NOTION_PROPERTIES.READY_FOR_TRANSLATION
          ).length,
      withSiblings: results.filter(
        (r) => r.siblings.spanish || r.siblings.portuguese
      ).length,
    };

    // Print summary
    console.log("\n" + chalk.bold("Test Pages Setup Summary:"));
    console.log(chalk.gray("─".repeat(40)));
    console.log(`Total pages: ${chalk.cyan(summary.totalPages.toString())}`);
    console.log(
      `New pages created: ${chalk.green(summary.newPages.toString())}`
    );
    console.log(
      `Existing pages: ${chalk.yellow(summary.existingPages.toString())}`
    );
    console.log(
      `Ready for translation: ${chalk.blue(summary.readyForTranslation.toString())}`
    );
    console.log(
      `Pages with translation siblings: ${chalk.magenta(summary.withSiblings.toString())}`
    );

    // Print page details
    console.log("\n" + chalk.bold("Page Details:"));
    console.log(chalk.gray("─".repeat(40)));
    for (const result of results) {
      const status = setReadyForTranslation
        ? NOTION_PROPERTIES.READY_FOR_TRANSLATION
        : result.originalStatus || "No status";
      const titleProp = result.page.properties[NOTION_PROPERTIES.TITLE];
      const title =
        titleProp && typeof titleProp === "object" && "title" in titleProp
          ? (titleProp as any).title?.[0]?.plain_text
          : "Unknown";
      console.log(`\n${chalk.cyan(title)}`);
      console.log(`  ID: ${result.page.id}`);
      console.log(`  Status: ${status}`);
      console.log(
        `  New: ${result.isNew ? chalk.green("Yes") : chalk.yellow("No")}`
      );
      console.log(
        `  Siblings: ${result.siblings.spanish ? "🇪🇸" : ""}${result.siblings.portuguese ? " 🇧🇷" : ""}`
      );
    }

    return { pages: results, summary };
  } catch (error) {
    spinner.fail(chalk.red("Failed to set up test pages"));
    throw error;
  }
}

/**
 * Restore test pages to their original status
 */
export async function restoreTestPages(pages: TestPageResult[]): Promise<void> {
  const token = process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error("NOTION_API_KEY is required in environment variables");
  }

  const notion = new Client({ auth: token });
  const spinner = ora("Restoring test pages to original status...").start();

  try {
    for (const result of pages) {
      if (result.originalStatus) {
        await notion.pages.update({
          page_id: result.page.id,
          properties: {
            [NOTION_PROPERTIES.STATUS]: {
              select: { name: result.originalStatus },
            },
          },
        });
      }
    }
    spinner.succeed(chalk.green("Restored test pages to original status"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to restore test pages"));
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const setReady = args.includes("--set-ready");

  if (args.includes("--help")) {
    console.log(`
${chalk.bold("Notion Test Pages Setup")}

Usage: bun scripts/notion-test-pages/index.ts [options]

Options:
  --dry-run     Show what would be created without making changes
  --set-ready   Set test pages to "Ready for translation" status
  --help        Show this help message

Examples:
  # Check what test pages exist (dry run)
  bun scripts/notion-test-pages/index.ts --dry-run

  # Create test pages if needed
  bun scripts/notion-test-pages/index.ts

  # Create test pages and set them ready for translation
  bun scripts/notion-test-pages/index.ts --set-ready
`);
    process.exit(0);
  }

  try {
    const result = await setupTestPages({
      dryRun,
      setReadyForTranslation: setReady,
    });

    if (result.summary.totalPages < 2) {
      console.log(
        chalk.yellow(
          "\n⚠️  Warning: Less than 2 test pages available. Translation tests may be limited."
        )
      );
    }

    process.exit(0);
  } catch (error) {
    console.error(chalk.red("\nError:"), error.message);
    process.exit(1);
  }
}

// Run main function if executed directly
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
