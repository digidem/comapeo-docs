import { Client } from "@notionhq/client";
import ora from "ora";
import chalk from "chalk";
import { NOTION_PROPERTIES } from "../constants";

interface UpdateStatusOptions {
  token: string;
  databaseId: string;
  fromStatus: string;
  toStatus: string;
  setPublishedCheckbox?: boolean;
}

/**
 * Updates the status of Notion pages from one status to another
 * @param options Configuration options for the status update
 */
export async function updateNotionPageStatus(
  options: UpdateStatusOptions
): Promise<void> {
  const { token, databaseId, fromStatus, toStatus, setPublishedCheckbox } =
    options;

  const notion = new Client({ auth: token });
  const spinner = ora(
    `Updating pages from "${fromStatus}" to "${toStatus}"`
  ).start();

  try {
    // Query pages with the "from" status
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: NOTION_PROPERTIES.STATUS,
        select: {
          equals: fromStatus,
        },
      },
    });

    const pages = response.results;

    if (pages.length === 0) {
      spinner.succeed(
        chalk.yellow(`No pages found with status "${fromStatus}"`)
      );
      return;
    }

    spinner.text = `Found ${pages.length} pages to update`;

    // Update each page's status
    let successCount = 0;
    let errorCount = 0;

    for (const page of pages) {
      try {
        const properties = {
          [NOTION_PROPERTIES.STATUS]: {
            select: {
              name: toStatus,
            },
          },
        } as any;

        // Add Published checkbox if requested
        if (setPublishedCheckbox) {
          properties["Published"] = {
            checkbox: true,
          };
        }

        await notion.pages.update({
          page_id: page.id,
          properties,
        });
        successCount++;
      } catch (error) {
        console.error(
          chalk.red(`Failed to update page ${page.id}: ${error.message}`)
        );
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
  } catch (error) {
    spinner.fail(chalk.red(`Failed to update page statuses: ${error.message}`));
    throw error;
  }
}

/**
 * Predefined workflow configurations
 */
const WORKFLOWS = {
  translation: {
    from: "Ready for translation",
    to: "Reviewing translations",
    setPublishedCheckbox: false,
  },
  draft: {
    from: "Ready to publish",
    to: "Draft published",
    setPublishedCheckbox: false,
  },
  publish: {
    from: "Draft published",
    to: "Published",
    setPublishedCheckbox: true,
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
            "Usage: updateStatus.ts [--workflow translation|publish|final-publish] [--token TOKEN] [--db-id DATABASE_ID] [--from STATUS] [--to STATUS]"
          )
        );
        process.exit(1);
    }
  }

  // Use environment variables as fallback
  const token = options.token || process.env.NOTION_API_KEY;
  const databaseId =
    options.databaseId ||
    process.env.DATABASE_ID ||
    process.env.NOTION_DATABASE_ID;

  if (databaseId) {
    process.env.DATABASE_ID = databaseId;
  }

  // Determine status values based on workflow or explicit flags
  let fromStatus: string;
  let toStatus: string;

  let setPublishedCheckbox = false;

  if (workflow && workflow in WORKFLOWS) {
    const workflowConfig = WORKFLOWS[workflow as keyof typeof WORKFLOWS];
    fromStatus = options.fromStatus || workflowConfig.from;
    toStatus = options.toStatus || workflowConfig.to;
    setPublishedCheckbox = workflowConfig.setPublishedCheckbox;
  } else if (options.fromStatus && options.toStatus) {
    fromStatus = options.fromStatus;
    toStatus = options.toStatus;
  } else {
    console.error(
      chalk.red(
        "Either --workflow must be specified (translation|publish|final-publish) or both --from and --to must be provided"
      )
    );
    console.error(chalk.gray("Examples:"));
    console.error(chalk.gray("  updateStatus.ts --workflow translation"));
    console.error(chalk.gray("  updateStatus.ts --workflow publish"));
    console.error(chalk.gray("  updateStatus.ts --workflow final-publish"));
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

  if (!databaseId) {
    console.error(
      chalk.red(
        "DATABASE_ID is required (use --db-id or set environment variable)"
      )
    );
    process.exit(1);
  }

  try {
    await updateNotionPageStatus({
      token,
      databaseId,
      fromStatus,
      toStatus,
      setPublishedCheckbox,
    });
  } catch (error) {
    console.error(chalk.red("Status update failed:", error.message));
    process.exit(1);
  }
}

// Run main function if this script is executed directly
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
