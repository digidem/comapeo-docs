import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";

if (!process.env.NOTION_API_KEY) {
  throw new Error("NOTION_API_KEY is not defined in the environment variables.");
}

if (!process.env.DATABASE_ID) {
  throw new Error("DATABASE_ID is not defined in the environment variables.");
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

export const DATABASE_ID = process.env.DATABASE_ID;

export { notion, n2m };
