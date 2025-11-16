import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmojiFile } from "./emojiCache.js";
import type { EmojiProcessorConfig } from "./emojiDownload.js";
import {
  extractCustomEmojiUrls,
  processBlockEmojis,
  processPageEmojis,
} from "./emojiExtraction.js";

// Mock dependencies
vi.mock("./emojiDownload.js", () => ({
  processEmoji: vi.fn(),
  validateEmojiUrl: (url: string, hosts: string[]) => {
    try {
      const parsed = new URL(url);
      return (
        hosts.some((host) => parsed.hostname.endsWith(host)) &&
        /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(parsed.pathname) &&
        (parsed.pathname.includes("emoji") || parsed.pathname.includes("icon"))
      );
    } catch {
      return false;
    }
  },
}));

import { processEmoji } from "./emojiDownload.js";

describe("emojiExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractCustomEmojiUrls", () => {
    it("should extract custom emoji from paragraph blocks", () => {
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
                    url: "https://example.com/emoji1.png",
                    name: "smile",
                  },
                },
                plain_text: ":smile:",
              },
            ],
          },
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        url: "https://example.com/emoji1.png",
        name: "smile",
        plainText: ":smile:",
      });
    });

    it("should extract custom emoji from heading blocks", () => {
      const blocks = [
        {
          type: "heading_1",
          heading_1: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://example.com/emoji.png",
                    name: "heart",
                  },
                },
                plain_text: ":heart:",
              },
            ],
          },
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("heart");
    });

    it("should extract from multiple block types", () => {
      const blocks = [
        {
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://example.com/emoji1.png",
                    name: "e1",
                  },
                },
                plain_text: ":e1:",
              },
            ],
          },
        },
        {
          type: "callout",
          callout: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://example.com/emoji2.png",
                    name: "e2",
                  },
                },
                plain_text: ":e2:",
              },
            ],
          },
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(2);
    });

    it("should extract from nested children blocks", () => {
      const blocks = [
        {
          type: "toggle",
          toggle: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://example.com/parent.png",
                    name: "parent",
                  },
                },
                plain_text: ":parent:",
              },
            ],
          },
          children: [
            {
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    type: "mention",
                    mention: {
                      type: "custom_emoji",
                      custom_emoji: {
                        url: "https://example.com/child.png",
                        name: "child",
                      },
                    },
                    plain_text: ":child:",
                  },
                ],
              },
            },
          ],
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("parent");
      expect(result[1].name).toBe("child");
    });

    it("should extract from block properties", () => {
      const blocks = [
        {
          type: "page",
          properties: {
            title: {
              title: [
                {
                  type: "mention",
                  mention: {
                    type: "custom_emoji",
                    custom_emoji: {
                      url: "https://example.com/title-emoji.png",
                      name: "title",
                    },
                  },
                  plain_text: ":title:",
                },
              ],
            },
          },
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("title");
    });

    it("should skip non-emoji mentions", () => {
      const blocks = [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "mention",
                mention: {
                  type: "page",
                  page: { id: "page-id" },
                },
                plain_text: "Page mention",
              },
            ],
          },
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(0);
    });

    it("should skip malformed emoji objects", () => {
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
                    // Missing url
                    name: "incomplete",
                  },
                },
                plain_text: ":incomplete:",
              },
            ],
          },
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(0);
    });

    it("should handle empty blocks array", () => {
      const result = extractCustomEmojiUrls([]);

      expect(result).toHaveLength(0);
    });

    it("should handle blocks with no rich_text", () => {
      const blocks = [
        {
          type: "paragraph",
          paragraph: {},
        },
      ];

      const result = extractCustomEmojiUrls(blocks);

      expect(result).toHaveLength(0);
    });

    it("should handle null/undefined blocks", () => {
      const blocks = [null, undefined, { type: "invalid" }];

      const result = extractCustomEmojiUrls(blocks as any);

      expect(result).toHaveLength(0);
    });
  });

  describe("processBlockEmojis", () => {
    const config: EmojiProcessorConfig = {
      emojiPath: "/test/emojis",
      cacheFile: "/test/.emoji-cache.json",
      maxEmojiSize: 1024 * 1024,
      maxConcurrentDownloads: 2,
      downloadTimeout: 5000,
      maxEmojisPerPage: 50,
      enableProcessing: true,
      allowedHosts: ["amazonaws.com"],
    };

    it("should return empty result when processing is disabled", async () => {
      const disabledConfig = { ...config, enableProcessing: false };
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
                    url: "https://amazonaws.com/emoji.png",
                    name: "test",
                  },
                },
                plain_text: ":test:",
              },
            ],
          },
        },
      ];

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const result = await processBlockEmojis(
        "page-id",
        blocks,
        disabledConfig,
        emojiCache,
        saveCache
      );

      expect(result.totalSaved).toBe(0);
      expect(result.emojiMap.size).toBe(0);
      expect(result.processedBlocks).toEqual(blocks);
    });

    it("should return empty result when no emojis found", async () => {
      const blocks = [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "No emojis here" } }],
          },
        },
      ];

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const result = await processBlockEmojis(
        "page-id",
        blocks,
        config,
        emojiCache,
        saveCache
      );

      expect(result.totalSaved).toBe(0);
      expect(result.emojiMap.size).toBe(0);
    });

    it("should process custom emojis and create mapping", async () => {
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
                    url: "https://amazonaws.com/emoji.png",
                    name: "test",
                  },
                },
                plain_text: ":test:",
              },
            ],
          },
        },
      ];

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 1024,
        reused: false,
      });

      const result = await processBlockEmojis(
        "page-id",
        blocks,
        config,
        emojiCache,
        saveCache
      );

      expect(result.totalSaved).toBe(1024);
      expect(result.emojiMap.get(":test:")).toBe("/images/emojis/test.png");
      expect(processEmoji).toHaveBeenCalledWith(
        "https://amazonaws.com/emoji.png",
        "page-id",
        config,
        emojiCache,
        saveCache
      );
    });

    it("should respect maxEmojisPerPage limit", async () => {
      const limitedConfig = { ...config, maxEmojisPerPage: 2 };

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
                    url: "https://amazonaws.com/emoji1.png",
                    name: "e1",
                  },
                },
                plain_text: ":e1:",
              },
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://amazonaws.com/emoji2.png",
                    name: "e2",
                  },
                },
                plain_text: ":e2:",
              },
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://amazonaws.com/emoji3.png",
                    name: "e3",
                  },
                },
                plain_text: ":e3:",
              },
            ],
          },
        },
      ];

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 0,
        reused: false,
      });

      await processBlockEmojis(
        "page-id",
        blocks,
        limitedConfig,
        emojiCache,
        saveCache
      );

      // Should only process 2 emojis
      expect(processEmoji).toHaveBeenCalledTimes(2);
    });

    it("should process emojis in batches", async () => {
      const batchConfig = { ...config, maxConcurrentDownloads: 1 };

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
                    url: "https://amazonaws.com/emoji1.png",
                    name: "e1",
                  },
                },
                plain_text: ":e1:",
              },
              {
                type: "mention",
                mention: {
                  type: "custom_emoji",
                  custom_emoji: {
                    url: "https://amazonaws.com/emoji2.png",
                    name: "e2",
                  },
                },
                plain_text: ":e2:",
              },
            ],
          },
        },
      ];

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 100,
        reused: false,
      });

      const result = await processBlockEmojis(
        "page-id",
        blocks,
        batchConfig,
        emojiCache,
        saveCache
      );

      expect(result.totalSaved).toBe(200); // 100 * 2
      expect(result.emojiMap.size).toBe(2);
    });

    it("should handle emoji processing failures gracefully", async () => {
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
                    url: "https://amazonaws.com/emoji.png",
                    name: "test",
                  },
                },
                plain_text: ":test:",
              },
            ],
          },
        },
      ];

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockRejectedValue(new Error("Download failed"));

      const result = await processBlockEmojis(
        "page-id",
        blocks,
        config,
        emojiCache,
        saveCache
      );

      // Should continue despite failure
      expect(result.totalSaved).toBe(0);
      expect(result.emojiMap.size).toBe(0);
    });
  });

  describe("processPageEmojis", () => {
    const config: EmojiProcessorConfig = {
      emojiPath: "/test/emojis",
      cacheFile: "/test/.emoji-cache.json",
      maxEmojiSize: 1024 * 1024,
      maxConcurrentDownloads: 2,
      downloadTimeout: 5000,
      maxEmojisPerPage: 50,
      enableProcessing: true,
      allowedHosts: ["amazonaws.com", "notion.site"],
    };

    it("should return content unchanged when processing is disabled", async () => {
      const disabledConfig = { ...config, enableProcessing: false };
      const content = "Test https://amazonaws.com/emoji/test.png content";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const result = await processPageEmojis(
        "page-id",
        content,
        disabledConfig,
        emojiCache,
        saveCache
      );

      expect(result.content).toBe(content);
      expect(result.totalSaved).toBe(0);
      expect(result.processedCount).toBe(0);
    });

    it("should return content unchanged when no emoji URLs found", async () => {
      const content = "This is plain text without emoji URLs";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      const result = await processPageEmojis(
        "page-id",
        content,
        config,
        emojiCache,
        saveCache
      );

      expect(result.content).toBe(content);
      expect(result.totalSaved).toBe(0);
      expect(result.processedCount).toBe(0);
    });

    it.skip("should extract and process emoji URLs", async () => {
      const content = "Check out https://amazonaws.com/emoji/smile.png!";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/smile.png",
        savedBytes: 1024,
        reused: false,
      });

      const result = await processPageEmojis(
        "page-id",
        content,
        config,
        emojiCache,
        saveCache
      );

      expect(result.content).toContain("/images/emojis/smile.png");
      expect(result.content).not.toContain(
        "https://amazonaws.com/emoji/smile.png"
      );
      expect(result.processedCount).toBe(1);
      expect(result.totalSaved).toBe(1024);
    });

    it("should process multiple emoji URLs", async () => {
      const content =
        "First: https://amazonaws.com/emoji/smile.png, Second: https://notion.site/emoji/heart.svg";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockImplementation(async (url) => ({
        newPath: `/images/emojis/${url.includes("smile") ? "smile.png" : "heart.svg"}`,
        savedBytes: 500,
        reused: false,
      }));

      const result = await processPageEmojis(
        "page-id",
        content,
        config,
        emojiCache,
        saveCache
      );

      expect(result.content).toContain("/images/emojis/smile.png");
      expect(result.content).toContain("/images/emojis/heart.svg");
      expect(result.processedCount).toBe(2);
      expect(result.totalSaved).toBe(1000);
    });

    it("should strip trailing punctuation from URLs", async () => {
      const content =
        "Check this: https://amazonaws.com/emoji/test.png). And this: https://amazonaws.com/emoji/test2.png,";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 0,
        reused: false,
      });

      await processPageEmojis(
        "page-id",
        content,
        config,
        emojiCache,
        saveCache
      );

      // URLs without punctuation should be passed to processEmoji
      expect((processEmoji as any).mock.calls[0][0]).toBe(
        "https://amazonaws.com/emoji/test.png"
      );
      expect((processEmoji as any).mock.calls[1][0]).toBe(
        "https://amazonaws.com/emoji/test2.png"
      );
    });

    it("should respect maxEmojisPerPage limit", async () => {
      const limitedConfig = { ...config, maxEmojisPerPage: 1 };
      const content =
        "First: https://amazonaws.com/emoji/e1.png, Second: https://amazonaws.com/emoji/e2.png";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 0,
        reused: false,
      });

      await processPageEmojis(
        "page-id",
        content,
        limitedConfig,
        emojiCache,
        saveCache
      );

      // Should only process 1 emoji
      expect(processEmoji).toHaveBeenCalledTimes(1);
    });

    it("should process emojis in batches according to maxConcurrentDownloads", async () => {
      const batchConfig = { ...config, maxConcurrentDownloads: 1 };
      const content =
        "E1: https://amazonaws.com/emoji/e1.png E2: https://amazonaws.com/emoji/e2.png";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 100,
        reused: false,
      });

      const result = await processPageEmojis(
        "page-id",
        content,
        batchConfig,
        emojiCache,
        saveCache
      );

      expect(result.processedCount).toBe(2);
    });

    it("should handle emoji processing failures gracefully", async () => {
      const content = "Test: https://amazonaws.com/emoji/fail.png";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockRejectedValue(new Error("Failed"));

      const result = await processPageEmojis(
        "page-id",
        content,
        config,
        emojiCache,
        saveCache
      );

      expect(result.content).toBe(content); // Content unchanged
      expect(result.processedCount).toBe(0);
    });

    it("should only process valid emoji URLs", async () => {
      const content =
        "Valid: https://amazonaws.com/emoji/test.png, Invalid: https://evil.com/test.png";

      const emojiCache = new Map<string, EmojiFile>();
      const saveCache = vi.fn();

      (processEmoji as any).mockResolvedValue({
        newPath: "/images/emojis/test.png",
        savedBytes: 0,
        reused: false,
      });

      await processPageEmojis(
        "page-id",
        content,
        config,
        emojiCache,
        saveCache
      );

      // Should only process the valid URL
      expect(processEmoji).toHaveBeenCalledTimes(1);
      expect((processEmoji as any).mock.calls[0][0]).toBe(
        "https://amazonaws.com/emoji/test.png"
      );
    });
  });
});
