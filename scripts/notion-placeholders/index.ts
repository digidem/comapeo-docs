import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchNotionData } from "../fetchNotionData";
import { NOTION_PROPERTIES } from "../constants";
import { PageAnalyzer } from "./pageAnalyzer";
import { ContentGenerator, ContentGenerationOptions } from "./contentGenerator";
import { NotionUpdater, UpdateOptions } from "./notionUpdater";
import { RateLimiter } from "./utils/rateLimiter";
import { BackupManager } from "./utils/backupManager";
import { ConfigError, logError, logWarning } from "../shared/errors";

// Load environment variables
dotenv.config();

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (resolvedDatabaseId) {
  process.env.DATABASE_ID = resolvedDatabaseId;
}

// Command line argument parsing
interface CliOptions {
  dryRun: boolean;
  verbose: boolean;
  contentLength: "short" | "medium" | "long";
  skipRecentlyModified: boolean;
  recentThresholdHours: number;
  force: boolean;
  backup: boolean;
  includeRemoved: boolean;
  filterStatus?: string;
  maxPages?: number;
}

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    verbose: false,
    contentLength: "medium",
    skipRecentlyModified: true,
    recentThresholdHours: 24,
    force: false,
    backup: true,
    includeRemoved: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
      case "-d":
        options.dryRun = true;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--content-length":
        const length = args[++i];
        if (["short", "medium", "long"].includes(length)) {
          options.contentLength = length as "short" | "medium" | "long";
        }
        break;
      case "--no-skip-recent":
        options.skipRecentlyModified = false;
        break;
      case "--recent-hours":
        options.recentThresholdHours = parseInt(args[++i]) || 24;
        break;
      case "--force":
        options.force = true;
        break;
      case "--no-backup":
        options.backup = false;
        break;
      case "--include-removed":
        options.includeRemoved = true;
        break;
      case "--filter-status":
        options.filterStatus = args[++i];
        break;
      case "--max-pages":
        const maxPagesValue = parseInt(args[++i]);
        if (!isNaN(maxPagesValue)) {
          options.maxPages = maxPagesValue;
        }
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
};

const printHelp = () => {
  console.log(chalk.bold("CoMapeo Notion Placeholder Generator\n"));
  console.log(
    "Generates meaningful placeholder content for empty Notion pages.\n"
  );
  console.log(chalk.bold("Usage:"));
  console.log("  npm run notion:gen-placeholders [options]\n");
  console.log(chalk.bold("Options:"));
  console.log(
    "  --dry-run, -d              Preview changes without modifying Notion"
  );
  console.log("  --verbose, -v              Show detailed output");
  console.log(
    "  --content-length <length>  Content length: short, medium, long (default: medium)"
  );
  console.log("  --no-skip-recent           Process recently modified pages");
  console.log(
    '  --recent-hours <hours>     Hours to consider "recent" (default: 24)'
  );
  console.log(
    "  --force                    Force update even if page has content"
  );
  console.log("  --no-backup                Skip creating backups");
  console.log(
    '  --include-removed          Include pages with "Remove" status'
  );
  console.log(
    "  --filter-status <status>   Only process pages with specific status"
  );
  console.log("  --max-pages <number>       Limit number of pages to process");
  console.log("  --help, -h                 Show this help message\n");
  console.log(chalk.bold("Examples:"));
  console.log("  npm run notion:gen-placeholders --dry-run");
  console.log(
    "  npm run notion:gen-placeholders --content-length long --verbose"
  );
  console.log(
    '  npm run notion:gen-placeholders --filter-status "Draft" --max-pages 10'
  );
};

// Main execution function
async function main() {
  const options = parseArgs();

  console.log(chalk.bold.cyan("🎯 CoMapeo Notion Placeholder Generator\n"));

  // Validate environment
  if (!process.env.NOTION_API_KEY) {
    logError(
      new ConfigError("NOTION_API_KEY not found in environment variables", [
        "Add NOTION_API_KEY to your .env file",
        "Refer to project documentation for setup",
      ]),
      "main"
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_ID) {
    logError(
      new ConfigError("DATABASE_ID not found in environment variables", [
        "Add DATABASE_ID to your .env file",
        "Refer to project documentation for setup",
      ]),
      "main"
    );
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(
      chalk.yellow("🔍 DRY RUN MODE - No changes will be made to Notion\n")
    );
  }

  const spinner = ora("Fetching pages from Notion...").start();
  const rateLimiter = new RateLimiter(3, 1); // 3 requests per second

  try {
    // Fetch all pages (exclude "Remove" status by default unless includeRemoved is true)
    let filter;
    try {
      if (options.filterStatus) {
        filter = {
          property: NOTION_PROPERTIES.STATUS,
          select: { equals: options.filterStatus },
        };
      } else if (!options.includeRemoved) {
        // Default: exclude pages with "Remove" status (but include null/empty status)
        filter = {
          or: [
            {
              property: NOTION_PROPERTIES.STATUS,
              select: { is_empty: true },
            },
            {
              property: NOTION_PROPERTIES.STATUS,
              select: { does_not_equal: "Remove" },
            },
          ],
        };
      } else {
        // Include all pages when includeRemoved is true
        filter = undefined;
      }
    } catch (error) {
      logWarning(
        "Could not create status filter, fetching all pages instead. " +
          "Check NOTION_PROPERTIES.STATUS constant.",
        "main"
      );
      filter = undefined;
    }

    let pages;
    try {
      pages = await fetchNotionData(filter);
      spinner.succeed(
        chalk.green(`✅ Fetched ${pages.length} pages from Notion`)
      );
    } catch (error) {
      // If filtering fails, try without any filter
      if (filter) {
        logWarning(
          "Status filter failed, trying without filter. Check filter syntax.",
          "main"
        );
        try {
          pages = await fetchNotionData(undefined);
          spinner.succeed(
            chalk.green(
              `✅ Fetched ${pages.length} pages from Notion (no filter applied)`
            )
          );
        } catch (fallbackError) {
          spinner.fail(chalk.red("❌ Failed to fetch pages from Notion"));
          logError(
            fallbackError,
            "Failed to fetch pages even without filter. Check API access."
          );
          throw fallbackError;
        }
      } else {
        spinner.fail(chalk.red("❌ Failed to fetch pages from Notion"));
        logError(
          error,
          "Failed to fetch pages. Check API access and credentials."
        );
        throw error;
      }
    }

    if (pages.length === 0) {
      console.log(chalk.yellow("No pages found to process."));
      return;
    }

    // Filter pages for English sub-pages under "Content elements" (issue #15 requirement)
    const filteredPages = pages.filter((page) => {
      const elementType =
        page.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE]?.select?.name ||
        page.properties?.["Section"]?.select?.name;
      const status =
        page.properties?.[NOTION_PROPERTIES.STATUS]?.select?.name ||
        page.properties?.["Status"]?.select?.name;
      const language =
        page.properties?.[NOTION_PROPERTIES.LANGUAGE]?.select?.name ||
        page.properties?.["Language"]?.select?.name;

      // Skip sections entirely (they shouldn't have placeholder content)
      if (elementType === "Section") {
        return false;
      }

      // Only process English pages (issue #15 requirement)
      if (language !== "English") {
        return false;
      }

      // Skip pages with "Remove" status unless explicitly included
      if (status === "Remove" && !options.includeRemoved) {
        return false;
      }

      return true;
    });

    // Limit pages if requested
    const pagesToProcess = options.maxPages
      ? filteredPages.slice(0, options.maxPages)
      : filteredPages;

    console.log(
      chalk.blue(
        `📊 Analyzing ${pagesToProcess.length} pages for content gaps (filtered from ${pages.length} total)...\n`
      )
    );

    // Analyze pages
    const analysisSpinner = ora("Analyzing page content...").start();
    const pageAnalyses = await PageAnalyzer.analyzePages(
      pagesToProcess.map((page) => ({
        id: page.id,
        title:
          page.properties?.[NOTION_PROPERTIES.TITLE]?.title?.[0]?.plain_text ||
          page.properties?.["Title"]?.title?.[0]?.plain_text ||
          page.properties?.["Name"]?.title?.[0]?.plain_text ||
          "Untitled",
      })),
      {
        skipRecentlyModified: options.skipRecentlyModified,
        recentThresholdHours: options.recentThresholdHours,
        minContentScore: options.force ? 0 : 10,
      }
    );

    const summary = PageAnalyzer.generateAnalysisSummary(pageAnalyses);
    analysisSpinner.succeed(chalk.green("✅ Analysis complete"));

    // Display summary
    console.log(chalk.bold("\n📋 Analysis Summary:"));
    console.log(`  Total pages analyzed: ${summary.totalPages}`);
    console.log(`  Empty pages: ${summary.emptyPages}`);
    console.log(`  Pages needing content: ${summary.pagesNeedingFill}`);
    console.log(
      `  Pages needing enhancement: ${summary.pagesNeedingEnhancement}`
    );
    console.log(
      `  Average content score: ${summary.averageContentScore.toFixed(1)}/100`
    );
    console.log(
      `  Recently modified (skipped): ${summary.recentlyModifiedSkipped}`
    );

    // Generate content for pages that need it
    const pagesToUpdate = Array.from(pageAnalyses.entries())
      .filter(
        ([, analysis]) =>
          analysis.recommendedAction === "fill" ||
          (options.force && analysis.recommendedAction === "enhance")
      )
      .map(([pageId, analysis]) => {
        const page = pagesToProcess.find((p) => p.id === pageId);
        const title =
          page?.properties?.[NOTION_PROPERTIES.TITLE]?.title?.[0]?.plain_text ||
          page?.properties?.["Title"]?.title?.[0]?.plain_text ||
          page?.properties?.["Name"]?.title?.[0]?.plain_text ||
          "Untitled";

        return {
          pageId,
          title,
          analysis,
          page,
        };
      });

    if (pagesToUpdate.length === 0) {
      console.log(chalk.green("\n🎉 No pages need placeholder content!"));
      return;
    }

    console.log(
      chalk.yellow(
        `\n🚀 Generating content for ${pagesToUpdate.length} pages...\n`
      )
    );

    // Generate and apply content
    const updates = [];
    for (let i = 0; i < pagesToUpdate.length; i++) {
      const { pageId, title, analysis } = pagesToUpdate[i];

      console.log(
        chalk.cyan(
          `📝 [${i + 1}/${pagesToUpdate.length}] Generating content for: "${title}"`
        )
      );
      console.log(
        chalk.gray(
          `   Type: ${analysis.recommendedContentType} | Score: ${analysis.contentScore}/100`
        )
      );

      const contentOptions: ContentGenerationOptions = {
        type: analysis.recommendedContentType,
        length: options.contentLength,
        title,
      };

      const blocks = ContentGenerator.generateCompletePage(contentOptions);
      updates.push({ pageId, blocks, title }); // Include title for better error reporting

      if (options.verbose) {
        console.log(chalk.blue(`   ✅ Generated ${blocks.length} blocks`));
      }
    }

    // Apply updates
    const updateOptions: UpdateOptions = {
      dryRun: options.dryRun,
      preserveExisting: !options.force,
      backupOriginal: options.backup,
      maxRetries: 3,
    };

    const updateSpinner = ora("Updating pages...").start();
    const results = await NotionUpdater.updatePages(updates, updateOptions);
    const updateSummary = NotionUpdater.generateUpdateSummary(results);
    updateSpinner.succeed(chalk.green("✅ Update process complete"));

    // Display results
    console.log(chalk.bold("\n📊 Update Results:"));
    console.log(`  Pages processed: ${updateSummary.totalPages}`);
    console.log(`  Successful updates: ${updateSummary.successfulUpdates}`);
    console.log(`  Failed updates: ${updateSummary.failedUpdates}`);
    console.log(`  Total blocks added: ${updateSummary.totalBlocksAdded}`);

    if (updateSummary.errors.length > 0) {
      console.log(chalk.red("\n❌ Errors:"));
      updateSummary.errors.forEach((error) =>
        console.log(chalk.red(`  ${error}`))
      );
    }

    // Cleanup old backups
    if (options.backup && !options.dryRun) {
      try {
        const deletedBackups = BackupManager.cleanupOldBackups(24 * 7); // 1 week
        if (deletedBackups > 0) {
          console.log(
            chalk.gray(`\n🧹 Cleaned up ${deletedBackups} old backups`)
          );
        }
      } catch (backupError) {
        logWarning(
          "Could not clean up old backups. Check backup directory permissions.",
          "main"
        );
      }
    }

    // Show backup stats
    if (options.verbose) {
      try {
        const backupStats = BackupManager.getBackupStats();
        console.log(chalk.gray("\n💾 Backup Statistics:"));
        console.log(chalk.gray(`  Total backups: ${backupStats.totalBackups}`));
        console.log(chalk.gray(`  Unique pages: ${backupStats.uniquePages}`));
        console.log(
          chalk.gray(
            `  Storage used: ${(backupStats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`
          )
        );
      } catch (statsError) {
        logWarning("Could not get backup stats. This is non-critical.", "main");
      }
    }

    console.log(chalk.bold.green("\n✨ Placeholder generation complete!"));

    if (updateSummary.successfulUpdates > 0) {
      console.log(
        chalk.green(
          `\n🎉 Successfully added placeholder content to ${updateSummary.successfulUpdates} pages`
        )
      );
      console.log(
        chalk.gray(
          `   Total content blocks generated: ${updateSummary.totalBlocksAdded}`
        )
      );
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow("\n💡 Run without --dry-run to apply changes to Notion")
      );
    }
  } catch (error) {
    // Only exit on critical errors, not update failures
    if (spinner) {
      spinner.fail(chalk.red("❌ Failed to generate placeholders"));
    }
    logError(
      error,
      "Critical error during placeholder generation. Check logs above for details."
    );

    // Don't exit in test environment
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n🛑 Interrupted by user"));
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error(chalk.red("❌ Uncaught exception:"), error);
  process.exit(1);
});

// Export for testing
export { main, parseArgs };

// Run if executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExec && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(chalk.red("❌ Fatal error:"), error);
    process.exit(1);
  });
}
