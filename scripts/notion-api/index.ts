/**
 * Notion API - Programmatic interface for Notion operations
 *
 * This module exports all Notion operations as pure functions that can be
 * called from APIs, tests, or other modules without CLI dependencies.
 *
 * @example
 * ```ts
 * import { fetchPages, generatePlaceholders } from './scripts/notion-api';
 *
 * const result = await fetchPages(
 *   { apiKey: process.env.NOTION_API_KEY!, databaseId: 'abc123' },
 *   { maxPages: 10 }
 * );
 * ```
 */

// Export all modules
export * from "./modules";

// Re-export commonly used types for convenience
export type {
  PageWithStatus,
  FetchAllOptions,
  FetchAllResult,
  NotionApiConfig,
  ProgressCallback,
  ApiResult,
  PlaceholderOptions,
  PlaceholderResult,
} from "./modules";

// Export main operations
export {
  fetchPages,
  fetchPage,
  generateMarkdown,
  generatePlaceholders,
  validateConfig,
  getHealthStatus,
} from "./modules";
