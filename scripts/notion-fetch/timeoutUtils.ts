/**
 * Timeout Utilities
 *
 * Provides timeout wrappers for async operations to prevent indefinite hanging.
 * Critical for operations like image processing (sharp), compression (imagemin),
 * and network requests that can hang on corrupted data or network issues.
 */

import chalk from "chalk";

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly operation: string
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout that rejects if the operation takes too long
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param operation - Description of the operation for error messages
 * @returns Promise that resolves with the original result or rejects on timeout
 *
 * @example
 * ```ts
 * const result = await withTimeout(
 *   sharpProcess(buffer),
 *   5000,
 *   "image processing"
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new TimeoutError(
          `Operation "${operation}" timed out after ${timeoutMs}ms`,
          operation
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Wraps a promise with a timeout and provides a fallback value on timeout
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param fallback - Value to return if timeout occurs
 * @param operation - Description of the operation for logging
 * @returns Promise that resolves with result or fallback value
 *
 * @example
 * ```ts
 * const compressed = await withTimeoutFallback(
 *   compressImage(buffer),
 *   10000,
 *   originalBuffer,
 *   "image compression"
 * );
 * ```
 */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  operation: string
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, operation);
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn(
        chalk.yellow(
          `⚠️  ${operation} timed out after ${timeoutMs}ms, using fallback`
        )
      );
      return fallback;
    }
    throw error;
  }
}

/**
 * Configuration for batch processing with concurrency control
 */
export interface BatchConfig {
  /** Maximum number of concurrent operations */
  maxConcurrent: number;
  /** Optional timeout per operation in milliseconds */
  timeoutMs?: number;
  /** Optional operation name for logging */
  operation?: string;
}

/**
 * Process items in batches with concurrency control
 *
 * Unlike Promise.all() or Promise.allSettled() which process everything concurrently,
 * this processes items in batches to prevent resource exhaustion.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param config - Batch processing configuration
 * @returns Array of settled results for each item
 *
 * @example
 * ```ts
 * const results = await processBatch(
 *   imageUrls,
 *   (url) => downloadImage(url),
 *   { maxConcurrent: 3, timeoutMs: 30000, operation: "image download" }
 * );
 * ```
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  config: BatchConfig
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  const { maxConcurrent, timeoutMs, operation } = config;

  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    const batchPromises = batch.map((item, batchIndex) => {
      const itemIndex = i + batchIndex;
      const promise = processor(item, itemIndex);

      // Apply timeout if configured
      if (timeoutMs && operation) {
        return withTimeout(
          promise,
          timeoutMs,
          `${operation} (item ${itemIndex + 1}/${items.length})`
        );
      }

      return promise;
    });

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
