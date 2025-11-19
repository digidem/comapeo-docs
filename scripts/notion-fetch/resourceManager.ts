/**
 * Resource management and adaptive concurrency for Notion fetch operations.
 *
 * Detects system resources (CPU, memory) and calculates optimal concurrency
 * for different operation types.
 */

import os from "node:os";
import chalk from "chalk";

/**
 * Resource provider interface for dependency injection
 * Allows tests to override system resource detection
 */
export interface ResourceProvider {
  getCpuCores: () => number;
  getFreeMemoryGB: () => number;
  getTotalMemoryGB: () => number;
}

/**
 * Default resource provider using real system values
 */
export const defaultResourceProvider: ResourceProvider = {
  getCpuCores: () => os.cpus().length,
  getFreeMemoryGB: () => os.freemem() / 1024 ** 3,
  getTotalMemoryGB: () => os.totalmem() / 1024 ** 3,
};

/**
 * Operation types for concurrency calculation
 */
export type OperationType = "images" | "pages" | "blocks";

/**
 * Concurrency configuration for each operation type
 */
interface ConcurrencyConfig {
  minConcurrency: number;
  maxConcurrency: number;
  memoryPerOperation: number; // GB per operation
}

const concurrencyConfigs: Record<OperationType, ConcurrencyConfig> = {
  images: {
    minConcurrency: 3,
    maxConcurrency: 10,
    memoryPerOperation: 0.5, // Image processing is memory-intensive
  },
  pages: {
    minConcurrency: 3,
    maxConcurrency: 15,
    memoryPerOperation: 0.2,
  },
  blocks: {
    minConcurrency: 5,
    maxConcurrency: 30,
    memoryPerOperation: 0.05,
  },
};

/**
 * Environment variable overrides for CI/testing
 * NOTION_FETCH_CONCURRENCY_OVERRIDE="images:5,pages:10,blocks:20"
 */
function getEnvOverride(type: OperationType): number | undefined {
  const override = process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE;
  if (!override) return undefined;

  const pairs = override.split(",");
  for (const pair of pairs) {
    const [key, value] = pair.split(":");
    if (key === type) {
      const num = parseInt(value, 10);
      return isNaN(num) ? undefined : num;
    }
  }
  return undefined;
}

/**
 * Detect optimal concurrency for a given operation type
 *
 * @param type - The type of operation (images, pages, blocks)
 * @param provider - Optional resource provider for testing
 * @returns Optimal concurrency limit
 */
export function detectOptimalConcurrency(
  type: OperationType,
  provider: ResourceProvider = defaultResourceProvider
): number {
  // Check for environment override first (for CI/testing)
  const envOverride = getEnvOverride(type);
  if (envOverride !== undefined) {
    return envOverride;
  }

  const cpuCores = provider.getCpuCores();
  const freeMemoryGB = provider.getFreeMemoryGB();
  const config = concurrencyConfigs[type];

  // Calculate based on memory (use 70% of free memory)
  const memoryBasedLimit = Math.floor(
    (freeMemoryGB * 0.7) / config.memoryPerOperation
  );

  // Calculate based on CPU (use 75% of cores)
  const cpuBasedLimit = Math.max(2, Math.floor(cpuCores * 0.75));

  // Take the minimum of memory/CPU limits, clamped to min/max
  const optimal = Math.max(
    config.minConcurrency,
    Math.min(config.maxConcurrency, memoryBasedLimit, cpuBasedLimit)
  );

  return optimal;
}

/**
 * Get system resource summary for logging
 */
export function getResourceSummary(
  provider: ResourceProvider = defaultResourceProvider
): string {
  const cpuCores = provider.getCpuCores();
  const freeMemoryGB = provider.getFreeMemoryGB().toFixed(1);
  const totalMemoryGB = provider.getTotalMemoryGB().toFixed(1);

  return `${cpuCores} CPU cores, ${freeMemoryGB}/${totalMemoryGB} GB RAM free`;
}

/**
 * Log adaptive concurrency configuration
 */
export function logConcurrencyConfig(
  provider: ResourceProvider = defaultResourceProvider
): void {
  const resources = getResourceSummary(provider);
  const imageConcurrency = detectOptimalConcurrency("images", provider);
  const pageConcurrency = detectOptimalConcurrency("pages", provider);
  const blockConcurrency = detectOptimalConcurrency("blocks", provider);

  console.log(chalk.blue(`📊 System resources: ${resources}`));
  console.log(
    chalk.gray(
      `   Adaptive concurrency: images=${imageConcurrency}, pages=${pageConcurrency}, blocks=${blockConcurrency}`
    )
  );
}

/**
 * ResourceManager class for managing adaptive concurrency
 */
export class ResourceManager {
  private provider: ResourceProvider;
  private rateLimitMultiplier: number = 1.0;

  constructor(provider: ResourceProvider = defaultResourceProvider) {
    this.provider = provider;
  }

  /**
   * Get optimal concurrency for an operation type
   */
  getConcurrency(type: OperationType): number {
    const base = detectOptimalConcurrency(type, this.provider);
    // Apply rate limit multiplier
    return Math.max(1, Math.floor(base * this.rateLimitMultiplier));
  }

  /**
   * Set rate limit multiplier (e.g., 0.5 to reduce by half during backoff)
   */
  setRateLimitMultiplier(multiplier: number): void {
    this.rateLimitMultiplier = Math.max(0.1, Math.min(1.0, multiplier));
  }

  /**
   * Reset rate limit multiplier to normal
   */
  resetRateLimitMultiplier(): void {
    this.rateLimitMultiplier = 1.0;
  }

  /**
   * Get current rate limit multiplier
   */
  getRateLimitMultiplier(): number {
    return this.rateLimitMultiplier;
  }

  /**
   * Get resource summary
   */
  getSummary(): string {
    return getResourceSummary(this.provider);
  }
}

// Global resource manager instance
let globalResourceManager: ResourceManager | null = null;

/**
 * Get the global ResourceManager instance
 */
export function getResourceManager(): ResourceManager {
  if (!globalResourceManager) {
    globalResourceManager = new ResourceManager();
  }
  return globalResourceManager;
}

/**
 * Reset the global ResourceManager (useful for testing)
 */
export function resetResourceManager(): void {
  globalResourceManager = null;
}
