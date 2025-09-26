import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { 
  installTestNotionEnv,
  createMockNotionPage,
  createMockPageFamily,
  mockProcessedImageResult,
} from "../../test-utils";

// Mock all dependencies
vi.mock("../../fetchNotionData", () => ({
  fetchNotionData: vi.fn(),
  sortAndExpandNotionData: vi.fn(),
}));

vi.mock("../generateBlocks", () => ({
  generateBlocks: vi.fn(),
}));

vi.mock("../spinnerManager", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
    })),
    remove: vi.fn(),
    stopAll: vi.fn(),
  },
}));

vi.mock("../runtime", () => ({
  trackSpinner: vi.fn(() => vi.fn()), // trackSpinner returns a cleanup function
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

describe("runFetchPipeline", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("Pipeline coordination", () => {
    it("should orchestrate fetchNotionData and sortAndExpandNotionData with generateBlocks", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockRawData = [
        createMockNotionPage({ title: "Page 1", order: 1 }),
        createMockNotionPage({ title: "Page 2", order: 2 }),
      ];
      
      const mockSortedData = [
        createMockNotionPage({ title: "Page 1", order: 1 }),
        createMockNotionPage({ title: "Page 2", order: 2 }),
      ];
      
      const mockGenerateResult = {
        totalSaved: 1024,
        sectionCount: 2,
        titleSectionCount: 1,
      };
      
      // Setup mocks
      fetchNotionData.mockResolvedValue(mockRawData);
      sortAndExpandNotionData.mockResolvedValue(mockSortedData);
      generateBlocks.mockImplementation(async (pages, progressCallback) => {
        // Simulate progress callback being called
        progressCallback({ current: 1, total: 2 });
        progressCallback({ current: 2, total: 2 });
        return mockGenerateResult;
      });
      
      const progressCallback = vi.fn();
      
      const result = await runFetchPipeline({ onProgress: progressCallback });
      
      // Verify pipeline coordination
      expect(fetchNotionData).toHaveBeenCalled();
      expect(sortAndExpandNotionData).toHaveBeenCalledWith(mockRawData);
      expect(generateBlocks).toHaveBeenCalledWith(mockSortedData, expect.any(Function));
      
      expect(result).toEqual({ data: mockSortedData, metrics: mockGenerateResult });
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should handle transform parameter properly", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockRawData = [createMockNotionPage({ title: "Page 1" })];
      const mockTransformedData = [createMockNotionPage({ title: "Transformed Page 1" })];
      
      const customTransform = vi.fn().mockReturnValue(mockTransformedData);
      
      fetchNotionData.mockResolvedValue(mockRawData);
      sortAndExpandNotionData.mockResolvedValue(mockRawData);
      generateBlocks.mockResolvedValue({
        totalSaved: 0,
        sectionCount: 0,
        titleSectionCount: 0,
      });
      
      await runFetchPipeline({ transform: customTransform });
      
      // Verify transform was applied
      expect(customTransform).toHaveBeenCalledWith(mockRawData);
      expect(generateBlocks).toHaveBeenCalledWith(mockTransformedData, expect.any(Function));
    });

    it("should pass onProgress callback through to generateBlocks", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockData = [createMockNotionPage({ title: "Page 1" })];
      
      fetchNotionData.mockResolvedValue(mockData);
      sortAndExpandNotionData.mockResolvedValue(mockData);
      generateBlocks.mockImplementation(async (pages, progressCallback) => {
        // Simulate progress updates
        progressCallback({ current: 1, total: 1 });
        return {
          totalSaved: 0,
          sectionCount: 0,
          titleSectionCount: 0,
        };
      });
      
      const customProgressCallback = vi.fn();
      
      await runFetchPipeline({ onProgress: customProgressCallback });
      
      // Verify progress callback was passed through and called
      expect(customProgressCallback).toHaveBeenCalledWith({ current: 1, total: 1 });
    });

    it("should handle shouldGenerate=false parameter", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockData = [createMockNotionPage({ title: "Page 1" })];
      
      fetchNotionData.mockResolvedValue(mockData);
      sortAndExpandNotionData.mockResolvedValue(mockData);
      
      const result = await runFetchPipeline({ shouldGenerate: false });
      
      // Verify data was fetched and sorted but not generated
      expect(fetchNotionData).toHaveBeenCalled();
      expect(sortAndExpandNotionData).toHaveBeenCalled();
      expect(generateBlocks).not.toHaveBeenCalled();
      
      // Should return sorted data instead of generation result
      expect(result).toEqual({ data: mockData });
    });
  });

  describe("Error handling", () => {
    it("should propagate fetchNotionData failures", async () => {
      const { fetchNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const fetchError = new Error("Failed to fetch data from Notion");
      fetchNotionData.mockRejectedValue(fetchError);
      
      await expect(runFetchPipeline({})).rejects.toThrow("Failed to fetch data from Notion");
    });

    it("should propagate sortAndExpandNotionData failures", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockData = [createMockNotionPage({ title: "Page 1" })];
      
      fetchNotionData.mockResolvedValue(mockData);
      sortAndExpandNotionData.mockRejectedValue(new Error("Failed to sort and expand data"));
      
      await expect(runFetchPipeline({})).rejects.toThrow("Failed to sort and expand data");
    });

    it("should propagate generateBlocks failures", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockData = [createMockNotionPage({ title: "Page 1" })];
      
      fetchNotionData.mockResolvedValue(mockData);
      sortAndExpandNotionData.mockResolvedValue(mockData);
      generateBlocks.mockRejectedValue(new Error("Failed to generate blocks"));
      
      await expect(runFetchPipeline({})).rejects.toThrow("Failed to generate blocks");
    });

    it("should short-circuit pipeline on fetch failures", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      fetchNotionData.mockRejectedValue(new Error("Network error"));
      
      await expect(runFetchPipeline({})).rejects.toThrow("Network error");
      
      // Verify subsequent steps were not called
      expect(sortAndExpandNotionData).not.toHaveBeenCalled();
      expect(generateBlocks).not.toHaveBeenCalled();
    });
  });

  describe("Metrics propagation", () => {
    it("should propagate metrics from generateBlocks correctly", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const mockData = [createMockNotionPage({ title: "Page 1" })];
      const expectedMetrics = {
        totalSaved: 2048,
        sectionCount: 5,
        titleSectionCount: 2,
      };
      
      fetchNotionData.mockResolvedValue(mockData);
      sortAndExpandNotionData.mockResolvedValue(mockData);
      generateBlocks.mockResolvedValue(expectedMetrics);
      
      const result = await runFetchPipeline({});
      
      expect(result).toEqual({ data: mockData, metrics: expectedMetrics });
    });

    it("should handle complex page structures with multiple sections", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const pageFamily1 = createMockPageFamily("Section 1", "Toggle");
      const pageFamily2 = createMockPageFamily("Section 2", "Page");
      const mockData = [...pageFamily1.pages, ...pageFamily2.pages];
      
      const expectedMetrics = {
        totalSaved: 4096,
        sectionCount: 8,
        titleSectionCount: 3,
      };
      
      fetchNotionData.mockResolvedValue(mockData);
      sortAndExpandNotionData.mockResolvedValue(mockData);
      generateBlocks.mockResolvedValue(expectedMetrics);
      
      const result = await runFetchPipeline({});
      
      expect(result).toEqual({ data: mockData, metrics: expectedMetrics });
      expect(generateBlocks).toHaveBeenCalledWith(mockData, expect.any(Function));
    });
  });

  describe("Configuration options", () => {
    it("should handle preview mode (shouldGenerate=false) with proper data flow", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const rawData = [createMockNotionPage({ title: "Raw Page", order: 5 })];
      const sortedData = [createMockNotionPage({ title: "Sorted Page", order: 1 })];
      
      fetchNotionData.mockResolvedValue(rawData);
      sortAndExpandNotionData.mockResolvedValue(sortedData);
      
      const result = await runFetchPipeline({ shouldGenerate: false });
      
      expect(fetchNotionData).toHaveBeenCalled();
      expect(sortAndExpandNotionData).toHaveBeenCalledWith(rawData);
      expect(generateBlocks).not.toHaveBeenCalled();
      expect(result).toEqual({ data: sortedData });
    });

    it("should apply custom transform functions correctly", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      const rawData = [
        createMockNotionPage({ title: "Page A", order: 2 }),
        createMockNotionPage({ title: "Page B", order: 1 }),
      ];
      
      const sortedData = [
        createMockNotionPage({ title: "Page B", order: 1 }),
        createMockNotionPage({ title: "Page A", order: 2 }),
      ];
      
      // Custom transform that filters out specific pages
      const customTransform = vi.fn((pages) => pages.filter(page => 
        page.properties.Title.title[0].plain_text !== "Page A"
      ));
      
      fetchNotionData.mockResolvedValue(rawData);
      sortAndExpandNotionData.mockResolvedValue(sortedData);
      generateBlocks.mockResolvedValue({
        totalSaved: 512,
        sectionCount: 1,
        titleSectionCount: 0,
      });
      
      await runFetchPipeline({ transform: customTransform });
      
      expect(customTransform).toHaveBeenCalledWith(sortedData);
      expect(generateBlocks).toHaveBeenCalledWith(
        [expect.objectContaining({
          properties: expect.objectContaining({
            Title: expect.objectContaining({
              title: [expect.objectContaining({ plain_text: "Page B" })]
            })
          })
        })],
        expect.any(Function)
      );
    });

    it("should handle empty data sets gracefully", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = vi.mocked(await import("../../fetchNotionData"));
      const { generateBlocks } = vi.mocked(await import("../generateBlocks"));
      const { runFetchPipeline } = await import("../runFetch");
      
      fetchNotionData.mockResolvedValue([]);
      sortAndExpandNotionData.mockResolvedValue([]);
      generateBlocks.mockResolvedValue({
        totalSaved: 0,
        sectionCount: 0,
        titleSectionCount: 0,
      });
      
      const result = await runFetchPipeline({});
      
      expect(result).toEqual({
        data: [],
        metrics: {
          totalSaved: 0,
          sectionCount: 0,
          titleSectionCount: 0,
        }
      });
      
      expect(generateBlocks).toHaveBeenCalledWith([], expect.any(Function));
    });
  });
});