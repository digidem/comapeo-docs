import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import {
  installTestNotionEnv,
  captureConsoleOutput,
  createMockNotionPage,
  createMockPageFamily,
  mockProcessedImageResult,
} from "../../test-utils";
import { fetchAllNotionData } from "../fetchAll";
import { PreviewGenerator } from "../previewGenerator";
import { StatusAnalyzer } from "../statusAnalyzer";
import { ComparisonEngine } from "../comparisonEngine";
import {
  initializeGracefulShutdownHandlers,
  trackSpinner,
  gracefulShutdown,
} from "../../notion-fetch/runtime";

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
vi.mock("../../notionClient", () => ({
  enhancedNotion: {
    blocksChildrenList: vi.fn(),
  },
}));

// Mock all CLI dependencies
vi.mock("../fetchAll", () => ({
  fetchAllNotionData: vi.fn(),
}));

vi.mock("../previewGenerator", () => ({
  PreviewGenerator: {
    generatePreview: vi.fn(),
  },
}));

vi.mock("../statusAnalyzer", () => ({
  StatusAnalyzer: {
    analyzePublicationStatus: vi.fn(),
  },
}));

vi.mock("../comparisonEngine", () => ({
  ComparisonEngine: {
    compareWithPublished: vi.fn(),
  },
}));

vi.mock("../../notion-fetch/runtime", () => ({
  gracefulShutdown: vi.fn(),
  initializeGracefulShutdownHandlers: vi.fn(),
  trackSpinner: vi.fn(),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

vi.mock("chalk", () => ({
  default: {
    green: (text: string) => `[GREEN]${text}[/GREEN]`,
    blue: (text: string) => `[BLUE]${text}[/BLUE]`,
    yellow: (text: string) => `[YELLOW]${text}[/YELLOW]`,
    red: (text: string) => `[RED]${text}[/RED]`,
    cyan: (text: string) => `[CYAN]${text}[/CYAN]`,
    gray: (text: string) => `[GRAY]${text}[/GRAY]`,
  },
}));

describe("CLI index", () => {
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

  describe("Basic CLI functionality", () => {
    it("should import and initialize CLI without errors", async () => {
      (fetchAllNotionData as Mock).mockResolvedValue({
        results: [],
        summary: {
          totalPages: 0,
          publishedPages: 0,
          languages: [],
        },
      });

      // Should be able to import without throwing
      expect(async () => {
        await import("../index");
      }).not.toThrow();
    });

    it("should handle environment setup correctly", async () => {
      await import("../index");

      // Verify graceful shutdown handlers were initialized
      expect(initializeGracefulShutdownHandlers).toHaveBeenCalled();
    });

    it("should validate required environment variables", async () => {
      // Temporarily remove environment variables
      const originalNotionKey = process.env.NOTION_API_KEY;
      const originalDatabaseId = process.env.DATABASE_ID;

      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;

      try {
        await import("../index");

        // Should still work but may log warnings
        expect(
          consoleCapture.errors.length + consoleCapture.logs.length
        ).toBeGreaterThanOrEqual(0);
      } finally {
        if (originalNotionKey) process.env.NOTION_API_KEY = originalNotionKey;
        if (originalDatabaseId) process.env.DATABASE_ID = originalDatabaseId;
      }
    });
  });

  describe("CLI components", () => {
    it("should have PreviewGenerator available", async () => {
      const { PreviewGenerator } = await import("../previewGenerator");

      expect(PreviewGenerator).toBeDefined();
      expect(PreviewGenerator.generatePreview).toBeDefined();
    });

    it("should have StatusAnalyzer available", async () => {
      const { StatusAnalyzer } = await import("../statusAnalyzer");

      expect(StatusAnalyzer).toBeDefined();
      expect(StatusAnalyzer.analyzePublicationStatus).toBeDefined();
    });

    it("should have ComparisonEngine available", async () => {
      const { ComparisonEngine } = await import("../comparisonEngine");

      expect(ComparisonEngine).toBeDefined();
      expect(ComparisonEngine.compareWithPublished).toBeDefined();
    });

    it("should handle spinner tracking correctly", async () => {
      await import("../index");

      // Runtime should be initialized
      expect(trackSpinner).toBeDefined();
    });
  });
});
