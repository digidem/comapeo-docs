import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import chalk from "chalk";
import { perfTelemetry } from "./perfTelemetry";
import {
  scheduleRequest,
  setCircuitBreakerCheck,
} from "./notion-fetch/requestScheduler";

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
// Standardized test environment detection
const IS_TEST_ENV =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true";

const RETRY_CONFIG = {
  maxRetries: 4,
  baseDelay: IS_TEST_ENV ? 50 : 1000, // faster retries in tests
  maxDelay: IS_TEST_ENV ? 1000 : 45000,
  timeout: IS_TEST_ENV ? 5000 : 15000,
};

/**
 * Validate and parse environment variable as positive integer
 */
function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
  name: string,
  min: number = 1,
  max: number = Number.MAX_SAFE_INTEGER
): number {
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    console.warn(
      chalk.yellow(
        `⚠️  Invalid ${name}: "${value}" is not a number, using default: ${defaultValue}`
      )
    );
    return defaultValue;
  }

  if (parsed < min) {
    console.warn(
      chalk.yellow(
        `⚠️  ${name}: ${parsed} is below minimum ${min}, using minimum`
      )
    );
    return min;
  }

  if (parsed > max) {
    console.warn(
      chalk.yellow(
        `⚠️  ${name}: ${parsed} exceeds maximum ${max}, using maximum`
      )
    );
    return max;
  }

  return parsed;
}

const RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.NOTION_RATE_LIMIT_WINDOW_MS,
  IS_TEST_ENV ? 5000 : 300000,
  "NOTION_RATE_LIMIT_WINDOW_MS",
  1000, // Min 1 second
  3600000 // Max 1 hour
);

const RATE_LIMIT_THRESHOLD = parsePositiveInt(
  process.env.NOTION_RATE_LIMIT_THRESHOLD,
  IS_TEST_ENV ? 5 : 25,
  "NOTION_RATE_LIMIT_THRESHOLD",
  1, // Min 1 hit
  1000 // Max 1000 hits
);

/**
 * Thread-safe rate limit tracker with sliding window and auto-recovery
 */
class RateLimitTracker {
  private timeline: number[] = [];
  private readonly windowMs: number;
  private readonly threshold: number;
  private circuitOpenTime: number | null = null;
  private readonly cooldownMs: number;

  constructor(windowMs: number, threshold: number) {
    this.windowMs = Math.max(1000, windowMs); // Min 1 second
    this.threshold = Math.max(1, threshold); // Min 1 hit
    // Cooldown period: 2x the window to ensure all old hits expire
    this.cooldownMs = this.windowMs * 2;
  }

  /**
   * Record a rate limit hit
   */
  addHit(timestamp: number = Date.now()): void {
    this.timeline.push(timestamp);
    this.cleanup();
  }

  /**
   * Check if circuit should open based on hits in window
   * Circuit auto-closes after cooldown period
   */
  shouldOpenCircuit(): boolean {
    this.cleanup();

    // Check if circuit is in cooldown
    if (this.circuitOpenTime !== null) {
      const timeSinceOpen = Date.now() - this.circuitOpenTime;
      if (timeSinceOpen >= this.cooldownMs) {
        // Cooldown period has passed, close circuit
        console.warn(
          chalk.yellow(
            `🔓 Circuit breaker auto-recovery: cooldown period (${this.cooldownMs}ms) elapsed, closing circuit`
          )
        );
        this.circuitOpenTime = null;
        // Timeline should be clean due to time passage
        return false;
      }
      // Still in cooldown, keep circuit open
      return true;
    }

    // Check if we should open the circuit
    const shouldOpen = this.timeline.length >= this.threshold;
    if (shouldOpen && this.circuitOpenTime === null) {
      this.circuitOpenTime = Date.now();
      console.warn(
        chalk.red(
          `🔒 Circuit breaker opened: ${this.timeline.length} rate limit hits in ${this.windowMs}ms window. Will auto-recover after ${this.cooldownMs}ms.`
        )
      );
    }

    return shouldOpen;
  }

  /**
   * Get current hit count in window
   */
  getHitCount(): number {
    this.cleanup();
    return this.timeline.length;
  }

  /**
   * Remove expired entries outside the window
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    // Remove all entries older than the window
    this.timeline = this.timeline.filter((t) => t >= cutoff);
  }

  /**
   * Reset the tracker (for testing or manual recovery)
   */
  reset(): void {
    this.timeline = [];
    this.circuitOpenTime = null;
  }

  /**
   * Get circuit state for monitoring
   */
  getCircuitState(): {
    isOpen: boolean;
    hitCount: number;
    cooldownRemaining: number | null;
  } {
    this.cleanup();
    const isOpen = this.shouldOpenCircuit();
    let cooldownRemaining = null;

    if (this.circuitOpenTime !== null) {
      const elapsed = Date.now() - this.circuitOpenTime;
      cooldownRemaining = Math.max(0, this.cooldownMs - elapsed);
    }

    return {
      isOpen,
      hitCount: this.timeline.length,
      cooldownRemaining,
    };
  }
}

const rateLimitTracker = new RateLimitTracker(
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_THRESHOLD
);

/**
 * Check if circuit breaker should be open
 */
export function isCircuitBreakerOpen(): boolean {
  return rateLimitTracker.shouldOpenCircuit();
}

export class RateLimitCircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitCircuitOpenError";
  }
}

/**
 * Reset rate limit tracker (for testing)
 */
export function resetRateLimitTracker(): void {
  rateLimitTracker.reset();
}

// Initialize circuit breaker check for the scheduler
setCircuitBreakerCheck(isCircuitBreakerOpen);

// Create Notion client with timeout
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  timeoutMs: RETRY_CONFIG.timeout,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

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
      const status = (error as { status?: number }).status;
      const attemptNumber = attempt + 1;

      // Don't retry on the last attempt
      if (attempt === maxRetries) break;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        const err = error as { message?: string };
        console.error(
          chalk.red(`Non-retryable error in ${operationName}:`),
          err.message || String(error)
        );
        perfTelemetry.recordRetry({
          operation: operationName,
          attempt: attemptNumber,
          status,
        });
        throw error;
      }

      const err = error as { message?: string };
      const delay = calculateDelay(attempt);

      if (status === 429) {
        rateLimitTracker.addHit();

        if (rateLimitTracker.shouldOpenCircuit()) {
          const hitCount = rateLimitTracker.getHitCount();
          const windowSeconds = (RATE_LIMIT_WINDOW_MS / 1000).toFixed(0);
          const message = `Rate limit circuit opened: ${hitCount} hits in ${windowSeconds}s window.`;
          perfTelemetry.recordEvent("rate-limit-circuit-open", {
            hits: hitCount,
            windowMs: RATE_LIMIT_WINDOW_MS,
            threshold: RATE_LIMIT_THRESHOLD,
            operation: operationName,
          });
          console.error(chalk.red(`❌ ${message}`));
          throw new RateLimitCircuitOpenError(message);
        }
      }

      perfTelemetry.recordRetry({
        operation: operationName,
        attempt: attemptNumber,
        status,
        delayMs: delay,
      });
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
    return scheduleRequest(
      () =>
        executeWithRetry(
          () =>
            this.client.databases.query?.(
              params as Parameters<typeof this.client.databases.query>[0]
            ),
          "databases.query"
        ),
      { label: "databases.query" }
    );
  }

  async pagesRetrieve(params: Record<string, unknown>) {
    return scheduleRequest(
      () =>
        executeWithRetry(
          () =>
            this.client.pages.retrieve(
              params as Parameters<typeof this.client.pages.retrieve>[0]
            ),
          "pages.retrieve"
        ),
      { label: "pages.retrieve" }
    );
  }

  async blocksChildrenList(params: Record<string, unknown>) {
    return scheduleRequest(
      () =>
        executeWithRetry(
          () =>
            this.client.blocks.children.list(
              params as Parameters<typeof this.client.blocks.children.list>[0]
            ),
          "blocks.children.list"
        ),
      { label: "blocks.children.list" }
    );
  }

  async blocksChildrenAppend(params: Record<string, unknown>) {
    return scheduleRequest(
      () =>
        executeWithRetry(
          () =>
            this.client.blocks.children.append(
              params as Parameters<typeof this.client.blocks.children.append>[0]
            ),
          "blocks.children.append"
        ),
      { label: "blocks.children.append" }
    );
  }

  async blocksDelete(params: Record<string, unknown>) {
    return scheduleRequest(
      () =>
        executeWithRetry(
          () =>
            this.client.blocks.delete(
              params as Parameters<typeof this.client.blocks.delete>[0]
            ),
          "blocks.delete"
        ),
      { label: "blocks.delete" }
    );
  }
}

// Create enhanced client
const enhancedNotion = new EnhancedNotionClient(notion);

// Export both original and enhanced clients
export { notion, n2m, enhancedNotion };
