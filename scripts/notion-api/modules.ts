/**
 * Notion API Modules - Pure, reusable functions for Notion operations
 *
 * This module provides programmatic interfaces for all Notion workflow operations.
 * Functions are designed to be callable from APIs, tests, or CLI tools without side effects.
 *
 * Core Principles:
 * - Pure functions where possible (no direct CLI interaction)
 * - Return structured data for API responses
 * - Support both callback and promise-based progress tracking
 * - Environment configuration via parameters (not implicit env vars)
 */

import type {
  PageWithStatus,
  FetchAllOptions,
  FetchAllResult,
} from "../notion-fetch-all/fetchAll";
import type { GenerateBlocksOptions } from "../notion-fetch/generateBlocks";
import type { ContentGenerationOptions } from "../notion-placeholders/contentGenerator";
import type { UpdateOptions } from "../notion-placeholders/notionUpdater";

// Re-export types for external consumers
export type { PageWithStatus, FetchAllOptions, FetchAllResult };
export type { GenerateBlocksOptions };
export type { ContentGenerationOptions, UpdateOptions };

/**
 * Configuration for Notion API operations
 * All operations require explicit configuration rather than relying on environment variables
 */
export interface NotionApiConfig {
  apiKey: string;
  databaseId?: string;
  dataSourceId?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Progress callback for long-running operations
 */
export interface ProgressCallback {
  (progress: {
    current: number;
    total: number;
    message?: string;
    timestamp?: Date;
  }): void | Promise<void>;
}

/**
 * Result wrapper for API operations
 */
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    executionTimeMs: number;
    timestamp: Date;
  };
}

// ============================================================================
// FETCH OPERATIONS
// ============================================================================

/**
 * Fetch operations - retrieve data from Notion
 */

import { fetchAllNotionData } from "../notion-fetch-all/fetchAll";
import { runFetchPipeline } from "../notion-fetch/runFetch";

/**
 * Fetch all pages from Notion database
 *
 * @param config - Notion API configuration
 * @param options - Fetch options (filtering, sorting, limits)
 * @param onProgress - Optional progress callback
 * @returns Fetch result with pages and metadata
 *
 * @example
 * ```ts
 * const result = await fetchPages(
 *   { apiKey: process.env.NOTION_API_KEY!, databaseId: 'abc123' },
 *   { includeRemoved: false, maxPages: 10 }
 * );
 * if (result.success) {
 *   console.log(`Fetched ${result.data?.pages.length} pages`);
 * }
 * ```
 */
export async function fetchPages(
  config: NotionApiConfig,
  options: FetchAllOptions = {},
  onProgress?: ProgressCallback
): Promise<ApiResult<FetchAllResult>> {
  const startTime = Date.now();

  try {
    // Set environment variables for legacy functions
    if (config.apiKey) process.env.NOTION_API_KEY = config.apiKey;
    if (config.databaseId) process.env.DATABASE_ID = config.databaseId;
    if (config.dataSourceId) process.env.DATA_SOURCE_ID = config.dataSourceId;

    const result = await fetchAllNotionData({
      ...options,
      progressLogger: onProgress,
    });

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  }
}

/**
 * Fetch a single page by ID with full content
 *
 * @param config - Notion API configuration
 * @param pageId - Notion page ID
 * @param onProgress - Optional progress callback
 * @returns Page with full content
 */
export async function fetchPage(
  config: NotionApiConfig,
  pageId: string,
  onProgress?: ProgressCallback
): Promise<ApiResult<PageWithStatus & { content?: string }>> {
  const startTime = Date.now();

  try {
    // Set environment variables for legacy functions
    if (config.apiKey) process.env.NOTION_API_KEY = config.apiKey;
    if (config.databaseId) process.env.DATABASE_ID = config.databaseId;

    // Use runFetchPipeline with specific filter for this page
    const { data: pages } = await runFetchPipeline({
      filter: {
        property: "id",
        rich_text: { equals: pageId },
      },
      shouldGenerate: false,
      fetchSpinnerText: "Fetching page from Notion",
      onProgress,
    });

    if (!pages || pages.length === 0) {
      return {
        success: false,
        error: {
          code: "PAGE_NOT_FOUND",
          message: `Page with ID ${pageId} not found`,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date(),
        },
      };
    }

    // Import transformPage function from fetchAll
    const { transformPage } = await import("../notion-fetch-all/fetchAll");

    const page = transformPage(pages[0] as any);

    return {
      success: true,
      data: page,
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "FETCH_PAGE_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  }
}

// ============================================================================
// GENERATE OPERATIONS
// ============================================================================

/**
 * Generate markdown files from Notion pages
 *
 * @param config - Notion API configuration
 * @param options - Generation options
 * @param onProgress - Optional progress callback
 * @returns Generation result with metrics
 */
export async function generateMarkdown(
  config: NotionApiConfig,
  options: FetchAllOptions & { generateOptions?: GenerateBlocksOptions } = {},
  onProgress?: ProgressCallback
): Promise<ApiResult<FetchAllResult>> {
  const startTime = Date.now();

  try {
    // Set environment variables for legacy functions
    if (config.apiKey) process.env.NOTION_API_KEY = config.apiKey;
    if (config.databaseId) process.env.DATABASE_ID = config.databaseId;
    if (config.dataSourceId) process.env.DATA_SOURCE_ID = config.dataSourceId;

    const result = await fetchAllNotionData({
      ...options,
      exportFiles: true,
      progressLogger: onProgress,
      generateOptions: options.generateOptions,
    });

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "GENERATE_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  }
}

// ============================================================================
// PLACEHOLDER OPERATIONS
// ============================================================================

/**
 * Placeholder generation options
 */
export interface PlaceholderOptions {
  dryRun?: boolean;
  force?: boolean;
  contentLength?: "short" | "medium" | "long";
  skipRecentlyModified?: boolean;
  recentThresholdHours?: number;
  includeRemoved?: boolean;
  filterStatus?: string;
  maxPages?: number;
}

/**
 * Placeholder generation result
 */
export interface PlaceholderResult {
  analyzed: number;
  updated: number;
  failed: number;
  skipped: number;
  blocksAdded: number;
  pages: Array<{
    pageId: string;
    title: string;
    status: "updated" | "failed" | "skipped";
    error?: string;
  }>;
}

/**
 * Generate placeholder content for empty Notion pages
 *
 * @param config - Notion API configuration
 * @param options - Placeholder generation options
 * @param onProgress - Optional progress callback
 * @returns Placeholder generation result
 */
export async function generatePlaceholders(
  config: NotionApiConfig,
  options: PlaceholderOptions = {},
  onProgress?: ProgressCallback
): Promise<ApiResult<PlaceholderResult>> {
  const startTime = Date.now();

  try {
    // Set environment variables for legacy functions
    if (config.apiKey) process.env.NOTION_API_KEY = config.apiKey;
    if (config.databaseId) process.env.DATABASE_ID = config.databaseId;

    // Import placeholder generation modules
    const { fetchNotionData } = await import("../fetchNotionData");
    const { PageAnalyzer } = await import(
      "../notion-placeholders/pageAnalyzer"
    );
    const { ContentGenerator } = await import(
      "../notion-placeholders/contentGenerator"
    );
    const { NotionUpdater } = await import(
      "../notion-placeholders/notionUpdater"
    );
    const { NOTION_PROPERTIES } = await import("../constants");

    // Fetch pages
    const filter = options.filterStatus
      ? {
          property: NOTION_PROPERTIES.STATUS,
          select: { equals: options.filterStatus },
        }
      : options.includeRemoved
        ? undefined
        : {
            or: [
              {
                property: NOTION_PROPERTIES.STATUS,
                select: { is_empty: true },
              },
              {
                property: NOTION_PROPERTIES.STATUS,
                select: { does_not_equal: "Remove" },
              },
            ],
          };

    const pages = await fetchNotionData(filter);

    onProgress?.({
      current: 1,
      total: 3,
      message: `Analyzing ${pages.length} pages...`,
      timestamp: new Date(),
    });

    // Filter for English pages with Page element type
    const filteredPages = pages.filter((page) => {
      const elementType =
        page.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE]?.select?.name ||
        page.properties?.["Section"]?.select?.name;
      const language =
        page.properties?.[NOTION_PROPERTIES.LANGUAGE]?.select?.name ||
        page.properties?.["Language"]?.select?.name;

      if (elementType === "Section") return false;
      if (language !== "English") return false;
      if (
        !options.includeRemoved &&
        page.properties?.[NOTION_PROPERTIES.STATUS]?.select?.name === "Remove"
      )
        return false;

      return true;
    });

    const pagesToProcess = options.maxPages
      ? filteredPages.slice(0, options.maxPages)
      : filteredPages;

    // Analyze pages
    const pageAnalyses = await PageAnalyzer.analyzePages(
      pagesToProcess.map((page) => ({
        id: page.id,
        title:
          page.properties?.[NOTION_PROPERTIES.TITLE]?.title?.[0]?.plain_text ||
          "Untitled",
      })),
      {
        skipRecentlyModified: options.skipRecentlyModified ?? true,
        recentThresholdHours: options.recentThresholdHours ?? 24,
        minContentScore: options.force ? 0 : 10,
      }
    );

    onProgress?.({
      current: 2,
      total: 3,
      message: `Generating content for ${pageAnalyses.size} pages...`,
      timestamp: new Date(),
    });

    // Generate content for pages needing it
    const pagesToUpdate = Array.from(pageAnalyses.entries())
      .filter(
        ([, analysis]) =>
          analysis.recommendedAction === "fill" ||
          (options.force && analysis.recommendedAction === "enhance")
      )
      .map(([pageId, analysis]) => {
        const page = pagesToProcess.find((p) => p.id === pageId);
        const title =
          page?.properties?.[NOTION_PROPERTIES.TITLE]?.title?.[0]?.plain_text ||
          "Untitled";

        return {
          pageId,
          title,
          analysis,
        };
      });

    const updates = [];
    for (const { pageId, title, analysis } of pagesToUpdate) {
      const contentOptions: ContentGenerationOptions = {
        type: analysis.recommendedContentType,
        length: options.contentLength || "medium",
        title,
      };

      const blocks = ContentGenerator.generateCompletePage(contentOptions);
      updates.push({ pageId, blocks, title });
    }

    onProgress?.({
      current: 3,
      total: 3,
      message: `Updating ${updates.length} pages...`,
      timestamp: new Date(),
    });

    // Apply updates
    const updateOptions: UpdateOptions = {
      dryRun: options.dryRun ?? false,
      preserveExisting: !options.force,
      backupOriginal: true,
      maxRetries: 3,
    };

    const results = await NotionUpdater.updatePages(updates, updateOptions);

    // Build result - results is an array, match by pageId
    const resultPages = results.map((result) => ({
      pageId: result.pageId,
      title:
        updates.find((u) => u.pageId === result.pageId)?.title || "Unknown",
      status: result.success ? ("updated" as const) : ("failed" as const),
      error: result.error,
    }));

    const summary = NotionUpdater.generateUpdateSummary(results);

    return {
      success: true,
      data: {
        analyzed: pagesToProcess.length,
        updated: summary.successfulUpdates,
        failed: summary.failedUpdates,
        skipped: pagesToProcess.length - updates.length,
        blocksAdded: summary.totalBlocksAdded,
        pages: resultPages,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "PLACEHOLDER_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate Notion API configuration
 */
export function validateConfig(config: NotionApiConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.apiKey || typeof config.apiKey !== "string") {
    errors.push("apiKey is required and must be a string");
  }

  if (config.databaseId && typeof config.databaseId !== "string") {
    errors.push("databaseId must be a string if provided");
  }

  if (config.timeout !== undefined && typeof config.timeout !== "number") {
    errors.push("timeout must be a number if provided");
  }

  if (
    config.maxRetries !== undefined &&
    typeof config.maxRetries !== "number"
  ) {
    errors.push("maxRetries must be a number if provided");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get status of Notion API service
 */
export async function getHealthStatus(config: NotionApiConfig): Promise<
  ApiResult<{
    healthy: boolean;
    databaseAccessible: boolean;
    timestamp: Date;
  }>
> {
  const startTime = Date.now();

  try {
    const validation = validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: "INVALID_CONFIG",
          message: validation.errors.join(", "),
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date(),
        },
      };
    }

    // Set environment variables for legacy functions
    if (config.apiKey) process.env.NOTION_API_KEY = config.apiKey;
    if (config.databaseId) process.env.DATABASE_ID = config.databaseId;

    // Test database access with a minimal query
    const result = await fetchPages(config, { maxPages: 1 });

    return {
      success: true,
      data: {
        healthy: result.success,
        databaseAccessible: result.success,
        timestamp: new Date(),
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "HEALTH_CHECK_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      },
    };
  }
}
