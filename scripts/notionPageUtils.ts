/**
 * Shared utilities for extracting properties from Notion pages
 * Used by both notion:fetch and notion:fetch-all commands
 */

import { NOTION_PROPERTIES } from "./constants";

/**
 * Extract status from a raw Notion page
 * @returns The status name, or "No Status" if not set
 */
export function getStatusFromRawPage(page: Record<string, any>): string {
  if (!page || typeof page !== "object") return "No Status";
  const properties = (page as any).properties;
  if (!properties || typeof properties !== "object") return "No Status";

  const statusProperty =
    properties[NOTION_PROPERTIES.STATUS] || properties["Status"];

  const name = statusProperty?.select?.name;
  const normalized = typeof name === "string" ? name.trim() : "";
  if (normalized) {
    return normalized;
  }
  return "No Status";
}

/**
 * Extract element type from a raw Notion page
 * @returns The element type name, or "Unknown" if not set
 */
export function getElementTypeFromRawPage(page: Record<string, any>): string {
  if (!page || typeof page !== "object") return "Unknown";
  const properties = (page as any).properties;
  if (!properties || typeof properties !== "object") return "Unknown";

  const elementTypeProperty =
    properties[NOTION_PROPERTIES.ELEMENT_TYPE] ||
    properties["Element Type"] ||
    properties["Section"];

  const name = elementTypeProperty?.select?.name;
  const normalized = typeof name === "string" ? name.trim() : "";
  if (normalized) {
    return normalized;
  }
  return "Unknown";
}

/**
 * Check if a page should be included (not marked for removal)
 * @param page - Raw Notion page object
 * @param includeRemoved - Whether to include pages marked for removal
 * @returns true if the page should be included
 */
export function shouldIncludePage(
  page: Record<string, any>,
  includeRemoved: boolean = false
): boolean {
  if (includeRemoved) return true;
  return getStatusFromRawPage(page) !== "Remove";
}

/**
 * Filter pages by status
 * @param pages - Array of raw Notion pages
 * @param status - Status to filter by
 * @returns Filtered array of pages
 */
export function filterPagesByStatus(
  pages: Array<Record<string, unknown>>,
  status: string
): Array<Record<string, unknown>> {
  return pages.filter((page) => getStatusFromRawPage(page) === status);
}

/**
 * Filter pages by element type
 * @param pages - Array of raw Notion pages
 * @param elementType - Element type to filter by
 * @returns Filtered array of pages
 */
export function filterPagesByElementType(
  pages: Array<Record<string, unknown>>,
  elementType: string
): Array<Record<string, unknown>> {
  return pages.filter(
    (page) => getElementTypeFromRawPage(page) === elementType
  );
}

/**
 * Smart page selection that prioritizes pages most likely to generate content
 * Used for preview/testing scenarios with page limits
 *
 * Priority order:
 * 1. "Ready to publish" status + "Page" element type
 * 2. Any status (except Remove) + "Page" element type
 * 3. Other element types (Toggle, Heading, etc.)
 *
 * @param pages - Array of raw Notion pages
 * @param maxPages - Maximum number of pages to return
 * @param options - Additional filtering options
 * @returns Array of prioritized pages, limited to maxPages
 */
export function selectPagesWithPriority(
  pages: Array<Record<string, unknown>>,
  maxPages: number,
  options: {
    includeRemoved?: boolean;
    statusFilter?: string;
    verbose?: boolean;
  } = {}
): Array<Record<string, unknown>> {
  const { includeRemoved = false, statusFilter, verbose = true } = options;

  // First apply removal and status filters
  let filtered = pages;

  if (!includeRemoved) {
    filtered = filtered.filter(
      (page) => getStatusFromRawPage(page) !== "Remove"
    );
  }

  if (statusFilter) {
    filtered = filtered.filter(
      (page) => getStatusFromRawPage(page) === statusFilter
    );
  }

  // Prioritize pages by likelihood of generating content
  const readyToPublishPages: Array<Record<string, unknown>> = [];
  const pageTypePages: Array<Record<string, unknown>> = [];
  const otherPages: Array<Record<string, unknown>> = [];

  for (const page of filtered) {
    const status = getStatusFromRawPage(page);
    const elementType = getElementTypeFromRawPage(page);

    if (status === "Ready to publish" && elementType === "Page") {
      readyToPublishPages.push(page);
    } else if (elementType === "Page") {
      pageTypePages.push(page);
    } else {
      otherPages.push(page);
    }
  }

  // Combine in priority order and limit to maxPages
  const prioritized = [
    ...readyToPublishPages,
    ...pageTypePages,
    ...otherPages,
  ].slice(0, maxPages);

  if (verbose) {
    console.log(`\n📊 Smart page selection for max ${maxPages} pages:`);
    console.log(
      `  ✅ Ready to publish + Page type: ${readyToPublishPages.length} pages`
    );
    console.log(`  📄 Other Page type: ${pageTypePages.length} pages`);
    console.log(`  📋 Other types: ${otherPages.length} pages`);
    console.log(`  🎯 Selected: ${prioritized.length} pages total\n`);
  }

  return prioritized;
}
