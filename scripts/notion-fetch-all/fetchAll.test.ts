import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAllNotionData,
  groupPagesByStatus,
  groupPagesByElementType,
  buildPageHierarchy,
  filterPages,
} from "./fetchAll.js";
import { enhancedNotion } from "../notionClient.js";

// Mock the notionClient
vi.mock("../notionClient.js", () => ({
  DATABASE_ID: "test-database-id",
  enhancedNotion: {
    databasesQuery: vi.fn(),
    pagesRetrieve: vi.fn(),
  },
}));

describe("fetchAll", () => {
  const mockNotionPages = [
    {
      id: "page1",
      url: "https://notion.so/page1",
      last_edited_time: "2024-01-15T10:00:00.000Z",
      created_time: "2024-01-01T10:00:00.000Z",
      properties: {
        "Content elements": {
          title: [{ plain_text: "Getting Started" }],
        },
        Status: {
          select: { name: "Ready to publish" },
        },
        "Element Type": {
          select: { name: "Page" },
        },
        Order: {
          number: 1,
        },
        Language: {
          select: { name: "English" },
        },
        "Parent item": {
          relation: [],
        },
        "Sub-item": {
          relation: [{ id: "subpage1" }],
        },
      },
    },
    {
      id: "page2",
      url: "https://notion.so/page2",
      last_edited_time: "2024-01-10T10:00:00.000Z",
      created_time: "2024-01-02T10:00:00.000Z",
      properties: {
        "Content elements": {
          title: [{ plain_text: "API Documentation" }],
        },
        Status: {
          select: { name: "Draft" },
        },
        "Element Type": {
          select: { name: "Section" },
        },
        Order: {
          number: 2,
        },
        "Parent item": {
          relation: [{ id: "page1" }],
        },
        "Sub-item": {
          relation: [],
        },
      },
    },
  ];

  const mockSubPage = {
    id: "subpage1",
    url: "https://notion.so/subpage1",
    last_edited_time: "2024-01-12T10:00:00.000Z",
    created_time: "2024-01-03T10:00:00.000Z",
    properties: {
      "Content elements": {
        title: [{ plain_text: "Quick Start" }],
      },
      Status: {
        select: { name: "Ready to publish" },
      },
      "Element Type": {
        select: { name: "Page" },
      },
      Order: {
        number: 1,
      },
      Language: {
        select: { name: "Spanish" },
      },
      "Parent item": {
        relation: [{ id: "page1" }],
      },
      "Sub-item": {
        relation: [],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock console methods
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("fetchAllNotionData", () => {
    it("should fetch all pages excluding removed items by default", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue(mockSubPage);

      const pages = await fetchAllNotionData();

      expect(enhancedNotion.databasesQuery).toHaveBeenCalledWith({
        database_id: expect.any(String),
        filter: {
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
        },
        page_size: 100,
      });

      expect(pages).toHaveLength(3); // 2 main pages + 1 sub-page
      expect(pages[0].title).toBe("Getting Started");
      expect(pages[0].status).toBe("Ready to publish");
      expect(pages[0].elementType).toBe("Page");
    });

    it("should handle pagination correctly", async () => {
      vi.mocked(enhancedNotion.databasesQuery)
        .mockResolvedValueOnce({
          results: [mockNotionPages[0]],
          has_more: true,
          next_cursor: "cursor123",
        })
        .mockResolvedValueOnce({
          results: [mockNotionPages[1]],
          has_more: false,
          next_cursor: null,
        });

      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue(mockSubPage);

      const pages = await fetchAllNotionData();

      expect(enhancedNotion.databasesQuery).toHaveBeenCalledTimes(2);
      expect(enhancedNotion.databasesQuery).toHaveBeenNthCalledWith(2, {
        database_id: expect.any(String),
        filter: {
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
        },
        start_cursor: "cursor123",
        page_size: 100,
      });

      expect(pages).toHaveLength(3);
    });

    it("should include removed pages when includeRemoved is true", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      await fetchAllNotionData({ includeRemoved: true });

      expect(enhancedNotion.databasesQuery).toHaveBeenCalledWith({
        database_id: expect.any(String),
        filter: undefined,
        page_size: 100,
      });
    });


    it("should exclude removed pages by default", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      await fetchAllNotionData();

      expect(enhancedNotion.databasesQuery).toHaveBeenCalledWith({
        database_id: expect.any(String),
        filter: {
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
        },
        page_size: 100,
      });
    });

    it("should include sub-pages when includeSubPages is true", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue(mockSubPage);

      const pages = await fetchAllNotionData({ includeSubPages: true });

      expect(enhancedNotion.pagesRetrieve).toHaveBeenCalledWith({
        page_id: "subpage1",
      });

      expect(pages).toHaveLength(3);
      expect(pages.some((p) => p.id === "subpage1")).toBe(true);
    });

    it("should skip sub-pages when includeSubPages is false", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      const pages = await fetchAllNotionData({ includeSubPages: false });

      expect(enhancedNotion.pagesRetrieve).not.toHaveBeenCalled();
      expect(pages).toHaveLength(2);
    });

    it("should handle sub-page fetch errors gracefully", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      vi.mocked(enhancedNotion.pagesRetrieve).mockRejectedValue(
        new Error("Sub-page not found")
      );

      const pages = await fetchAllNotionData({ includeSubPages: true });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch sub-page subpage1"),
        expect.any(String)
      );

      expect(pages).toHaveLength(2); // Only main pages
    });

    it("should sort pages correctly", async () => {
      const unsortedPages = [
        {
          ...mockNotionPages[1],
          properties: {
            ...mockNotionPages[1].properties,
            Order: { number: 3 },
          },
        },
        {
          ...mockNotionPages[0],
          properties: {
            ...mockNotionPages[0].properties,
            Order: { number: 1 },
          },
        },
      ];

      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: unsortedPages,
        has_more: false,
        next_cursor: null,
      });

      const pages = await fetchAllNotionData({
        sortBy: "order",
        sortDirection: "asc",
        includeSubPages: false,
      });

      expect(pages[0].order).toBe(1);
      expect(pages[1].order).toBe(3);
    });

    it("should sort by title when specified", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: mockNotionPages,
        has_more: false,
        next_cursor: null,
      });

      const pages = await fetchAllNotionData({
        sortBy: "title",
        sortDirection: "asc",
        includeSubPages: false,
      });

      expect(pages[0].title).toBe("API Documentation");
      expect(pages[1].title).toBe("Getting Started");
    });

    it("should handle missing properties gracefully", async () => {
      const pageWithMissingProps = {
        id: "page3",
        url: "https://notion.so/page3",
        last_edited_time: "2024-01-10T10:00:00.000Z",
        created_time: "2024-01-02T10:00:00.000Z",
        properties: {},
      };

      vi.mocked(enhancedNotion.databasesQuery).mockResolvedValue({
        results: [pageWithMissingProps],
        has_more: false,
        next_cursor: null,
      });

      const pages = await fetchAllNotionData({ includeSubPages: false });

      expect(pages).toHaveLength(1);
      expect(pages[0].title).toBe("Untitled");
      expect(pages[0].status).toBe("No Status");
      expect(pages[0].elementType).toBe("Unknown");
      expect(pages[0].order).toBe(0);
    });

    it("should handle API errors", async () => {
      vi.mocked(enhancedNotion.databasesQuery).mockRejectedValue(
        new Error("API Error")
      );

      await expect(fetchAllNotionData()).rejects.toThrow("API Error");
    });
  });

  describe("groupPagesByStatus", () => {
    const testPages = [
      { status: "Ready to publish", title: "Page 1" },
      { status: "Draft", title: "Page 2" },
      { status: "Ready to publish", title: "Page 3" },
      { status: "No Status", title: "Page 4" },
    ] as any;

    it("should group pages by status correctly", () => {
      const groups = groupPagesByStatus(testPages);

      expect(groups.size).toBe(3);
      expect(groups.get("Ready to publish")).toHaveLength(2);
      expect(groups.get("Draft")).toHaveLength(1);
      expect(groups.get("No Status")).toHaveLength(1);
    });

    it("should handle pages without status", () => {
      const pagesWithoutStatus = [
        { title: "Page 1" },
        { status: null, title: "Page 2" },
      ] as any;

      const groups = groupPagesByStatus(pagesWithoutStatus);

      expect(groups.get("No Status")).toHaveLength(2);
    });
  });

  describe("groupPagesByElementType", () => {
    const testPages = [
      { elementType: "Page", title: "Page 1" },
      { elementType: "Section", title: "Section 1" },
      { elementType: "Page", title: "Page 2" },
      { elementType: "Unknown", title: "Unknown 1" },
    ] as any;

    it("should group pages by element type correctly", () => {
      const groups = groupPagesByElementType(testPages);

      expect(groups.size).toBe(3);
      expect(groups.get("Page")).toHaveLength(2);
      expect(groups.get("Section")).toHaveLength(1);
      expect(groups.get("Unknown")).toHaveLength(1);
    });
  });

  describe("buildPageHierarchy", () => {
    const testPages = [
      { id: "parent1", title: "Parent 1", parentItem: undefined },
      { id: "child1", title: "Child 1", parentItem: "parent1" },
      { id: "child2", title: "Child 2", parentItem: "parent1" },
      { id: "parent2", title: "Parent 2", parentItem: undefined },
    ] as any;

    it("should build hierarchy correctly", () => {
      const hierarchy = buildPageHierarchy(testPages);

      expect(hierarchy.topLevel).toHaveLength(2);
      expect(hierarchy.children.size).toBe(1);
      expect(hierarchy.children.get("parent1")).toHaveLength(2);
    });

    it("should handle orphaned pages", () => {
      const pagesWithOrphans = [
        { id: "orphan1", title: "Orphan 1", parentItem: "nonexistent" },
        { id: "parent1", title: "Parent 1", parentItem: undefined },
      ] as any;

      const hierarchy = buildPageHierarchy(pagesWithOrphans);

      expect(hierarchy.topLevel).toHaveLength(1);
      expect(hierarchy.children.get("nonexistent")).toHaveLength(1);
    });
  });

  describe("filterPages", () => {
    const testPages = [
      {
        id: "page1",
        status: "Ready to publish",
        elementType: "Page",
        language: "English",
        subItems: ["sub1"],
        parentItem: undefined,
        lastEdited: new Date("2024-01-15"),
      },
      {
        id: "page2",
        status: "Draft",
        elementType: "Section",
        language: "Spanish",
        subItems: [],
        parentItem: "page1",
        lastEdited: new Date("2024-01-01"),
      },
    ] as any;

    it("should filter by status", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Ready to publish"],
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe("Ready to publish");
    });

    it("should filter by element type", () => {
      const filtered = filterPages(testPages, {
        elementTypes: ["Section"],
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].elementType).toBe("Section");
    });

    it("should filter by language", () => {
      const filtered = filterPages(testPages, {
        languages: ["Spanish"],
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].language).toBe("Spanish");
    });

    it("should filter by sub-items presence", () => {
      const withSubItems = filterPages(testPages, {
        hasSubItems: true,
      });

      const withoutSubItems = filterPages(testPages, {
        hasSubItems: false,
      });

      expect(withSubItems).toHaveLength(1);
      expect(withSubItems[0].subItems.length).toBeGreaterThan(0);
      expect(withoutSubItems).toHaveLength(1);
      expect(withoutSubItems[0].subItems.length).toBe(0);
    });

    it("should filter by top-level status", () => {
      const topLevel = filterPages(testPages, {
        isTopLevel: true,
      });

      const children = filterPages(testPages, {
        isTopLevel: false,
      });

      expect(topLevel).toHaveLength(1);
      expect(topLevel[0].parentItem).toBeUndefined();
      expect(children).toHaveLength(1);
      expect(children[0].parentItem).toBeDefined();
    });

    it("should filter by date range", () => {
      const recentPages = filterPages(testPages, {
        modifiedAfter: new Date("2024-01-10"),
      });

      const oldPages = filterPages(testPages, {
        modifiedBefore: new Date("2024-01-10"),
      });

      expect(recentPages).toHaveLength(1);
      expect(recentPages[0].lastEdited.getTime()).toBeGreaterThan(
        new Date("2024-01-10").getTime()
      );
      expect(oldPages).toHaveLength(1);
      expect(oldPages[0].lastEdited.getTime()).toBeLessThan(
        new Date("2024-01-10").getTime()
      );
    });

    it("should apply multiple filters", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Ready to publish", "Draft"],
        elementTypes: ["Page"],
        isTopLevel: true,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe("Ready to publish");
      expect(filtered[0].elementType).toBe("Page");
      expect(filtered[0].parentItem).toBeUndefined();
    });

    it("should return empty array when no pages match filters", () => {
      const filtered = filterPages(testPages, {
        statuses: ["Nonexistent Status"],
      });

      expect(filtered).toHaveLength(0);
    });
  });
});
