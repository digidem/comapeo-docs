import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main, parseArgs } from "./index.js";
import { fetchAllNotionData } from "./fetchAll.js";
import { PreviewGenerator } from "./previewGenerator.js";
import { StatusAnalyzer } from "./statusAnalyzer.js";
import { ComparisonEngine } from "./comparisonEngine.js";
import fs from "node:fs";

// Mock external dependencies
vi.mock("./fetchAll.js");
vi.mock("./previewGenerator.js");
vi.mock("./statusAnalyzer.js");
vi.mock("./comparisonEngine.js");
vi.mock("node:fs");
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

describe("notion-fetch-all", () => {
  const mockPages = [
    {
      id: "page1",
      title: "Getting Started",
      status: "Ready to publish",
      elementType: "Page",
      order: 1,
      language: "English",
      parentItem: null,
      subItems: [],
      lastEdited: new Date("2024-01-15"),
      createdTime: new Date("2024-01-01"),
      properties: {},
      rawPage: {},
    },
    {
      id: "page2",
      title: "API Reference",
      status: "Draft",
      elementType: "Page",
      order: 2,
      language: "English",
      parentItem: null,
      subItems: [],
      lastEdited: new Date("2024-01-10"),
      createdTime: new Date("2024-01-02"),
      properties: {},
      rawPage: {},
    },
  ];

  const mockPreview = {
    sections: [
      {
        title: "Getting Started",
        status: "Ready to publish",
        elementType: "Page",
        order: 1,
        pages: [],
        subSections: [],
        contentStats: {
          totalPages: 1,
          readyPages: 1,
          draftPages: 0,
          emptyPages: 0,
          completionPercentage: 100,
        },
      },
    ],
    markdown: "# CoMapeo Documentation Preview\\n\\nTest content...",
    stats: {
      totalPages: 2,
      readyPages: 1,
      draftPages: 1,
      emptyPages: 0,
      sections: 1,
      languages: ["English"],
      averageCompletionRate: 75,
    },
  };

  const mockAnalysis = {
    breakdown: [
      {
        status: "Ready to publish",
        count: 1,
        percentage: 50,
        pages: [],
      },
      {
        status: "Draft",
        count: 1,
        percentage: 50,
        pages: [],
      },
    ],
    readiness: {
      readyToPublish: 1,
      needsWork: 1,
      totalPages: 2,
      readinessPercentage: 50,
      blockers: [],
    },
    languages: [
      {
        language: "English",
        totalPages: 2,
        readyPages: 1,
        draftPages: 1,
        emptyPages: 0,
        completionPercentage: 50,
        lastUpdated: new Date("2024-01-15"),
      },
    ],
    trends: {
      recentlyUpdated: 2,
      staleContent: 0,
      averageAge: 7,
    },
  };

  const mockComparison = {
    published: {
      totalPages: 10,
      sections: 3,
      languages: ["English", "Spanish"],
    },
    preview: {
      totalPages: 12,
      sections: 4,
      languages: ["English", "Spanish", "Portuguese"],
    },
    differences: {
      newPages: [
        {
          title: "New Feature Guide",
          status: "Ready to publish",
          section: "User Guide",
          language: "English",
        },
      ],
      updatedPages: [],
      removedPages: [],
    },
    impact: {
      sidebarChanges: [
        {
          type: "added" as const,
          section: "Advanced Features",
          description: "New section with 3 pages",
        },
      ],
      contentVolume: {
        increase: 2,
        percentageChange: 20,
      },
      structuralChanges: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup environment variables
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.DATABASE_ID = "test-database-id";

    // Mock console methods
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock process.exit
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    // Mock Date.now for consistent timestamps
    vi.spyOn(Date, "now").mockReturnValue(1640995200000); // 2022-01-01
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NOTION_API_KEY;
    delete process.env.DATABASE_ID;
  });

  describe("parseArgs", () => {
    it("should parse command line arguments correctly", () => {
      const originalArgv = process.argv;
      process.argv = [
        "node",
        "script",
        "--verbose",
        "--output-format",
        "json",
        "--comparison",
      ];

      const options = parseArgs();

      expect(options.verbose).toBe(true);
      expect(options.outputFormat).toBe("json");
      expect(options.comparison).toBe(true);

      process.argv = originalArgv;
    });

    it("should use default values when no arguments provided", () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      const options = parseArgs();

      expect(options.verbose).toBe(false);
      expect(options.outputFormat).toBe("markdown");
      expect(options.includeArchived).toBe(false);
      expect(options.includeRemoved).toBe(false);
      expect(options.sortBy).toBe("order");
      expect(options.sortDirection).toBe("asc");
      expect(options.analysis).toBe(true);
      expect(options.comparison).toBe(false);

      process.argv = originalArgv;
    });

    it("should handle output and sorting options", () => {
      const originalArgv = process.argv;
      process.argv = [
        "node",
        "script",
        "--output",
        "test.html",
        "--sort-by",
        "modified",
        "--sort-desc",
      ];

      const options = parseArgs();

      expect(options.outputFile).toBe("test.html");
      expect(options.sortBy).toBe("modified");
      expect(options.sortDirection).toBe("desc");

      process.argv = originalArgv;
    });

    it("should handle include options", () => {
      const originalArgv = process.argv;
      process.argv = [
        "node",
        "script",
        "--include-archived",
        "--include-removed",
      ];

      const options = parseArgs();

      expect(options.includeArchived).toBe(true);
      expect(options.includeRemoved).toBe(true);

      process.argv = originalArgv;
    });

    it("should handle preview-only mode", () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--preview-only"];

      const options = parseArgs();

      expect(options.previewOnly).toBe(true);
      expect(options.analysis).toBe(false);
      expect(options.comparison).toBe(false);

      process.argv = originalArgv;
    });
  });

  describe("main function", () => {
    beforeEach(() => {
      vi.mocked(fetchAllNotionData).mockResolvedValue(mockPages);
      vi.mocked(PreviewGenerator.generatePreview).mockResolvedValue(
        mockPreview
      );
      vi.mocked(StatusAnalyzer.analyzePublicationStatus).mockReturnValue(
        mockAnalysis
      );
      vi.mocked(StatusAnalyzer.generateReadinessReport).mockReturnValue({
        summary: "Test readiness report",
        recommendations: ["Improve content"],
        timeline: {
          immediate: ["Fix errors"],
          shortTerm: ["Add content"],
          longTerm: ["Maintain quality"],
        },
      });
      vi.mocked(StatusAnalyzer.identifyContentGaps).mockReturnValue({
        missingPages: [],
        inconsistentStructure: [],
        outdatedContent: [],
      });
      vi.mocked(ComparisonEngine.compareWithPublished).mockResolvedValue(
        mockComparison
      );
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    });

    it("should exit early if NOTION_API_KEY is missing", async () => {
      delete process.env.NOTION_API_KEY;

      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      await expect(main()).rejects.toThrow("process.exit called");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("NOTION_API_KEY not found")
      );

      process.argv = originalArgv;
    });

    it("should exit early if DATABASE_ID is missing", async () => {
      delete process.env.DATABASE_ID;

      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      await expect(main()).rejects.toThrow("process.exit called");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_ID not found")
      );

      process.argv = originalArgv;
    });

    it("should complete full workflow successfully", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      await main();

      expect(fetchAllNotionData).toHaveBeenCalledWith({
        includeArchived: false,
        includeRemoved: false,
        sortBy: "order",
        sortDirection: "asc",
        includeSubPages: true,
      });
      expect(PreviewGenerator.generatePreview).toHaveBeenCalled();
      expect(StatusAnalyzer.analyzePublicationStatus).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();

      process.argv = originalArgv;
    });

    it("should handle status filter", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--status-filter", "Draft"];

      await main();

      // Should filter pages after fetching
      expect(PreviewGenerator.generatePreview).toHaveBeenCalledWith(
        [mockPages[1]], // Only the Draft page
        expect.any(Object)
      );

      process.argv = originalArgv;
    });

    it("should handle max pages limit", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--max-pages", "1"];

      await main();

      expect(PreviewGenerator.generatePreview).toHaveBeenCalledWith(
        [mockPages[0]], // Only first page
        expect.any(Object)
      );

      process.argv = originalArgv;
    });

    it("should skip analysis in preview-only mode", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--preview-only"];

      await main();

      expect(fetchAllNotionData).toHaveBeenCalled();
      expect(PreviewGenerator.generatePreview).toHaveBeenCalled();
      expect(StatusAnalyzer.analyzePublicationStatus).not.toHaveBeenCalled();
      expect(ComparisonEngine.compareWithPublished).not.toHaveBeenCalled();

      process.argv = originalArgv;
    });

    it("should perform comparison when requested", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--comparison"];

      await main();

      expect(ComparisonEngine.compareWithPublished).toHaveBeenCalledWith(
        mockPreview.sections,
        mockPages
      );

      process.argv = originalArgv;
    });

    it("should generate JSON output correctly", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output-format", "json"];

      await main();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.json$/),
        expect.stringContaining('"format": "notion-fetch-all-complete"'),
        "utf8"
      );

      process.argv = originalArgv;
    });

    it("should generate HTML output correctly", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output-format", "html"];

      await main();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.html$/),
        expect.stringContaining("<!DOCTYPE html>"),
        "utf8"
      );

      process.argv = originalArgv;
    });

    it("should use custom output file path", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output", "custom-preview.md"];

      await main();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/custom-preview\.md$/),
        expect.any(String),
        "utf8"
      );

      process.argv = originalArgv;
    });

    it("should display verbose analysis information", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--verbose"];

      await main();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Status Breakdown:")
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Language Progress:")
      );

      process.argv = originalArgv;
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(fetchAllNotionData).mockRejectedValue(new Error("API Error"));

      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      await expect(main()).rejects.toThrow("process.exit called");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error:"),
        expect.any(Error)
      );

      process.argv = originalArgv;
    });

    it("should handle preview generation errors", async () => {
      vi.mocked(PreviewGenerator.generatePreview).mockRejectedValue(
        new Error("Preview Error")
      );

      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      await expect(main()).rejects.toThrow("process.exit called");

      process.argv = originalArgv;
    });

    it("should handle file write errors", async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error("Write Error");
      });

      const originalArgv = process.argv;
      process.argv = ["node", "script"];

      await expect(main()).rejects.toThrow("process.exit called");

      process.argv = originalArgv;
    });
  });

  describe("output generation", () => {
    it("should include analysis in markdown output", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output-format", "markdown"];

      await main();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;

      expect(content).toContain("# CoMapeo Documentation Preview");
      expect(content).toContain("Test readiness report");

      process.argv = originalArgv;
    });

    it("should include comparison in output when requested", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--comparison"];

      await main();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;

      expect(content).toContain("Test readiness report");

      process.argv = originalArgv;
    });

    it("should generate valid JSON structure", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output-format", "json"];

      await main();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;

      expect(() => JSON.parse(content)).not.toThrow();

      const parsedContent = JSON.parse(content);
      expect(parsedContent).toHaveProperty("metadata");
      expect(parsedContent).toHaveProperty("preview");
      expect(parsedContent).toHaveProperty("analysis");
      expect(parsedContent).toHaveProperty("pages");

      process.argv = originalArgv;
    });

    it("should generate valid HTML structure", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output-format", "html"];

      await main();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;

      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("<html");
      expect(content).toContain("<head>");
      expect(content).toContain("<body>");
      expect(content).toContain("</html>");

      process.argv = originalArgv;
    });
  });

  describe("configuration validation", () => {
    it("should validate output format options", () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--output-format", "invalid"];

      const options = parseArgs();

      // Should default to markdown for invalid option
      expect(options.outputFormat).toBe("markdown");

      process.argv = originalArgv;
    });

    it("should validate sort options", () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--sort-by", "invalid"];

      const options = parseArgs();

      // Should default to order for invalid option
      expect(options.sortBy).toBe("order");

      process.argv = originalArgv;
    });

    it("should handle numeric arguments correctly", () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script", "--max-pages", "abc"];

      const options = parseArgs();

      expect(options.maxPages).toBeUndefined(); // invalid number

      process.argv = originalArgv;
    });
  });
});
