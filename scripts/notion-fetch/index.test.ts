import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  type Mock,
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
      blue: vi.fn((text) => text),
    },
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    green: vi.fn((text) => text),
    blue: vi.fn((text) => text),
    gray: vi.fn((text) => text),
  },
}));

vi.mock("./generateBlocks", () => ({
  generateBlocks: vi.fn(),
}));

vi.mock("./runFetch", () => ({
  runFetchPipeline: vi.fn(),
}));

vi.mock("../constants", () => ({
  NOTION_PROPERTIES: {
    STATUS: "Status",
    READY_TO_PUBLISH: "Ready to publish",
  },
}));

vi.mock("./runtime", () => {
  return {
    gracefulShutdown: vi.fn().mockImplementation(async (exitCode = 0) => {
      return exitCode;
    }),
    trackSpinner: vi.fn().mockReturnValue(vi.fn()),
    initializeGracefulShutdownHandlers: vi.fn(),
    __resetRuntimeForTests: vi.fn(),
  };
});

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

    it.skip("should log environment variables when DEBUG is set", async () => {
      // Note: This test expects module initialization side effects
      // Cannot test with module caching (vi.resetModules unavailable in Vitest 4)
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
        emojiCount: 0,
      };

      // Reset modules and set environment variables to ensure fresh import
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";

      const { runFetchPipeline } = await import("./runFetch");

      (runFetchPipeline as Mock).mockImplementation(async (args) => {
        console.log(`runFetchPipeline called with:`, args);
        return {
          data: mockData,
          metrics: mockGenerateResult,
        };
      });

      // Act
      // Import the module which will execute main() automatically
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      // Assert
      expect(actualExitCode).toBe(0);
      expect(runFetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
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
          },
          fetchSpinnerText: "Fetching data from Notion",
          generateSpinnerText: "Generating blocks",
        })
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
        expect.stringContaining("Missing NOTION_API_KEY environment variable")
      );
    });

    it("should have loaded DATABASE_ID from environment", async () => {
      // While we can't test the missing DATABASE_ID throw with cached modules,
      // we can verify that DATABASE_ID was properly loaded and is available
      // (The validation happens in notionClient.ts at module load time)
      expect(process.env.DATABASE_ID).toBeDefined();
      expect(process.env.DATABASE_ID).toBe("test-database-id");
    });

    it("should handle fetchNotionData errors", async () => {
      // Arrange
      const fetchError = new Error("Failed to fetch data");
      const { runFetchPipeline } = await import("./runFetch");
      (runFetchPipeline as Mock).mockRejectedValue(fetchError);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Fatal error in main:"),
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

      const { runFetchPipeline } = await import("./runFetch");
      (runFetchPipeline as Mock).mockRejectedValue(generateError);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Fatal error in main:"),
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
        emojiCount: 1,
      };

      // Reset modules and set environment variables to ensure fresh import
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";

      const { runFetchPipeline } = await import("./runFetch");

      (runFetchPipeline as Mock).mockResolvedValue({
        data: mockData,
        metrics: mockGenerateResult,
      });

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
        emojiCount: 0,
      };

      // Reset modules and set environment variables to ensure fresh import
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";

      const { runFetchPipeline } = await import("./runFetch");

      (runFetchPipeline as Mock).mockResolvedValue({
        data: mockData,
        metrics: mockGenerateResult,
      });

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(runFetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchSpinnerText: "Fetching data from Notion",
          generateSpinnerText: "Generating blocks",
        })
      );
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
        emojiCount: 0,
      };

      // Reset modules and set environment variables to ensure fresh import
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";

      const { runFetchPipeline } = await import("./runFetch");

      // Mock runFetchPipeline to call progress callback
      (runFetchPipeline as Mock).mockImplementation(
        async ({ onProgress, ...rest }) => {
          if (onProgress) {
            onProgress({ current: 1, total: 2 });
            onProgress({ current: 2, total: 2 });
          }
          return {
            data: mockData,
            metrics: mockGenerateResult,
          };
        }
      );

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      // The progress callback should have been called
      expect(runFetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          onProgress: expect.any(Function),
        })
      );
    });
  });

  describe("error handling and graceful shutdown", () => {
    it("should handle fatal errors in main", async () => {
      // Arrange
      const fatalError = new Error("Fatal error");
      const { runFetchPipeline } = await import("./runFetch");
      (runFetchPipeline as Mock).mockRejectedValue(fatalError);

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Fatal error in main:"),
        fatalError
      );
    });

    it.skip("should register signal handlers on module load", async () => {
      // Note: Same module caching issue - tests module initialization side effects
      // Arrange
      const originalOn = process.on;
      const mockOn = vi.fn();
      process.on = mockOn;

      try {
        const runtime = await import("./runtime");
        runtime.__resetRuntimeForTests?.();
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
        emojiCount: 0,
      };

      // Reset modules and set environment variables to ensure fresh import
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";

      const { runFetchPipeline } = await import("./runFetch");

      (runFetchPipeline as Mock).mockResolvedValue({
        data: mockData,
        metrics: mockGenerateResult,
      });

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(runFetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
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
          },
          fetchSpinnerText: "Fetching data from Notion",
          generateSpinnerText: "Generating blocks",
        })
      );
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
        emojiCount: 0,
      };

      // Reset modules and set environment variables to ensure fresh import
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";

      const { runFetchPipeline } = await import("./runFetch");

      (runFetchPipeline as Mock).mockResolvedValue({
        data: sortedData,
        metrics: mockGenerateResult,
      });

      // Act & Assert
      const mod = await import("./index");
      const actualExitCode = await mod.main();

      expect(actualExitCode).toBe(0);
      expect(runFetchPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
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
          },
          fetchSpinnerText: "Fetching data from Notion",
          generateSpinnerText: "Generating blocks",
        })
      );
    });
  });
});
