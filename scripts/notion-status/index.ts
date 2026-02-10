import { Client } from "@notionhq/client";
import ora from "ora";
import chalk from "chalk";
import { NOTION_PROPERTIES } from "../constants";
import {
  RollbackRecorder,
  getRollbackRecorder,
  recordStatusChanges,
} from "./rollbackRecorder";

interface UpdateStatusOptions {
  token: string;
  databaseId: string;
  fromStatus: string;
  toStatus: string;
  setPublishedDate?: boolean;
  languageFilter?: string;
  /** Enable rollback recording (default: true) */
  enableRollback?: boolean;
  /** Operation name for rollback tracking (default: auto-generated) */
  operationName?: string;
}

/**
 * Helper to extract page title from a Notion page response
 */
function getPageTitle(page: any): string | undefined {
  const titleProp = page.properties?.[NOTION_PROPERTIES.TITLE];
  if (titleProp?.title?.length > 0) {
    return titleProp.title[0]?.plain_text || undefined;
  }
  return undefined;
}

/**
 * Updates the status of Notion pages from one status to another
 * Records changes for rollback if enableRollback is true (default)
 * @param options Configuration options for the status update
 */
export async function updateNotionPageStatus(
  options: UpdateStatusOptions
): Promise<{ sessionId?: string; successCount: number; errorCount: number }> {
  const {
    token,
    databaseId,
    fromStatus,
    toStatus,
    setPublishedDate,
    languageFilter,
    enableRollback = true,
    operationName,
  } = options;

  const notion = new Client({ auth: token });
  const languageMsg = languageFilter ? ` (Language: ${languageFilter})` : "";
  const spinner = ora(
    `Updating pages from "${fromStatus}" to "${toStatus}"${languageMsg}`
  ).start();

  // Generate operation name if not provided
  const opName =
    operationName ||
    `${fromStatus.replace(/\s+/g, "-").toLowerCase()}-to-${toStatus.replace(/\s+/g, "-").toLowerCase()}`;

  // Use rollback recording wrapper if enabled
  if (enableRollback) {
    return recordStatusChanges(
      opName,
      fromStatus,
      toStatus,
      async (recorder, sessionId) => {
        return performStatusUpdate(
          notion,
          databaseId,
          fromStatus,
          toStatus,
          setPublishedDate,
          languageFilter,
          recorder,
          spinner
        );
      },
      { languageFilter }
    );
  }

  // Perform update without recording
  return performStatusUpdate(
    notion,
    databaseId,
    fromStatus,
    toStatus,
    setPublishedDate,
    languageFilter,
    null,
    spinner
  );
}

/**
 * Internal function to perform the actual status update
 */
async function performStatusUpdate(
  notion: Client,
  databaseId: string,
  fromStatus: string,
  toStatus: string,
  setPublishedDate: boolean | undefined,
  languageFilter: string | undefined,
  recorder: RollbackRecorder | null,
  spinner: any
): Promise<{ sessionId?: string; successCount: number; errorCount: number }> {
  const sessionId = recorder?.getCurrentSession()?.sessionId;

  try {
    // Build filter for status and optionally language
    const filter: any = {
      property: NOTION_PROPERTIES.STATUS,
      select: {
        equals: fromStatus,
      },
    };

    // Add compound filter if language filter is specified
    const queryFilter: any = languageFilter
      ? {
          and: [
            {
              property: NOTION_PROPERTIES.STATUS,
              select: {
                equals: fromStatus,
              },
            },
            {
              property: NOTION_PROPERTIES.LANGUAGE,
              select: {
                equals: languageFilter,
              },
            },
          ],
        }
      : filter;

    // Query pages with the "from" status (and optionally language)
    const response = await notion.dataSources.query({
      // v5 API: use data_source_id instead of database_id
      data_source_id: databaseId,
      filter: queryFilter,
    });

    const pages = response.results;

    if (pages.length === 0) {
      spinner.succeed(
        chalk.yellow(`No pages found with status "${fromStatus}"`)
      );
      return { sessionId, successCount: 0, errorCount: 0 };
    }

    spinner.text = `Found ${pages.length} pages to update`;

    // Update each page's status
    let successCount = 0;
    let errorCount = 0;

    for (const page of pages) {
      try {
        const pageTitle = getPageTitle(page);
        const properties: Record<string, unknown> = {
          [NOTION_PROPERTIES.STATUS]: {
            select: {
              name: toStatus,
            },
          },
        };

        // Add Published date if requested
        if (setPublishedDate) {
          properties[NOTION_PROPERTIES.PUBLISHED_DATE] = {
            date: {
              start: new Date().toISOString().split("T")[0], // YYYY-MM-DD format
            },
          };
        }

        await notion.pages.update({
          page_id: page.id,
          properties: properties as any,
        });

        // Record the change for rollback
        if (recorder) {
          await recorder.recordChange(page.id, fromStatus, true, {
            pageTitle,
            languageFilter,
          });
        }

        successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(`Failed to update page ${page.id}: ${errorMessage}`)
        );

        // Record failed change
        if (recorder) {
          await recorder.recordChange(page.id, fromStatus, false, {
            languageFilter,
          });
        }

        errorCount++;
      }
    }

    if (errorCount === 0) {
      spinner.succeed(
        chalk.green(
          `Successfully updated ${successCount} pages from "${fromStatus}" to "${toStatus}"`
        )
      );
    } else {
      spinner.warn(
        chalk.yellow(`Updated ${successCount} pages, ${errorCount} failed`)
      );
    }

    return { sessionId, successCount, errorCount };
  } catch (error) {
    spinner.fail(
      chalk.red(`Failed to update page statuses: ${(error as Error).message}`)
    );
    throw error;
  }
}

/**
 * Predefined workflow configurations
 */
const WORKFLOWS = {
  "ready-for-translation": {
    from: "No Status",
    to: "Ready for translation",
    languageFilter: "English",
    setPublishedDate: false,
  },
  translation: {
    from: "Ready for translation",
    to: "Auto translation generated",
    setPublishedDate: false,
  },
  draft: {
    from: "Ready to publish",
    to: "Draft published",
    setPublishedDate: false,
  },
  publish: {
    from: "Draft published",
    to: "Published",
    setPublishedDate: true, // Set the published date when publishing
  },
  "publish-production": {
    from: "Staging",
    to: "Published",
    setPublishedDate: true, // Set the published date when publishing
  },
} as const;

/**
 * Main function that parses command line arguments and runs the status update
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const options: Partial<UpdateStatusOptions> = {};
  let workflow: string | undefined;

  for (let i = 0; i < args.length; i += 2) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: validated in switch statement below
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case "--token":
        options.token = value;
        break;
      case "--db-id":
        options.databaseId = value;
        break;
      case "--from":
        options.fromStatus = value;
        break;
      case "--to":
        options.toStatus = value;
        break;
      case "--workflow":
        workflow = value;
        break;
      default:
        console.error(chalk.red(`Unknown flag: ${flag}`));
        console.error(
          chalk.gray(
            "Usage: updateStatus.ts [--workflow translation|draft|publish|publish-production] [--token TOKEN] [--db-id DATABASE_ID] [--from STATUS] [--to STATUS]"
          )
        );
        process.exit(1);
    }
  }

  // Use environment variables as fallback
  const token = options.token || process.env.NOTION_API_KEY;

  // v5 API: Prefer DATA_SOURCE_ID, fall back to DATABASE_ID for backward compatibility
  // Note: In v5, DATABASE_ID and DATA_SOURCE_ID may be different values!
  const dataSourceId =
    options.databaseId ||
    process.env.DATA_SOURCE_ID ||
    process.env.DATABASE_ID ||
    process.env.NOTION_DATABASE_ID;

  if (dataSourceId) {
    process.env.DATABASE_ID = dataSourceId;
  }

  // Determine status values based on workflow or explicit flags
  let fromStatus: string;
  let toStatus: string;

  let setPublishedDate = false;

  if (workflow && workflow in WORKFLOWS) {
    const workflowConfig = WORKFLOWS[workflow as keyof typeof WORKFLOWS];
    fromStatus = options.fromStatus || workflowConfig.from;
    toStatus = options.toStatus || workflowConfig.to;
    setPublishedDate = workflowConfig.setPublishedDate;
  } else if (options.fromStatus && options.toStatus) {
    fromStatus = options.fromStatus;
    toStatus = options.toStatus;
  } else {
    console.error(
      chalk.red(
        "Either --workflow must be specified (ready-for-translation|translation|draft|publish|publish-production) or both --from and --to must be provided"
      )
    );
    console.error(chalk.gray("Examples:"));
    console.error(
      chalk.gray("  updateStatus.ts --workflow ready-for-translation")
    );
    console.error(chalk.gray("  updateStatus.ts --workflow translation"));
    console.error(chalk.gray("  updateStatus.ts --workflow draft"));
    console.error(chalk.gray("  updateStatus.ts --workflow publish"));
    console.error(
      chalk.gray("  updateStatus.ts --workflow publish-production")
    );
    console.error(
      chalk.gray(
        '  updateStatus.ts --from "Custom Status" --to "Another Status"'
      )
    );
    process.exit(1);
  }

  if (!token) {
    console.error(
      chalk.red(
        "NOTION_API_KEY is required (use --token or set environment variable)"
      )
    );
    process.exit(1);
  }

  if (!dataSourceId) {
    console.error(
      chalk.red(
        "DATA_SOURCE_ID or DATABASE_ID is required (use --db-id or set environment variable)\n" +
          "For Notion API v5, please set DATA_SOURCE_ID in your .env file.\n" +
          "Run: bun scripts/migration/discoverDataSource.ts"
      )
    );
    process.exit(1);
  }

  // Get language filter from workflow config if applicable
  let languageFilter: string | undefined;
  if (workflow && workflow in WORKFLOWS) {
    const workflowConfig = WORKFLOWS[workflow as keyof typeof WORKFLOWS];
    languageFilter =
      "languageFilter" in workflowConfig
        ? workflowConfig.languageFilter
        : undefined;
  }

  try {
    const result = await updateNotionPageStatus({
      token,
      databaseId: dataSourceId,
      fromStatus,
      toStatus,
      setPublishedDate,
      languageFilter,
      enableRollback: true,
      operationName: workflow,
    });

    // Show session info if rollback was enabled
    if (result.sessionId) {
      console.log(chalk.gray(`Rollback session: ${result.sessionId}`));
      console.log(
        chalk.gray(`Use rollback commands to revert these changes if needed.`)
      );
    }
  } catch (error) {
    console.error(chalk.red("Status update failed:", (error as Error).message));
    process.exit(1);
  }
}

// Run main function if this script is executed directly
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
