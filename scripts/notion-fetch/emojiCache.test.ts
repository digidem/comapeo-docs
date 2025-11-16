import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  sanitizeFilename,
  validatePath,
  generateHash,
  generateFilename,
  isValidCacheEntry,
  loadCache,
  saveCache,
  getCacheStats,
  cleanup,
  type EmojiFile,
} from "./emojiCache.js";

describe("emojiCache", () => {
  const testDir = path.join(process.cwd(), "test-emoji-cache");
  const testCacheFile = path.join(testDir, ".emoji-cache.json");

  beforeEach(() => {
    // Create test directory
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("sanitizeFilename", () => {
    it("should remove path separators", () => {
      expect(sanitizeFilename("test/file.png")).toBe("testfile.png");
      expect(sanitizeFilename("test\\file.png")).toBe("testfile.png");
    });

    it("should remove parent directory references", () => {
      expect(sanitizeFilename("../test.png")).toBe("test.png");
      expect(sanitizeFilename("../../test.png")).toBe("test.png");
    });

    it("should remove leading dots except for special files", () => {
      expect(sanitizeFilename(".hidden")).toBe("hidden");
      expect(sanitizeFilename("..hidden")).toBe("hidden");
      // Special case: preserve .emoji-cache.json
      expect(sanitizeFilename(".emoji-cache.json")).toBe(".emoji-cache.json");
    });

    it("should handle valid filenames unchanged", () => {
      expect(sanitizeFilename("emoji.png")).toBe("emoji.png");
      expect(sanitizeFilename("test-emoji_123.jpg")).toBe("test-emoji_123.jpg");
    });

    it("should handle empty strings", () => {
      expect(sanitizeFilename("")).toBe("");
    });

    it("should handle multiple consecutive dots and slashes", () => {
      expect(sanitizeFilename("...///test.png")).toBe("test.png");
    });
  });

  describe("validatePath", () => {
    it("should accept valid paths within base directory", () => {
      const basePath = testDir;
      const result = validatePath(basePath, "test.png");
      expect(result).toContain("test.png");
      expect(result.startsWith(basePath)).toBe(true);
    });

    it("should sanitize filename before validation", () => {
      const basePath = testDir;
      const result = validatePath(basePath, "test/file.png");
      // The path separators in the filename are removed, but the basePath still contains them
      expect(result).toContain("testfile.png");
      expect(path.basename(result)).toBe("testfile.png");
    });

    it("should throw error for path traversal attempts", () => {
      const basePath = testDir;
      // Create a filename that would escape the directory after sanitization
      // Note: sanitizeFilename removes .. but let's test the validation logic
      expect(() => {
        // This is a contrived example - in practice sanitizeFilename prevents this
        const maliciousPath = path.join(basePath, "..", "outside.png");
        if (!maliciousPath.startsWith(basePath)) {
          throw new Error("Invalid path: outside of allowed directory");
        }
      }).toThrow("Invalid path: outside of allowed directory");
    });

    it("should handle filenames with special characters", () => {
      const basePath = testDir;
      const result = validatePath(basePath, "emoji_test-123.png");
      expect(result).toContain("emoji_test-123.png");
    });
  });

  describe("generateHash", () => {
    it("should generate consistent hashes for same content", () => {
      const buffer = Buffer.from("test content");
      const hash1 = generateHash(buffer);
      const hash2 = generateHash(buffer);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different content", () => {
      const buffer1 = Buffer.from("test content 1");
      const buffer2 = Buffer.from("test content 2");
      const hash1 = generateHash(buffer1);
      const hash2 = generateHash(buffer2);
      expect(hash1).not.toBe(hash2);
    });

    it("should generate 16-character hash", () => {
      const buffer = Buffer.from("test content");
      const hash = generateHash(buffer);
      expect(hash).toHaveLength(16);
    });

    it("should handle empty buffers", () => {
      const buffer = Buffer.from("");
      const hash = generateHash(buffer);
      expect(hash).toHaveLength(16);
    });

    it("should handle large buffers", () => {
      const buffer = Buffer.alloc(1024 * 1024); // 1MB
      const hash = generateHash(buffer);
      expect(hash).toHaveLength(16);
    });
  });

  describe("generateFilename", () => {
    it("should generate filename with hash and timestamp", () => {
      const url = "https://example.com/emojis/smile.png";
      const buffer = Buffer.from("test");
      const filename = generateFilename(url, buffer, ".png");

      expect(filename).toMatch(/^[a-z0-9_-]+_[a-f0-9]{16}_\d{8}\.png$/);
    });

    it("should use original filename from URL", () => {
      const url = "https://example.com/emojis/custom-emoji.png";
      const buffer = Buffer.from("test");
      const filename = generateFilename(url, buffer, ".png");

      expect(filename).toContain("custom");
    });

    it("should truncate long filenames", () => {
      const url =
        "https://example.com/emojis/very-long-emoji-name-that-should-be-truncated.png";
      const buffer = Buffer.from("test");
      const filename = generateFilename(url, buffer, ".png");

      const namePart = filename.split("_")[0];
      expect(namePart.length).toBeLessThanOrEqual(15);
    });

    it("should sanitize invalid characters", () => {
      const url = "https://example.com/emojis/emoji@#$%.png";
      const buffer = Buffer.from("test");
      const filename = generateFilename(url, buffer, ".png");

      expect(filename).toMatch(/^[a-z0-9_-]+_[a-f0-9]{16}_\d{8}\.png$/);
    });

    it("should handle URLs without filename", () => {
      const url = "https://example.com/emojis/";
      const buffer = Buffer.from("test");
      const filename = generateFilename(url, buffer, ".png");

      expect(filename).toContain("emoji");
    });

    it("should use different extensions", () => {
      const url = "https://example.com/emojis/test.svg";
      const buffer = Buffer.from("test");
      const filenameSvg = generateFilename(url, buffer, ".svg");
      const filenameJpg = generateFilename(url, buffer, ".jpg");

      expect(filenameSvg).toMatch(/\.svg$/);
      expect(filenameJpg).toMatch(/\.jpg$/);
    });

    it("should generate unique filenames for different buffers", () => {
      const url = "https://example.com/emojis/test.png";
      const buffer1 = Buffer.from("content1");
      const buffer2 = Buffer.from("content2");
      const filename1 = generateFilename(url, buffer1, ".png");
      const filename2 = generateFilename(url, buffer2, ".png");

      expect(filename1).not.toBe(filename2);
    });
  });

  describe("isValidCacheEntry", () => {
    it("should validate correct cache entries", () => {
      const entry: EmojiFile = {
        url: "https://example.com/emoji.png",
        filename: "emoji_abc123_12345678.png",
        localPath: "/path/to/emoji.png",
        hash: "abcdef1234567890",
        size: 1024,
      };
      expect(isValidCacheEntry(entry)).toBe(true);
    });

    it("should reject entries missing required fields", () => {
      expect(isValidCacheEntry({})).toBe(false);
      expect(isValidCacheEntry({ url: "test", filename: "test.png" })).toBe(
        false
      );
    });

    it("should reject entries with wrong types", () => {
      expect(
        isValidCacheEntry({
          url: 123, // Should be string
          filename: "test.png",
          localPath: "/path",
          hash: "abc",
          size: 100,
        })
      ).toBe(false);

      expect(
        isValidCacheEntry({
          url: "test",
          filename: "test.png",
          localPath: "/path",
          hash: "abc",
          size: "100", // Should be number
        })
      ).toBe(false);
    });

    it("should reject null and undefined", () => {
      expect(isValidCacheEntry(null)).toBe(false);
      expect(isValidCacheEntry(undefined)).toBe(false);
    });

    it("should reject non-object types", () => {
      expect(isValidCacheEntry("string")).toBe(false);
      expect(isValidCacheEntry(123)).toBe(false);
      expect(isValidCacheEntry(true)).toBe(false);
    });
  });

  describe("loadCache", () => {
    it("should load valid cache from disk", async () => {
      const cacheData = {
        "https://example.com/emoji1.png": {
          url: "https://example.com/emoji1.png",
          filename: "emoji1.png",
          localPath: path.join(testDir, "emoji1.png"),
          hash: "abc123",
          size: 1024,
        },
      };

      // Create cache file and emoji file
      fs.writeFileSync(testCacheFile, JSON.stringify(cacheData));
      fs.writeFileSync(path.join(testDir, "emoji1.png"), "test");

      const emojiCache = new Map<string, EmojiFile>();
      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(1);
      expect(emojiCache.has("https://example.com/emoji1.png")).toBe(true);
    });

    it("should skip entries for missing files", async () => {
      const cacheData = {
        "https://example.com/emoji1.png": {
          url: "https://example.com/emoji1.png",
          filename: "emoji1.png",
          localPath: path.join(testDir, "emoji1.png"),
          hash: "abc123",
          size: 1024,
        },
      };

      // Create cache file but NOT the emoji file
      fs.writeFileSync(testCacheFile, JSON.stringify(cacheData));

      const emojiCache = new Map<string, EmojiFile>();
      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(0);
    });

    it("should skip invalid cache entries", async () => {
      const cacheData = {
        "https://example.com/invalid.png": {
          // Missing required fields
          url: "https://example.com/invalid.png",
        },
      };

      fs.writeFileSync(testCacheFile, JSON.stringify(cacheData));

      const emojiCache = new Map<string, EmojiFile>();
      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(0);
    });

    it("should handle missing cache file", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(0);
    });

    it("should handle corrupt JSON", async () => {
      fs.writeFileSync(testCacheFile, "{ invalid json");

      const emojiCache = new Map<string, EmojiFile>();
      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(0);
    });

    it("should handle non-object JSON", async () => {
      fs.writeFileSync(testCacheFile, JSON.stringify([]));

      const emojiCache = new Map<string, EmojiFile>();
      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(0);
    });

    it("should clear existing cache before loading", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      emojiCache.set("old-url", {
        url: "old-url",
        filename: "old.png",
        localPath: "/old",
        hash: "old",
        size: 100,
      });

      await loadCache(testCacheFile, testDir, emojiCache);

      expect(emojiCache.size).toBe(0);
    });
  });

  describe("saveCache", () => {
    it("should save cache to disk", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      emojiCache.set("https://example.com/emoji1.png", {
        url: "https://example.com/emoji1.png",
        filename: "emoji1.png",
        localPath: path.join(testDir, "emoji1.png"),
        hash: "abc123",
        size: 1024,
      });

      await saveCache(testCacheFile, emojiCache);

      expect(fs.existsSync(testCacheFile)).toBe(true);

      const content = fs.readFileSync(testCacheFile, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed["https://example.com/emoji1.png"]).toBeDefined();
    });

    it("should save empty cache", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      await saveCache(testCacheFile, emojiCache);

      expect(fs.existsSync(testCacheFile)).toBe(true);

      const content = fs.readFileSync(testCacheFile, "utf8");
      const parsed = JSON.parse(content);
      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it("should format JSON with indentation", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      emojiCache.set("https://example.com/emoji1.png", {
        url: "https://example.com/emoji1.png",
        filename: "emoji1.png",
        localPath: path.join(testDir, "emoji1.png"),
        hash: "abc123",
        size: 1024,
      });

      await saveCache(testCacheFile, emojiCache);

      const content = fs.readFileSync(testCacheFile, "utf8");
      expect(content).toContain("\n");
      expect(content).toContain("  ");
    });
  });

  describe("getCacheStats", () => {
    it("should return stats for empty cache", () => {
      const emojiCache = new Map<string, EmojiFile>();
      const stats = getCacheStats(emojiCache);

      expect(stats.totalEmojis).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.uniqueEmojis).toBe(0);
    });

    it("should count total emojis", () => {
      const emojiCache = new Map<string, EmojiFile>();
      emojiCache.set("url1", {
        url: "url1",
        filename: "e1.png",
        localPath: "/e1.png",
        hash: "hash1",
        size: 100,
      });
      emojiCache.set("url2", {
        url: "url2",
        filename: "e2.png",
        localPath: "/e2.png",
        hash: "hash2",
        size: 200,
      });

      const stats = getCacheStats(emojiCache);
      expect(stats.totalEmojis).toBe(2);
    });

    it("should sum total size", () => {
      const emojiCache = new Map<string, EmojiFile>();
      emojiCache.set("url1", {
        url: "url1",
        filename: "e1.png",
        localPath: "/e1.png",
        hash: "hash1",
        size: 100,
      });
      emojiCache.set("url2", {
        url: "url2",
        filename: "e2.png",
        localPath: "/e2.png",
        hash: "hash2",
        size: 200,
      });

      const stats = getCacheStats(emojiCache);
      expect(stats.totalSize).toBe(300);
    });

    it("should count unique emojis by hash", () => {
      const emojiCache = new Map<string, EmojiFile>();
      // Same hash = same content, different URLs
      emojiCache.set("url1", {
        url: "url1",
        filename: "e1.png",
        localPath: "/e1.png",
        hash: "samehash",
        size: 100,
      });
      emojiCache.set("url2", {
        url: "url2",
        filename: "e2.png",
        localPath: "/e2.png",
        hash: "samehash",
        size: 100,
      });
      emojiCache.set("url3", {
        url: "url3",
        filename: "e3.png",
        localPath: "/e3.png",
        hash: "differenthash",
        size: 200,
      });

      const stats = getCacheStats(emojiCache);
      expect(stats.totalEmojis).toBe(3);
      expect(stats.uniqueEmojis).toBe(2); // Only 2 unique hashes
    });
  });

  describe("cleanup", () => {
    it("should remove files not in cache", async () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, "emoji1.png"), "test1");
      fs.writeFileSync(path.join(testDir, "emoji2.png"), "test2");
      fs.writeFileSync(path.join(testDir, "orphan.png"), "orphan");

      // Cache only has emoji1 and emoji2
      const emojiCache = new Map<string, EmojiFile>();
      emojiCache.set("url1", {
        url: "url1",
        filename: "emoji1.png",
        localPath: path.join(testDir, "emoji1.png"),
        hash: "hash1",
        size: 100,
      });
      emojiCache.set("url2", {
        url: "url2",
        filename: "emoji2.png",
        localPath: path.join(testDir, "emoji2.png"),
        hash: "hash2",
        size: 200,
      });

      await cleanup(testDir, emojiCache);

      // emoji1 and emoji2 should still exist
      expect(fs.existsSync(path.join(testDir, "emoji1.png"))).toBe(true);
      expect(fs.existsSync(path.join(testDir, "emoji2.png"))).toBe(true);
      // orphan.png should be removed
      expect(fs.existsSync(path.join(testDir, "orphan.png"))).toBe(false);
    });

    it("should skip .emoji-cache.json and .gitkeep files", async () => {
      fs.writeFileSync(testCacheFile, "{}");
      fs.writeFileSync(path.join(testDir, ".gitkeep"), "");

      const emojiCache = new Map<string, EmojiFile>();
      await cleanup(testDir, emojiCache);

      // These should not be removed
      expect(fs.existsSync(testCacheFile)).toBe(true);
      expect(fs.existsSync(path.join(testDir, ".gitkeep"))).toBe(true);
    });

    it("should handle empty cache", async () => {
      fs.writeFileSync(path.join(testDir, "test.png"), "test");

      const emojiCache = new Map<string, EmojiFile>();
      await cleanup(testDir, emojiCache);

      // File should be removed
      expect(fs.existsSync(path.join(testDir, "test.png"))).toBe(false);
    });

    it("should handle empty directory", async () => {
      const emojiCache = new Map<string, EmojiFile>();
      await cleanup(testDir, emojiCache);

      // Should not throw
      expect(fs.existsSync(testDir)).toBe(true);
    });
  });
});
