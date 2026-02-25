import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installTestNotionEnv,
  createMockNotionPage,
  captureConsoleOutput,
} from "../test-utils";
import {
  fetchAllNotionData,
  groupPagesByStatus,
  groupPagesByElementType,
  buildPageHierarchy,
  filterPages,
  buildStatusFilter,
  type PageWithStatus,
} from "./fetchAll";

// Mock sharp to avoid installation issues
vi.mock("sharp", () => {
  const createPipeline = () => {
    const pipeline: any = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      png: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from("")),
      toFile: vi.fn(async () => ({ size: 1000 })),
      metadata: vi.fn(async () => ({
        width: 100,
        height: 100,
        format: "jpeg",
      })),
    };
    return pipeline;
  };
  return {
    default: vi.fn(() => createPipeline()),
  };
});

// Mock notionClient to avoid environment variable requirements
vi.mock("../notionClient", () => ({
  enhancedNotion: {
    blocksChildrenList: vi.fn(),
  },
}));

// Mock dependencies
vi.mock("../notion-fetch/runFetch", () => ({
  runFetchPipeline: vi.fn(),
}));

vi.mock("../notionPageUtils", () => ({
  getStatusFromRawPage: vi.fn((page: any) => {
    return page?.properties?.["Publish Status"]?.select?.name || "No Status";
  }),
  resolveChildrenByStatus: vi.fn((pages: any[], statusFilter: string) => {
    const parentPages = pages.filter(
      (page) =>
        page?.properties?.["Publish Status"]?.select?.name === statusFilter
    );

    if (parentPages.length === 0) {
      return [];
    }

    const childIds = new Set<string>();
    for (const parent of parentPages) {
      const relations = parent?.properties?.["Sub-item"]?.relation;
      if (!Array.isArray(relations)) continue;
      for (const relation of relations) {
        if (typeof relation?.id === "string" && relation.id.length > 0) {
          childIds.add(relation.id);
        }
      }
    }

    if (childIds.size > 0) {
      const resolvedChildren = pages.filter((page) =>
        childIds.has(page?.id as string)
      );
      if (resolvedChildren.length > 0) {
        return resolvedChildren;
      }
    }

    return parentPages;
  }),
  selectPagesWithPriority: vi.fn((pages, maxPages) => pages.slice(0, maxPages)),
}));

describe("fetchAll - Core Functions", () => {
  let restoreEnv: () => void;
  let consoleCapture: ReturnType<typeof captureConsoleOutput>;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    consoleCapture = captureConsoleOutput();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    consoleCapture.restore();
    vi.restoreAllMocks();
  });

  describe("fetchAllNotionData", () => {
    it("should fetch and transform pages successfully", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({ title: "Page 1", status: "Ready to publish" }),
        createMockNotionPage({ title: "Page 2", status: "Draft" }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
        metrics: {
          totalSaved: 1024,
          sectionCount: 2,
          titleSectionCount: 1,
          emojiCount: 0,
        },
      });

      const result = await fetchAllNotionData({
        includeRemoved: false,
        exportFiles: true,
      });

      expect(result.pages).toHaveLength(2);
      expect(result.processedCount).toBe(2);
      expect(result.metrics).toBeDefined();
    });

    it("should exclude removed pages by default", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({ title: "Page 1", status: "Ready to publish" }),
        createMockNotionPage({ title: "Page 2", status: "Remove" }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        includeRemoved: false,
      });

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].title).toBe("Page 1");
    });

    it("should include removed pages when specified", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({ title: "Page 1", status: "Ready to publish" }),
        createMockNotionPage({ title: "Page 2", status: "Remove" }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        includeRemoved: true,
      });

      expect(result.pages).toHaveLength(2);
    });

    it("should filter by status when statusFilter is provided", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({
          id: "parent-1",
          title: "Parent 1",
          status: "Ready to publish",
          order: 1,
          subItems: ["child-1"],
        }),
        createMockNotionPage({
          id: "draft-1",
          title: "Draft Page",
          status: "Draft",
          order: 2,
        }),
        createMockNotionPage({
          id: "parent-2",
          title: "Parent 2",
          status: "Ready to publish",
          order: 3,
          subItems: ["child-3"],
        }),
      ];

      vi.mocked(runFetchPipeline).mockImplementation(async (options: any) => {
        const filteredByApi = mockPages.filter(
          (page) =>
            page.properties?.["Publish Status"]?.select?.name ===
            options?.filter?.select?.equals
        );
        const transformed = options.transform(filteredByApi);
        return { data: transformed };
      });

      const result = await fetchAllNotionData({
        statusFilter: "Ready to publish",
      });

      expect(result.processedCount).toBe(2);
      expect(result.pages.map((page) => page.id)).toEqual([
        "parent-1",
        "parent-2",
      ]);
      expect(result.candidateIds).toEqual(["parent-1", "parent-2"]);
    });

    it("should preserve parent candidateIds when statusFilter resolves to child pages", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");

      const mockPages = [
        createMockNotionPage({
          id: "parent-1",
          title: "Parent 1",
          status: "Ready to publish",
          subItems: ["child-1"],
        }),
        createMockNotionPage({
          id: "parent-2",
          title: "Parent 2",
          status: "Ready to publish",
          subItems: ["child-2"],
        }),
        createMockNotionPage({
          id: "child-1",
          title: "Child 1",
          status: "Draft",
        }),
        createMockNotionPage({
          id: "child-2",
          title: "Child 2",
          status: "Draft",
        }),
      ];

      vi.mocked(runFetchPipeline).mockImplementation(async (options: any) => {
        const transformed = options.transform(mockPages);
        return { data: transformed };
      });

      const result = await fetchAllNotionData({
        statusFilter: "Ready to publish",
      });

      expect(result.pages.map((page) => page.id)).toEqual([
        "child-1",
        "child-2",
      ]);
      expect(result.candidateIds).toEqual(["parent-1", "parent-2"]);
      expect(result.processedCount).toBe(2);
    });

    it("should limit pages when maxPages is specified", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const { selectPagesWithPriority } = await import("../notionPageUtils");

      const mockPages = Array.from({ length: 20 }, (_, i) =>
        createMockNotionPage({ title: `Page ${i + 1}`, order: i + 1 })
      );

      // Update mock to properly limit pages
      vi.mocked(selectPagesWithPriority).mockImplementation(
        (pages, maxPages) => {
          return pages.slice(0, maxPages);
        }
      );

      vi.mocked(runFetchPipeline).mockImplementation(async (options: any) => {
        const transformed = options.transform(mockPages);
        return { data: transformed };
      });

      const result = await fetchAllNotionData({
        maxPages: 5,
      });

      expect(selectPagesWithPriority).toHaveBeenCalledTimes(1);
      expect(result.pages).toHaveLength(5);
      expect(result.processedCount).toBe(5);
      expect(result.pages.map((page) => page.title)).toEqual([
        "Page 1",
        "Page 2",
        "Page 3",
        "Page 4",
        "Page 5",
      ]);
    });

    it("should sort pages by order (ascending)", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({ title: "Page 3", order: 3 }),
        createMockNotionPage({ title: "Page 1", order: 1 }),
        createMockNotionPage({ title: "Page 2", order: 2 }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        sortBy: "order",
        sortDirection: "asc",
      });

      expect(result.pages[0].order).toBe(1);
      expect(result.pages[1].order).toBe(2);
      expect(result.pages[2].order).toBe(3);
    });

    it("should sort pages by order (descending)", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({ title: "Page 1", order: 1 }),
        createMockNotionPage({ title: "Page 3", order: 3 }),
        createMockNotionPage({ title: "Page 2", order: 2 }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        sortBy: "order",
        sortDirection: "desc",
      });

      expect(result.pages[0].order).toBe(3);
      expect(result.pages[1].order).toBe(2);
      expect(result.pages[2].order).toBe(1);
    });

    it("should sort pages by title", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({ title: "Charlie" }),
        createMockNotionPage({ title: "Alpha" }),
        createMockNotionPage({ title: "Bravo" }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        sortBy: "title",
        sortDirection: "asc",
      });

      expect(result.pages[0].title).toBe("Alpha");
      expect(result.pages[1].title).toBe("Bravo");
      expect(result.pages[2].title).toBe("Charlie");
    });

    it("should sort pages by created time", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({
          title: "Newest",
          createdTime: "2024-01-03T00:00:00Z",
        }),
        createMockNotionPage({
          title: "Oldest",
          createdTime: "2024-01-01T00:00:00Z",
        }),
        createMockNotionPage({
          title: "Middle",
          createdTime: "2024-01-02T00:00:00Z",
        }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        sortBy: "created",
        sortDirection: "asc",
      });

      expect(result.pages[0].title).toBe("Oldest");
      expect(result.pages[2].title).toBe("Newest");
    });

    it("should sort pages by modified time", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        createMockNotionPage({
          title: "Recently Modified",
          lastEdited: "2024-01-03T00:00:00Z",
        }),
        createMockNotionPage({
          title: "Not Modified",
          lastEdited: "2024-01-01T00:00:00Z",
        }),
        createMockNotionPage({
          title: "Modified Yesterday",
          lastEdited: "2024-01-02T00:00:00Z",
        }),
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        sortBy: "modified",
        sortDirection: "asc",
      });

      expect(result.pages[0].title).toBe("Not Modified");
      expect(result.pages[2].title).toBe("Recently Modified");
    });

    it("should handle empty results gracefully", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: [],
      });

      const result = await fetchAllNotionData({});

      expect(result.pages).toHaveLength(0);
      expect(result.fetchedCount).toBe(0);
      expect(result.processedCount).toBe(0);
    });

    it("should handle pages with missing properties gracefully", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        {
          id: "test-page-1",
          url: "https://notion.so/test",
          last_edited_time: new Date().toISOString(),
          created_time: new Date().toISOString(),
          properties: {}, // Empty properties
        },
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({});

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].title).toBe("Untitled");
      expect(result.pages[0].status).toBe("No Status");
      expect(result.pages[0].elementType).toBe("Unknown");
    });

    it("should handle null property values", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [
        {
          id: "test-page-1",
          url: "https://notion.so/test",
          last_edited_time: new Date().toISOString(),
          created_time: new Date().toISOString(),
          properties: {
            "Content elements": {
              title: [{ plain_text: "Test Page" }],
            },
            "Publish Status": {
              select: null, // Explicitly null
            },
            "Element Type": {
              select: null, // Explicitly null
            },
            Order: {
              number: 0,
            },
          },
        },
      ];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({});

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].status).toBe("No Status");
      expect(result.pages[0].elementType).toBe("Unknown");
    });

    it("should skip generation when exportFiles is false", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = [createMockNotionPage({ title: "Page 1" })];

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const result = await fetchAllNotionData({
        exportFiles: false,
      });

      expect(result.pages).toHaveLength(1);
      expect(result.metrics).toBeUndefined();
    });

    it("should call progress logger during processing", async () => {
      const { runFetchPipeline } = await import("../notion-fetch/runFetch");
      const mockPages = Array.from({ length: 5 }, (_, i) =>
        createMockNotionPage({ title: `Page ${i + 1}` })
      );

      vi.mocked(runFetchPipeline).mockResolvedValue({
        data: mockPages,
      });

      const progressCalls: Array<{ current: number; total: number }> = [];
      const progressLogger = (progress: { current: number; total: number }) => {
        progressCalls.push(progress);
      };

      await fetchAllNotionData({
        progressLogger,
        exportFiles: true,
      });

      expect(runFetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          onProgress: progressLogger,
        })
      );
    });
  });

  describe("groupPagesByStatus", () => {
    it("should group pages by status correctly", () => {
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({
          title: "Page 1",
          status: "Ready to publish",
        }),
        createMockPageWithStatus({ title: "Page 2", status: "Draft" }),
        createMockPageWithStatus({
          title: "Page 3",
          status: "Ready to publish",
        }),
        createMockPageWithStatus({ title: "Page 4", status: "In progress" }),
      ];

      const grouped = groupPagesByStatus(pages);

      expect(grouped.size).toBe(3);
      expect(grouped.get("Ready to publish")).toHaveLength(2);
      expect(grouped.get("Draft")).toHaveLength(1);
      expect(grouped.get("In progress")).toHaveLength(1);
    });

    it("should handle pages with no status", () => {
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({ title: "Page 1", status: "No Status" }),
        createMockPageWithStatus({
          title: "Page 2",
          status: "Ready to publish",
        }),
      ];

      const grouped = groupPagesByStatus(pages);

      expect(grouped.has("No Status")).toBe(true);
      expect(grouped.get("No Status")).toHaveLength(1);
    });

    it("should handle empty array", () => {
      const grouped = groupPagesByStatus([]);
      expect(grouped.size).toBe(0);
    });
  });

  describe("groupPagesByElementType", () => {
    it("should group pages by element type correctly", () => {
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({ title: "Page 1", elementType: "Page" }),
        createMockPageWithStatus({
          title: "Section 1",
          elementType: "Section",
        }),
        createMockPageWithStatus({ title: "Page 2", elementType: "Page" }),
        createMockPageWithStatus({ title: "Toggle 1", elementType: "Toggle" }),
      ];

      const grouped = groupPagesByElementType(pages);

      expect(grouped.size).toBe(3);
      expect(grouped.get("Page")).toHaveLength(2);
      expect(grouped.get("Section")).toHaveLength(1);
      expect(grouped.get("Toggle")).toHaveLength(1);
    });

    it("should handle unknown element types", () => {
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({ title: "Page 1", elementType: "Unknown" }),
      ];

      const grouped = groupPagesByElementType(pages);

      expect(grouped.has("Unknown")).toBe(true);
      expect(grouped.get("Unknown")).toHaveLength(1);
    });
  });

  describe("buildPageHierarchy", () => {
    it("should build correct parent-child hierarchy", () => {
      const parentId = "parent-123";
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({ id: parentId, title: "Parent" }),
        createMockPageWithStatus({
          id: "child-1",
          title: "Child 1",
          parentItem: parentId,
        }),
        createMockPageWithStatus({
          id: "child-2",
          title: "Child 2",
          parentItem: parentId,
        }),
      ];

      const hierarchy = buildPageHierarchy(pages);

      expect(hierarchy.topLevel).toHaveLength(1);
      expect(hierarchy.topLevel[0].title).toBe("Parent");
      expect(hierarchy.children.get(parentId)).toHaveLength(2);
    });

    it("should handle multiple top-level pages", () => {
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({ id: "top-1", title: "Top 1" }),
        createMockPageWithStatus({ id: "top-2", title: "Top 2" }),
        createMockPageWithStatus({ id: "top-3", title: "Top 3" }),
      ];

      const hierarchy = buildPageHierarchy(pages);

      expect(hierarchy.topLevel).toHaveLength(3);
      expect(hierarchy.children.size).toBe(0);
    });

    it("should handle nested hierarchies (grandchildren)", () => {
      const parentId = "parent-123";
      const childId = "child-456";

      const pages: PageWithStatus[] = [
        createMockPageWithStatus({ id: parentId, title: "Parent" }),
        createMockPageWithStatus({
          id: childId,
          title: "Child",
          parentItem: parentId,
        }),
        createMockPageWithStatus({
          id: "grandchild-789",
          title: "Grandchild",
          parentItem: childId,
        }),
      ];

      const hierarchy = buildPageHierarchy(pages);

      expect(hierarchy.topLevel).toHaveLength(1);
      expect(hierarchy.children.get(parentId)).toHaveLength(1);
      expect(hierarchy.children.get(childId)).toHaveLength(1);
    });

    it("should handle orphaned pages (parent doesn't exist)", () => {
      const pages: PageWithStatus[] = [
        createMockPageWithStatus({
          id: "orphan-1",
          title: "Orphan",
          parentItem: "non-existent-parent",
        }),
      ];

      const hierarchy = buildPageHierarchy(pages);

      expect(hierarchy.topLevel).toHaveLength(0);
      expect(hierarchy.children.get("non-existent-parent")).toHaveLength(1);
    });

    it("should handle empty array", () => {
      const hierarchy = buildPageHierarchy([]);

      expect(hierarchy.topLevel).toHaveLength(0);
      expect(hierarchy.children.size).toBe(0);
    });
  });

  describe("filterPages", () => {
    const testPages: PageWithStatus[] = [
      createMockPageWithStatus({
        id: "1",
        title: "Page 1",
        status: "Ready to publish",
        elementType: "Page",
        language: "English",
        subItems: [],
        lastEdited: new Date("2024-01-15"),
      }),
      createMockPageWithStatus({
        id: "2",
        title: "Page 2",
        status: "Draft",
        elementType: "Section",
        language: "Spanish",
        subItems: ["child-1"],
        lastEdited: new Date("2024-01-10"),
      }),
      createMockPageWithStatus({
        id: "3",
        title: "Page 3",
        status: "Ready to publish",
        elementType: "Page",
        language: "Portuguese",
        subItems: [],
        parentItem: "2",
        lastEdited: new Date("2024-01-20"),
      }),
    ];

    it("should filter by status", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Ready to publish"],
      });

      expect(filtered).toHaveLength(2);
      filtered.forEach((page) => {
        expect(page.status).toBe("Ready to publish");
      });
    });

    it("should filter by multiple statuses", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Ready to publish", "Draft"],
      });

      expect(filtered).toHaveLength(3);
    });

    it("should filter by element type", () => {
      const filtered = filterPages(testPages, {
        elementTypes: ["Page"],
      });

      expect(filtered).toHaveLength(2);
      filtered.forEach((page) => {
        expect(page.elementType).toBe("Page");
      });
    });

    it("should filter by language", () => {
      const filtered = filterPages(testPages, {
        languages: ["Spanish"],
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].language).toBe("Spanish");
    });

    it("should filter by hasSubItems", () => {
      const withSubItems = filterPages(testPages, {
        hasSubItems: true,
      });

      expect(withSubItems).toHaveLength(1);
      expect(withSubItems[0].subItems.length).toBeGreaterThan(0);

      const withoutSubItems = filterPages(testPages, {
        hasSubItems: false,
      });

      expect(withoutSubItems).toHaveLength(2);
    });

    it("should filter by isTopLevel", () => {
      const topLevel = filterPages(testPages, {
        isTopLevel: true,
      });

      expect(topLevel).toHaveLength(2);
      topLevel.forEach((page) => {
        expect(page.parentItem).toBeUndefined();
      });

      const children = filterPages(testPages, {
        isTopLevel: false,
      });

      expect(children).toHaveLength(1);
      expect(children[0].parentItem).toBeDefined();
    });

    it("should filter by modifiedAfter date", () => {
      const filtered = filterPages(testPages, {
        modifiedAfter: new Date("2024-01-12"),
      });

      expect(filtered).toHaveLength(2);
    });

    it("should filter by modifiedBefore date", () => {
      const filtered = filterPages(testPages, {
        modifiedBefore: new Date("2024-01-12"),
      });

      expect(filtered).toHaveLength(1);
    });

    it("should combine multiple filters", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Ready to publish"],
        elementTypes: ["Page"],
        isTopLevel: true,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should return empty array when no pages match", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Non-existent Status"],
      });

      expect(filtered).toHaveLength(0);
    });

    it("should return all pages when no filters applied", () => {
      const filtered = filterPages(testPages, {});

      expect(filtered).toHaveLength(3);
    });
  });
});

describe("resolveChildrenByStatus", () => {
  it("should fall back to matching parents when children are referenced but not fetched", async () => {
    const { resolveChildrenByStatus } =
      await vi.importActual<typeof import("../notionPageUtils")>(
        "../notionPageUtils"
      );

    const pages = [
      createMockNotionPage({ id: "draft-1", title: "Draft", status: "Draft" }),
      createMockNotionPage({
        id: "parent-b",
        title: "Parent B",
        status: "Ready to publish",
        subItems: ["missing-child-b"],
      }),
      createMockNotionPage({
        id: "parent-a",
        title: "Parent A",
        status: "Ready to publish",
        subItems: ["missing-child-a"],
      }),
    ];

    const resolved = resolveChildrenByStatus(pages, "Ready to publish");

    expect(resolved.map((page: any) => page.id)).toEqual([
      "parent-b",
      "parent-a",
    ]);
  });

  it("should return resolved children when children exist in fetched pages", async () => {
    const { resolveChildrenByStatus } =
      await vi.importActual<typeof import("../notionPageUtils")>(
        "../notionPageUtils"
      );

    const pages = [
      createMockNotionPage({
        id: "parent-1",
        title: "Parent",
        status: "Ready to publish",
        subItems: ["child-1", "child-2"],
      }),
      createMockNotionPage({
        id: "child-1",
        title: "Child 1",
        status: "Draft",
      }),
      createMockNotionPage({
        id: "child-2",
        title: "Child 2",
        status: "Draft",
      }),
      createMockNotionPage({
        id: "unrelated-1",
        title: "Other",
        status: "Draft",
      }),
    ];

    const resolved = resolveChildrenByStatus(pages, "Ready to publish");

    expect(resolved.map((page: any) => page.id)).toEqual([
      "child-1",
      "child-2",
    ]);
  });
});

describe("buildStatusFilter", () => {
  it("should return undefined when includeRemoved is true", () => {
    const filter = buildStatusFilter(true);
    expect(filter).toBeUndefined();
  });

  it("should return a filter object when includeRemoved is false", () => {
    const filter = buildStatusFilter(false);
    expect(filter).toBeDefined();
    expect(filter).toHaveProperty("or");
    expect(filter.or).toBeInstanceOf(Array);
    expect(filter.or).toHaveLength(2);
  });

  it("should create correct filter structure for excluding removed items", () => {
    const filter = buildStatusFilter(false);

    expect(filter).toEqual({
      or: [
        {
          property: "Publish Status",
          select: { is_empty: true },
        },
        {
          property: "Publish Status",
          select: { does_not_equal: "Remove" },
        },
      ],
    });
  });

  it("should match Notion API filter query format", () => {
    const filter = buildStatusFilter(false);

    // Verify the structure matches Notion's compound filter format
    expect(filter).toMatchObject({
      or: expect.arrayContaining([
        expect.objectContaining({
          property: expect.any(String),
          select: expect.any(Object),
        }),
      ]),
    });

    // Verify first condition checks for empty status
    expect(filter.or[0]).toEqual({
      property: "Publish Status",
      select: { is_empty: true },
    });

    // Verify second condition excludes "Remove" status
    expect(filter.or[1]).toEqual({
      property: "Publish Status",
      select: { does_not_equal: "Remove" },
    });
  });

  it("should return a targeted equals filter when statusFilter is provided", () => {
    const filter = buildStatusFilter(false, "Ready to publish");

    expect(filter).toEqual({
      property: "Publish Status",
      select: { equals: "Ready to publish" },
    });
  });

  it("should use the targeted filter for any statusFilter value", () => {
    const filter = buildStatusFilter(false, "Draft");

    expect(filter).toEqual({
      property: "Publish Status",
      select: { equals: "Draft" },
    });
  });

  it("should return undefined when includeRemoved is true even with statusFilter", () => {
    const filter = buildStatusFilter(true, "Ready to publish");
    expect(filter).toBeUndefined();
  });
});

// Helper function to create mock PageWithStatus
function createMockPageWithStatus(
  options: Partial<PageWithStatus> = {}
): PageWithStatus {
  return {
    id: options.id || "page-" + Math.random().toString(36).substr(2, 9),
    url:
      options.url ||
      `https://notion.so/${(options.id || "test").replace(/-/g, "")}`,
    title: options.title || "Test Page",
    status: options.status || "Ready to publish",
    elementType: options.elementType || "Page",
    order: options.order ?? 0,
    language: options.language,
    parentItem: options.parentItem,
    subItems: options.subItems || [],
    lastEdited: options.lastEdited || new Date(),
    createdTime: options.createdTime || new Date(),
    properties: options.properties || {},
    rawPage: options.rawPage || {},
  };
}
