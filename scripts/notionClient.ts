import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not defined in the environment variables.`);
  }
  return value;
}

// Get required environment variables
export const NOTION_API_KEY = getRequiredEnvVar('NOTION_API_KEY');
export const DATABASE_ID = getRequiredEnvVar('DATABASE_ID');

// Initialize Notion client
const notion = new Client({ auth: NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

export { notion, n2m };
