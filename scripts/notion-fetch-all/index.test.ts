import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installTestNotionEnv } from "../test-utils";

const {
  mockFetchAllNotionData,
  mockGeneratePreview,
  mockAnalyzePublicationStatus,
  mockGenerateReadinessReport,
  mockIdentifyContentGaps,
} = vi.hoisted(() => ({
  mockFetchAllNotionData: vi.fn(),
  mockGeneratePreview: vi.fn(),
  mockAnalyzePublicationStatus: vi.fn(),
  mockGenerateReadinessReport: vi.fn(),
  mockIdentifyContentGaps: vi.fn(),
}));

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

vi.mock("./fetchAll", () => ({
  fetchAllNotionData: mockFetchAllNotionData,
}));

vi.mock("./previewGenerator", () => ({
  PreviewGenerator: {
    generatePreview: mockGeneratePreview,
  },
}));

vi.mock("./statusAnalyzer", () => ({
  StatusAnalyzer: {
    analyzePublicationStatus: mockAnalyzePublicationStatus,
    generateReadinessReport: mockGenerateReadinessReport,
    identifyContentGaps: mockIdentifyContentGaps,
  },
}));

vi.mock("./comparisonEngine", () => ({
  ComparisonEngine: {
    compareWithPublished: vi.fn(),
    generateComparisonReport: vi.fn(() => ""),
  },
}));

vi.mock("../notion-fetch/runtime", () => ({
  gracefulShutdown: vi.fn(),
  initializeGracefulShutdownHandlers: vi.fn(),
  trackSpinner: vi.fn(() => vi.fn()),
}));

describe("notion-fetch-all index", () => {
  let restoreEnv: () => void;
  const originalArgv = process.argv;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    vi.clearAllMocks();
    process.argv = ["bun", "scripts/notion-fetch-all/index.ts"];
    mockFetchAllNotionData.mockResolvedValue({
      pages: [],
      rawPages: [],
      candidateIds: [],
      fetchedCount: 0,
      processedCount: 0,
      metrics: undefined,
    });
    mockGeneratePreview.mockResolvedValue({
      markdown: "Preview",
      sections: [],
    });
    mockAnalyzePublicationStatus.mockReturnValue({
      readiness: {
        readyToPublish: 0,
        needsWork: 0,
        blockers: [],
        readinessPercentage: 0,
      },
    });
    mockGenerateReadinessReport.mockReturnValue("report");
    mockIdentifyContentGaps.mockReturnValue({
      missingPages: [],
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./index");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./index");
    expect(typeof scriptModule).toBe("object");
  });

  it("disables deletion mode for --page-id runs", async () => {
    process.argv = [
      "bun",
      "scripts/notion-fetch-all/index.ts",
      "--page-id",
      "single-page-id",
      "--no-analysis",
    ];

    const { main } = await import("./index");
    await main();

    expect(mockFetchAllNotionData).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "single-page-id",
        generateOptions: expect.objectContaining({
          enableDeletion: false,
        }),
      })
    );
  });
});
