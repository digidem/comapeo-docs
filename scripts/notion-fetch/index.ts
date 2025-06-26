import dotenv from 'dotenv';
import ora from 'ora';
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

async function main() {
  console.log(chalk.bold.cyan('🚀 Starting Notion data fetch and processing\n'));

  // Check if NOTION_API_KEY is defined
  if (!process.env.NOTION_API_KEY) {
    console.error(chalk.bold.red("Error: NOTION_API_KEY is not defined in the environment variables."));
    process.exit(1);
  }

  // Check if DATABASE_ID is defined
  if (!process.env.DATABASE_ID) {
    console.error(chalk.bold.red("Error: DATABASE_ID is not defined in the environment variables."));
    process.exit(1);
  }

  try {
    const fetchSpinner = ora('Fetching data from Notion').start();
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
    const { totalSaved, sectionCount, titleSectionCount } = await generateBlocks(data, (progress) => {
      generateSpinner.text = chalk.blue(`Generating blocks: ${progress.current}/${progress.total}`);
    });
    generateSpinner.succeed(chalk.green('Blocks generated successfully'));

    // updateJson(data);

    console.log(chalk.bold.green('\n✨ All tasks completed successfully!'));
    console.log(chalk.bold.cyan(`A total of ${(totalSaved / 1024).toFixed(2)} KB was saved on image compression.`));
    console.log(chalk.bold.yellow(`Created ${sectionCount} section folders with _category_.json files.`));
    console.log(chalk.bold.magenta(`Applied ${titleSectionCount} title sections to content items.`));
  } catch (error) {
    console.error(chalk.bold.red("\n❌ Error updating files:"), error);
  }
}

main();
