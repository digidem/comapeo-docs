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
 * Extract language from a raw Notion page
 * @returns The language name (e.g., "English", "Spanish", "Portuguese"), or undefined if not set
 */
export function getLanguageFromRawPage(
  page: Record<string, any>
): string | undefined {
  if (!page || typeof page !== "object") return undefined;
  const properties = (page as any).properties;
  if (!properties || typeof properties !== "object") return undefined;

  const languageProperty =
    properties[NOTION_PROPERTIES.LANGUAGE] || properties["Language"];

  const name = languageProperty?.select?.name;
  const normalized = typeof name === "string" ? name.trim() : "";
  if (normalized) {
    return normalized;
  }
  return undefined;
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
 * Extract sub-item IDs from a page's "Sub-item" relation property
 * @param page - Raw Notion page object
 * @returns Array of sub-item IDs
 */
export function getSubItemIds(page: Record<string, unknown>): string[] {
  const relations = (page.properties as any)?.["Sub-item"]?.relation;
  if (!Array.isArray(relations)) return [];
  return relations
    .map((rel) => (rel as { id?: string }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Resolve children from parent pages matching a status filter
 * When statusFilter is provided, finds parent pages with that status and returns their children
 * @param pages - Array of raw Notion pages
 * @param statusFilter - Status to filter parent pages by
 * @returns Filtered pages (children if found, otherwise parents matching status)
 */
export function resolveChildrenByStatus(
  pages: Array<Record<string, unknown>>,
  statusFilter: string
): Array<Record<string, unknown>> {
  // Find parent pages that match the status filter
  const parentPages = pages.filter(
    (page) => getStatusFromRawPage(page) === statusFilter
  );

  // Collect all child page IDs from the "Sub-item" relation
  const childIds = new Set<string>();
  for (const parent of parentPages) {
    const subItemIds = getSubItemIds(parent);
    for (const id of subItemIds) {
      childIds.add(id);
    }
  }

  // Return only the children, not the parents
  if (childIds.size > 0) {
    return pages.filter((page) => childIds.has(page.id as string));
  }

  // No children found, fall back to original behavior
  return parentPages;
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

  // First apply removal filter
  let filtered = pages;

  if (!includeRemoved) {
    filtered = filtered.filter(
      (page) => getStatusFromRawPage(page) !== "Remove"
    );
  }

  // When statusFilter is provided, resolve children from parent pages
  let hasChildren = false;
  if (statusFilter) {
    const childIds = new Set<string>();
    const parentPages = filtered.filter(
      (page) => getStatusFromRawPage(page) === statusFilter
    );

    for (const parent of parentPages) {
      const subItemIds = getSubItemIds(parent);
      for (const id of subItemIds) {
        childIds.add(id);
      }
    }

    if (childIds.size > 0) {
      hasChildren = true;
      if (verbose) {
        console.log(
          `  🔍 statusFilter "${statusFilter}": found ${parentPages.length} parent(s) with ${childIds.size} child(ren)`
        );
      }
      filtered = filtered.filter((p) => childIds.has(p.id as string));
    } else {
      if (verbose) {
        console.log(
          `  ⚠️ statusFilter "${statusFilter}": no children found, returning parent pages`
        );
      }
      filtered = parentPages;
    }
  }

  // When statusFilter found children, return them all without limiting to maxPages
  // The maxPages limit will be applied after the pipeline completes
  if (statusFilter && hasChildren) {
    if (verbose) {
      console.log(
        `  🔍 statusFilter: returning all ${filtered.length} children (skipping maxPages limit)`
      );
    }
    return filtered;
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
