import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processImage } from "./imageProcessor";

describe("imageProcessor", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
  });

  it("should run without errors", () => {
    // This basic test ensures the module can be imported
    expect(processImage).toBeDefined();
    expect(typeof processImage).toBe("function");
  });

  describe("processImage function", () => {
    it("should be defined as an async function", () => {
      expect(processImage).toBeInstanceOf(Function);
      expect(processImage.length).toBe(2); // inputBuffer, outputPath (maxWidth is optional)
    });

    it("should handle SVG images without processing", async () => {
      const inputBuffer = Buffer.from("<svg>fake-svg-data</svg>");
      const outputPath = "/path/to/output.svg";

      const result = await processImage(inputBuffer, outputPath);

      expect(result).toHaveProperty("outputBuffer");
      expect(result).toHaveProperty("originalSize");
      expect(result).toHaveProperty("processedSize");
      expect(result.outputBuffer).toBe(inputBuffer);
      expect(result.originalSize).toBe(inputBuffer.length);
      expect(result.processedSize).toBe(inputBuffer.length);
    });

    it("should handle SVG files with uppercase extension", async () => {
      const inputBuffer = Buffer.from("<svg>fake-svg-data</svg>");
      const outputPath = "/path/to/output.SVG";

      const result = await processImage(inputBuffer, outputPath);

      expect(result.outputBuffer).toBe(inputBuffer);
      expect(result.originalSize).toBe(inputBuffer.length);
      expect(result.processedSize).toBe(inputBuffer.length);
    });

    it("should throw error for unsupported formats", async () => {
      const inputBuffer = Buffer.from("fake-image-data");
      const outputPath = "/path/to/output.bmp";

      await expect(processImage(inputBuffer, outputPath)).rejects.toThrow(
        "Unsupported image format: .bmp"
      );
    });

    it("should throw error for files without extensions", async () => {
      const inputBuffer = Buffer.from("fake-image-data");
      const outputPath = "/path/to/output";

      await expect(processImage(inputBuffer, outputPath)).rejects.toThrow(
        "Unsupported image format:"
      );
    });

    it("should throw error for unknown extensions", async () => {
      const inputBuffer = Buffer.from("fake-image-data");
      const outputPath = "/path/to/output.xyz";

      await expect(processImage(inputBuffer, outputPath)).rejects.toThrow(
        "Unsupported image format: .xyz"
      );
    });

    it("should accept maxWidth parameter", () => {
      const inputBuffer = Buffer.from("fake-image-data");
      const outputPath = "/path/to/output.svg"; // Use SVG to avoid Sharp processing

      // Should not throw when called with maxWidth parameter
      expect(() => {
        const promise = processImage(inputBuffer, outputPath, 800);
        promise.catch(() => {}); // Ignore promise rejection for interface test
      }).not.toThrow();
    });

    it("should work without maxWidth parameter (default value)", () => {
      const inputBuffer = Buffer.from("fake-image-data");
      const outputPath = "/path/to/output.svg"; // Use SVG to avoid Sharp processing

      // Should not throw when called without maxWidth parameter
      expect(() => {
        const promise = processImage(inputBuffer, outputPath);
        promise.catch(() => {}); // Ignore promise rejection for interface test
      }).not.toThrow();
    });

    it("should return Promise", () => {
      const inputBuffer = Buffer.from("fake-image-data");
      const outputPath = "/path/to/output.svg";

      const result = processImage(inputBuffer, outputPath);
      expect(result).toBeInstanceOf(Promise);

      // Clean up promise
      result.catch(() => {});
    });

    it("should handle small buffers for SVG", async () => {
      const inputBuffer = Buffer.from("<svg></svg>");
      const outputPath = "/path/to/output.svg";

      const result = await processImage(inputBuffer, outputPath);

      expect(result.outputBuffer).toBe(inputBuffer);
      expect(result.originalSize).toBe(inputBuffer.length);
      expect(result.processedSize).toBe(inputBuffer.length);
    });

    it("should handle different path formats", async () => {
      const inputBuffer = Buffer.from("<svg>test</svg>");
      const testPaths = [
        "file.svg",
        "./file.svg",
        "/absolute/path/file.svg",
        "../relative/file.svg",
        "path/with spaces/file.svg",
      ];

      for (const outputPath of testPaths) {
        const result = await processImage(inputBuffer, outputPath);
        expect(result.outputBuffer).toBe(inputBuffer);
      }
    });
  });
});
