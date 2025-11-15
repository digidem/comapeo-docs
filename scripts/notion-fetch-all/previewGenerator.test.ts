import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { captureConsoleOutput } from "../test-utils";
import { PreviewGenerator, type PreviewOptions } from "./previewGenerator";
import type { PageWithStatus } from "./fetchAll";

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

// Mock Notion client
vi.mock("../notionClient", () => ({
  enhancedNotion: {
    blocksChildrenList: vi.fn(),
  },
}));

describe("PreviewGenerator", () => {
  let consoleCapture: ReturnType<typeof captureConsoleOutput>;

  beforeEach(() => {
    consoleCapture = captureConsoleOutput();
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleCapture.restore();
    vi.restoreAllMocks();
  });

  describe("generatePreview", () => {
    it("should generate preview with sections and stats", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Section 1", elementType: "Section" }),
        createMockPage({ title: "Page 1", status: "Ready to publish" }),
        createMockPage({ title: "Page 2", status: "Draft" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats.totalPages).toBe(3);
    });

    it("should generate markdown when requested", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Test Page", status: "Ready to publish" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
      });

      expect(result.markdown).toBeDefined();
      expect(result.markdown).toContain("CoMapeo Documentation Preview");
      expect(result.markdown).toContain("Overview Statistics");
    });

    it("should skip markdown when not requested", async () => {
      const pages: PageWithStatus[] = [createMockPage({ title: "Test Page" })];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: false,
      });

      expect(result.markdown).toBeUndefined();
    });

    it("should calculate stats correctly", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "Not started" }), // Should be empty
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.totalPages).toBe(4);
      expect(result.stats.readyPages).toBe(2);
      expect(result.stats.draftPages).toBe(1);
      expect(result.stats.emptyPages).toBe(1);
    });

    it("should include language statistics", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ language: "English", status: "Ready to publish" }),
        createMockPage({ language: "Spanish", status: "Ready to publish" }),
        createMockPage({ language: "Portuguese", status: "Draft" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.languages).toContain("English");
      expect(result.stats.languages).toContain("Spanish");
      expect(result.stats.languages).toContain("Portuguese");
      expect(result.stats.languages).toHaveLength(3);
    });

    it("should calculate average completion rate", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Section 1",
          elementType: "Section",
        }),
        createMockPage({
          parentItem: parentId,
          status: "Ready to publish",
        }),
        createMockPage({
          parentItem: parentId,
          status: "Draft",
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.averageCompletionRate).toBeDefined();
      expect(result.stats.averageCompletionRate).toBeGreaterThanOrEqual(0);
      expect(result.stats.averageCompletionRate).toBeLessThanOrEqual(100);
    });

    it("should handle empty pages array", async () => {
      const result = await PreviewGenerator.generatePreview([]);

      expect(result.sections).toHaveLength(0);
      expect(result.stats.totalPages).toBe(0);
      expect(result.stats.sections).toBe(0);
      expect(result.stats.averageCompletionRate).toBe(0);
    });

    it("should build hierarchical structure correctly", async () => {
      const parentId = "parent-123";
      const childId = "child-456";

      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Parent Section",
          elementType: "Section",
        }),
        createMockPage({
          id: childId,
          title: "Child Section",
          elementType: "Section",
          parentItem: parentId,
        }),
        createMockPage({
          id: "grandchild-789",
          title: "Grandchild Page",
          parentItem: childId,
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe("Parent Section");
      expect(result.sections[0].subSections).toHaveLength(1);
      expect(result.sections[0].subSections[0].title).toBe("Child Section");
      expect(result.sections[0].subSections[0].pages).toHaveLength(1);
    });

    it("should calculate section content stats", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Test Section",
          elementType: "Section",
          status: "Ready to publish",
        }),
        createMockPage({
          parentItem: parentId,
          status: "Ready to publish",
        }),
        createMockPage({
          parentItem: parentId,
          status: "Ready to publish",
        }),
        createMockPage({
          parentItem: parentId,
          status: "Draft",
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toHaveLength(1);
      const section = result.sections[0];

      expect(section.contentStats.totalPages).toBe(4);
      expect(section.contentStats.readyPages).toBe(3);
      expect(section.contentStats.draftPages).toBe(1);
      expect(section.contentStats.completionPercentage).toBe(75); // 3/4
    });

    it("should sort pages by order within sections", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Section",
          elementType: "Section",
        }),
        createMockPage({
          title: "Page 3",
          parentItem: parentId,
          order: 3,
        }),
        createMockPage({
          title: "Page 1",
          parentItem: parentId,
          order: 1,
        }),
        createMockPage({
          title: "Page 2",
          parentItem: parentId,
          order: 2,
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      const section = result.sections[0];
      expect(section.pages[0].title).toBe("Page 1");
      expect(section.pages[1].title).toBe("Page 2");
      expect(section.pages[2].title).toBe("Page 3");
    });
  });

  describe("Content Estimation", () => {
    it("should estimate Ready to publish pages have content", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.emptyPages).toBe(0);
    });

    it("should estimate Not started pages are empty", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Not started" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.emptyPages).toBe(1);
    });

    it("should detect placeholder titles as empty", async () => {
      const placeholders = [
        "Nueva Página",
        "Nova Página",
        "New Page",
        "Untitled",
      ];

      for (const title of placeholders) {
        const pages: PageWithStatus[] = [
          createMockPage({ title, status: "No Status" }),
        ];

        const result = await PreviewGenerator.generatePreview(pages);

        expect(result.stats.emptyPages).toBe(1);
      }
    });

    it("should consider Draft published as having content", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Draft published" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.emptyPages).toBe(0);
    });

    it("should consider Update in progress as having content", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Update in progress" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.stats.emptyPages).toBe(0);
    });
  });

  describe("Markdown Generation", () => {
    it("should include table of contents in markdown", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Section 1", elementType: "Section" }),
        createMockPage({ title: "Page 1" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
      });

      expect(result.markdown).toContain("Table of Contents");
      expect(result.markdown).toContain("Section 1");
      expect(result.markdown).toContain("Page 1");
    });

    it("should include detailed structure in markdown", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Test Section", elementType: "Section" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
      });

      expect(result.markdown).toContain("Detailed Structure");
      expect(result.markdown).toContain("Test Section");
    });

    it("should include status icons in markdown", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "In progress" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
      });

      expect(result.markdown).toContain("✅"); // Ready to publish
      expect(result.markdown).toContain("📝"); // Draft
      expect(result.markdown).toContain("🔄"); // In progress
    });

    it("should show content stats when requested", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        showContentStats: true,
      });

      expect(result.markdown).toContain("Ready to Publish");
      expect(result.markdown).toContain("Total Pages");
    });

    it("should hide content stats when not requested", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        showContentStats: false,
      });

      // Should still have title but not detailed stats
      expect(result.markdown).toContain("CoMapeo Documentation Preview");
    });

    it("should include metadata when requested", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Test Section",
          elementType: "Section",
          status: "Ready to publish",
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        includeMetadata: true,
      });

      expect(result.markdown).toContain("**Status**:");
      expect(result.markdown).toContain("**Type**:");
    });

    it("should hide metadata when not requested", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Test Section",
          elementType: "Section",
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        includeMetadata: false,
      });

      expect(result.markdown).not.toContain("Status:");
      expect(result.markdown).not.toContain("Type:");
    });

    it("should include language info in metadata", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({
          title: "Spanish Page",
          language: "Spanish",
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        includeMetadata: true,
      });

      expect(result.markdown).toContain("Spanish");
    });

    it("should handle empty pages option", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Not started" }), // Empty
      ];

      const resultWithEmpty = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        includeEmptyPages: true,
      });

      const resultWithoutEmpty = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
        includeEmptyPages: false,
      });

      // Both should have same structure, but markdown may differ
      expect(resultWithEmpty.stats.totalPages).toBe(2);
      expect(resultWithoutEmpty.stats.totalPages).toBe(2);
    });
  });

  describe("Export Preview", () => {
    it("should export markdown format", async () => {
      const pages: PageWithStatus[] = [createMockPage({ title: "Test Page" })];

      const preview = await PreviewGenerator.generatePreview(pages);

      const filename = await PreviewGenerator.exportPreview(
        preview.sections,
        preview.stats,
        "markdown"
      );

      expect(filename).toMatch(/\.md$/);
      expect(filename).toContain("comapeo-docs-preview");
    });

    it("should export json format", async () => {
      const pages: PageWithStatus[] = [createMockPage({ title: "Test Page" })];

      const preview = await PreviewGenerator.generatePreview(pages);

      const filename = await PreviewGenerator.exportPreview(
        preview.sections,
        preview.stats,
        "json"
      );

      expect(filename).toMatch(/\.json$/);
    });

    it("should export html format", async () => {
      const pages: PageWithStatus[] = [createMockPage({ title: "Test Page" })];

      const preview = await PreviewGenerator.generatePreview(pages);

      const filename = await PreviewGenerator.exportPreview(
        preview.sections,
        preview.stats,
        "html"
      );

      expect(filename).toMatch(/\.html$/);
    });

    it("should use custom output path when provided", async () => {
      const pages: PageWithStatus[] = [createMockPage({ title: "Test Page" })];

      const preview = await PreviewGenerator.generatePreview(pages);

      const customPath = "custom-preview.md";
      const filename = await PreviewGenerator.exportPreview(
        preview.sections,
        preview.stats,
        "markdown",
        customPath
      );

      expect(filename).toBe(customPath);
    });

    it("should throw error for unsupported format", async () => {
      const pages: PageWithStatus[] = [createMockPage({ title: "Test Page" })];

      const preview = await PreviewGenerator.generatePreview(pages);

      await expect(
        PreviewGenerator.exportPreview(
          preview.sections,
          preview.stats,
          "xml" as any
        )
      ).rejects.toThrow("Unsupported format");
    });
  });

  describe("Edge Cases", () => {
    it("should handle pages with no parent or children", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ id: "orphan-1", title: "Orphan Page 1" }),
        createMockPage({ id: "orphan-2", title: "Orphan Page 2" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toHaveLength(2);
    });

    it("should handle pages with sub-items but no children in array", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({
          id: "parent",
          title: "Parent",
          subItems: ["missing-child-1", "missing-child-2"],
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toHaveLength(1);
    });

    it("should handle deeply nested hierarchies", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ id: "1", title: "Level 1", elementType: "Section" }),
        createMockPage({
          id: "2",
          title: "Level 2",
          elementType: "Section",
          parentItem: "1",
        }),
        createMockPage({
          id: "3",
          title: "Level 3",
          elementType: "Section",
          parentItem: "2",
        }),
        createMockPage({
          id: "4",
          title: "Level 4",
          elementType: "Section",
          parentItem: "3",
        }),
        createMockPage({ id: "5", title: "Level 5 Page", parentItem: "4" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe("Level 1");

      // Navigate down the hierarchy
      let current = result.sections[0];
      expect(current.subSections).toHaveLength(1);

      current = current.subSections[0];
      expect(current.title).toBe("Level 2");
      expect(current.subSections).toHaveLength(1);

      current = current.subSections[0];
      expect(current.title).toBe("Level 3");
    });

    it("should handle special characters in page titles", async () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: 'Page with <html> & "quotes"' }),
        createMockPage({ title: "Page with 中文 characters" }),
        createMockPage({ title: "Page with émojis 🎉🎊" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages, {
        generateMarkdown: true,
      });

      expect(result.markdown).toContain('Page with <html> & "quotes"');
      expect(result.markdown).toContain("Page with 中文 characters");
      expect(result.markdown).toContain("Page with émojis 🎉🎊");
    });

    it("should handle large number of pages efficiently", async () => {
      const pages: PageWithStatus[] = Array.from({ length: 500 }, (_, i) =>
        createMockPage({
          id: `page-${i}`,
          title: `Page ${i}`,
          status: i % 2 === 0 ? "Ready to publish" : "Draft",
        })
      );

      const startTime = Date.now();
      const result = await PreviewGenerator.generatePreview(pages);
      const duration = Date.now() - startTime;

      expect(result.stats.totalPages).toBe(500);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it("should handle sections with mixed element types", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Mixed Section",
          elementType: "Section",
        }),
        createMockPage({
          parentItem: parentId,
          elementType: "Page",
          title: "Regular Page",
        }),
        createMockPage({
          parentItem: parentId,
          elementType: "Toggle",
          title: "Toggle Item",
        }),
        createMockPage({
          parentItem: parentId,
          elementType: "Heading",
          title: "Heading Item",
        }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].pages.length).toBeGreaterThan(0);
    });

    it("should handle pages with identical orders", async () => {
      const parentId = "section-1";
      const pages: PageWithStatus[] = [
        createMockPage({ id: parentId, elementType: "Section" }),
        createMockPage({ parentItem: parentId, order: 1, title: "Page A" }),
        createMockPage({ parentItem: parentId, order: 1, title: "Page B" }),
        createMockPage({ parentItem: parentId, order: 1, title: "Page C" }),
      ];

      const result = await PreviewGenerator.generatePreview(pages);

      expect(result.sections[0].pages).toHaveLength(3);
      // Should not crash and handle deterministically
    });
  });
});

// Helper function to create mock PageWithStatus
function createMockPage(options: Partial<PageWithStatus> = {}): PageWithStatus {
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
