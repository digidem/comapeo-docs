import { enhancedNotion, DATABASE_ID } from "../notionClient";
import { NOTION_PROPERTIES } from "../constants";

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
}

/**
 * Fetches ALL pages from Notion database (excludes archived and removed items by default)
 */
export async function fetchAllNotionData(
  options: FetchAllOptions = {}
): Promise<PageWithStatus[]> {
  const {
    includeRemoved = false,
    sortBy = "order",
    sortDirection = "asc",
    includeSubPages = true,
  } = options;

  console.log(
    "🌍 Fetching ALL pages from Notion (excluding removed items by default)..."
  );

  try {
    // Build filter - exclude archived and removed items by default
    let filter: any = undefined;

    try {
      if (!includeRemoved) {
        // Handle null status values properly - most pages have null status
        filter = {
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
    } catch (filterError) {
      console.warn(
        "⚠️  Could not create filter, fetching all pages...",
        filterError.message
      );
      filter = undefined; // Fallback to no filter
    }

    // Fetch all pages with error recovery
    let response;
    try {
      response = await enhancedNotion.databasesQuery({
        database_id: DATABASE_ID,
        filter: filter,
        page_size: 100,
      });
    } catch (queryError) {
      // If filtering fails, try without any filter
      if (filter) {
        console.warn("⚠️  Filter failed, trying without filter...");
        try {
          response = await enhancedNotion.databasesQuery({
            database_id: DATABASE_ID,
            page_size: 100,
          });
        } catch (fallbackError) {
          console.error("❌ Failed to fetch pages even without filter");
          throw fallbackError;
        }
      } else {
        console.error("❌ Query failed without filter");
        throw new Error("Query failed: Unable to fetch pages from Notion");
      }
    }

    let allPages = response?.results || [];

    // Handle pagination
    let hasMore = response?.has_more || false;
    let nextCursor = response?.next_cursor;

    while (hasMore && nextCursor) {
      const nextResponse = await enhancedNotion.databasesQuery({
        database_id: DATABASE_ID,
        filter: filter,
        start_cursor: nextCursor,
        page_size: 100,
      });

      allPages = allPages.concat(nextResponse.results);
      hasMore = nextResponse.has_more;
      nextCursor = nextResponse.next_cursor;
    }

    console.log(`📥 Fetched ${allPages.length} total pages from Notion`);

    // Transform to structured format
    const structuredPages: PageWithStatus[] = allPages.map((page) =>
      transformPage(page)
    );

    // Include sub-pages if requested
    if (includeSubPages) {
      const subPagePromises = structuredPages
        .filter((page) => page.subItems.length > 0)
        .flatMap((page) =>
          page.subItems.map(async (subPageId) => {
            try {
              const subPage = await enhancedNotion.pagesRetrieve({
                page_id: subPageId,
              });
              return transformPage(subPage);
            } catch (error) {
              console.warn(
                `Failed to fetch sub-page ${subPageId}:`,
                error.message
              );
              return null;
            }
          })
        );

      const subPages = (await Promise.allSettled(subPagePromises))
        .filter(
          (result): result is PromiseFulfilledResult<PageWithStatus> =>
            result.status === "fulfilled" && result.value !== null
        )
        .map((result) => result.value);

      structuredPages.push(...subPages);
      console.log(`📈 After sub-pages: ${structuredPages.length} total pages`);
    }

    // Sort pages
    const sortedPages = sortPages(structuredPages, sortBy, sortDirection);

    // Log each page with its status for visibility
    console.log("\n📋 Page Inventory:");
    const statusCounts = new Map<string, number>();

    sortedPages.forEach((page, index) => {
      const count = statusCounts.get(page.status) || 0;
      statusCounts.set(page.status, count + 1);

      if (index < 10 || page.status !== "Ready to publish") {
        // Show first 10 or non-published
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

    return sortedPages;
  } catch (error) {
    console.error("❌ Error fetching all pages:", error);
    throw error;
  }
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
