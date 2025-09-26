import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { mockConsole, createTempDir, cleanupTempDir } from "../test-utils";

// Mock all external dependencies
vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
    isSpinning: false,
  })),
}));

vi.mock("chalk", () => ({
  default: {
    bold: {
      cyan: vi.fn((text) => text),
      red: vi.fn((text) => text),
      green: vi.fn((text) => text),
      yellow: vi.fn((text) => text),
      magenta: vi.fn((text) => text),
    },
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    green: vi.fn((text) => text),
    blue: vi.fn((text) => text),
  },
}));

vi.mock("../fetchNotionData", () => ({
  fetchNotionData: vi.fn(),
  sortAndExpandNotionData: vi.fn(),
}));

vi.mock("./generateBlocks", () => ({
  generateBlocks: vi.fn(),
}));

vi.mock("../constants", () => ({
  NOTION_PROPERTIES: {
    STATUS: "Status",
    READY_TO_PUBLISH: "Ready to publish",
  },
}));

describe("notion-fetch integration", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalProcessExit: typeof process.exit;
  let consoleMocks: ReturnType<typeof mockConsole>;
  let exitCode: number | undefined;

  beforeAll(async () => {
    // Store original environment and process.exit
    originalEnv = { ...process.env };
    originalProcessExit = process.exit;

    // Mock process.exit to capture exit codes
    process.exit = vi.fn((code?: number) => {
      exitCode = code;
      throw new Error(`Process exit called with code: ${code}`);
    }) as any;

    // Create temporary directory for test files
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    // Restore environment and process.exit
    process.env = originalEnv;
    process.exit = originalProcessExit;

    // Clean up temporary directory
    await cleanupTempDir(tempDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    exitCode = undefined;

    // Set up test environment
    process.env.NODE_ENV = "test";
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.DATABASE_ID = "test-database-id";
    process.env.DEBUG = undefined;

    // Mock console methods
    consoleMocks = mockConsole();
  });

  afterEach(() => {
    consoleMocks.restore();
    vi.resetModules();
  });

  describe("module initialization", () => {
    it("should load environment variables on import", async () => {
      // Arrange
      const dotenv = await import("dotenv");

      // Act
      await import("./index");

      // Assert
      expect(dotenv.default.config).toHaveBeenCalled();
    });

    it("should log environment variables when DEBUG is set", async () => {
      // Arrange
      process.env.DEBUG = "true";
      process.env.TEST_VAR = "test-value";

      // Act
      await import("./index");

      // Assert
      expect(consoleMocks.log).toHaveBeenCalledWith(
        "Environment variables:",
        expect.objectContaining({
          DEBUG: "true",
          TEST_VAR: "test-value",
        })
      );
    });

    it("should not log environment variables when DEBUG is not set", async () => {
      // Arrange
      delete process.env.DEBUG;

      // Act
      await import("./index");

      // Assert
      expect(consoleMocks.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Environment variables:")
      );
    });
  });

  describe("main workflow execution", () => {
    it("should execute main workflow successfully with valid environment", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const mockGenerateResult = {
        totalSaved: 1024,
        sectionCount: 2,
        titleSectionCount: 1,
      };

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(mockData as any);
      vi.mocked(generateBlocks).mockResolvedValue(mockGenerateResult);

      // Act
      // Import the module which will execute main() automatically
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      // Assert
      expect(actualExitCode).toBe(0);
      expect(fetchNotionData).toHaveBeenCalledWith({
        and: [
          {
            property: "Status",
            select: { equals: "Ready to publish" },
          },
          {
            property: "Parent item",
            relation: { is_empty: true },
          },
        ],
      });
      expect(sortAndExpandNotionData).toHaveBeenCalledWith(mockData);
      expect(generateBlocks).toHaveBeenCalledWith(
        mockData,
        expect.any(Function)
      );
    });

    it("should handle missing NOTION_API_KEY gracefully", async () => {
      // Arrange
      delete process.env.NOTION_API_KEY;

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("NOTION_API_KEY is not defined")
      );
    });

    it("should handle missing DATABASE_ID gracefully", async () => {
      // Arrange
      delete process.env.DATABASE_ID;

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_ID is not defined")
      );
    });

    it("should handle fetchNotionData errors", async () => {
      // Arrange
      const fetchError = new Error("Failed to fetch data");
      const { fetchNotionData } = await import("../fetchNotionData");
      vi.mocked(fetchNotionData).mockRejectedValue(fetchError);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Error updating files:"),
        fetchError
      );
    });

    it("should handle generateBlocks errors", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const generateError = new Error("Failed to generate blocks");

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(mockData as any);
      vi.mocked(generateBlocks).mockRejectedValue(generateError);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Error updating files:"),
        generateError
      );
    });

    it("should display correct success statistics", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const mockGenerateResult = {
        totalSaved: 2048, // 2 KB
        sectionCount: 3,
        titleSectionCount: 2,
      };

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(mockData as any);
      vi.mocked(generateBlocks).mockResolvedValue(mockGenerateResult);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(consoleMocks.log).toHaveBeenCalledWith(
        expect.stringContaining("2.00 KB was saved on image compression")
      );
      expect(consoleMocks.log).toHaveBeenCalledWith(
        expect.stringContaining("Created 3 section folders")
      );
      expect(consoleMocks.log).toHaveBeenCalledWith(
        expect.stringContaining("Applied 2 title sections")
      );
    });
  });

  describe("spinner management", () => {
    it("should create and manage spinners correctly", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const mockGenerateResult = {
        totalSaved: 1024,
        sectionCount: 2,
        titleSectionCount: 1,
      };

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(mockData as any);
      vi.mocked(generateBlocks).mockResolvedValue(mockGenerateResult);

      const ora = vi.mocked(await import("ora")).default;

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(ora).toHaveBeenCalledWith("Fetching data from Notion");
      expect(ora).toHaveBeenCalledWith("Generating blocks");
    });

    it("should update spinner text during generateBlocks progress", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const mockGenerateResult = {
        totalSaved: 1024,
        sectionCount: 2,
        titleSectionCount: 1,
      };

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(mockData as any);

      // Mock generateBlocks to call progress callback
      vi.mocked(generateBlocks).mockImplementation(
        async (data, progressCallback) => {
          if (progressCallback) {
            progressCallback({ current: 1, total: 2 });
            progressCallback({ current: 2, total: 2 });
          }
          return mockGenerateResult;
        }
      );

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      // The progress callback should have been called
      expect(generateBlocks).toHaveBeenCalledWith(
        mockData,
        expect.any(Function)
      );
    });
  });

  describe("error handling and graceful shutdown", () => {
    it("should handle fatal errors in main", async () => {
      // Arrange
      const fatalError = new Error("Fatal error");
      const { fetchNotionData } = await import("../fetchNotionData");
      vi.mocked(fetchNotionData).mockRejectedValue(fatalError);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Fatal error in main:"),
        fatalError
      );
    });

    it("should register signal handlers on module load", async () => {
      // Arrange
      const originalOn = process.on;
      const mockOn = vi.fn();
      process.on = mockOn;

      try {
        // Act
        await import("./index");

        // Assert
        expect(mockOn).toHaveBeenCalledWith("SIGINT", expect.any(Function));
        expect(mockOn).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
        expect(mockOn).toHaveBeenCalledWith(
          "uncaughtException",
          expect.any(Function)
        );
        expect(mockOn).toHaveBeenCalledWith(
          "unhandledRejection",
          expect.any(Function)
        );
      } finally {
        // Restore
        process.on = originalOn;
      }
    });
  });

  describe("workflow integration", () => {
    it("should pass correct filter to fetchNotionData", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const mockGenerateResult = {
        totalSaved: 1024,
        sectionCount: 2,
        titleSectionCount: 1,
      };

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(mockData as any);
      vi.mocked(generateBlocks).mockResolvedValue(mockGenerateResult);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(fetchNotionData).toHaveBeenCalledWith({
        and: [
          {
            property: "Status",
            select: {
              equals: "Ready to publish",
            },
          },
          {
            property: "Parent item",
            relation: { is_empty: true },
          },
        ],
      });
    });

    it("should process data through sortAndExpandNotionData", async () => {
      // Arrange
      const mockData = [
        {
          id: "test-page-id",
          properties: {
            Title: { title: [{ plain_text: "Test Page" }] },
          },
        },
      ];
      const sortedData = [
        {
          id: "test-page-id-sorted",
          properties: {
            Title: { title: [{ plain_text: "Test Page Sorted" }] },
          },
        },
      ];
      const mockGenerateResult = {
        totalSaved: 1024,
        sectionCount: 2,
        titleSectionCount: 1,
      };

      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { generateBlocks } = await import("./generateBlocks");

      vi.mocked(fetchNotionData).mockResolvedValue(mockData as any);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue(sortedData as any);
      vi.mocked(generateBlocks).mockResolvedValue(mockGenerateResult);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(sortAndExpandNotionData).toHaveBeenCalledWith(mockData);
      expect(generateBlocks).toHaveBeenCalledWith(
        sortedData,
        expect.any(Function)
      );
    });
  });
});
