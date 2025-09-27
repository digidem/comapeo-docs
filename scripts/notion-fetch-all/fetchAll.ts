import { NOTION_PROPERTIES } from "../constants";
import { runFetchPipeline } from "../notion-fetch/runFetch";

export interface PageWithStatus {
  id: string;
  url: string;
  title: string;
  status: string;
  elementType: string;
  order: number;
  language?: string;
  parentItem?: string;
  subItems: string[];
  lastEdited: Date;
  createdTime: Date;
  properties: Record<string, any>;
  rawPage: any;
}

export interface FetchAllOptions {
  includeRemoved?: boolean;
  sortBy?: "order" | "created" | "modified" | "title";
  sortDirection?: "asc" | "desc";
  includeSubPages?: boolean;
  statusFilter?: string;
  maxPages?: number;
  exportFiles?: boolean;
  fetchSpinnerText?: string;
  generateSpinnerText?: string;
  progressLogger?: (progress: { current: number; total: number }) => void;
}

export interface FetchAllResult {
  pages: PageWithStatus[];
  rawPages: Array<Record<string, unknown>>;
  metrics?: {
    totalSaved: number;
    sectionCount: number;
    titleSectionCount: number;
  };
  fetchedCount: number;
  processedCount: number;
}

/**
 * Fetches ALL pages from Notion database (excludes archived and removed items by default)
 */
export async function fetchAllNotionData(
  options: FetchAllOptions = {}
): Promise<FetchAllResult> {
  const {
    includeRemoved = false,
    sortBy = "order",
    sortDirection = "asc",
    statusFilter,
    maxPages,
    exportFiles = true,
    fetchSpinnerText,
    generateSpinnerText,
    progressLogger,
  } = options;

  const filter = buildStatusFilter(includeRemoved);

  let fetchedCount = 0;

  const { data: rawData = [], metrics } = await runFetchPipeline({
    filter,
    fetchSpinnerText:
      fetchSpinnerText ??
      "Fetching ALL pages from Notion (excluding removed items by default)...",
    generateSpinnerText:
      generateSpinnerText ?? "Exporting pages to markdown files",
    transform: (pages) => {
      try {
        fetchedCount = Array.isArray(pages) ? pages.length : 0;
        const transformed = applyFetchAllTransform(
          Array.isArray(pages) ? pages : [],
          {
            statusFilter,
            maxPages,
            includeRemoved,
          }
        );
        return Array.isArray(transformed) ? transformed : [];
      } catch (e) {
        console.warn(
          "fetchAll transform failed, using untransformed data:",
          (e as Error)?.message ?? e
        );
        return Array.isArray(pages) ? pages : [];
      }
    },
    onProgress: progressLogger,
    shouldGenerate: exportFiles,
  });

  // Apply defensive filters for both removal and explicit status
  const defensivelyFiltered = rawData.filter((p) => {
    const status = getStatusFromRawPage(p);
    if (!includeRemoved && status === "Remove") return false;
    if (statusFilter && status !== statusFilter) return false;
    return true;
  });

  const pages = defensivelyFiltered.map((page) => transformPage(page));
  const sortedPages = sortPages(pages, sortBy, sortDirection);

  logStatusSummary(sortedPages);

  return {
    pages: sortedPages,
    rawPages: defensivelyFiltered,
    metrics: exportFiles ? metrics : undefined,
    fetchedCount,
    processedCount: sortedPages.length,
  };
}

function buildStatusFilter(includeRemoved: boolean) {
  if (includeRemoved) {
    return undefined;
  }

  return {
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
}

function applyFetchAllTransform(
  pages: Array<Record<string, unknown>>,
  options: {
    statusFilter?: string;
    maxPages?: number;
    includeRemoved: boolean;
  }
) {
  const { statusFilter, maxPages, includeRemoved } = options;

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

  if (typeof maxPages === "number" && maxPages > 0) {
    filtered = filtered.slice(0, maxPages);
  }

  return filtered;
}

function getStatusFromRawPage(page: Record<string, any>): string {
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

function logStatusSummary(pages: PageWithStatus[]) {
  if (pages.length === 0) {
    console.log("📭 No pages matched the provided filters");
    return;
  }

  console.log("\n📋 Page Inventory:");
  const statusCounts = new Map<string, number>();

  pages.forEach((page, index) => {
    const count = statusCounts.get(page.status) || 0;
    statusCounts.set(page.status, count + 1);

    const READY_STATUS = "Ready to publish";
    if (index < 10 || page.status !== READY_STATUS) {
      console.log(
        `  ${index + 1}. [${page.status}] ${page.title} (${page.elementType})`
      );
    }
  });

  console.log("\n📊 Status Summary:");
  Array.from(statusCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count} pages`);
    });
}

/**
 * Transform raw Notion page to structured format
 */
function transformPage(page: any): PageWithStatus {
  const properties = page.properties || {};

  // Extract title safely
  let title = "Untitled";
  const titleProperty =
    properties[NOTION_PROPERTIES.TITLE] || properties["Title"];
  if (titleProperty?.title?.[0]?.plain_text) {
    title = titleProperty.title[0].plain_text;
  }

  // Extract status - handle null values properly
  let status = "No Status";
  const statusProperty =
    properties[NOTION_PROPERTIES.STATUS] || properties["Status"];
  if (statusProperty?.select?.name) {
    status = statusProperty.select.name;
  } else if (statusProperty?.select === null) {
    status = "No Status"; // Explicitly handle null select values
  }

  // Extract element type - handle null values properly
  let elementType = "Unknown";
  const elementTypeProperty =
    properties[NOTION_PROPERTIES.ELEMENT_TYPE] ||
    properties["Section"] ||
    properties["Element Type"];
  if (elementTypeProperty?.select?.name) {
    elementType = elementTypeProperty.select.name;
  } else if (elementTypeProperty?.select === null) {
    elementType = "Unknown"; // Explicitly handle null select values
  }

  // Extract order
  let order = 0;
  const orderProperty = properties["Order"];
  if (orderProperty?.number !== undefined) {
    order = orderProperty.number;
  }

  // Extract language (for sub-pages)
  let language: string | undefined;
  const languageProperty = properties["Language"];
  if (languageProperty?.select?.name) {
    language = languageProperty.select.name;
  }

  // Extract parent item
  let parentItem: string | undefined;
  const parentProperty = properties["Parent item"];
  if (parentProperty?.relation?.[0]?.id) {
    parentItem = parentProperty.relation[0].id;
  }

  // Extract sub-items
  const subItems: string[] = [];
  const subItemsProperty = properties["Sub-item"];
  if (subItemsProperty?.relation) {
    subItems.push(...subItemsProperty.relation.map((item: any) => item.id));
  }

  return {
    id: page.id,
    url: page.url || `https://notion.so/${page.id.replace(/-/g, "")}`,
    title,
    status,
    elementType,
    order,
    language,
    parentItem,
    subItems,
    lastEdited: new Date(page.last_edited_time),
    createdTime: new Date(page.created_time),
    properties,
    rawPage: page,
  };
}

/**
 * Sort pages by specified criteria
 */
function sortPages(
  pages: PageWithStatus[],
  sortBy: FetchAllOptions["sortBy"],
  direction: FetchAllOptions["sortDirection"]
): PageWithStatus[] {
  const multiplier = direction === "desc" ? -1 : 1;

  return pages.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "order":
        comparison = a.order - b.order;
        break;
      case "created":
        comparison = a.createdTime.getTime() - b.createdTime.getTime();
        break;
      case "modified":
        comparison = a.lastEdited.getTime() - b.lastEdited.getTime();
        break;
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
      default:
        comparison = a.order - b.order;
    }

    return comparison * multiplier;
  });
}

/**
 * Get pages grouped by status
 */
export function groupPagesByStatus(
  pages: PageWithStatus[]
): Map<string, PageWithStatus[]> {
  const groups = new Map<string, PageWithStatus[]>();

  for (const page of pages) {
    const status = page.status || "No Status";
    if (!groups.has(status)) {
      groups.set(status, []);
    }
    groups.get(status)!.push(page);
  }

  return groups;
}

/**
 * Get pages grouped by element type
 */
export function groupPagesByElementType(
  pages: PageWithStatus[]
): Map<string, PageWithStatus[]> {
  const groups = new Map<string, PageWithStatus[]>();

  for (const page of pages) {
    const elementType = page.elementType || "Unknown";
    if (!groups.has(elementType)) {
      groups.set(elementType, []);
    }
    groups.get(elementType)!.push(page);
  }

  return groups;
}

/**
 * Get hierarchical structure of pages (parent-child relationships)
 */
export function buildPageHierarchy(pages: PageWithStatus[]): {
  topLevel: PageWithStatus[];
  children: Map<string, PageWithStatus[]>;
} {
  const children = new Map<string, PageWithStatus[]>();
  const topLevel: PageWithStatus[] = [];

  for (const page of pages) {
    if (page.parentItem) {
      // This is a child page
      if (!children.has(page.parentItem)) {
        children.set(page.parentItem, []);
      }
      children.get(page.parentItem)!.push(page);
    } else {
      // This is a top-level page
      topLevel.push(page);
    }
  }

  return { topLevel, children };
}

/**
 * Filter pages by multiple criteria
 */
export function filterPages(
  pages: PageWithStatus[],
  filters: {
    statuses?: string[];
    elementTypes?: string[];
    languages?: string[];
    hasSubItems?: boolean;
    isTopLevel?: boolean;
    modifiedAfter?: Date;
    modifiedBefore?: Date;
  }
): PageWithStatus[] {
  return pages.filter((page) => {
    // Status filter
    if (filters.statuses && !filters.statuses.includes(page.status)) {
      return false;
    }

    // Element type filter
    if (
      filters.elementTypes &&
      !filters.elementTypes.includes(page.elementType)
    ) {
      return false;
    }

    // Language filter
    if (
      filters.languages &&
      page.language &&
      !filters.languages.includes(page.language)
    ) {
      return false;
    }

    // Sub-items filter
    if (filters.hasSubItems !== undefined) {
      const hasSubItems = page.subItems.length > 0;
      if (filters.hasSubItems !== hasSubItems) {
        return false;
      }
    }

    // Top-level filter
    if (filters.isTopLevel !== undefined) {
      const isTopLevel = !page.parentItem;
      if (filters.isTopLevel !== isTopLevel) {
        return false;
      }
    }

    // Date filters
    if (filters.modifiedAfter && page.lastEdited < filters.modifiedAfter) {
      return false;
    }

    if (filters.modifiedBefore && page.lastEdited > filters.modifiedBefore) {
      return false;
    }

    return true;
  });
}
