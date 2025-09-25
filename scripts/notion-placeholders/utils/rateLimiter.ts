/**
 * Rate limiter for Notion API calls to prevent hitting API limits
 */
export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number; // in milliseconds

  constructor(maxRequests: number = 3, timeWindowSeconds: number = 1) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowSeconds * 1000;
  }

  /**
   * Wait if necessary to respect rate limits
   */
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // Remove requests outside the time window
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.timeWindow
    );

    // If we're at the limit, wait until we can make another request
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest);

      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    // Record this request
    this.requests.push(now);
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitIfNeeded();
    return fn();
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
  }

  /**
   * Get current request count in the time window
   */
  getCurrentCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.timeWindow
    );
    return this.requests.length;
  }
}
