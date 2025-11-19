/**
 * Timeout Utilities
 *
 * Provides timeout wrappers for async operations to prevent indefinite hanging.
 * Critical for operations like image processing (sharp), compression (imagemin),
 * and network requests that can hang on corrupted data or network issues.
 */

import chalk from "chalk";
import type { ProgressTracker } from "./progressTracker";

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
 * IMPORTANT: JavaScript doesn't support native promise cancellation. When a timeout
 * occurs, the underlying operation continues running until completion. The timeout
 * serves as a circuit breaker to unblock the script flow, but the operation itself
 * cannot be forcibly cancelled.
 *
 * For operations that support AbortController (like fetch/axios), use the signal
 * parameter to enable actual cancellation.
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
  let timeoutId: NodeJS.Timeout | undefined;

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
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    throw error;
  } finally {
    // Extra safety: ensure timeout is always cleared
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
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
  /** Optional progress tracker for aggregate progress display */
  progressTracker?: ProgressTracker;
  /** Optional callback invoked when each item completes (for streaming progress updates) */
  onItemComplete?: (
    index: number,
    result: PromiseSettledResult<unknown>
  ) => void;
}

/**
 * Process items in batches with concurrency control
 *
 * Unlike Promise.all() or Promise.allSettled() which process everything concurrently,
 * this processes items in batches to prevent resource exhaustion.
 *
 * Key benefits:
 * - Prevents network saturation from too many concurrent requests
 * - Avoids memory exhaustion from loading too many resources simultaneously
 * - Enables graceful degradation - one failure doesn't block others
 * - Better progress tracking with batch-level granularity
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item (receives item and global index)
 * @param config - Batch processing configuration
 * @returns Array of settled results for each item (maintains original order)
 *
 * @example
 * ```ts
 * const results = await processBatch(
 *   imageUrls,
 *   async (url, index) => {
 *     console.log(`Processing ${index + 1}/${imageUrls.length}`);
 *     return downloadImage(url);
 *   },
 *   { maxConcurrent: 3, timeoutMs: 30000, operation: "image download" }
 * );
 * ```
 */
export async function processBatch<T, R>(
  items: readonly T[],
  processor: (item: T, index: number) => Promise<R>,
  config: BatchConfig
): Promise<PromiseSettledResult<R>[]> {
  // Validate inputs
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }

  if (typeof processor !== "function") {
    throw new TypeError("processor must be a function");
  }

  if (config.maxConcurrent < 1) {
    throw new RangeError("maxConcurrent must be at least 1");
  }

  const results: PromiseSettledResult<R>[] = [];
  const {
    maxConcurrent,
    timeoutMs,
    operation,
    progressTracker,
    onItemComplete,
  } = config;

  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    const batchPromises = batch.map((item, batchIndex) => {
      const itemIndex = i + batchIndex;

      // Per-item guard to prevent double-counting when timeout fires
      // but underlying promise eventually settles
      let hasNotifiedTracker = false;
      // Guard for onItemComplete to ensure it's only called once per item
      let hasCalledOnItemComplete = false;

      // Notify progress tracker that item is starting
      if (progressTracker) {
        progressTracker.startItem();
      }

      try {
        const promise = processor(item, itemIndex);

        // Wrap promise to track completion
        const trackedPromise = promise
          .then((result) => {
            // Notify progress tracker - check result.success if available
            // Skip if already notified (e.g., by timeout handler)
            if (progressTracker && !hasNotifiedTracker) {
              hasNotifiedTracker = true;
              // If result has a 'success' property, use it to determine status
              // Otherwise, treat promise fulfillment as success (backward compatible)
              const isSuccess =
                typeof result === "object" &&
                result !== null &&
                "success" in result
                  ? result.success === true
                  : true;
              progressTracker.completeItem(isSuccess);
            }
            // Call onItemComplete for streaming progress updates
            // Wrapped in try-catch to prevent callback errors from affecting processing
            if (onItemComplete && !hasCalledOnItemComplete) {
              hasCalledOnItemComplete = true;
              try {
                onItemComplete(itemIndex, {
                  status: "fulfilled",
                  value: result,
                });
              } catch (callbackError) {
                console.error(
                  chalk.red(
                    `Error in onItemComplete callback: ${callbackError}`
                  )
                );
              }
            }
            return result;
          })
          .catch((error) => {
            // Notify progress tracker of failure
            // Skip if already notified (e.g., by timeout handler)
            if (progressTracker && !hasNotifiedTracker) {
              hasNotifiedTracker = true;
              progressTracker.completeItem(false);
            }
            // Call onItemComplete for streaming progress updates
            // Wrapped in try-catch to prevent callback errors from affecting processing
            if (onItemComplete && !hasCalledOnItemComplete) {
              hasCalledOnItemComplete = true;
              try {
                onItemComplete(itemIndex, {
                  status: "rejected",
                  reason: error,
                });
              } catch (callbackError) {
                console.error(
                  chalk.red(
                    `Error in onItemComplete callback: ${callbackError}`
                  )
                );
              }
            }
            throw error;
          });

        // Apply timeout if configured
        if (timeoutMs) {
          // Use provided operation name or default to "batch operation"
          const operationDescription = operation
            ? `${operation} (item ${itemIndex + 1}/${items.length})`
            : `batch operation (item ${itemIndex + 1}/${items.length})`;

          return withTimeout(
            trackedPromise,
            timeoutMs,
            operationDescription
          ).catch((error) => {
            // CRITICAL: If timeout fires before trackedPromise settles,
            // the .then/.catch handlers above won't run yet.
            // We must notify progress tracker here to prevent hanging.
            // The per-item guard ensures we only count once even if
            // the underlying promise settles later.
            if (
              error instanceof TimeoutError &&
              progressTracker &&
              !hasNotifiedTracker
            ) {
              hasNotifiedTracker = true;
              progressTracker.completeItem(false);
            }
            // Call onItemComplete for streaming progress updates on timeout
            // Wrapped in try-catch to prevent callback errors from affecting processing
            if (
              error instanceof TimeoutError &&
              onItemComplete &&
              !hasCalledOnItemComplete
            ) {
              hasCalledOnItemComplete = true;
              try {
                onItemComplete(itemIndex, {
                  status: "rejected",
                  reason: error,
                });
              } catch (callbackError) {
                console.error(
                  chalk.red(
                    `Error in onItemComplete callback: ${callbackError}`
                  )
                );
              }
            }
            throw error;
          });
        }

        return trackedPromise;
      } catch (error) {
        // Handle synchronous errors from processor
        // Notify progress tracker of failure
        // Skip if already notified
        if (progressTracker && !hasNotifiedTracker) {
          hasNotifiedTracker = true;
          progressTracker.completeItem(false);
        }
        // Call onItemComplete for streaming progress updates
        // Wrapped in try-catch to prevent callback errors from affecting processing
        if (onItemComplete && !hasCalledOnItemComplete) {
          hasCalledOnItemComplete = true;
          try {
            onItemComplete(itemIndex, { status: "rejected", reason: error });
          } catch (callbackError) {
            console.error(
              chalk.red(`Error in onItemComplete callback: ${callbackError}`)
            );
          }
        }
        return Promise.reject(error);
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
