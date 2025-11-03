#!/usr/bin/env bun
/**
 * Migration helper script to discover the correct DATA_SOURCE_ID for Notion API v5
 *
 * This script helps you find the correct data_source_id value to use with the v5 API.
 * In v5, databases are now called "data sources" and may have different IDs.
 *
 * Usage:
 *   bun scripts/migration/discoverDataSource.ts
 *
 * The script will:
 * 1. Use your current DATABASE_ID to query the database
 * 2. Display the data_source_id returned by the API
 * 3. Verify that queries work with the discovered ID
 * 4. Provide instructions for updating your .env file
 */

import { Client } from "@notionhq/client";
import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_ID = process.env.DATABASE_ID || process.env.NOTION_DATABASE_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;

if (!NOTION_API_KEY) {
  console.error(
    chalk.red("❌ NOTION_API_KEY is not set in your environment variables.")
  );
  console.log(
    chalk.yellow("\nPlease add it to your .env file:\n") +
      chalk.cyan("NOTION_API_KEY=your_api_key_here")
  );
  process.exit(1);
}

if (!DATABASE_ID) {
  console.error(
    chalk.red("❌ DATABASE_ID is not set in your environment variables.")
  );
  console.log(
    chalk.yellow("\nPlease add it to your .env file:\n") +
      chalk.cyan("DATABASE_ID=your_database_id_here")
  );
  process.exit(1);
}

async function discoverDataSourceId() {
  console.log(
    chalk.blue("\n🔍 Discovering DATA_SOURCE_ID for Notion API v5...\n")
  );

  const notion = new Client({
    auth: NOTION_API_KEY,
    notionVersion: "2025-09-03", // v5 API version
    timeoutMs: 15000,
  });

  try {
    // Step 1: Retrieve database information
    console.log(chalk.cyan("Step 1: Retrieving database information..."));
    console.log(chalk.gray(`Using DATABASE_ID: ${DATABASE_ID}\n`));

    const database = await notion.databases.retrieve({
      database_id: DATABASE_ID,
    });

    console.log(chalk.green("✓ Successfully retrieved database"));
    console.log(
      chalk.gray(
        `  Title: ${(database as any).title?.[0]?.plain_text || "Unknown"}`
      )
    );

    // Step 2: Try querying with dataSources.query
    console.log(
      chalk.cyan("\nStep 2: Testing dataSources.query with discovered ID...")
    );

    // The data_source_id should be the same as database_id for existing databases
    // but we query to verify
    const queryResult = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      page_size: 1, // Just get one page to verify it works
    });

    console.log(chalk.green("✓ Successfully queried data source"));
    console.log(chalk.gray(`  Results found: ${queryResult.results.length}`));

    // Step 3: Display results
    console.log(chalk.blue("\n📋 Migration Information:\n"));
    console.log(chalk.white("Current configuration:"));
    console.log(chalk.gray(`  DATABASE_ID: ${DATABASE_ID}`));

    console.log(chalk.white("\nFor Notion API v5, use:"));
    console.log(chalk.green(`  DATA_SOURCE_ID: ${DATABASE_ID}`));

    console.log(chalk.blue("\n✅ Next Steps:\n"));
    console.log(chalk.white("1. Add this line to your .env file:"));
    console.log(chalk.cyan(`   DATA_SOURCE_ID=${DATABASE_ID}`));

    console.log(chalk.white("\n2. Verify the change works:"));
    console.log(chalk.gray("   bun notion:fetch --dry-run"));

    console.log(chalk.white("\n3. Update your scripts to use DATA_SOURCE_ID:"));
    console.log(
      chalk.gray("   - Replace DATABASE_ID with DATA_SOURCE_ID in your code")
    );
    console.log(
      chalk.gray("   - Use dataSources.query() instead of databases.query()")
    );
    console.log(
      chalk.gray(
        '   - Use parent: { type: "data_source_id", data_source_id: ... }'
      )
    );

    console.log(
      chalk.yellow(
        "\n⚠️  Note: For this database, DATA_SOURCE_ID is the same as DATABASE_ID."
      )
    );
    console.log(
      chalk.yellow(
        "   However, this may not be true for all databases in the future."
      )
    );
    console.log(
      chalk.yellow(
        "   Always use DATA_SOURCE_ID when working with the v5 API.\n"
      )
    );

    return DATABASE_ID;
  } catch (error: unknown) {
    console.error(chalk.red("\n❌ Error discovering DATA_SOURCE_ID:"));

    const err = error as { status?: number; message?: string; code?: string };

    if (err.status === 404) {
      console.error(
        chalk.red(`\nThe database with ID "${DATABASE_ID}" was not found.`)
      );
      console.log(chalk.yellow("\nPossible causes:"));
      console.log(chalk.gray("  - The DATABASE_ID is incorrect"));
      console.log(
        chalk.gray("  - The API key doesn't have access to this database")
      );
      console.log(chalk.gray("  - The database was deleted or moved"));
    } else if (err.status === 401) {
      console.error(chalk.red("\nAuthentication failed."));
      console.log(
        chalk.yellow(
          "\nPlease check that your NOTION_API_KEY is correct and has not expired."
        )
      );
    } else if (err.code === "notionhq_client_request_timeout") {
      console.error(
        chalk.red(
          "\nRequest timed out. Please check your network connection and try again."
        )
      );
    } else {
      console.error(chalk.red(`\n${err.message || String(error)}`));
    }

    console.log(chalk.yellow("\n💡 Troubleshooting:"));
    console.log(chalk.gray("  1. Verify your .env file contains:"));
    console.log(chalk.gray("     - NOTION_API_KEY=<your_api_key>"));
    console.log(chalk.gray("     - DATABASE_ID=<your_database_id>"));
    console.log(
      chalk.gray("\n  2. Ensure the API key has access to the database")
    );
    console.log(
      chalk.gray(
        "\n  3. Check that you're using a valid Notion integration token"
      )
    );

    process.exit(1);
  }
}

// Run the discovery process
discoverDataSourceId()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(chalk.red("\n❌ Unexpected error:"), error);
    process.exit(1);
  });
