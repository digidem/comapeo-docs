import dotenv from 'dotenv';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { fetchNotionData, sortAndExpandNotionData } from '../fetchNotionData.js';
import { generateBlocks } from './generateBlocks.js';
import { NOTION_PROPERTIES } from '../constants.js';
// import { updateJson } from '../lib/updateJson.js';

// Load environment variables from .env file
dotenv.config();
if (process.env.DEBUG) {
  console.log('Environment variables:', process.env);
}

// Global state for graceful shutdown
let isShuttingDown = false;
let activeSpinners: Ora[] = [];

// Resource cleanup function
async function cleanupResources() {
  console.log(chalk.yellow('\n🧹 Cleaning up resources...'));

  // Stop all active spinners
  activeSpinners.forEach(spinner => {
    if (spinner.isSpinning) {
      spinner.stop();
    }
  });
  activeSpinners = [];

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Allow event loop to clear
  await new Promise(resolve => setImmediate(resolve));
}

// Graceful shutdown handler
async function gracefulShutdown(exitCode: number = 0, signal?: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(chalk.yellow(`\n${signal ? `Received ${signal}, ` : ''}Shutting down gracefully...`));

  try {
    await cleanupResources();
    console.log(chalk.green('✅ Cleanup completed'));
  } catch (error) {
    console.error(chalk.red('❌ Error during cleanup:'), error);
  }

  process.exit(exitCode);
}

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown(130, 'SIGINT'));
process.on('SIGTERM', () => gracefulShutdown(143, 'SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught exception:'), error);
  gracefulShutdown(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled rejection at:'), promise, 'reason:', reason);
  gracefulShutdown(1);
});

async function main() {
  console.log(chalk.bold.cyan('🚀 Starting Notion data fetch and processing\n'));

  // Check if NOTION_API_KEY is defined
  if (!process.env.NOTION_API_KEY) {
    console.error(chalk.bold.red("Error: NOTION_API_KEY is not defined in the environment variables."));
    await gracefulShutdown(1);
  }

  // Check if DATABASE_ID is defined
  if (!process.env.DATABASE_ID) {
    console.error(chalk.bold.red("Error: DATABASE_ID is not defined in the environment variables."));
    await gracefulShutdown(1);
  }

  try {
    const fetchSpinner = ora('Fetching data from Notion').start();
    activeSpinners.push(fetchSpinner);

    const filter = {
        and: [
          {
            property: NOTION_PROPERTIES.STATUS,
            select: {
              equals: NOTION_PROPERTIES.READY_TO_PUBLISH
            }
          },
          {
            "property": "Parent item",
            "relation": { is_empty: true }
          }
        ]
      }

    let data = await fetchNotionData(filter);
    // Sort data by Order property if available to ensure proper sequencing
    data = await sortAndExpandNotionData(data);
    fetchSpinner.succeed(chalk.green('Data fetched successfully'));

    const generateSpinner = ora('Generating blocks').start();
    activeSpinners.push(generateSpinner);

    const { totalSaved, sectionCount, titleSectionCount } = await generateBlocks(data, (progress) => {
      generateSpinner.text = chalk.blue(`Generating blocks: ${progress.current}/${progress.total}`);
    });
    generateSpinner.succeed(chalk.green('Blocks generated successfully'));

    // updateJson(data);

    console.log(chalk.bold.green('\n✨ All tasks completed successfully!'));
    console.log(chalk.bold.cyan(`A total of ${(totalSaved / 1024).toFixed(2)} KB was saved on image compression.`));
    console.log(chalk.bold.yellow(`Created ${sectionCount} section folders with _category_.json files.`));
    console.log(chalk.bold.magenta(`Applied ${titleSectionCount} title sections to content items.`));

    // Clean exit after successful completion
    await gracefulShutdown(0);

  } catch (error) {
    console.error(chalk.bold.red("\n❌ Error updating files:"), error);
    await gracefulShutdown(1);
  }
}

main().catch(async (error) => {
  console.error(chalk.bold.red('❌ Fatal error in main:'), error);
  await gracefulShutdown(1);
});
