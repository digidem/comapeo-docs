/**
 * Rate limit manager for Notion API requests
 *
 * Handles 429 (Too Many Requests) responses with exponential backoff.
 * Shared between parallel page processing (Issue #4) and adaptive batching (Issue #6).
 */

import chalk from "chalk";

export class RateLimitManager {
  private lastRateLimitTime: number = 0;
  private currentBackoffMs: number = 0;
  private readonly initialBackoffMs: number = 1000; // 1 second
  private readonly maxBackoffMs: number = 60000; // 1 minute

  /**
   * Check if we're currently in backoff period
   */
  isRateLimited(): boolean {
    if (this.currentBackoffMs === 0) return false;
    const elapsed = Date.now() - this.lastRateLimitTime;
    const inBackoff = elapsed < this.currentBackoffMs;

    // Clear backoff if period has elapsed
    if (!inBackoff) {
      this.currentBackoffMs = 0;
    }

    return inBackoff;
  }

  /**
   * Get remaining backoff time in milliseconds
   * @returns Remaining backoff time, or 0 if not rate limited
   */
  getRemainingBackoff(): number {
    if (!this.isRateLimited()) return 0;
    const elapsed = Date.now() - this.lastRateLimitTime;
    return Math.max(0, this.currentBackoffMs - elapsed);
  }

  /**
   * Record a rate limit hit and calculate backoff duration
   * @param retryAfterSeconds - Optional Retry-After header value in seconds
   */
  recordRateLimit(retryAfterSeconds?: number): void {
    this.lastRateLimitTime = Date.now();

    // Use Retry-After header if provided, otherwise use exponential backoff
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      this.currentBackoffMs = retryAfterSeconds * 1000;
    } else {
      // Exponential backoff: double the previous backoff, or start with initial
      this.currentBackoffMs =
        this.currentBackoffMs === 0
          ? this.initialBackoffMs
          : Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
    }

    const backoffSeconds = (this.currentBackoffMs / 1000).toFixed(1);
    console.warn(
      chalk.yellow(
        `⚠️  Rate limit hit. Backing off for ${backoffSeconds}s before continuing.`
      )
    );
  }

  /**
   * Wait for current backoff period to elapse
   * @returns Promise that resolves when backoff period is over
   */
  async waitForBackoff(): Promise<void> {
    const remaining = this.getRemainingBackoff();
    if (remaining > 0) {
      const seconds = (remaining / 1000).toFixed(1);
      console.info(
        chalk.blue(`⏳ Waiting ${seconds}s for rate limit backoff...`)
      );
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  /**
   * Reset the rate limit state (useful for testing)
   */
  reset(): void {
    this.lastRateLimitTime = 0;
    this.currentBackoffMs = 0;
  }

  /**
   * Get current backoff duration in milliseconds
   */
  getCurrentBackoff(): number {
    return this.currentBackoffMs;
  }
}

// Singleton instance for global rate limit management
let globalRateLimitManager: RateLimitManager | null = null;

/**
 * Get the global rate limit manager instance
 */
export function getRateLimitManager(): RateLimitManager {
  if (!globalRateLimitManager) {
    globalRateLimitManager = new RateLimitManager();
  }
  return globalRateLimitManager;
}

/**
 * Reset the global rate limit manager (useful for testing)
 */
export function resetRateLimitManager(): void {
  if (globalRateLimitManager) {
    globalRateLimitManager.reset();
  }
}
