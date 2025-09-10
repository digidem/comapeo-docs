import dotenv from 'dotenv';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchNotionData, sortAndExpandNotionData } from '../fetchNotionData.js';
import { generateBlocks } from './generateBlocks.js';
import { NOTION_PROPERTIES } from '../constants.js';
// import { updateJson } from '../lib/updateJson.js';

// Load environment variables from .env file
dotenv.config();
if (process.env.DEBUG) {
  console.log('Environment variables:', process.env);
}

// Determine if this file is executed directly (CLI) or imported (tests/other modules)
const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

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

  // Always call process.exit; in tests this is mocked to throw, which the test harness asserts against
  process.exit(exitCode);
}

 // Register shutdown handlers on module load
process.on('SIGINT', () => {
  // Avoid interfering with test assertions by not exiting the process in test environment
  if (process.env.NODE_ENV !== 'test') {
    void gracefulShutdown(130, 'SIGINT');
  }
});
process.on('SIGTERM', () => {
  // Avoid interfering with test assertions by not exiting the process in test environment
  if (process.env.NODE_ENV !== 'test') {
    void gracefulShutdown(143, 'SIGTERM');
  }
});
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught exception:'), error);
  // Avoid interfering with test assertions by not exiting the process in test environment
  if (process.env.NODE_ENV !== 'test') {
    void gracefulShutdown(1);
  }
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled rejection at:'), promise, 'reason:', reason);
  // Avoid interfering with test assertions by not exiting the process in test environment
  if (process.env.NODE_ENV !== 'test') {
    void gracefulShutdown(1);
  }
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

    // Use generic typing for Notion page records through the pipeline
    let data: Array<Record<string, unknown>> = (await fetchNotionData(filter)) as Array<Record<string, unknown>>;
    // Sort data by Order property if available to ensure proper sequencing
    data = (await sortAndExpandNotionData(data)) as Array<Record<string, unknown>>;
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
    // Clean exit after successful completion (in tests this throws to allow assertions)
    await gracefulShutdown(0);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Process exit called with code:')) {
      // Propagate exit signal for test harness assertions (do not treat as operational error)
      throw error;
    }
    console.error(chalk.bold.red('❌ Fatal error in main:'), error);
    console.error(chalk.bold.red('\n❌ Error updating files:'), error);
    // Trigger shutdown; in tests, mocked process.exit will throw and be observed by the harness
    await gracefulShutdown(1);
  }

}

export { gracefulShutdown, main };

 // Only run automatically when executed directly (CLI) and not during tests
 if (process.env.NODE_ENV !== 'test' && isDirectExec) {
   await main().catch(async (error) => {
     console.error(chalk.bold.red('❌ Fatal error in main:'), error);
     await gracefulShutdown(1);
   });
 }
