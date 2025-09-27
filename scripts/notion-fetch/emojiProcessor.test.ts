import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";

// Mock dependencies before importing
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

import { EmojiProcessor } from "./emojiProcessor.js";

describe("EmojiProcessor", () => {
  const testEmojiDir = path.join(process.cwd(), "static/images/emojis-test/");
  const testCacheFile = path.join(testEmojiDir, ".emoji-cache.json");

  beforeEach(() => {
    // Configure with test paths
    EmojiProcessor.configure({
      emojiPath: testEmojiDir,
      cacheFile: testCacheFile,
      maxEmojiSize: 1024 * 1024, // 1MB for testing
      maxConcurrentDownloads: 2,
      downloadTimeout: 5000,
      maxEmojisPerPage: 10,
      enableProcessing: true,
      allowedHosts: ["amazonaws.com", "notion.site", "test.com"], // Add test.com for testing
    });

    // Reset the processor
    EmojiProcessor.reset();

    // Ensure test directory exists
    fs.mkdirSync(testEmojiDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testEmojiDir)) {
      fs.rmSync(testEmojiDir, { recursive: true, force: true });
    }

    // Reset processor
    EmojiProcessor.reset();
  });

  describe("processPageEmojis", () => {
    it("should return content unchanged when no emojis present", async () => {
      const content = "This is a test content without emojis.";
      const result = await EmojiProcessor.processPageEmojis(
        "test-page",
        content
      );

      expect(result.content).toBe(content);
      expect(result.totalSaved).toBe(0);
    });

    it("should detect Notion emoji URLs", async () => {
      const content = `Check out this emoji: https://amazonaws.com/emoji/smile.png and this one: https://notion.site/emoji/heart.svg`;

      // Mock successful emoji processing
      vi.spyOn(EmojiProcessor, "processEmoji").mockResolvedValue({
        newPath: "/images/emojis/test-emoji.png",
        savedBytes: 1024,
        reused: false,
      });

      const result = await EmojiProcessor.processPageEmojis(
        "test-page",
        content
      );

      expect(EmojiProcessor.processEmoji).toHaveBeenCalledTimes(2);
      expect(result.content).toContain("/images/emojis/test-emoji.png");
      expect(result.totalSaved).toBe(2048); // 1024 * 2
    });

    it("should return content unchanged when processing is disabled", async () => {
      EmojiProcessor.configure({ enableProcessing: false });
      const content = `Check out this emoji: https://amazonaws.com/emoji/smile.png`;

      const result = await EmojiProcessor.processPageEmojis(
        "test-page",
        content
      );

      expect(result.content).toBe(content);
      expect(result.totalSaved).toBe(0);
    });

    it("should respect maxEmojisPerPage limit", async () => {
      EmojiProcessor.configure({ maxEmojisPerPage: 1 });
      const content = `First: https://amazonaws.com/emoji/smile.png Second: https://notion.site/emoji/heart.svg`;

      vi.spyOn(EmojiProcessor, "processEmoji").mockResolvedValue({
        newPath: "/images/emojis/test-emoji.png",
        savedBytes: 512,
        reused: false,
      });

      const result = await EmojiProcessor.processPageEmojis(
        "test-page",
        content
      );

      // Should only process the first emoji due to limit
      expect(EmojiProcessor.processEmoji).toHaveBeenCalledTimes(1);
      expect(result.totalSaved).toBe(512);
    });

    it("should handle emoji processing failures gracefully", async () => {
      const content = `Check out this emoji: https://amazonaws.com/emoji/broken.png`;

      // Mock failed emoji processing
      vi.spyOn(EmojiProcessor, "processEmoji").mockRejectedValue(
        new Error("Network error")
      );

      // Should not throw, but continue processing
      const result = await EmojiProcessor.processPageEmojis(
        "test-page",
        content
      );

      expect(result.content).toBe(content); // Content unchanged on failure
      expect(result.totalSaved).toBe(0);
    });
  });

  describe("URL validation", () => {
    it("should reject non-HTTPS URLs", async () => {
      const url = "http://amazonaws.com/emoji/test.png";
      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toBe(url); // Should fallback to original URL
      expect(result.reused).toBe(false);
    });

    it("should reject URLs from disallowed hosts", async () => {
      const url = "https://malicious.com/emoji/test.png";
      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toBe(url); // Should fallback to original URL
      expect(result.reused).toBe(false);
    });

    it("should reject URLs without valid emoji/icon path", async () => {
      const url = "https://amazonaws.com/images/test.png"; // No emoji, notion-static, or icon pattern
      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toBe(url); // Should fallback to original URL
      expect(result.reused).toBe(false);
    });

    it("should reject URLs without image extensions", async () => {
      const url = "https://amazonaws.com/emoji/test.txt";
      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toBe(url); // Should fallback to original URL
      expect(result.reused).toBe(false);
    });

    it("should accept valid emoji URLs", async () => {
      const url = "https://amazonaws.com/emoji/test.png";

      // Mock successful download and processing
      const mockAxiosGet = vi.mocked(axios.get);
      const pngMagicBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      mockAxiosGet.mockResolvedValueOnce({
        data: pngMagicBytes,
        headers: { "content-type": "image/png" },
      });

      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toMatch(/^\/images\/emojis\/.+\.png$/);
      expect(result.reused).toBe(false);
    });

    it("should accept Notion static URLs", async () => {
      const url = "https://s3-us-west-2.amazonaws.com/public.notion-static.com/b900aefd-3951-4b85-b75f-44e28a611e8a/icon-save.jpg";

      // Mock successful download and processing
      const mockAxiosGet = vi.mocked(axios.get);
      const jpgMagicBytes = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46
      ]); // Full JPEG header

      mockAxiosGet.mockResolvedValueOnce({
        data: jpgMagicBytes,
        headers: { "content-type": "image/jpeg" },
      });

      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toMatch(/^\/images\/emojis\/icon-save_.+\.(png|jpg)$/);
      expect(result.reused).toBe(false);
    });

    it("should accept icon file URLs", async () => {
      const url = "https://amazonaws.com/path/icon-custom-emoji.png";

      // Mock successful download and processing
      const mockAxiosGet = vi.mocked(axios.get);
      const pngMagicBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      mockAxiosGet.mockResolvedValueOnce({
        data: pngMagicBytes,
        headers: { "content-type": "image/png" },
      });

      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toMatch(/^\/images\/emojis\/.+\.png$/);
      expect(result.reused).toBe(false);
    });
  });

  describe("content validation", () => {
    it("should reject files that are too large", async () => {
      EmojiProcessor.configure({ maxEmojiSize: 100 }); // 100 bytes limit
      const url = "https://amazonaws.com/emoji/large.png";

      const mockAxiosGet = vi.mocked(axios.get);
      const largeBuffer = Buffer.alloc(200); // 200 bytes, exceeds limit

      mockAxiosGet.mockResolvedValueOnce({
        data: largeBuffer,
        headers: { "content-type": "image/png" },
      });

      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toBe(url); // Should fallback due to size limit
    });

    it("should reject files with invalid magic numbers", async () => {
      const url = "https://amazonaws.com/emoji/fake.png";

      const mockAxiosGet = vi.mocked(axios.get);
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]); // Invalid magic numbers

      mockAxiosGet.mockResolvedValueOnce({
        data: invalidBuffer,
        headers: { "content-type": "image/png" },
      });

      const result = await EmojiProcessor.processEmoji(url, "test-page");

      expect(result.newPath).toBe(url); // Should fallback due to content validation failure
    });
  });

  describe("configuration", () => {
    it("should use default configuration initially", () => {
      EmojiProcessor.reset();
      const config = EmojiProcessor.getConfig();

      expect(config.maxEmojiSize).toBe(5 * 1024 * 1024);
      expect(config.maxConcurrentDownloads).toBe(3);
      expect(config.enableProcessing).toBe(true);
      expect(config.allowedHosts).toEqual(["amazonaws.com", "notion.site"]);
    });

    it("should allow configuration changes", () => {
      const customConfig = {
        maxEmojiSize: 1000,
        maxConcurrentDownloads: 1,
        enableProcessing: false,
        allowedHosts: ["custom.com"],
      };

      EmojiProcessor.configure(customConfig);
      const config = EmojiProcessor.getConfig();

      expect(config.maxEmojiSize).toBe(1000);
      expect(config.maxConcurrentDownloads).toBe(1);
      expect(config.enableProcessing).toBe(false);
      expect(config.allowedHosts).toEqual(["custom.com"]);
    });
  });

  describe("cache management", () => {
    it("should load and validate cache entries", async () => {
      // Create a valid cache file
      const cacheData = {
        "https://test.com/emoji/valid.png": {
          url: "https://test.com/emoji/valid.png",
          filename: "valid.png",
          localPath: path.join(testEmojiDir, "valid.png"),
          hash: "validhash",
          size: 1024,
        },
      };

      fs.writeFileSync(testCacheFile, JSON.stringify(cacheData, null, 2));
      fs.writeFileSync(path.join(testEmojiDir, "valid.png"), "fake image data");

      await EmojiProcessor.initialize();
      const stats = EmojiProcessor.getCacheStats();

      expect(stats.totalEmojis).toBe(1);
      expect(stats.totalSize).toBe(1024);
    });

    it("should skip invalid cache entries", async () => {
      // Create cache with invalid entry
      const cacheData = {
        "https://test.com/emoji/invalid.png": {
          url: "https://test.com/emoji/invalid.png",
          filename: "invalid.png",
          // Missing required fields
        },
      };

      fs.writeFileSync(testCacheFile, JSON.stringify(cacheData, null, 2));

      await EmojiProcessor.initialize();
      const stats = EmojiProcessor.getCacheStats();

      expect(stats.totalEmojis).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return correct cache statistics", () => {
      // Add some test entries to cache
      (EmojiProcessor as any).emojiCache.set("url1", {
        url: "url1",
        filename: "emoji1.png",
        localPath: "/path/emoji1.png",
        hash: "hash1",
        size: 1024,
      });

      (EmojiProcessor as any).emojiCache.set("url2", {
        url: "url2",
        filename: "emoji2.png",
        localPath: "/path/emoji2.png",
        hash: "hash2",
        size: 2048,
      });

      const stats = EmojiProcessor.getCacheStats();

      expect(stats.totalEmojis).toBe(2);
      expect(stats.totalSize).toBe(3072);
      expect(stats.uniqueEmojis).toBe(2);
    });
  });

  describe("initialization", () => {
    it("should create emoji directory on initialization", async () => {
      await EmojiProcessor.initialize();

      expect(fs.existsSync(testEmojiDir)).toBe(true);
    });

    it("should only initialize once", async () => {
      const mkdirSpy = vi.spyOn(fs, "mkdirSync");

      await EmojiProcessor.initialize();
      await EmojiProcessor.initialize();

      // Should only be called once for the directory creation
      expect(mkdirSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("custom emoji extraction", () => {
    it("should extract custom emojis from rich text blocks", () => {
      const blocks = [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    id: "12345",
                    name: "test-emoji",
                    url: "https://s3-us-west-2.amazonaws.com/public.notion-static.com/test.jpg",
                  },
                },
                plain_text: ":test-emoji:",
              },
            ],
          },
        },
      ];

      const emojis = EmojiProcessor.extractCustomEmojiUrls(blocks);

      expect(emojis).toHaveLength(1);
      expect(emojis[0]).toEqual({
        url: "https://s3-us-west-2.amazonaws.com/public.notion-static.com/test.jpg",
        name: "test-emoji",
        plainText: ":test-emoji:",
      });
    });

    it("should extract emojis from multiple block types", () => {
      const blocks = [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    id: "1",
                    name: "emoji1",
                    url: "https://test.com/emoji1.png",
                  },
                },
                plain_text: ":emoji1:",
              },
            ],
          },
        },
        {
          type: "heading_1",
          heading_1: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    id: "2",
                    name: "emoji2",
                    url: "https://test.com/emoji2.png",
                  },
                },
                plain_text: ":emoji2:",
              },
            ],
          },
        },
      ];

      const emojis = EmojiProcessor.extractCustomEmojiUrls(blocks);

      expect(emojis).toHaveLength(2);
      expect(emojis[0].name).toBe("emoji1");
      expect(emojis[1].name).toBe("emoji2");
    });

    it("should ignore non-emoji mentions", () => {
      const blocks = [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "page",
                  page: { id: "some-page-id" },
                },
                plain_text: "Page Link",
              },
              {
                type: "text",
                text: { content: "Regular text" },
                plain_text: "Regular text",
              },
            ],
          },
        },
      ];

      const emojis = EmojiProcessor.extractCustomEmojiUrls(blocks);

      expect(emojis).toHaveLength(0);
    });
  });

  describe("emoji mapping application", () => {
    it("should replace emoji plain text with inline HTML images", () => {
      const markdownContent = "Here is an emoji :test-emoji: in the text.";
      const emojiMap = new Map([
        [":test-emoji:", "/images/emojis/test-emoji.png"],
      ]);

      const result = EmojiProcessor.applyEmojiMappings(
        markdownContent,
        emojiMap
      );

      expect(result).toBe(
        'Here is an emoji <img src="/images/emojis/test-emoji.png" alt="test-emoji" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> in the text.'
      );
    });

    it("should handle multiple emoji replacements", () => {
      const markdownContent = ":emoji1: and :emoji2: are both here";
      const emojiMap = new Map([
        [":emoji1:", "/images/emojis/emoji1.png"],
        [":emoji2:", "/images/emojis/emoji2.png"],
      ]);

      const result = EmojiProcessor.applyEmojiMappings(
        markdownContent,
        emojiMap
      );

      expect(result).toBe(
        '<img src="/images/emojis/emoji1.png" alt="emoji1" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> and <img src="/images/emojis/emoji2.png" alt="emoji2" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> are both here'
      );
    });

    it("should handle empty emoji map", () => {
      const markdownContent = "No emojis here.";
      const emojiMap = new Map();

      const result = EmojiProcessor.applyEmojiMappings(
        markdownContent,
        emojiMap
      );

      expect(result).toBe(markdownContent);
    });

    it("should handle [img](#img) patterns from notion-to-md conversion", () => {
      const markdownContent =
        "Here is [img](#img) [ comapeo-save-low] and [img](#img)[comapeo-capture-low] in the text.";
      const emojiMap = new Map([
        [":comapeo-save-low:", "/images/emojis/comapeo-save-low.png"],
        [":comapeo-capture-low:", "/images/emojis/comapeo-capture-low.png"],
      ]);

      const result = EmojiProcessor.applyEmojiMappings(
        markdownContent,
        emojiMap
      );

      expect(result).toBe(
        'Here is <img src="/images/emojis/comapeo-save-low.png" alt="comapeo-save-low" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> and <img src="/images/emojis/comapeo-capture-low.png" alt="comapeo-capture-low" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> in the text.'
      );
    });

    it("should handle [img] patterns without (#img) links", () => {
      const markdownContent =
        "Here is [img] [ comapeo-save-low] and [img][comapeo-capture-low] in the text.";
      const emojiMap = new Map([
        [":comapeo-save-low:", "/images/emojis/comapeo-save-low.png"],
        [":comapeo-capture-low:", "/images/emojis/comapeo-capture-low.png"],
      ]);

      const result = EmojiProcessor.applyEmojiMappings(
        markdownContent,
        emojiMap
      );

      expect(result).toBe(
        'Here is <img src="/images/emojis/comapeo-save-low.png" alt="comapeo-save-low" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> and <img src="/images/emojis/comapeo-capture-low.png" alt="comapeo-capture-low" class="emoji" style="display: inline; height: 1.2em; width: auto; vertical-align: text-bottom; margin: 0 0.1em;" /> in the text.'
      );
    });
  });
});
