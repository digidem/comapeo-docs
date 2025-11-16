import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { EmojiFile } from "./emojiCache.js";
import {
  validateEmojiUrl,
  validateImageContent,
  formatError,
  processEmoji,
  type EmojiProcessorConfig,
} from "./emojiDownload.js";

// Mock dependencies
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("./spinnerManager.js", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    remove: vi.fn(),
  },
}));

vi.mock("./utils.js", () => ({
  compressImageToFileWithFallback: vi.fn(() =>
    Promise.resolve({ finalSize: 1024, usedFallback: false })
  ),
  isResizableFormat: vi.fn(() => true),
  detectFormatFromBuffer: vi.fn(() => "png"),
  extForFormat: vi.fn(() => ".png"),
}));

import axios from "axios";

describe("emojiDownload", () => {
  const testDir = path.join(process.cwd(), "test-emoji-download");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("validateEmojiUrl", () => {
    const allowedHosts = ["amazonaws.com", "notion.site"];

    it("should accept valid emoji URLs from allowed hosts", () => {
      expect(
        validateEmojiUrl("https://amazonaws.com/emojis/smile.png", allowedHosts)
      ).toBe(true);
      expect(
        validateEmojiUrl("https://notion.site/emoji/heart.svg", allowedHosts)
      ).toBe(true);
    });

    it("should accept URLs with emoji in path", () => {
      expect(
        validateEmojiUrl(
          "https://amazonaws.com/path/emoji/file.png",
          allowedHosts
        )
      ).toBe(true);
    });

    it("should accept Notion static URLs when host is allowed", () => {
      const hostsWithNotionStatic = [...allowedHosts, "notion-static.com"];
      expect(
        validateEmojiUrl(
          "https://notion-static.com/emojis/icon.png",
          hostsWithNotionStatic
        )
      ).toBe(true);
      // Also accepts if path contains notion-static.com
      expect(
        validateEmojiUrl(
          "https://amazonaws.com/notion-static.com/icon.png",
          allowedHosts
        )
      ).toBe(true);
    });

    it("should accept icon file patterns", () => {
      expect(
        validateEmojiUrl("https://amazonaws.com/icon-abc123.png", allowedHosts)
      ).toBe(true);
      expect(
        validateEmojiUrl("https://notion.site/icon-test.svg", allowedHosts)
      ).toBe(true);
    });

    it("should accept various image extensions", () => {
      const extensions = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
      for (const ext of extensions) {
        expect(
          validateEmojiUrl(
            `https://amazonaws.com/emoji/test.${ext}`,
            allowedHosts
          )
        ).toBe(true);
      }
    });

    it("should reject non-HTTPS URLs", () => {
      expect(
        validateEmojiUrl("http://amazonaws.com/emojis/smile.png", allowedHosts)
      ).toBe(false);
      expect(
        validateEmojiUrl("ftp://amazonaws.com/emojis/smile.png", allowedHosts)
      ).toBe(false);
    });

    it("should reject URLs from non-allowed hosts", () => {
      expect(
        validateEmojiUrl("https://evil.com/emojis/smile.png", allowedHosts)
      ).toBe(false);
      expect(
        validateEmojiUrl("https://example.com/emoji/test.png", allowedHosts)
      ).toBe(false);
    });

    it("should reject URLs without image extensions", () => {
      expect(
        validateEmojiUrl("https://amazonaws.com/emoji/test", allowedHosts)
      ).toBe(false);
      expect(
        validateEmojiUrl("https://amazonaws.com/emoji/test.txt", allowedHosts)
      ).toBe(false);
    });

    it("should reject URLs without emoji-related paths", () => {
      expect(
        validateEmojiUrl("https://amazonaws.com/random/file.png", allowedHosts)
      ).toBe(false);
    });

    it("should handle invalid URLs gracefully", () => {
      expect(validateEmojiUrl("not-a-url", allowedHosts)).toBe(false);
      expect(validateEmojiUrl("", allowedHosts)).toBe(false);
      expect(validateEmojiUrl("https://", allowedHosts)).toBe(false);
    });

    it("should be case insensitive for extensions", () => {
      expect(
        validateEmojiUrl("https://amazonaws.com/emoji/test.PNG", allowedHosts)
      ).toBe(true);
      expect(
        validateEmojiUrl("https://amazonaws.com/emoji/test.JPG", allowedHosts)
      ).toBe(true);
    });
  });

  describe("validateImageContent", () => {
    it("should validate PNG magic numbers", () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(validateImageContent(pngBuffer)).toBe(true);
    });

    it("should validate JPG magic numbers", () => {
      const jpgBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      expect(validateImageContent(jpgBuffer)).toBe(true);
    });

    it("should validate GIF magic numbers (87a)", () => {
      const gifBuffer = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00,
      ]);
      expect(validateImageContent(gifBuffer)).toBe(true);
    });

    it("should validate GIF magic numbers (89a)", () => {
      const gifBuffer = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00,
      ]);
      expect(validateImageContent(gifBuffer)).toBe(true);
    });

    it("should validate WebP magic numbers", () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      ]);
      expect(validateImageContent(webpBuffer)).toBe(true);
    });

    it("should validate SVG magic numbers (XML declaration)", () => {
      const svgBuffer = Buffer.from([
        0x3c, 0x3f, 0x78, 0x6d, 0x6c, 0x00, 0x00, 0x00,
      ]);
      expect(validateImageContent(svgBuffer)).toBe(true);
    });

    it("should validate SVG magic numbers (svg tag)", () => {
      const svgBuffer = Buffer.from([
        0x3c, 0x73, 0x76, 0x67, 0x00, 0x00, 0x00, 0x00,
      ]);
      expect(validateImageContent(svgBuffer)).toBe(true);
    });

    it("should reject buffers with invalid magic numbers", () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateImageContent(invalidBuffer)).toBe(false);
    });

    it("should reject buffers that are too short", () => {
      const shortBuffer = Buffer.from([0x89, 0x50]);
      expect(validateImageContent(shortBuffer)).toBe(false);
    });

    it("should reject empty buffers", () => {
      const emptyBuffer = Buffer.from([]);
      expect(validateImageContent(emptyBuffer)).toBe(false);
    });

    it("should reject text content", () => {
      const textBuffer = Buffer.from("This is text content");
      expect(validateImageContent(textBuffer)).toBe(false);
    });
  });

  describe("formatError", () => {
    it("should format error with operation and URL", () => {
      const error = new Error("Test error");
      const result = formatError(
        "Download",
        "https://example.com/emoji.png",
        error
      );

      expect(result).toContain("Download");
      expect(result).toContain("https://example.com/emoji.png");
      expect(result).toContain("Test error");
    });

    it("should handle errors without message property", () => {
      const result = formatError(
        "Download",
        "https://example.com/emoji.png",
        "String error"
      );

      expect(result).toContain("Download");
      expect(result).toContain("String error");
    });

    it("should handle null/undefined errors", () => {
      const result1 = formatError(
        "Download",
        "https://example.com/emoji.png",
        null
      );
      const result2 = formatError(
        "Download",
        "https://example.com/emoji.png",
        undefined
      );

      expect(result1).toContain("Download");
      expect(result2).toContain("Download");
    });

    it("should handle different operations", () => {
      const error = new Error("Test");
      expect(formatError("Validation", "url", error)).toContain("Validation");
      expect(formatError("Processing", "url", error)).toContain("Processing");
      expect(formatError("HTTP 404", "url", error)).toContain("HTTP 404");
    });
  });

  describe("processEmoji", () => {
    const config: EmojiProcessorConfig = {
      emojiPath: testDir,
      cacheFile: path.join(testDir, ".emoji-cache.json"),
      maxEmojiSize: 1024 * 1024,
      maxConcurrentDownloads: 2,
      downloadTimeout: 5000,
      maxEmojisPerPage: 10,
      enableProcessing: true,
      allowedHosts: ["amazonaws.com", "notion.site", "test.com"],
    };

    it("should return original URL when processing is disabled", async () => {
      const disabledConfig = { ...config, enableProcessing: false };
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const result = await processEmoji(
        "https://amazonaws.com/emoji/test.png",
        "page-id",
        disabledConfig,
        emojiCache,
        saveCache
      );

      expect(result.newPath).toBe("https://amazonaws.com/emoji/test.png");
      expect(result.reused).toBe(false);
      expect(result.savedBytes).toBe(0);
    });

    it("should return original URL for invalid emoji URLs", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const result = await processEmoji(
        "https://evil.com/not-emoji.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      expect(result.newPath).toBe("https://evil.com/not-emoji.png");
      expect(result.reused).toBe(false);
    });

    it("should return cached emoji if available", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const cacheEntry: EmojiFile = {
        url: "https://amazonaws.com/emoji/test.png",
        filename: "test.png",
        localPath: path.join(testDir, "test.png"),
        hash: "abc123",
        size: 1024,
      };

      emojiCache.set("https://amazonaws.com/emoji/test.png", cacheEntry);
      fs.writeFileSync(path.join(testDir, "test.png"), "test");

      const saveCache = vi.fn();

      const result = await processEmoji(
        "https://amazonaws.com/emoji/test.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      expect(result.reused).toBe(true);
      expect(result.newPath).toContain("test.png");
    });

    it("should download and process new emoji", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      // Mock successful download
      const pngBuffer = Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        ...Array(100).fill(0),
      ]);

      (axios.get as any).mockResolvedValue({
        data: pngBuffer,
      });

      const result = await processEmoji(
        "https://test.com/emoji/smile.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      expect(result.reused).toBe(false);
      expect(result.newPath).toContain(".png");
      expect(saveCache).toHaveBeenCalled();
    });

    it("should reject files that are too large", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      // Mock large file
      const largeBuffer = Buffer.alloc(config.maxEmojiSize + 1);
      (axios.get as any).mockResolvedValue({
        data: largeBuffer,
      });

      const result = await processEmoji(
        "https://test.com/emoji/large.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      // Should fallback to original URL
      expect(result.newPath).toBe("https://test.com/emoji/large.png");
    });

    it("should reject invalid image content", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      // Mock invalid content
      const invalidBuffer = Buffer.from("not an image");
      (axios.get as any).mockResolvedValue({
        data: invalidBuffer,
      });

      const result = await processEmoji(
        "https://test.com/emoji/fake.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      // Should fallback to original URL
      expect(result.newPath).toBe("https://test.com/emoji/fake.png");
    });

    it.skip("should reuse existing file with same hash", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      // Create existing file
      const existingFile = path.join(testDir, "existing.png");
      fs.writeFileSync(existingFile, "test");

      const existingEntry: EmojiFile = {
        url: "https://test.com/emoji/old.png",
        filename: "existing.png",
        localPath: existingFile,
        hash: "samehash",
        size: 1024,
      };

      emojiCache.set("https://test.com/emoji/old.png", existingEntry);

      // Mock download with same content (will generate same hash)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      (axios.get as any).mockResolvedValue({
        data: pngBuffer,
      });

      // Mock generateHash to return the same hash
      const { generateHash } = await import("./emojiCache.js");
      vi.spyOn({ generateHash }, "generateHash").mockReturnValue("samehash");

      const result = await processEmoji(
        "https://test.com/emoji/new.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      expect(result.reused).toBe(true);
      expect(saveCache).toHaveBeenCalled();
    });

    it("should handle download timeout", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const timeoutError = new Error("timeout");
      (timeoutError as any).code = "ECONNABORTED";

      (axios.get as any).mockRejectedValue(timeoutError);

      const result = await processEmoji(
        "https://test.com/emoji/timeout.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      // Should fallback to original URL
      expect(result.newPath).toBe("https://test.com/emoji/timeout.png");
    });

    it("should handle DNS resolution errors", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const dnsError = new Error("DNS error");
      (dnsError as any).code = "ENOTFOUND";

      (axios.get as any).mockRejectedValue(dnsError);

      const result = await processEmoji(
        "https://test.com/emoji/notfound.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      // Should fallback to original URL
      expect(result.newPath).toBe("https://test.com/emoji/notfound.png");
    });

    it("should handle HTTP errors", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const httpError = {
        response: { status: 404 },
        message: "Not found",
      };

      (axios.get as any).mockRejectedValue(httpError);

      const result = await processEmoji(
        "https://test.com/emoji/404.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );

      // Should fallback to original URL
      expect(result.newPath).toBe("https://test.com/emoji/404.png");
    });
  });
});
