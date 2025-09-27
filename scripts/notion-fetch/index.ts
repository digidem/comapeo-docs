import dotenv from "dotenv";
import chalk from "chalk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NOTION_PROPERTIES } from "../constants";
import { runFetchPipeline } from "./runFetch";
import {
  gracefulShutdown,
  initializeGracefulShutdownHandlers,
} from "./runtime";

// Load environment variables from .env file
dotenv.config();

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (resolvedDatabaseId) {
  process.env.DATABASE_ID = resolvedDatabaseId;
}
if (process.env.DEBUG) {
  console.log("Environment variables:", process.env);
}

const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  !!process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

initializeGracefulShutdownHandlers();

async function main(): Promise<number> {
  console.log(
    chalk.bold.cyan("🚀 Starting Notion data fetch and processing\n")
  );

  if (!process.env.NOTION_API_KEY) {
    console.error(
      chalk.bold.red(
        "Error: NOTION_API_KEY is not defined in the environment variables."
      )
    );
    return await gracefulShutdown(1);
  }

  if (!process.env.DATABASE_ID) {
    console.error(
      chalk.bold.red(
        "Error: DATABASE_ID is not defined in the environment variables."
      )
    );
    return await gracefulShutdown(1);
  }

  try {
    const filter = {
      and: [
        {
          property: NOTION_PROPERTIES.STATUS,
          select: {
            equals: NOTION_PROPERTIES.READY_TO_PUBLISH,
          },
        },
        {
          property: "Parent item",
          relation: { is_empty: true },
        },
      ],
    };

    const { metrics } = await runFetchPipeline({
      filter,
      fetchSpinnerText: "Fetching data from Notion",
      generateSpinnerText: "Generating blocks",
    });

    console.log(chalk.bold.green("\n✨ All tasks completed successfully!"));

    if (metrics) {
      const totalSavedKb = Number(metrics.totalSaved) / 1024;
      const sectionCount = Number(metrics.sectionCount);
      const titleSectionCount = Number(metrics.titleSectionCount);

      console.log(
        chalk.bold.cyan(
          `A total of ${isFinite(totalSavedKb) ? totalSavedKb.toFixed(2) : "0.00"} KB was saved on image compression.`
        )
      );
      console.log(
        chalk.bold.yellow(
          `Created ${isFinite(sectionCount) ? sectionCount : 0} section folders with _category_.json files.`
        )
      );
      console.log(
        chalk.bold.magenta(
          `Applied ${isFinite(titleSectionCount) ? titleSectionCount : 0} title sections to content items.`
        )
      );
    } else {
      console.log(
        chalk.gray("Generation step was skipped; no metrics to report.")
      );
    }

    return await gracefulShutdown(0);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Process exit called with code:")
    ) {
      throw error;
    }

    console.error(chalk.bold.red("❌ Fatal error in main:"), error);
    console.error(chalk.bold.red("\n❌ Error updating files:"), error);
    return await gracefulShutdown(1);
  }
}

export { gracefulShutdown, main };

if (process.env.NODE_ENV !== "test" && isDirectExec) {
  await main().catch(async (error) => {
    console.error(chalk.bold.red("❌ Fatal error in main:"), error);
    await gracefulShutdown(1);
  });
}
