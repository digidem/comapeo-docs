import { describe, it, expect } from "vitest";
import {
  getStatusFromRawPage,
  getElementTypeFromRawPage,
  shouldIncludePage,
  filterPagesByStatus,
  filterPagesByElementType,
  selectPagesWithPriority,
} from "./notionPageUtils";

describe("notionPageUtils", () => {
  describe("getStatusFromRawPage", () => {
    it("should extract status from valid page", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "Ready to publish",
            },
          },
        },
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("Ready to publish");
    });

    it("should return 'No Status' for null page", () => {
      const status = getStatusFromRawPage(null as any);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for undefined page", () => {
      const status = getStatusFromRawPage(undefined as any);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for non-object page", () => {
      const status = getStatusFromRawPage("not an object" as any);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for page without properties", () => {
      const page = {};

      const status = getStatusFromRawPage(page);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for page with null properties", () => {
      const page = {
        properties: null,
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for page without Status property", () => {
      const page = {
        properties: {
          Title: { title: [{ plain_text: "Test" }] },
        },
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for page with empty select", () => {
      const page = {
        properties: {
          Status: {
            select: null,
          },
        },
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for page with empty status name", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "",
            },
          },
        },
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("No Status");
    });

    it("should return 'No Status' for page with whitespace-only status", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "   ",
            },
          },
        },
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("No Status");
    });

    it("should trim whitespace from status name", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "  Draft  ",
            },
          },
        },
      };

      const status = getStatusFromRawPage(page);

      expect(status).toBe("Draft");
    });

    it("should handle various status values", () => {
      const statuses = ["Draft", "Review", "Ready to publish", "Published", "Remove"];

      statuses.forEach((statusName) => {
        const page = {
          properties: {
            Status: {
              select: {
                name: statusName,
              },
            },
          },
        };

        const status = getStatusFromRawPage(page);

        expect(status).toBe(statusName);
      });
    });
  });

  describe("getElementTypeFromRawPage", () => {
    it("should extract element type from valid page", () => {
      const page = {
        properties: {
          "Element Type": {
            select: {
              name: "Page",
            },
          },
        },
      };

      const elementType = getElementTypeFromRawPage(page);

      expect(elementType).toBe("Page");
    });

    it("should return 'Unknown' for null page", () => {
      const elementType = getElementTypeFromRawPage(null as any);

      expect(elementType).toBe("Unknown");
    });

    it("should return 'Unknown' for undefined page", () => {
      const elementType = getElementTypeFromRawPage(undefined as any);

      expect(elementType).toBe("Unknown");
    });

    it("should return 'Unknown' for page without properties", () => {
      const page = {};

      const elementType = getElementTypeFromRawPage(page);

      expect(elementType).toBe("Unknown");
    });

    it("should return 'Unknown' for page with null properties", () => {
      const page = {
        properties: null,
      };

      const elementType = getElementTypeFromRawPage(page);

      expect(elementType).toBe("Unknown");
    });

    it("should handle 'Section' as fallback property name", () => {
      const page = {
        properties: {
          Section: {
            select: {
              name: "Heading",
            },
          },
        },
      };

      const elementType = getElementTypeFromRawPage(page);

      expect(elementType).toBe("Heading");
    });

    it("should return 'Unknown' for empty element type name", () => {
      const page = {
        properties: {
          "Element Type": {
            select: {
              name: "",
            },
          },
        },
      };

      const elementType = getElementTypeFromRawPage(page);

      expect(elementType).toBe("Unknown");
    });

    it("should trim whitespace from element type name", () => {
      const page = {
        properties: {
          "Element Type": {
            select: {
              name: "  Toggle  ",
            },
          },
        },
      };

      const elementType = getElementTypeFromRawPage(page);

      expect(elementType).toBe("Toggle");
    });

    it("should handle various element types", () => {
      const types = ["Page", "Toggle", "Heading", "Title", "Unknown"];

      types.forEach((typeName) => {
        const page = {
          properties: {
            "Element Type": {
              select: {
                name: typeName,
              },
            },
          },
        };

        const elementType = getElementTypeFromRawPage(page);

        expect(elementType).toBe(typeName);
      });
    });
  });

  describe("shouldIncludePage", () => {
    it("should include page with 'Ready to publish' status by default", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "Ready to publish",
            },
          },
        },
      };

      expect(shouldIncludePage(page)).toBe(true);
    });

    it("should exclude page with 'Remove' status by default", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "Remove",
            },
          },
        },
      };

      expect(shouldIncludePage(page)).toBe(false);
    });

    it("should include page with 'Remove' status when includeRemoved is true", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "Remove",
            },
          },
        },
      };

      expect(shouldIncludePage(page, true)).toBe(true);
    });

    it("should include page with 'Draft' status", () => {
      const page = {
        properties: {
          Status: {
            select: {
              name: "Draft",
            },
          },
        },
      };

      expect(shouldIncludePage(page)).toBe(true);
    });

    it("should include page with 'No Status'", () => {
      const page = {
        properties: {},
      };

      expect(shouldIncludePage(page)).toBe(true);
    });
  });

  describe("filterPagesByStatus", () => {
    it("should filter pages by status correctly", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Draft" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Ready to publish" } },
          },
        },
        {
          id: "3",
          properties: {
            Status: { select: { name: "Draft" } },
          },
        },
      ];

      const filtered = filterPagesByStatus(pages, "Draft");

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe("1");
      expect(filtered[1].id).toBe("3");
    });

    it("should return empty array when no pages match", () => {
      const pages = [
        {
          properties: {
            Status: { select: { name: "Draft" } },
          },
        },
      ];

      const filtered = filterPagesByStatus(pages, "Published");

      expect(filtered).toHaveLength(0);
    });

    it("should handle empty pages array", () => {
      const filtered = filterPagesByStatus([], "Draft");

      expect(filtered).toHaveLength(0);
    });
  });

  describe("filterPagesByElementType", () => {
    it("should filter pages by element type correctly", () => {
      const pages = [
        {
          id: "1",
          properties: {
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            "Element Type": { select: { name: "Toggle" } },
          },
        },
        {
          id: "3",
          properties: {
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const filtered = filterPagesByElementType(pages, "Page");

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe("1");
      expect(filtered[1].id).toBe("3");
    });

    it("should return empty array when no pages match", () => {
      const pages = [
        {
          properties: {
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const filtered = filterPagesByElementType(pages, "Toggle");

      expect(filtered).toHaveLength(0);
    });

    it("should handle empty pages array", () => {
      const filtered = filterPagesByElementType([], "Page");

      expect(filtered).toHaveLength(0);
    });
  });

  describe("selectPagesWithPriority", () => {
    it("should prioritize 'Ready to publish' + 'Page' type pages", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Draft" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "3",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Toggle" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 10, { verbose: false });

      // Page 2 should be first (Ready to publish + Page)
      expect(selected[0].id).toBe("2");
      // Page 1 should be second (Page type, not ready to publish)
      expect(selected[1].id).toBe("1");
      // Page 3 should be last (not Page type)
      expect(selected[2].id).toBe("3");
    });

    it("should limit results to maxPages", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "3",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 2, { verbose: false });

      expect(selected).toHaveLength(2);
      expect(selected[0].id).toBe("1");
      expect(selected[1].id).toBe("2");
    });

    it("should handle maxPages = 0", () => {
      const pages = [
        {
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 0, { verbose: false });

      expect(selected).toHaveLength(0);
    });

    it("should handle empty pages array", () => {
      const selected = selectPagesWithPriority([], 10, { verbose: false });

      expect(selected).toHaveLength(0);
    });

    it("should handle maxPages greater than available pages", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Draft" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 100, { verbose: false });

      expect(selected).toHaveLength(1);
    });

    it("should exclude 'Remove' status by default", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Remove" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 10, { verbose: false });

      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe("1");
    });

    it("should include 'Remove' status when includeRemoved is true", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Remove" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 10, {
        includeRemoved: true,
        verbose: false,
      });

      expect(selected).toHaveLength(2);
    });

    it("should filter by statusFilter when provided", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Draft" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 10, {
        statusFilter: "Draft",
        verbose: false,
      });

      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe("1");
    });

    it("should handle all pages being 'Ready to publish' + 'Page'", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Ready to publish" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 1, { verbose: false });

      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe("1");
    });

    it("should handle all pages being other types", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Draft" } },
            "Element Type": { select: { name: "Toggle" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Draft" } },
            "Element Type": { select: { name: "Heading" } },
          },
        },
      ];

      const selected = selectPagesWithPriority(pages, 10, { verbose: false });

      expect(selected).toHaveLength(2);
    });

    it("should combine includeRemoved and statusFilter correctly", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Status: { select: { name: "Remove" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
        {
          id: "2",
          properties: {
            Status: { select: { name: "Draft" } },
            "Element Type": { select: { name: "Page" } },
          },
        },
      ];

      // With includeRemoved but filtering for Draft
      const selected = selectPagesWithPriority(pages, 10, {
        includeRemoved: true,
        statusFilter: "Draft",
        verbose: false,
      });

      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe("2");
    });
  });
});
