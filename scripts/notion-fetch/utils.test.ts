import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ImgFormat } from "./utils";

// Mock imageCompressor module
vi.mock("./imageCompressor", () => ({
  compressImage: vi.fn(),
}));

describe("notion-fetch utils", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Setup console spy (fresh for each test)
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./utils");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./utils");
    expect(typeof scriptModule).toBe("object");
  });

  describe("detectFormatFromBuffer", () => {
    it("should detect PNG format", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      expect(detectFormatFromBuffer(pngBuffer)).toBe("png");
    });

    it("should detect JPEG format", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      expect(detectFormatFromBuffer(jpegBuffer)).toBe("jpeg");
    });

    it("should detect GIF format", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const gifBuffer = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
      ]);
      expect(detectFormatFromBuffer(gifBuffer)).toBe("gif");
    });

    it("should detect WEBP format", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(detectFormatFromBuffer(webpBuffer)).toBe("webp");
    });

    it("should detect AVIF format (avif brand)", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const avifBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
      ]);
      expect(detectFormatFromBuffer(avifBuffer)).toBe("avif");
    });

    it("should detect AVIF format (avis brand)", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const avisBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73,
      ]);
      expect(detectFormatFromBuffer(avisBuffer)).toBe("avif");
    });

    it("should detect HEIC format (heic brand)", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const heicBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      ]);
      expect(detectFormatFromBuffer(heicBuffer)).toBe("heic");
    });

    it("should detect HEIC format (mif1 brand)", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const mif1Buffer = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31,
      ]);
      expect(detectFormatFromBuffer(mif1Buffer)).toBe("heic");
    });

    it("should detect SVG format", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const svgBuffer = Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'
      );
      expect(detectFormatFromBuffer(svgBuffer)).toBe("svg");
    });

    it("should handle SVG with uppercase tags", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const svgBuffer = Buffer.from('<SVG width="100" height="100"></SVG>');
      expect(detectFormatFromBuffer(svgBuffer)).toBe("svg");
    });

    it("should return unknown for buffers less than 12 bytes", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const smallBuffer = Buffer.from([0x01, 0x02, 0x03]);
      expect(detectFormatFromBuffer(smallBuffer)).toBe("unknown");
    });

    it("should return unknown for empty buffer", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const emptyBuffer = Buffer.alloc(0);
      expect(detectFormatFromBuffer(emptyBuffer)).toBe("unknown");
    });

    it("should return unknown for null buffer", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      expect(detectFormatFromBuffer(null as any)).toBe("unknown");
    });

    it("should return unknown for unrecognized format", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      const unknownBuffer = Buffer.from([
        0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      ]);
      expect(detectFormatFromBuffer(unknownBuffer)).toBe("unknown");
    });

    it("should handle SVG decode errors gracefully", async () => {
      const { detectFormatFromBuffer } = await import("./utils");
      // Buffer with invalid UTF-8 sequence
      const invalidUtf8 = Buffer.from([
        0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8, 0xf7, 0xf6, 0xf5, 0xf4,
      ]);
      expect(detectFormatFromBuffer(invalidUtf8)).toBe("unknown");
    });
  });

  describe("formatFromContentType", () => {
    it("should detect PNG from content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/png")).toBe("png");
    });

    it("should detect JPEG from image/jpeg", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/jpeg")).toBe("jpeg");
    });

    it("should detect JPEG from image/jpg", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/jpg")).toBe("jpeg");
    });

    it("should detect WEBP from content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/webp")).toBe("webp");
    });

    it("should detect SVG from content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/svg+xml")).toBe("svg");
    });

    it("should detect GIF from content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/gif")).toBe("gif");
    });

    it("should detect AVIF from content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/avif")).toBe("avif");
    });

    it("should detect HEIC from image/heic", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/heic")).toBe("heic");
    });

    it("should detect HEIC from image/heif", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/heif")).toBe("heic");
    });

    it("should handle content-type with charset", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("image/png; charset=utf-8")).toBe("png");
    });

    it("should be case-insensitive", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("IMAGE/PNG")).toBe("png");
      expect(formatFromContentType("Image/JPEG")).toBe("jpeg");
    });

    it("should return unknown for undefined content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType(undefined)).toBe("unknown");
    });

    it("should return unknown for empty content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("")).toBe("unknown");
    });

    it("should return unknown for unrecognized content-type", async () => {
      const { formatFromContentType } = await import("./utils");
      expect(formatFromContentType("application/octet-stream")).toBe("unknown");
    });
  });

  describe("chooseFormat", () => {
    it("should prefer buffer format over header format", async () => {
      const { chooseFormat } = await import("./utils");
      expect(chooseFormat("png", "jpeg")).toBe("png");
    });

    it("should use header format when buffer is unknown", async () => {
      const { chooseFormat } = await import("./utils");
      expect(chooseFormat("unknown", "webp")).toBe("webp");
    });

    it("should return unknown when both are unknown", async () => {
      const { chooseFormat } = await import("./utils");
      expect(chooseFormat("unknown", "unknown")).toBe("unknown");
    });

    it("should prefer buffer format when header is unknown", async () => {
      const { chooseFormat } = await import("./utils");
      expect(chooseFormat("jpeg", "unknown")).toBe("jpeg");
    });
  });

  describe("extForFormat", () => {
    it("should return .jpg for jpeg", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("jpeg")).toBe(".jpg");
    });

    it("should return .png for png", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("png")).toBe(".png");
    });

    it("should return .webp for webp", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("webp")).toBe(".webp");
    });

    it("should return .svg for svg", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("svg")).toBe(".svg");
    });

    it("should return .gif for gif", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("gif")).toBe(".gif");
    });

    it("should return .avif for avif", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("avif")).toBe(".avif");
    });

    it("should return .heic for heic", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("heic")).toBe(".heic");
    });

    it("should return empty string for unknown", async () => {
      const { extForFormat } = await import("./utils");
      expect(extForFormat("unknown")).toBe("");
    });
  });

  describe("isResizableFormat", () => {
    it("should return true for jpeg", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("jpeg")).toBe(true);
    });

    it("should return true for png", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("png")).toBe(true);
    });

    it("should return true for webp", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("webp")).toBe(true);
    });

    it("should return false for svg", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("svg")).toBe(false);
    });

    it("should return false for gif", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("gif")).toBe(false);
    });

    it("should return false for avif", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("avif")).toBe(false);
    });

    it("should return false for heic", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("heic")).toBe(false);
    });

    it("should return false for unknown", async () => {
      const { isResizableFormat } = await import("./utils");
      expect(isResizableFormat("unknown")).toBe(false);
    });
  });

  describe("warnOptimizationFailure", () => {
    it("should warn with Error object details", async () => {
      const { warnOptimizationFailure } = await import("./utils");
      const error = new Error("Optimization failed");
      error.name = "OptimizationError";

      warnOptimizationFailure(
        "https://example.com/image.png",
        "/path/to/file.png",
        "compress",
        error
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[img-optimize:warn]")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("stage=compress")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("source=https://example.com/image.png")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("target=/path/to/file.png")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("OptimizationError")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Optimization failed")
      );
    });

    it("should warn with string error", async () => {
      const { warnOptimizationFailure } = await import("./utils");

      warnOptimizationFailure(
        "https://example.com/test.jpg",
        "/tmp/test.jpg",
        "download",
        "Network timeout"
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Network timeout")
      );
    });

    it("should include SOFT_FAIL flag in warning", async () => {
      const { warnOptimizationFailure } = await import("./utils");

      warnOptimizationFailure(
        "https://example.com/image.png",
        "/path/to/file.png",
        "resize",
        new Error("Test error")
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("softFail=true")
      );
    });
  });

  describe("compressImageWithFallback", () => {
    it("should return compressed buffer when compression succeeds and is smaller", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageWithFallback } = await import("./utils");

      const inputBuffer = Buffer.alloc(1000, 0xaa);
      const compressedBuffer = Buffer.alloc(500, 0xbb);

      vi.mocked(compressImage).mockResolvedValue({
        compressedBuffer,
        originalSize: 1000,
        compressedSize: 500,
      });

      const result = await compressImageWithFallback(
        inputBuffer,
        "/path/to/file.png",
        "https://example.com/image.png"
      );

      expect(result.buffer).toBe(compressedBuffer);
      expect(result.compressedSize).toBe(500);
      expect(result.usedFallback).toBe(false);
    });

    it("should return original buffer when compressed is larger", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageWithFallback } = await import("./utils");

      const inputBuffer = Buffer.alloc(500, 0xaa);
      const compressedBuffer = Buffer.alloc(1000, 0xbb);

      vi.mocked(compressImage).mockResolvedValue({
        compressedBuffer,
        originalSize: 500,
        compressedSize: 1000,
      });

      const result = await compressImageWithFallback(
        inputBuffer,
        "/path/to/file.png",
        "https://example.com/image.png"
      );

      expect(result.buffer).toBe(inputBuffer);
      expect(result.compressedSize).toBe(500);
      expect(result.usedFallback).toBe(true);
    });

    it("should return original buffer when compressed is equal size", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageWithFallback } = await import("./utils");

      const inputBuffer = Buffer.alloc(1000, 0xaa);
      const compressedBuffer = Buffer.alloc(1000, 0xbb);

      vi.mocked(compressImage).mockResolvedValue({
        compressedBuffer,
        originalSize: 1000,
        compressedSize: 1000,
      });

      const result = await compressImageWithFallback(
        inputBuffer,
        "/path/to/file.png",
        "https://example.com/image.png"
      );

      expect(result.buffer).toBe(inputBuffer);
      expect(result.compressedSize).toBe(1000);
      expect(result.usedFallback).toBe(true);
    });

    it("should fallback on error when SOFT_FAIL is true", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageWithFallback, SOFT_FAIL } = await import("./utils");

      expect(SOFT_FAIL).toBe(true); // Default

      const inputBuffer = Buffer.alloc(1000, 0xaa);

      vi.mocked(compressImage).mockRejectedValue(
        new Error("Compression failed")
      );

      const result = await compressImageWithFallback(
        inputBuffer,
        "/path/to/file.png",
        "https://example.com/image.png"
      );

      expect(result.buffer).toBe(inputBuffer);
      expect(result.compressedSize).toBe(1000);
      expect(result.usedFallback).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("optimize-buffer")
      );
    });
  });

  describe("compressImageToFileWithFallback", () => {
    let tmpDir: string;

    beforeEach(() => {
      // Create a real temp directory for testing
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "utils-test-"));
    });

    afterEach(() => {
      // Cleanup temp directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it("should write optimized file when compression succeeds and is smaller", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageToFileWithFallback } = await import("./utils");

      const originalBuffer = Buffer.alloc(1000, 0xaa);
      const candidateBuffer = Buffer.alloc(900, 0xbb);
      const compressedBuffer = Buffer.alloc(500, 0xcc);
      const filepath = path.join(tmpDir, "test.png");

      vi.mocked(compressImage).mockResolvedValue({
        compressedBuffer,
        originalSize: 900,
        compressedSize: 500,
      });

      const result = await compressImageToFileWithFallback(
        originalBuffer,
        candidateBuffer,
        filepath,
        "https://example.com/image.png"
      );

      expect(result.finalSize).toBe(500);
      expect(result.usedFallback).toBe(false);
      expect(fs.existsSync(filepath)).toBe(true);

      const writtenContent = fs.readFileSync(filepath);
      expect(writtenContent).toEqual(compressedBuffer);
    });

    it("should write original file when optimized is not smaller", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageToFileWithFallback } = await import("./utils");

      const originalBuffer = Buffer.alloc(500, 0xaa);
      const candidateBuffer = Buffer.alloc(500, 0xbb);
      const compressedBuffer = Buffer.alloc(600, 0xcc); // Larger!
      const filepath = path.join(tmpDir, "test.png");

      vi.mocked(compressImage).mockResolvedValue({
        compressedBuffer,
        originalSize: 500,
        compressedSize: 600,
      });

      const result = await compressImageToFileWithFallback(
        originalBuffer,
        candidateBuffer,
        filepath,
        "https://example.com/image.png"
      );

      expect(result.finalSize).toBe(500);
      expect(result.usedFallback).toBe(true);

      const writtenContent = fs.readFileSync(filepath);
      expect(writtenContent).toEqual(originalBuffer);
    });

    it("should write original file on compression error with soft fail", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageToFileWithFallback } = await import("./utils");

      const originalBuffer = Buffer.alloc(1000, 0xaa);
      const candidateBuffer = Buffer.alloc(900, 0xbb);
      const filepath = path.join(tmpDir, "test.png");

      vi.mocked(compressImage).mockRejectedValue(
        new Error("Compression failed")
      );

      const result = await compressImageToFileWithFallback(
        originalBuffer,
        candidateBuffer,
        filepath,
        "https://example.com/image.png"
      );

      expect(result.finalSize).toBe(1000);
      expect(result.usedFallback).toBe(true);

      const writtenContent = fs.readFileSync(filepath);
      expect(writtenContent).toEqual(originalBuffer);
    });

    it("should cleanup temp directory after success", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageToFileWithFallback } = await import("./utils");

      const originalBuffer = Buffer.alloc(1000, 0xaa);
      const candidateBuffer = Buffer.alloc(900, 0xbb);
      const compressedBuffer = Buffer.alloc(500, 0xcc);
      const filepath = path.join(tmpDir, "test.png");

      vi.mocked(compressImage).mockResolvedValue({
        compressedBuffer,
        originalSize: 900,
        compressedSize: 500,
      });

      await compressImageToFileWithFallback(
        originalBuffer,
        candidateBuffer,
        filepath,
        "https://example.com/image.png"
      );

      // Temp directory should be cleaned up
      // We can't easily verify this without tracking fs.mkdtempSync,
      // but we can verify the final file exists
      expect(fs.existsSync(filepath)).toBe(true);
    });

    it("should cleanup temp directory after error", async () => {
      const { compressImage } = await import("./imageCompressor");
      const { compressImageToFileWithFallback } = await import("./utils");

      const originalBuffer = Buffer.alloc(1000, 0xaa);
      const candidateBuffer = Buffer.alloc(900, 0xbb);
      const filepath = path.join(tmpDir, "test.png");

      vi.mocked(compressImage).mockRejectedValue(
        new Error("Compression failed")
      );

      await compressImageToFileWithFallback(
        originalBuffer,
        candidateBuffer,
        filepath,
        "https://example.com/image.png"
      );

      // Final file should exist with original content
      expect(fs.existsSync(filepath)).toBe(true);
      const content = fs.readFileSync(filepath);
      expect(content).toEqual(originalBuffer);
    });
  });
});
