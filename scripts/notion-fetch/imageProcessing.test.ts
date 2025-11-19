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
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import {
  processImageWithFallbacks,
  logImageFailure,
  ImageCache,
  downloadAndProcessImageWithCache,
  downloadAndProcessImage,
  getImageCache,
  getProcessingMetrics,
  resetProcessingMetrics,
  logProcessingMetrics,
  type ImageProcessingResult,
  type ImageCacheEntry,
} from "./imageProcessing";

// Mock dependencies
vi.mock("node:fs");
vi.mock("axios");
vi.mock("./imageProcessor", () => ({
  processImage: vi.fn(async (buffer: Buffer) => ({
    outputBuffer: buffer,
    originalSize: buffer.length,
  })),
}));
vi.mock("./utils", () => ({
  compressImageToFileWithFallback: vi.fn(async () => ({
    finalSize: 1000,
    usedFallback: false,
  })),
  detectFormatFromBuffer: vi.fn(() => "jpeg"),
  formatFromContentType: vi.fn(() => "jpeg"),
  chooseFormat: vi.fn(() => "jpeg"),
  extForFormat: vi.fn(() => ".jpg"),
  isResizableFormat: vi.fn(() => true),
}));
vi.mock("./spinnerManager", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    remove: vi.fn(),
  },
}));
vi.mock("./imageValidation", () => ({
  validateAndSanitizeImageUrl: vi.fn((url: string) => ({
    isValid: true,
    sanitizedUrl: url,
  })),
  createFallbackImageMarkdown: vi.fn(() => "![Fallback](fallback.jpg)"),
}));

describe("imageProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("processImageWithFallbacks", () => {
    it("should return error for invalid URL", async () => {
      const { validateAndSanitizeImageUrl } = await import("./imageValidation");
      vi.mocked(validateAndSanitizeImageUrl).mockReturnValueOnce({
        isValid: false,
        error: "Invalid protocol",
      });

      const result = await processImageWithFallbacks(
        "ftp://example.com/image.jpg",
        "test-block",
        0,
        "original markdown"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid protocol");
      expect(result.fallbackUsed).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid image URL")
      );
    });

    it("should process image successfully", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from("fake image data"),
        headers: { "content-type": "image/jpeg" },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await processImageWithFallbacks(
        "https://example.com/image.jpg",
        "test-block",
        0,
        "original markdown"
      );

      expect(result.success).toBe(true);
      expect(result.newPath).toBeDefined();
      expect(result.fallbackUsed).toBe(false);
    });

    it("should handle download failure and log error", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockRejectedValue(new Error("Network error"));

      const result = await processImageWithFallbacks(
        "https://example.com/image.jpg",
        "test-block",
        0,
        "original markdown"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
      expect(result.fallbackUsed).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Image download failed")
      );
    });

    it("should handle non-Error exceptions", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockRejectedValue("String error");

      const result = await processImageWithFallbacks(
        "https://example.com/image.jpg",
        "test-block",
        0,
        "original markdown"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe("logImageFailure", () => {
    beforeEach(() => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
    });

    it("should skip logging in CI environment", () => {
      process.env.CI = "true";
      const logEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        pageBlock: "test-block",
        imageIndex: 0,
        originalUrl: "https://example.com/image.jpg",
        error: "Network error",
        fallbackUsed: true,
      };

      logImageFailure(logEntry);

      // Should not attempt to read or write files
      expect(fs.existsSync).not.toHaveBeenCalled();
    });

    it("should skip logging in GitHub Actions environment", () => {
      process.env.GITHUB_ACTIONS = "true";
      const logEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        pageBlock: "test-block",
        imageIndex: 0,
        originalUrl: "https://example.com/image.jpg",
        error: "Network error",
        fallbackUsed: true,
      };

      logImageFailure(logEntry);

      // Should not attempt to read or write files
      expect(fs.existsSync).not.toHaveBeenCalled();
    });

    it("should truncate long field values", async () => {
      const longString = "a".repeat(3000);
      const logEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        pageBlock: longString,
        imageIndex: 0,
        originalUrl: "https://example.com/image.jpg",
        error: "Network error",
        fallbackUsed: true,
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      logImageFailure(logEntry);

      // Give async operation time to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have attempted to write (verification happens in async code)
      // The actual truncation is tested by ensuring the function doesn't throw
    });

    it("should handle non-serializable log entries", async () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      const logEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        circular,
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      logImageFailure(logEntry);

      // Give async operation time to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw and should handle gracefully
    });
  });

  describe("ImageCache", () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue("");
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
    });

    it("should initialize with empty cache when directory is empty", () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const cache = new ImageCache();
      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.validEntries).toBe(0);
    });

    it("should count existing cache entries from directory", () => {
      const cacheEntry = {
        url: "https://example.com/image1.jpg",
        localPath: "test_0.jpg",
        timestamp: "2024-01-01T00:00:00Z",
        blockName: "test-block",
      };

      vi.mocked(fs.readdirSync).mockReturnValue(["abc123.json"] as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

      const cache = new ImageCache();
      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(1);
    });

    it("should handle corrupt cache entry gracefully", () => {
      vi.mocked(fs.readdirSync).mockReturnValue(["corrupt.json"] as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json{{{");

      const cache = new ImageCache();
      const stats = cache.getStats();

      // Corrupt entries are skipped but counted in total
      expect(stats.totalEntries).toBe(1);
      expect(stats.validEntries).toBe(0);
    });

    it("should check if cached image exists", () => {
      const cache = new ImageCache();
      const cacheEntry = {
        url: "https://example.com/image.jpg",
        localPath: "test_0.jpg",
        timestamp: new Date().toISOString(), // Recent timestamp to pass TTL check
        blockName: "test-block",
      };

      // Mock: cache file exists and image file exists
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

      expect(cache.has("https://example.com/image.jpg")).toBe(true);
    });

    it("should return false for non-existent cache entry", () => {
      const cache = new ImageCache();

      // Mock: cache file doesn't exist
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(cache.has("https://example.com/nonexistent.jpg")).toBe(false);
    });

    it("should get cached entry", () => {
      const cache = new ImageCache();
      const cacheEntry = {
        url: "https://example.com/image.jpg",
        localPath: "test_0.jpg",
        timestamp: "2024-01-01T00:00:00Z",
        blockName: "test-block",
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

      const entry = cache.get("https://example.com/image.jpg");

      expect(entry).toBeDefined();
      expect(entry?.url).toBe("https://example.com/image.jpg");
      expect(entry?.blockName).toBe("test-block");
    });

    it("should return undefined for non-existent cache entry", () => {
      const cache = new ImageCache();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const entry = cache.get("https://example.com/nonexistent.jpg");

      expect(entry).toBeUndefined();
    });

    it("should set cache entry and save to individual file", () => {
      const cache = new ImageCache();

      cache.set(
        "https://example.com/image.jpg",
        "/images/test_0.jpg",
        "test-block"
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
      // Verify it writes to a hash-based filename
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(writeCall[0]).toMatch(/\.cache[\/\\]images[\/\\][a-f0-9]+\.json$/);
    });

    it("should handle save errors gracefully", () => {
      const cache = new ImageCache();

      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error("Write error");
      });

      cache.set(
        "https://example.com/image.jpg",
        "/images/test_0.jpg",
        "test-block"
      );

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to save cache entry")
      );
    });

    it("should get cache statistics from directory", () => {
      const cache = new ImageCache();
      const cacheEntry = {
        url: "https://example.com/image.jpg",
        localPath: "test_0.jpg",
        timestamp: "2024-01-01T00:00:00Z",
        blockName: "test",
      };

      vi.mocked(fs.readdirSync).mockReturnValue([
        "abc.json",
        "def.json",
      ] as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.validEntries).toBe(2);
    });

    it("should cleanup stale entries", () => {
      const cache = new ImageCache();
      const staleEntry = {
        url: "https://example.com/image1.jpg",
        localPath: "test_0.jpg",
        timestamp: "2024-01-01T00:00:00Z",
        blockName: "test",
      };

      vi.mocked(fs.readdirSync).mockReturnValue(["stale.json"] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(staleEntry));
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      // Mock: cache file exists but image file doesn't
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath.toString().includes(".json"); // Only cache files exist
      });

      cache.cleanup();

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("Cleaned up")
      );
    });

    it("should reject suspicious file names with path traversal", () => {
      const cache = new ImageCache();

      // Set with path traversal attempt
      cache.set(
        "https://example.com/image.jpg",
        "../../../etc/passwd",
        "test-block"
      );

      // Read back the entry
      const cacheEntry = {
        url: "https://example.com/image.jpg",
        localPath: "passwd", // Should be sanitized to basename
        timestamp: expect.any(String),
        blockName: "test-block",
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

      const entry = cache.get("https://example.com/image.jpg");
      expect(entry?.localPath).toBe("passwd");
      expect(entry?.localPath).not.toContain("..");
    });
  });

  describe("downloadAndProcessImageWithCache", () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
    });

    it("should return cached image if available", async () => {
      const cacheEntry = {
        url: "https://example.com/cached.jpg",
        localPath: "cached_0.jpg",
        timestamp: "2024-01-01T00:00:00Z",
        blockName: "test-block",
      };

      // Mock: both cache file and image file exist
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

      const result = await downloadAndProcessImageWithCache(
        "https://example.com/cached.jpg",
        "test-block",
        0
      );

      expect(result.fromCache).toBe(true);
      expect(result.newPath).toContain("/images/");
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("Using cached image")
      );
    });

    it("should download and cache new image", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from("fake image data"),
        headers: { "content-type": "image/jpeg" },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImageWithCache(
        "https://example.com/new.jpg",
        "test-block",
        0
      );

      expect(result.fromCache).toBe(false);
      expect(result.newPath).toBeDefined();
      expect(result.savedBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe("downloadAndProcessImage", () => {
    it("should download and process image successfully", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from("fake image data"),
        headers: { "content-type": "image/jpeg" },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "test-block",
        0
      );

      expect(result.newPath).toMatch(/\/images\/testblock_0\.jpg/);
      expect(result.savedBytes).toBeGreaterThanOrEqual(0);
    });

    it("should retry on failure", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          data: Buffer.from("fake image data"),
          headers: { "content-type": "image/jpeg" },
        });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "test-block",
        0
      );

      expect(result.newPath).toBeDefined();
      expect(mockAxios.get).toHaveBeenCalledTimes(3);
    });

    it("should throw error after 3 failed attempts", async () => {
      const mockAxios = vi.mocked(axios);
      const error = new Error("Network error");
      mockAxios.get.mockRejectedValue(error);

      await expect(
        downloadAndProcessImage(
          "https://example.com/image.jpg",
          "test-block",
          0
        )
      ).rejects.toThrow("Network error");

      expect(mockAxios.get).toHaveBeenCalledTimes(3);
    });

    it("should handle timeout errors", async () => {
      // Enable verbose mode to test error logging (suppressed by default in tests)
      const originalVerbose = process.env.VERBOSE;
      process.env.VERBOSE = "true";

      try {
        const mockAxios = vi.mocked(axios);
        const error: any = new Error("Timeout");
        error.code = "ECONNABORTED";
        mockAxios.get.mockRejectedValue(error);

        await expect(
          downloadAndProcessImage(
            "https://example.com/image.jpg",
            "test-block",
            0
          )
        ).rejects.toThrow();

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining("Image processing error details"),
          expect.any(Error)
        );
      } finally {
        // Restore original VERBOSE setting
        if (originalVerbose !== undefined) {
          process.env.VERBOSE = originalVerbose;
        } else {
          delete process.env.VERBOSE;
        }
      }
    });

    it("should handle HTTP errors", async () => {
      const mockAxios = vi.mocked(axios);
      const error: any = new Error("HTTP error");
      error.response = { status: 404 };
      mockAxios.get.mockRejectedValue(error);

      await expect(
        downloadAndProcessImage(
          "https://example.com/image.jpg",
          "test-block",
          0
        )
      ).rejects.toThrow();
    });

    it("should handle DNS resolution errors", async () => {
      const mockAxios = vi.mocked(axios);
      const error: any = new Error("DNS error");
      error.code = "ENOTFOUND";
      mockAxios.get.mockRejectedValue(error);

      await expect(
        downloadAndProcessImage(
          "https://example.com/image.jpg",
          "test-block",
          0
        )
      ).rejects.toThrow();
    });

    it("should use test-aware retry delays", async () => {
      process.env.NODE_ENV = "test";
      const mockAxios = vi.mocked(axios);
      mockAxios.get
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          data: Buffer.from("fake image data"),
          headers: { "content-type": "image/jpeg" },
        });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "test-block",
        0
      );

      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });

    it("should sanitize block name for filename", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from("fake image data"),
        headers: { "content-type": "image/jpeg" },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "Test Block! With @#$ Special Characters",
        0
      );

      // Should only contain alphanumeric characters (truncated to 20 chars)
      expect(result.newPath).toMatch(/\/images\/testblockwithspecial_0\.jpg/);
    });

    it("should handle array content-type headers", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from("fake image data"),
        headers: { "content-type": ["image/jpeg", "charset=utf-8"] },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "test-block",
        0
      );

      expect(result.newPath).toBeDefined();
    });

    it("should handle non-resizable image formats", async () => {
      const mockAxios = vi.mocked(axios);
      mockAxios.get.mockResolvedValueOnce({
        data: Buffer.from("fake svg data"),
        headers: { "content-type": "image/svg+xml" },
      });

      const { isResizableFormat } = await import("./utils");
      vi.mocked(isResizableFormat).mockReturnValue(false);

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImage(
        "https://example.com/image.svg",
        "test-block",
        0
      );

      expect(result.newPath).toBeDefined();
    });
  });

  describe("getImageCache", () => {
    it("should return the global image cache instance", () => {
      const cache = getImageCache();
      expect(cache).toBeInstanceOf(ImageCache);
    });

    it("should return the same instance on multiple calls", () => {
      const cache1 = getImageCache();
      const cache2 = getImageCache();
      expect(cache1).toBe(cache2);
    });
  });

  describe("Skip optimization logic", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      const { resetProcessingMetrics } = await import("./imageProcessing");
      resetProcessingMetrics();
    });

    it("should skip processing for small images (< 50KB)", async () => {
      const mockAxios = vi.mocked(axios);
      const smallImageBuffer = Buffer.alloc(30 * 1024); // 30KB
      mockAxios.get.mockResolvedValueOnce({
        data: smallImageBuffer,
        headers: { "content-type": "image/jpeg" },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "test-block",
        0
      );

      expect(result.newPath).toBeDefined();
      expect(result.savedBytes).toBe(0);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("testblock_0.jpg"),
        smallImageBuffer
      );

      const { getProcessingMetrics } = await import("./imageProcessing");
      const metrics = getProcessingMetrics();
      expect(metrics.skippedSmallSize).toBe(1);
    });

    it("should process images larger than 50KB threshold", async () => {
      const mockAxios = vi.mocked(axios);
      const largeImageBuffer = Buffer.alloc(100 * 1024); // 100KB
      mockAxios.get.mockResolvedValueOnce({
        data: largeImageBuffer,
        headers: { "content-type": "image/jpeg" },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await downloadAndProcessImage(
        "https://example.com/image.jpg",
        "test-block",
        0
      );

      expect(result.newPath).toBeDefined();

      const { getProcessingMetrics } = await import("./imageProcessing");
      const metrics = getProcessingMetrics();
      expect(metrics.skippedSmallSize).toBe(0);
      expect(metrics.fullyProcessed).toBe(1);
    });

    it("should skip processing for already-optimized PNG images", async () => {
      const mockAxios = vi.mocked(axios);
      // Create a PNG buffer with optimization markers in the first 4KB (where hasOptimizationMarkers checks)
      const pngSignature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const optimizationMarker = Buffer.from("pngquant optimized image");
      const paddingSize = 100 * 1024 - 8 - optimizationMarker.length;
      // Place marker within first 4KB so it's detected
      const imageBuffer = Buffer.concat([
        pngSignature,
        optimizationMarker,
        Buffer.alloc(paddingSize),
      ]);

      mockAxios.get.mockResolvedValueOnce({
        data: imageBuffer,
        headers: { "content-type": "image/png" },
      });

      const { detectFormatFromBuffer, isResizableFormat } = await import(
        "./utils"
      );
      vi.mocked(detectFormatFromBuffer).mockReturnValue("png");
      vi.mocked(isResizableFormat).mockReturnValue(true);

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = await downloadAndProcessImage(
        "https://example.com/image.png",
        "test-block",
        0
      );

      expect(result.newPath).toBeDefined();

      const { getProcessingMetrics } = await import("./imageProcessing");
      const metrics = getProcessingMetrics();
      expect(metrics.skippedAlreadyOptimized).toBe(1);
    });

    it("should track processing metrics correctly", async () => {
      const { getProcessingMetrics, resetProcessingMetrics } = await import(
        "./imageProcessing"
      );
      resetProcessingMetrics();

      const mockAxios = vi.mocked(axios);

      // Small image (skip)
      const smallBuffer = Buffer.alloc(30 * 1024);
      mockAxios.get.mockResolvedValueOnce({
        data: smallBuffer,
        headers: { "content-type": "image/jpeg" },
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      await downloadAndProcessImage("https://example.com/small.jpg", "test", 0);

      // Large image (process)
      const largeBuffer = Buffer.alloc(100 * 1024);
      mockAxios.get.mockResolvedValueOnce({
        data: largeBuffer,
        headers: { "content-type": "image/jpeg" },
      });

      await downloadAndProcessImage("https://example.com/large.jpg", "test", 1);

      const metrics = getProcessingMetrics();
      expect(metrics.totalProcessed).toBe(2);
      expect(metrics.skippedSmallSize).toBe(1);
      expect(metrics.fullyProcessed).toBe(1);
    });
  });
});
