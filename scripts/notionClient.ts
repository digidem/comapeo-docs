import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import chalk from "chalk";

if (!process.env.NOTION_API_KEY) {
  throw new Error(
    "NOTION_API_KEY is not defined in the environment variables."
  );
}

if (!process.env.DATABASE_ID) {
  throw new Error("DATABASE_ID is not defined in the environment variables.");
}

// Configuration for retry logic
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  timeout: 10000, // 10 seconds per request
};

// Create Notion client with timeout
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  timeoutMs: RETRY_CONFIG.timeout,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

export const DATABASE_ID = process.env.DATABASE_ID;

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
    err.code === "ETIMEDOUT"
  )
    return true;

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
        this.client.databases.query(
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
}

// Create enhanced client
const enhancedNotion = new EnhancedNotionClient(notion);

// Export both original and enhanced clients
export { notion, n2m, enhancedNotion };
