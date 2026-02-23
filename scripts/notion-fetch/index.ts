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
dotenv.config({ override: true });

function resolveDatabaseId(): string | undefined {
  const databaseId = process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;
  if (databaseId) {
    process.env.DATABASE_ID = databaseId;
  }
  return databaseId;
}

// Resolve once on module import to mirror previous behaviour
resolveDatabaseId();
if (process.env.DEBUG) {
  console.log("Environment variables:", process.env);
}

const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  !!process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

const cliArgs = process.argv.slice(2);
const perfLogFlag = cliArgs.includes("--perf-log");
const perfOutputArg = cliArgs.find((arg) => arg.startsWith("--perf-output="));

if (perfLogFlag && !process.env.NOTION_PERF_LOG) {
  process.env.NOTION_PERF_LOG = "1";
}

if (perfOutputArg) {
  const [, value] = perfOutputArg.split("=");
  if (value && !process.env.NOTION_PERF_OUTPUT) {
    process.env.NOTION_PERF_OUTPUT = value;
  }
}

initializeGracefulShutdownHandlers();

async function main(): Promise<number> {
  console.log(
    chalk.bold.cyan("🚀 Starting Notion data fetch and processing\n")
  );

  const resolvedDatabaseId = resolveDatabaseId();

  if (!process.env.NOTION_API_KEY) {
    const msg = "Missing NOTION_API_KEY environment variable.";
    // Keep concise output to avoid leaking sensitive context in logs
    console.error(chalk.bold.red(msg));
    await gracefulShutdown(1);
    return 1;
  }

  if (!resolvedDatabaseId) {
    console.error(
      chalk.bold.red(
        "Error: DATABASE_ID (or NOTION_DATABASE_ID) is not defined in the environment variables."
      )
    );
    await gracefulShutdown(1);
    return 1;
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
      onProgress: (progress) => {
        console.log(
          chalk.gray(
            `Progress: ${progress.current}/${progress.total} sections generated`
          )
        );
      },
    });

    console.log(chalk.bold.green("\n✨ All tasks completed successfully!"));

    if (metrics) {
      const totalSavedKb = Number(metrics.totalSaved) / 1024;
      const sectionCount = Number(metrics.sectionCount);
      const titleSectionCount = Number(metrics.titleSectionCount);
      const emojiCount = Number(metrics.emojiCount);

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
      console.log(
        chalk.bold.blue(
          `Processed ${isFinite(emojiCount) ? emojiCount : 0} custom emojis from Notion pages.`
        )
      );
    } else {
      console.log(
        chalk.gray("Generation step was skipped; no metrics to report.")
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

    console.error(chalk.bold.red("❌ Fatal error in main:"), error);
    await gracefulShutdown(1);
    return 1;
  }
}

export { gracefulShutdown, main };

if (process.env.NODE_ENV !== "test" && isDirectExec) {
  await main().catch(async (error) => {
    console.error(chalk.bold.red("❌ Fatal error in main:"), error);
    await gracefulShutdown(1);
  });
}
