import { Client } from "@notionhq/client";
import ora from 'ora';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';

interface UpdateDatabaseTitleOptions {
  token: string;
  databaseId: string;
  packageJsonPath?: string;
}

/**
 * Updates the Notion database title with version information from package.json
 * @param options Configuration options for the database title update
 */
export async function updateNotionDatabaseTitle(options: UpdateDatabaseTitleOptions): Promise<void> {
  const { token, databaseId, packageJsonPath = 'package.json' } = options;

  const notion = new Client({ auth: token });
  const spinner = ora('Updating database title with version information').start();

  try {
    // Read package.json to get version
    const packagePath = join(process.cwd(), packageJsonPath);
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    const version = packageJson.version;

    if (!version) {
      throw new Error('No version found in package.json');
    }

    // Get current database information
    const database = await notion.databases.retrieve({ database_id: databaseId });

    if (!('title' in database)) {
      throw new Error('Database title not accessible');
    }

    // Extract current title text
    let currentTitle = '';
    if (database.title && database.title.length > 0) {
      currentTitle = database.title[0].plain_text || '';
    }

    // Check if version pattern exists in title (e.g., v1.2.3, v1.2.3-beta, etc.)
    const versionRegex = /\s-\sv\d+\.\d+\.\d+(?:-[a-zA-Z0-9-]+)?$/;
    const hasVersion = versionRegex.test(currentTitle);

    let newTitle: string;
    if (hasVersion) {
      // Replace existing version
      newTitle = currentTitle.replace(versionRegex, ` - v${version}`);
      spinner.text = `Updating existing version in title`;
    } else {
      // Append new version
      newTitle = `${currentTitle} - v${version}`;
      spinner.text = `Adding version to title`;
    }

    // Update database title
    await notion.databases.update({
      database_id: databaseId,
      title: [
        {
          type: 'text',
          text: {
            content: newTitle
          }
        }
      ]
    });

    spinner.succeed(chalk.green(`Successfully updated database title to: "${newTitle}"`));

  } catch (error) {
    spinner.fail(chalk.red(`Failed to update database title: ${error.message}`));
    throw error;
  }
}

/**
 * Main function that parses command line arguments and runs the title update
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const options: Partial<UpdateDatabaseTitleOptions> = {};

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--token':
        options.token = value;
        break;
      case '--db-id':
        options.databaseId = value;
        break;
      case '--package-json':
        options.packageJsonPath = value;
        break;
      default:
        console.error(chalk.red(`Unknown flag: ${flag}`));
        console.error(chalk.gray('Usage: notion-update [--token TOKEN] [--db-id DATABASE_ID] [--package-json PATH]'));
        process.exit(1);
    }
  }

  // Use environment variables as fallback
  const token = options.token || process.env.NOTION_API_KEY;
  const databaseId = options.databaseId || process.env.DATABASE_ID;

  if (!token) {
    console.error(chalk.red('NOTION_API_KEY is required (use --token or set environment variable)'));
    process.exit(1);
  }

  if (!databaseId) {
    console.error(chalk.red('DATABASE_ID is required (use --db-id or set environment variable)'));
    process.exit(1);
  }

  try {
    await updateNotionDatabaseTitle({
      token,
      databaseId,
      packageJsonPath: options.packageJsonPath
    });
  } catch (error) {
    console.error(chalk.red('Database title update failed:', error.message));
    process.exit(1);
  }
}

// Run main function if this script is executed directly
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}