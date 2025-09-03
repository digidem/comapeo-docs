import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import chalk from 'chalk';

if (!process.env.NOTION_API_KEY) {
  throw new Error("NOTION_API_KEY is not defined in the environment variables.");
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
  return new Promise(resolve => setTimeout(resolve, ms));
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
function isRetryableError(error: any): boolean {
  // Rate limit errors (429)
  if (error.status === 429) return true;

  // Network errors
  if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') return true;

  // Server errors (5xx)
  if (error.status && error.status >= 500) return true;

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
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) break;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        console.error(chalk.red(`Non-retryable error in ${operationName}:`), error.message);
        throw error;
      }

      const delay = calculateDelay(attempt);
      console.warn(chalk.yellow(`⚠️  ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`));
      console.warn(chalk.yellow(`   Retrying in ${delay}ms...`));

      await sleep(delay);
    }
  }

  console.error(chalk.red(`❌ ${operationName} failed after ${maxRetries + 1} attempts`));
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

  async databasesQuery(params: any) {
    return executeWithRetry(
      () => this.client.databases.query(params),
      'databases.query'
    );
  }

  async pagesRetrieve(params: any) {
    return executeWithRetry(
      () => this.client.pages.retrieve(params),
      'pages.retrieve'
    );
  }

  async blocksChildrenList(params: any) {
    return executeWithRetry(
      () => this.client.blocks.children.list(params),
      'blocks.children.list'
    );
  }
}

// Create enhanced client
const enhancedNotion = new EnhancedNotionClient(notion);

// Export both original and enhanced clients
export { notion, n2m, enhancedNotion };
