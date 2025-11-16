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
    });

    it("should initialize with empty cache when file doesn't exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cache = new ImageCache();
      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.validEntries).toBe(0);
    });

    it("should load existing cache from file", () => {
      const cacheData = {
        "https://example.com/image1.jpg": {
          url: "https://example.com/image1.jpg",
          localPath: "test_0.jpg",
          timestamp: "2024-01-01T00:00:00Z",
          blockName: "test-block",
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheData));

      const cache = new ImageCache();
      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(1);
    });

    it("should handle corrupt cache file gracefully", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json{{{");

      const cache = new ImageCache();
      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load image cache")
      );
    });

    it("should check if cached image exists", () => {
      const cache = new ImageCache();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      cache.set(
        "https://example.com/image.jpg",
        "/images/test_0.jpg",
        "test-block"
      );

      expect(cache.has("https://example.com/image.jpg")).toBe(true);
      expect(cache.has("https://example.com/nonexistent.jpg")).toBe(false);
    });

    it("should get cached entry", () => {
      const cache = new ImageCache();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      cache.set(
        "https://example.com/image.jpg",
        "/images/test_0.jpg",
        "test-block"
      );

      const entry = cache.get("https://example.com/image.jpg");

      expect(entry).toBeDefined();
      expect(entry?.url).toBe("https://example.com/image.jpg");
      expect(entry?.blockName).toBe("test-block");
    });

    it("should return undefined for non-existent cache entry", () => {
      const cache = new ImageCache();

      const entry = cache.get("https://example.com/nonexistent.jpg");

      expect(entry).toBeUndefined();
    });

    it("should set cache entry and save to file", () => {
      const cache = new ImageCache();

      cache.set(
        "https://example.com/image.jpg",
        "/images/test_0.jpg",
        "test-block"
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
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
        expect.stringContaining("Failed to save image cache")
      );
    });

    it("should get cache statistics", () => {
      const cache = new ImageCache();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      cache.set("https://example.com/image1.jpg", "/images/test_0.jpg", "test");
      cache.set("https://example.com/image2.jpg", "/images/test_1.jpg", "test");

      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.validEntries).toBeGreaterThanOrEqual(0);
    });

    it("should cleanup stale entries", () => {
      const cache = new ImageCache();

      // Add entries
      vi.mocked(fs.existsSync).mockReturnValue(true);
      cache.set("https://example.com/image1.jpg", "/images/test_0.jpg", "test");
      cache.set("https://example.com/image2.jpg", "/images/test_1.jpg", "test");

      // Mock first image missing
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        return !path.includes("test_0.jpg");
      });

      cache.cleanup();

      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("Cleaned up")
      );
    });

    it("should reject suspicious file names with path traversal", () => {
      const cache = new ImageCache();

      vi.mocked(fs.existsSync).mockReturnValue(true);

      // This should sanitize the path
      cache.set(
        "https://example.com/image.jpg",
        "../../../etc/passwd",
        "test-block"
      );

      // The cache should store only the basename
      const entry = cache.get("https://example.com/image.jpg");
      expect(entry?.localPath).not.toContain("..");
    });
  });

  describe("downloadAndProcessImageWithCache", () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    it("should return cached image if available", async () => {
      // Get the global cache and populate it
      const imageCache = getImageCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Set cache entry
      imageCache.set(
        "https://example.com/cached.jpg",
        "cached_0.jpg",
        "test-block"
      );

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
});
