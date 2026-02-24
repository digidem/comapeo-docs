import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import { NOTION_PROPERTIES, MAIN_LANGUAGE } from "../constants";

// Load environment variables
dotenv.config({ override: true });

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (resolvedDatabaseId) {
  process.env.DATABASE_ID = resolvedDatabaseId;
}

interface NotionPageProperties {
  Title: {
    title: {
      text: {
        content: string;
      };
    }[];
  };
  Status?: {
    select: {
      name: string;
    };
  };
  "Element Type"?: {
    select: {
      name: string;
    };
  };
  // Legacy support while migrating the Notion database
  Section?: {
    select: {
      name: string;
    };
  };
  Order?: {
    number: number;
  };
  Language?: {
    select: {
      name: string;
    };
  };
  "Parent item"?: {
    relation: {
      id: string;
    }[];
  };
  [key: string]: unknown;
}

/**
 * Gets the highest order number from the database
 */
async function getHighestOrder(
  notion: Client,
  databaseId: string
): Promise<number> {
  const response = await notion.dataSources.query({
    // v5 API: use data_source_id instead of database_id
    data_source_id: databaseId,
    sorts: [
      {
        property: NOTION_PROPERTIES.ORDER,
        direction: "descending",
      },
    ],
    page_size: 1,
  });

  if (response.results.length === 0) {
    return 0;
  }

  const page = response.results[0];
  // @ts-expect-error - We know the page has properties
  const orderProperty = page.properties?.[NOTION_PROPERTIES.ORDER];

  if (
    orderProperty &&
    "number" in orderProperty &&
    typeof orderProperty.number === "number"
  ) {
    return orderProperty.number;
  }

  return 0;
}

/**
 * Creates a new content template page with "Not started" status
 */
async function createTemplatePage(
  notion: Client,
  databaseId: string,
  title: string,
  order: number
): Promise<string> {
  const pageProperties: NotionPageProperties = {
    Title: {
      title: [
        {
          text: {
            content: title,
          },
        },
      ],
    },
    Status: {
      select: {
        name: "Not started",
      },
    },
    "Element Type": {
      select: {
        name: "Page",
      },
    },
    Order: {
      number: order,
    },
  };

  const newPage = await notion.pages.create({
    // v5 API: use data_source_id in parent instead of database_id
    parent: {
      type: "data_source_id",
      data_source_id: databaseId,
    },
    // @ts-expect-error - Notion API types are not fully compatible with our types
    properties: pageProperties,
  });

  return newPage.id;
}

/**
 * Creates a child page with parent relation
 */
async function createChildPage(
  notion: Client,
  databaseId: string,
  parentPageId: string,
  title: string,
  language: string = MAIN_LANGUAGE
): Promise<string> {
  const pageProperties: NotionPageProperties = {
    Title: {
      title: [
        {
          text: {
            content: title,
          },
        },
      ],
    },
    Language: {
      select: {
        name: language,
      },
    },
    "Parent item": {
      relation: [{ id: parentPageId }],
    },
  };

  const newPage = await notion.pages.create({
    // v5 API: use data_source_id in parent instead of database_id
    parent: {
      type: "data_source_id",
      data_source_id: databaseId,
    },
    // @ts-expect-error - Notion API types are not fully compatible with our types
    properties: pageProperties,
  });

  return newPage.id;
}

/**
 * Main function to create content template
 */
export async function createContentTemplate(title: string): Promise<void> {
  const spinner = ora("Creating new content template").start();

  try {
    // Initialize Notion client
    const notion = new Client({
      auth: process.env.NOTION_API_KEY,
      notionVersion: "2025-09-03", // Required for v5 API
    });

    const databaseId = process.env.DATABASE_ID;

    if (!databaseId) {
      throw new Error("DATABASE_ID environment variable is required");
    }

    // Get the highest order number
    spinner.text = "Getting current order numbers...";
    const highestOrder = await getHighestOrder(notion, databaseId);
    const newOrder = highestOrder + 1;

    // Create the main template page
    spinner.text = `Creating main page: "${title}"`;
    const mainPageId = await createTemplatePage(
      notion,
      databaseId,
      title,
      newOrder
    );

    // Create the English child page
    spinner.text = `Creating English child page: "${title} (English)"`;
    const childPageId = await createChildPage(
      notion,
      databaseId,
      mainPageId,
      title,
      MAIN_LANGUAGE
    );

    spinner.succeed(
      chalk.green(`✅ Content template created successfully!
📄 Main page: "${title}" (Order: ${newOrder})
📄 English page: "${title} (English)" (Order: ${newOrder})
🔗 Parent-child relationship established
📊 Status: "Not started" for both pages`)
    );

    console.log(chalk.blue(`\n🔗 Notion URLs:`));
    console.log(
      chalk.blue(`Main page: https://notion.so/${mainPageId.replace(/-/g, "")}`)
    );
    console.log(
      chalk.blue(
        `English page: https://notion.so/${childPageId.replace(/-/g, "")}`
      )
    );
  } catch (error) {
    spinner.fail(
      chalk.red(`Failed to create content template: ${error.message}`)
    );
    throw error;
  }
}

// CLI execution
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      chalk.red("❌ Error: Please provide a title for the content template")
    );
    console.log(
      chalk.yellow(
        'Usage: bun scripts/notion-create-template/createTemplate.ts "Your Content Title"'
      )
    );
    process.exit(1);
  }

  const title = args[0];

  const run = async () => {
    try {
      await createContentTemplate(title);
      console.log(chalk.green("\n🎉 Content template creation completed!"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\n💥 Error: ${message}`));
      process.exit(1);
    }
  };

  run();
}
