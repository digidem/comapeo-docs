/**
 * Tests for notion-count-pages script
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock the fetchAllNotionData function
const mockFetchAllNotionData = vi.fn();

vi.mock("./notion-fetch-all/fetchAll", () => ({
  fetchAllNotionData: (...args: unknown[]) => mockFetchAllNotionData(...args),
  get type() {
    return this;
  },
  get set() {
    return this;
  },
}));

const DATA_DIR = join(process.cwd(), ".jobs-data");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

describe("notion-count-pages", () => {
  beforeEach(() => {
    cleanupTestData();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTestData();
    vi.restoreAllMocks();
  });

  describe("parseArgs", () => {
    it("should parse no arguments correctly", async () => {
      const { parseArgs } = await import("./notion-count-pages");
      process.argv = ["node", "notion-count-pages"];

      const options = parseArgs();

      expect(options).toEqual({
        includeRemoved: false,
        json: false,
      });
    });

    it("should parse --include-removed flag", async () => {
      const { parseArgs } = await import("./notion-count-pages");
      process.argv = ["node", "notion-count-pages", "--include-removed"];

      const options = parseArgs();

      expect(options).toEqual({
        includeRemoved: true,
        json: false,
      });
    });

    it("should parse --status-filter argument", async () => {
      const { parseArgs } = await import("./notion-count-pages");
      process.argv = ["node", "notion-count-pages", "--status-filter", "Draft"];

      const options = parseArgs();

      expect(options).toEqual({
        includeRemoved: false,
        statusFilter: "Draft",
        json: false,
      });
    });

    it("should parse --json flag", async () => {
      const { parseArgs } = await import("./notion-count-pages");
      process.argv = ["node", "notion-count-pages", "--json"];

      const options = parseArgs();

      expect(options).toEqual({
        includeRemoved: false,
        json: true,
      });
    });

    it("should parse --max-pages argument", async () => {
      const { parseArgs } = await import("./notion-count-pages");
      process.argv = ["node", "notion-count-pages", "--max-pages", "10"];

      const options = parseArgs();

      expect(options).toEqual({
        includeRemoved: false,
        json: false,
        maxPages: 10,
      });
    });

    it("should parse multiple arguments together", async () => {
      const { parseArgs } = await import("./notion-count-pages");
      process.argv = [
        "node",
        "notion-count-pages",
        "--include-removed",
        "--status-filter",
        "Ready to publish",
        "--json",
      ];

      const options = parseArgs();

      expect(options).toEqual({
        includeRemoved: true,
        statusFilter: "Ready to publish",
        json: true,
      });
    });
  });

  describe("formatResult", () => {
    it("should format result as plain text by default", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 42,
        fetchedCount: 42,
        processedCount: 42,
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      expect(output).toBe("Count: 42");
    });

    it("should output clear and informative message for zero count", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 0,
        fetchedCount: 0,
        processedCount: 0,
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      expect(output).toBe("Count: 0");
      expect(output.length).toBeGreaterThan(0);
      expect(output.trim()).not.toBe("");
    });

    it("should output clear message for large counts with formatting", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 1234,
        fetchedCount: 1234,
        processedCount: 1234,
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      expect(output).toContain("Count: 1234");
      expect(output.length).toBeGreaterThan(0);
    });

    it("should format result as JSON when requested", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 42,
        fetchedCount: 50,
        processedCount: 42,
        includeRemoved: false,
      };

      const output = formatResult(result, true);
      const parsed = JSON.parse(output);

      expect(parsed).toEqual(result);
    });

    it("should include status filter in output when present", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 10,
        fetchedCount: 50,
        processedCount: 10,
        statusFilter: "Draft",
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      expect(output).toContain("Count: 10");
      expect(output).toContain("Status filter: Draft");
    });

    it("should show fetched and processed counts when they differ", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 10,
        fetchedCount: 50,
        processedCount: 10,
        statusFilter: "Draft",
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      expect(output).toContain("Fetched: 50");
      expect(output).toContain("After filtering: 10");
    });

    it("should show include removed when true", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 55,
        fetchedCount: 55,
        processedCount: 55,
        includeRemoved: true,
      };

      const output = formatResult(result, false);

      expect(output).toContain("Count: 55");
      expect(output).toContain("Include removed: true");
    });

    it("should provide clear output for complex scenario with all options", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 5,
        fetchedCount: 100,
        processedCount: 5,
        statusFilter: "Ready to publish",
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      // Verify all relevant information is present
      expect(output).toContain("Count: 5");
      expect(output).toContain("Status filter: Ready to publish");
      expect(output).toContain("Fetched: 100");
      expect(output).toContain("After filtering: 5");

      // Verify output is well-structured
      const lines = output.split("\n");
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("Count: 5");
    });

    it("should ensure output is human-readable and not just raw data", async () => {
      const { formatResult } = await import("./notion-count-pages");
      const result = {
        count: 42,
        fetchedCount: 50,
        processedCount: 42,
        statusFilter: "Draft",
        includeRemoved: false,
      };

      const output = formatResult(result, false);

      // Verify labels are descriptive, not cryptic
      expect(output).toContain("Count:");
      expect(output).toContain("Status filter:");
      expect(output).toContain("Fetched:");
      expect(output).toContain("After filtering:");

      // Verify no raw property names
      expect(output).not.toContain("fetchedCount");
      expect(output).not.toContain("processedCount");
      expect(output).not.toContain("includeRemoved");
    });

    it("should maintain consistent format across different scenarios", async () => {
      const { formatResult } = await import("./notion-count-pages");

      const scenarios = [
        { count: 1, fetchedCount: 1, processedCount: 1, includeRemoved: false },
        {
          count: 10,
          fetchedCount: 10,
          processedCount: 10,
          includeRemoved: false,
        },
        {
          count: 100,
          fetchedCount: 100,
          processedCount: 100,
          includeRemoved: false,
        },
      ];

      for (const scenario of scenarios) {
        const output = formatResult(scenario, false);
        expect(output).toMatch(/^Count: \d+$/);
      }
    });
  });

  describe("main", () => {
    it("should count all pages successfully", async () => {
      mockFetchAllNotionData.mockResolvedValue({
        pages: [],
        rawPages: [],
        fetchedCount: 42,
        processedCount: 42,
      });

      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      expect(mockFetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          includeRemoved: false,
          exportFiles: false,
        })
      );

      expect(consoleLogSpy).toHaveBeenCalledWith("Count: 42");

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should count pages with status filter", async () => {
      mockFetchAllNotionData.mockResolvedValue({
        pages: [],
        rawPages: [],
        fetchedCount: 50,
        processedCount: 10,
      });

      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages", "--status-filter", "Draft"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      expect(mockFetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          statusFilter: "Draft",
        })
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Count: 10")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Status filter: Draft")
      );

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should output JSON when requested", async () => {
      mockFetchAllNotionData.mockResolvedValue({
        pages: [],
        rawPages: [],
        fetchedCount: 42,
        processedCount: 42,
      });

      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages", "--json"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed).toEqual({
        count: 42,
        fetchedCount: 42,
        processedCount: 42,
        includeRemoved: false,
      });

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle missing NOTION_API_KEY gracefully", async () => {
      process.env.NOTION_API_KEY = "";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => {
          throw new Error("exit called");
        });

      const { main } = await import("./notion-count-pages");

      await expect(main()).rejects.toThrow("exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("NOTION_API_KEY")
      );

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle missing DATABASE_ID gracefully", async () => {
      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "";
      process.argv = ["node", "notion-count-pages"];

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => {
          throw new Error("exit called");
        });

      const { main } = await import("./notion-count-pages");

      await expect(main()).rejects.toThrow("exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_ID")
      );

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });

  describe("integration", () => {
    it("should handle API errors gracefully", async () => {
      mockFetchAllNotionData.mockRejectedValue(new Error("API request failed"));

      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => {
          throw new Error("exit called");
        });

      const { main } = await import("./notion-count-pages");

      await expect(main()).rejects.toThrow("exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error:",
        "API request failed"
      );

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });
});
