import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import chalk from "chalk";
import type { RichTextItemResponse } from "@notionhq/client/build/src/api-endpoints";

dotenv.config();

if (!process.env.NOTION_API_KEY) {
  throw new Error(
    "NOTION_API_KEY is not defined in the environment variables."
  );
}

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (!resolvedDatabaseId) {
  throw new Error("DATABASE_ID is not defined in the environment variables.");
}

process.env.DATABASE_ID = resolvedDatabaseId;

// Configuration for retry logic
const IS_TEST_ENV = process.env.NODE_ENV === "test";

const RETRY_CONFIG = {
  maxRetries: 4,
  baseDelay: IS_TEST_ENV ? 50 : 1000, // faster retries in tests
  maxDelay: IS_TEST_ENV ? 1000 : 45000,
  timeout: IS_TEST_ENV ? 5000 : 15000,
};

// Create Notion client with timeout
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  timeoutMs: RETRY_CONFIG.timeout,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

const DOC_SPACER_COMPONENT = "<DocSpacer />";

const hasVisibleRichText = (items: RichTextItemResponse[] = []): boolean =>
  items.some((item) => {
    if (!item) {
      return false;
    }

    if (typeof item.plain_text === "string" && item.plain_text.trim().length) {
      return true;
    }

    if (item.type === "text") {
      return Boolean(item.text?.content?.trim());
    }

    if (item.type === "equation") {
      return Boolean(item.equation?.expression?.trim());
    }

    if (item.type === "mention") {
      return Boolean(item.plain_text?.trim());
    }

    return false;
  });

n2m.setCustomTransformer("paragraph", async (block) => {
  if (block.type !== "paragraph") {
    return undefined;
  }

  const paragraph = block.paragraph;
  if (!paragraph) {
    return undefined;
  }

  if (block.has_children) {
    return undefined;
  }

  const richText = Array.isArray(paragraph.rich_text)
    ? paragraph.rich_text
    : [];

  if (hasVisibleRichText(richText)) {
    return undefined;
  }

  return DOC_SPACER_COMPONENT;
});

export const DATABASE_ID = resolvedDatabaseId;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  const err = error as { status?: number; code?: string };

  // Rate limit errors (429)
  if (err.status === 429) return true;

  // Network errors
  if (
    err.code === "ECONNABORTED" ||
    err.code === "ENOTFOUND" ||
    err.code === "ETIMEDOUT" ||
    err.code === "notionhq_client_request_timeout"
  )
    return true;

  if ((error as { name?: string }).name === "RequestTimeoutError") return true;

  // Server errors (5xx)
  if (err.status && err.status >= 500) return true;

  return false;
}

/**
 * Execute a Notion API call with retry logic
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) break;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        const err = error as { message?: string };
        console.error(
          chalk.red(`Non-retryable error in ${operationName}:`),
          err.message || String(error)
        );
        throw error;
      }

      const err = error as { message?: string };
      const delay = calculateDelay(attempt);
      console.warn(
        chalk.yellow(
          `⚠️  ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message || String(error)} — Retrying in ${delay}ms...`
        )
      );

      await sleep(delay);
    }
  }

  console.error(
    chalk.red(`❌ ${operationName} failed after ${maxRetries + 1} attempts`)
  );
  throw lastError;
}

/**
 * Enhanced Notion client with retry logic
 */
class EnhancedNotionClient {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async databasesQuery(params: Record<string, unknown>) {
    return executeWithRetry(
      () =>
        this.client.databases.query?.(
          params as Parameters<typeof this.client.databases.query>[0]
        ),
      "databases.query"
    );
  }

  async pagesRetrieve(params: Record<string, unknown>) {
    return executeWithRetry(
      () =>
        this.client.pages.retrieve(
          params as Parameters<typeof this.client.pages.retrieve>[0]
        ),
      "pages.retrieve"
    );
  }

  async blocksChildrenList(params: Record<string, unknown>) {
    return executeWithRetry(
      () =>
        this.client.blocks.children.list(
          params as Parameters<typeof this.client.blocks.children.list>[0]
        ),
      "blocks.children.list"
    );
  }

  async blocksChildrenAppend(params: Record<string, unknown>) {
    return executeWithRetry(
      () =>
        this.client.blocks.children.append(
          params as Parameters<typeof this.client.blocks.children.append>[0]
        ),
      "blocks.children.append"
    );
  }

  async blocksDelete(params: Record<string, unknown>) {
    return executeWithRetry(
      () =>
        this.client.blocks.delete(
          params as Parameters<typeof this.client.blocks.delete>[0]
        ),
      "blocks.delete"
    );
  }
}

// Create enhanced client
const enhancedNotion = new EnhancedNotionClient(notion);

// Export both original and enhanced clients
export { notion, n2m, enhancedNotion };
