#!/usr/bin/env bun

/**
 * Data Source Discovery Script for Notion SDK v5 Migration
 *
 * This script discovers the data_source_id for the database by:
 * 1. Using the v5 API to retrieve database information
 * 2. Extracting the data sources list
 * 3. Identifying the primary data source
 *
 * Usage: bun scripts/migration/discoverDataSource.ts
 */

import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import chalk from "chalk";

dotenv.config();

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (!resolvedDatabaseId) {
  console.error(
    chalk.red(
      "❌ DATABASE_ID or NOTION_DATABASE_ID not found in environment variables."
    )
  );
  console.log(
    chalk.yellow(
      "Please ensure your .env file contains DATABASE_ID or NOTION_DATABASE_ID"
    )
  );
  process.exit(1);
}

if (!process.env.NOTION_API_KEY) {
  console.error(
    chalk.red("❌ NOTION_API_KEY not found in environment variables.")
  );
  console.log(
    chalk.yellow(
      "Please ensure your .env file contains NOTION_API_KEY"
    )
  );
  process.exit(1);
}

console.log(chalk.blue("🔍 Discovering data sources..."));
console.log(chalk.gray(`Database ID: ${resolvedDatabaseId}`));

// Initialize Notion client with v5 API version
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2025-09-03", // Required for v5
});

async function discoverDataSource() {
  try {
    console.log(chalk.blue("📡 Fetching database information..."));

    // Use v5 API to retrieve database
    const database = await notion.databases.retrieve({
      database_id: resolvedDatabaseId,
    });

    console.log(chalk.green("✅ Database retrieved successfully"));

    // Check if database has data_sources (v5 response structure)
    if (!("data_sources" in database)) {
      console.error(
        chalk.red(
          "❌ Database response does not contain 'data_sources' field"
        )
      );
      console.log(
        chalk.yellow(
          "This may indicate the API version is not set correctly or the response structure has changed."
        )
      );
      console.log(chalk.gray("Response keys:", Object.keys(database)));
      process.exit(1);
    }

    const dataSources = (database as any).data_sources as Array<{
      id: string;
      name: string;
      type: string;
      created_time: string;
      last_edited_time: string;
    }>;

    if (!dataSources || dataSources.length === 0) {
      console.error(
        chalk.red("❌ No data sources found in database response")
      );
      process.exit(1);
    }

    console.log(chalk.green(`\n📊 Found ${dataSources.length} data source(s):\n`));

    dataSources.forEach((ds, index) => {
      console.log(
        chalk.white(`${index + 1}. ${ds.name || "Unnamed Data Source"}`)
      );
      console.log(chalk.gray(`   ID: ${ds.id}`));
      console.log(chalk.gray(`   Type: ${ds.type}`));
      console.log(chalk.gray(`   Created: ${ds.created_time}`));
      console.log("");
    });

    // Use the first data source as the primary
    const primaryDataSource = dataSources[0];

    console.log(chalk.blue("🎯 Using primary data source:"));
    console.log(chalk.green(`   Name: ${primaryDataSource.name || "Unnamed"}`));
    console.log(chalk.green(`   ID: ${primaryDataSource.id}`));

    // Test query to ensure it works
    console.log(chalk.blue("\n🧪 Testing data source query..."));
    try {
      const testQuery = await notion.dataSources.query({
        data_source_id: primaryDataSource.id,
        page_size: 1,
      });
      console.log(
        chalk.green(
          `✅ Data source query successful! (${testQuery.results.length} result(s))`
        )
      );
    } catch (error: any) {
      console.error(chalk.red("❌ Data source query failed:"));
      console.error(chalk.red(`   ${error.message}`));
      if (error.status === 400) {
        console.log(
          chalk.yellow(
            "   This may indicate the data source ID format is incorrect or the API version is not compatible."
          )
        );
      }
      process.exit(1);
    }

    // Generate output
    console.log(chalk.blue("\n" + "=".repeat(60)));
    console.log(chalk.yellow("📋 ADD THIS TO YOUR .env FILE:"));
    console.log("=".repeat(60));
    console.log(chalk.green(`\nDATA_SOURCE_ID="${primaryDataSource.id}"`));
    console.log("\n" + "=".repeat(60));

    console.log(chalk.blue("\n💾 Saving data source ID to discovery-result.json..."));
    const fs = await import("fs");
    const result = {
      database_id: resolvedDatabaseId,
      data_source_id: primaryDataSource.id,
      data_source_name: primaryDataSource.name,
      data_source_type: primaryDataSource.type,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      "scripts/migration/discovery-result.json",
      JSON.stringify(result, null, 2)
    );

    console.log(
      chalk.green(
        `✅ Data source discovery complete! Result saved to scripts/migration/discovery-result.json`
      )
    );
  } catch (error: any) {
    console.error(chalk.red("\n❌ Error discovering data source:"));
    console.error(chalk.red(`   ${error.message}`));

    if (error.status === 401) {
      console.log(
        chalk.yellow(
          "\n   This may indicate the NOTION_API_KEY is invalid or has insufficient permissions."
        )
      );
    } else if (error.status === 404) {
      console.log(
        chalk.yellow(
          "\n   This may indicate the DATABASE_ID is invalid or the database does not exist."
        )
      );
    } else if (error.code === "notionhq_client_request_timeout") {
      console.log(
        chalk.yellow(
          "\n   Request timed out. Try again with a stable internet connection."
        )
      );
    }

    process.exit(1);
  }
}

// Run the discovery
discoverDataSource();
