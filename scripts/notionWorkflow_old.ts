import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import { fetchNotionData } from './fetchNotionData.js';
import { generateBlocks } from './generateBlocks.js';

import { main as translateNotionPages } from './translateNotionPages.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Main function to run the Notion workflow
 */
async function main() {
  console.log(chalk.bold.cyan('🚀 Starting Notion workflow: Fetch, Generate, and Translate\n'));

  // Check if required environment variables are defined
  if (!process.env.NOTION_API_KEY) {
    console.error(chalk.bold.red("Error: NOTION_API_KEY is not defined in the environment variables."));
    process.exit(1);
  }

  if (!process.env.DATABASE_ID) {
    console.error(chalk.bold.red("Error: DATABASE_ID is not defined in the environment variables."));
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.bold.red("Error: OPENAI_API_KEY is not defined in the environment variables."));
    process.exit(1);
  }

  try {
    // Step 1: Fetch data from Notion
    const fetchSpinner = ora('Fetching data from Notion').start();
    const data = await fetchNotionData();

    fetchSpinner.succeed(chalk.green(`Fetched ${data.length} pages from Notion`));

    // Step 2: Generate blocks (English content)
    const generateSpinner = ora('Generating blocks for English content').start();
    const { totalSaved, sectionCount, titleSectionCount } = await generateBlocks(data, (progress) => {
      generateSpinner.text = chalk.blue(`Generating blocks: ${progress.current}/${progress.total} - ${progress.title}`);
    });
    generateSpinner.succeed(chalk.green('English content generated successfully'));

    console.log(chalk.bold.cyan(`A total of ${(totalSaved / 1024).toFixed(2)} KB was saved on image compression.`));
    console.log(chalk.bold.yellow(`Created ${sectionCount} section folders with _category_.json files.`));
    console.log(chalk.bold.magenta(`Applied ${titleSectionCount} title sections to content items.`));

    // Step 3: Translate content using the translateNotionPages function
    console.log(chalk.bold.cyan('\n🌐 Starting translation process'));
    await translateNotionPages();

    console.log(chalk.bold.green('\n✨ Notion workflow completed successfully!'));
  } catch (error) {
    console.error(chalk.bold.red("\n❌ Error in Notion workflow:"), error);
    process.exit(1);
  }
}

// Run the main function
main();
