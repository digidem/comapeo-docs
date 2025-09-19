import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { enhancedNotion, DATABASE_ID } from "../notionClient.js";
import { NOTION_PROPERTIES } from "../constants.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILENAME = "notion_db.json";
const OUTPUT_PATH = path.resolve(process.cwd(), OUTPUT_FILENAME);

interface NotionQueryResponse {
  results: Array<Record<string, unknown>>;
  has_more?: boolean;
  next_cursor?: string | null;
}

function isReadyToPublish(page: Record<string, any>): boolean {
  const status =
    page?.properties?.[NOTION_PROPERTIES.STATUS]?.select?.name ?? null;
  return status === NOTION_PROPERTIES.READY_TO_PUBLISH;
}

async function fetchAllPages(): Promise<Array<Record<string, unknown>>> {
  const allResults: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;

  do {
    const response = (await enhancedNotion.databasesQuery({
      database_id: DATABASE_ID,
      ...(cursor ? { start_cursor: cursor } : {}),
    })) as NotionQueryResponse;

    allResults.push(...(response.results ?? []));
    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);

  return allResults;
}

export async function exportNotionDatabase(): Promise<void> {
  console.log(chalk.cyan("📥 Fetching complete Notion database..."));

  const allPages = await fetchAllPages();
  const readyToPublish = allPages.filter(isReadyToPublish);

  const payload = {
    generatedAt: new Date().toISOString(),
    total: allPages.length,
    readyToPublishTotal: readyToPublish.length,
    readyToPublishIds: readyToPublish.map((page) => page.id ?? null),
    results: allPages,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log(
    chalk.green(
      `✅ Exported ${allPages.length} pages to ${path.relative(
        process.cwd(),
        OUTPUT_PATH
      )}`
    )
  );
  console.log(
    chalk.yellow(
      `📝 ${readyToPublish.length} items are marked as "${NOTION_PROPERTIES.READY_TO_PUBLISH}".`
    )
  );
}

if (import.meta.main) {
  exportNotionDatabase().catch((error) => {
    console.error(chalk.red("❌ Failed to export Notion database:"), error);
    process.exit(1);
  });
}
