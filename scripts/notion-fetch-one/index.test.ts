import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NOTION_PROPERTIES } from "../constants";
import { installTestNotionEnv } from "../test-utils";

vi.mock("sharp", () => {
  const createPipeline = () => {
    const pipeline: any = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      png: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from("")),
    };
    return pipeline;
  };

  const sharpMock = vi.fn(() => createPipeline());

  return {
    default: sharpMock,
  };
});

let extractFullTitle!: (typeof import("./index"))["extractFullTitle"];
let findBestMatch!: (typeof import("./index"))["findBestMatch"];
let fuzzyMatchScore!: (typeof import("./index"))["fuzzyMatchScore"];
let levenshteinDistance!: (typeof import("./index"))["levenshteinDistance"];
let minMatchScore!: (typeof import("./index"))["MIN_MATCH_SCORE"];
let normalizeString!: (typeof import("./index"))["normalizeString"];
let scorePages!: (typeof import("./index"))["scorePages"];
let restoreEnv: (() => void) | undefined;

beforeAll(async () => {
  restoreEnv = installTestNotionEnv();
  ({
    extractFullTitle,
    findBestMatch,
    fuzzyMatchScore,
    levenshteinDistance,
    MIN_MATCH_SCORE: minMatchScore,
    normalizeString,
    scorePages,
  } = await import("./index"));
});

afterAll(() => {
  restoreEnv?.();
});

// Helper to create mock Notion pages
function createMockPage(title: string, id = "mock-id"): Record<string, any> {
  return {
    id,
    properties: {
      [NOTION_PROPERTIES.TITLE]: {
        title: [
          {
            plain_text: title,
          },
        ],
      },
    },
  };
}

describe("notion-fetch-one fuzzy matching", () => {
  describe("levenshteinDistance", () => {
    it("should return 0 for identical strings", () => {
      expect(levenshteinDistance("hello", "hello")).toBe(0);
    });

    it("should return string length for completely different strings", () => {
      expect(levenshteinDistance("abc", "xyz")).toBe(3);
    });

    it("should calculate correct distance for single character difference", () => {
      expect(levenshteinDistance("hello", "helo")).toBe(1);
      expect(levenshteinDistance("hello", "jello")).toBe(1);
    });

    it("should handle empty strings", () => {
      expect(levenshteinDistance("", "hello")).toBe(5);
      expect(levenshteinDistance("hello", "")).toBe(5);
      expect(levenshteinDistance("", "")).toBe(0);
    });

    it("should be case-sensitive", () => {
      expect(levenshteinDistance("Hello", "hello")).toBe(1);
    });
  });

  describe("normalizeString", () => {
    it("should convert to lowercase", () => {
      expect(normalizeString("HELLO")).toBe("hello");
      expect(normalizeString("Hello World")).toBe("hello world");
    });

    it("should trim whitespace", () => {
      expect(normalizeString("  hello  ")).toBe("hello");
      expect(normalizeString("\t\nhello\t\n")).toBe("hello");
    });

    it("should collapse multiple spaces", () => {
      expect(normalizeString("hello    world")).toBe("hello world");
      expect(normalizeString("a  b   c    d")).toBe("a b c d");
    });

    it("should remove special characters", () => {
      expect(normalizeString("hello!")).toBe("hello");
      expect(normalizeString("hello-world")).toBe("helloworld");
      expect(normalizeString("hello_world")).toBe("hello_world"); // underscores are kept as word chars
    });

    it("should handle combined transformations", () => {
      expect(normalizeString("  Hello,  World!  ")).toBe("hello world");
      expect(normalizeString("Understanding How Exchange Works")).toBe(
        "understanding how exchange works"
      );
    });

    it("should preserve non-Latin scripts", () => {
      expect(normalizeString("中文標題")).toBe("中文標題");
      expect(normalizeString("مرحبا بالعالم")).toBe("مرحبا بالعالم");
    });

    it("should strip diacritics but keep base characters", () => {
      expect(normalizeString("Crème Brûlée à la carte")).toBe(
        "creme brulee a la carte"
      );
    });
  });

  describe("fuzzyMatchScore", () => {
    it("should give highest score for exact matches", () => {
      const score = fuzzyMatchScore("hello", "hello");
      expect(score).toBe(1000);
    });

    it("should give exact match score after normalization", () => {
      const score = fuzzyMatchScore("HELLO", "hello");
      expect(score).toBe(1000);

      const score2 = fuzzyMatchScore("  hello  ", "hello");
      expect(score2).toBe(1000);
    });

    it("should give high score for substring matches", () => {
      const score = fuzzyMatchScore(
        "exchange",
        "Understanding How Exchange Works"
      );
      expect(score).toBeGreaterThan(500);
      expect(score).toBeLessThan(1000);
    });

    it("should give higher score to better substring matches", () => {
      const shortMatch = fuzzyMatchScore("ab", "ab cd ef");
      const longMatch = fuzzyMatchScore("ab cd", "ab cd ef");
      expect(longMatch).toBeGreaterThan(shortMatch);
    });

    it("should handle partial similarity with Levenshtein distance", () => {
      const score = fuzzyMatchScore("hello", "helo");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(500);
    });

    it("should give lower score to very different strings", () => {
      const score = fuzzyMatchScore("abc", "xyz");
      expect(score).toBeLessThan(50);
    });

    it("should handle non-Latin scripts", () => {
      const score = fuzzyMatchScore("مرحبا", "مرحبا");
      expect(score).toBe(1000);
    });

    it("should return zero score when normalization removes everything", () => {
      const score = fuzzyMatchScore("!!!", "???");
      expect(score).toBe(0);
    });
  });

  describe("findBestMatch", () => {
    it("should return null for empty page array", () => {
      const result = findBestMatch("test", []);
      expect(result).toBeNull();
    });

    it("should find exact match", () => {
      const pages = [
        createMockPage("Getting Started", "1"),
        createMockPage("Understanding How Exchange Works", "2"),
        createMockPage("Advanced Topics", "3"),
      ];

      const result = findBestMatch("Understanding How Exchange Works", pages);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("2");
      expect(result?.score).toBe(1000);
    });

    it("should find match case-insensitively", () => {
      const pages = [
        createMockPage("Getting Started", "1"),
        createMockPage("Understanding How Exchange Works", "2"),
      ];

      const result = findBestMatch("UNDERSTANDING HOW EXCHANGE WORKS", pages);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("2");
    });

    it("should find best substring match", () => {
      const pages = [
        createMockPage("Getting Started", "1"),
        createMockPage("Understanding How Exchange Works", "2"),
        createMockPage("Exchange Rate API", "3"),
      ];

      const result = findBestMatch("exchange works", pages);
      expect(result).not.toBeNull();
      // Should match page 2 because it contains both words
      expect(result?.page.id).toBe("2");
    });

    it("should prefer longer substring matches", () => {
      const pages = [
        createMockPage("Ex", "1"),
        createMockPage("Exchange", "2"),
        createMockPage("Understanding How Exchange Works", "3"),
      ];

      const result = findBestMatch("exchange", pages);
      expect(result).not.toBeNull();
      // Should prefer exact match over substring
      expect(result?.page.id).toBe("2");
    });

    it("should handle pages with only Name property", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Name: {
              name: [{ plain_text: "Test Page" }],
            },
          },
        },
      ];

      const result = findBestMatch("test", pages);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("1");
    });

    it("should handle pages without title gracefully", () => {
      const pages = [
        {
          id: "1",
          properties: {},
        },
        createMockPage("Real Page", "2"),
      ];

      const result = findBestMatch("real page", pages);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("2");
    });

    it("should find best match among similar pages", () => {
      const pages = [
        createMockPage("How to Exchange", "1"),
        createMockPage("Understanding How Exchange Works", "2"),
        createMockPage("Exchange Tutorial", "3"),
      ];

      const result = findBestMatch("understanding exchange", pages);
      expect(result).not.toBeNull();
      // Should match page 2 as it contains both words
      expect(result?.page.id).toBe("2");
    });

    it("should handle whitespace variations", () => {
      const pages = [createMockPage("Understanding How Exchange Works", "1")];

      const result = findBestMatch("  understanding   how   exchange  ", pages);
      expect(result).not.toBeNull();
      expect(result?.score).toBeGreaterThan(500); // Should be a good match
    });

    it("should handle special characters", () => {
      const pages = [createMockPage("Getting Started!", "1")];

      const result = findBestMatch("getting started", pages);
      expect(result).not.toBeNull();
      expect(result?.score).toBe(1000); // Exact match after normalization
    });
  });

  describe("scorePages", () => {
    it("should sort matches by score descending", () => {
      const pages = [
        createMockPage("Advanced Topics", "1"),
        createMockPage("Understanding How Exchange Works", "2"),
        createMockPage("Exchange", "3"),
      ];

      const scored = scorePages("exchange", pages);
      expect(scored[0].page.id).toBe("3");
      expect(scored[1].page.id).toBe("2");
    });

    it("should assign zero score to Untitled pages", () => {
      const pages = [
        { id: "no-title", properties: {} },
        createMockPage("Understanding How Exchange Works", "2"),
      ];

      const scored = scorePages("exchange", pages);
      const untitledEntry = scored.find(
        (entry) => entry.page.id === "no-title"
      );
      expect(untitledEntry?.score).toBe(0);
    });
  });

  describe("extractFullTitle", () => {
    it("should extract single fragment title", () => {
      const titleProperty = {
        title: [{ plain_text: "Simple Title" }],
      };
      expect(extractFullTitle(titleProperty)).toBe("Simple Title");
    });

    it("should join multiple fragments into single title", () => {
      const titleProperty = {
        title: [
          { plain_text: "Bold " },
          { plain_text: "and " },
          { plain_text: "italic" },
        ],
      };
      expect(extractFullTitle(titleProperty)).toBe("Bold and italic");
    });

    it("should handle title with emoji fragments", () => {
      const titleProperty = {
        title: [
          { plain_text: "🎉 " },
          { plain_text: "Celebrate " },
          { plain_text: "with emoji" },
        ],
      };
      expect(extractFullTitle(titleProperty)).toBe("🎉 Celebrate with emoji");
    });

    it("should handle mixed formatting (bold, italic, emoji)", () => {
      const titleProperty = {
        title: [
          { plain_text: "Understanding " },
          { plain_text: "How " },
          { plain_text: "Exchange " },
          { plain_text: "Works" },
        ],
      };
      expect(extractFullTitle(titleProperty)).toBe(
        "Understanding How Exchange Works"
      );
    });

    it("should fallback to name property", () => {
      const titleProperty = {
        name: [{ plain_text: "Name Property" }],
      };
      expect(extractFullTitle(titleProperty)).toBe("Name Property");
    });

    it("should return Untitled for null property", () => {
      expect(extractFullTitle(null)).toBe("Untitled");
    });

    it("should return Untitled for empty title array", () => {
      const titleProperty = { title: [] };
      expect(extractFullTitle(titleProperty)).toBe("Untitled");
    });
  });

  describe("findBestMatch with multi-fragment titles", () => {
    it("should match pages with multi-fragment titles correctly", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Title: {
              title: [
                { plain_text: "Understanding " },
                { plain_text: "How " },
                { plain_text: "Exchange " },
                { plain_text: "Works" },
              ],
            },
          },
        },
        {
          id: "2",
          properties: {
            Title: {
              title: [{ plain_text: "Exchange Tutorial" }],
            },
          },
        },
      ];

      const result = findBestMatch("Understanding How Exchange Works", pages);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("1");
      expect(result?.score).toBe(1000); // Exact match
    });

    it("should handle partial matches with multi-fragment titles", () => {
      const pages = [
        {
          id: "1",
          properties: {
            Title: {
              title: [
                { plain_text: "🎉 " },
                { plain_text: "Getting " },
                { plain_text: "Started" },
              ],
            },
          },
        },
      ];

      const result = findBestMatch("getting started", pages);
      expect(result).not.toBeNull();
      // Substring match due to emoji prefix, but still a strong match
      expect(result?.score).toBeGreaterThan(500);
    });

    it("should handle titles with only first fragment matching (old bug scenario)", () => {
      // This test verifies the fix for the Codex review issue
      // If we only read [0], we'd only see "Bold"
      // With the fix, we see "Bold text with more content"
      const pages = [
        {
          id: "1",
          properties: {
            Title: {
              title: [
                { plain_text: "Bold" },
                { plain_text: " text with more content" },
              ],
            },
          },
        },
        {
          id: "2",
          properties: {
            Title: {
              title: [{ plain_text: "Bold" }],
            },
          },
        },
      ];

      // Search for full title - should match page 1 exactly
      const result = findBestMatch("Bold text with more content", pages);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("1");
      expect(result?.score).toBe(1000); // Exact match

      // Search for just "Bold" - should match page 2 exactly
      const result2 = findBestMatch("Bold", pages);
      expect(result2).not.toBeNull();
      expect(result2?.page.id).toBe("2");
      expect(result2?.score).toBe(1000); // Exact match
    });
  });

  describe("real-world use cases", () => {
    const mockDatabase = [
      createMockPage("Getting Started with CoMapeo", "1"),
      createMockPage("Understanding How Exchange Works", "2"),
      createMockPage("Advanced Configuration", "3"),
      createMockPage("Troubleshooting Common Issues", "4"),
      createMockPage("API Reference", "5"),
      createMockPage("Exchange Rate API", "6"),
      createMockPage("How to Configure Exchange Settings", "7"),
    ];

    it('should find "Understanding How Exchange Works" with partial query', () => {
      const queries = [
        "exchange",
        "exchange works",
        "understanding exchange",
        "how exchange works",
      ];

      const expectations = new Map<string, number>([
        ["exchange", 500],
        ["exchange works", 500],
        ["understanding exchange", minMatchScore],
        ["how exchange works", minMatchScore],
      ]);

      queries.forEach((query) => {
        const result = findBestMatch(query, mockDatabase);
        expect(result).not.toBeNull();
        const threshold = expectations.get(query) ?? minMatchScore;
        expect(result?.score ?? 0).toBeGreaterThanOrEqual(threshold);
      });
    });

    it("should handle typos with fuzzy matching", () => {
      const result = findBestMatch("exhange", mockDatabase); // typo: missing 'c'
      expect(result).not.toBeNull();
      // Typos should surface suggestions but remain below the confidence threshold
      expect(result?.score ?? 0).toBeLessThan(minMatchScore);
    });

    it("should handle abbreviated queries", () => {
      const result = findBestMatch("api ref", mockDatabase);
      expect(result).not.toBeNull();
      expect(result?.page.id).toBe("5"); // API Reference
    });

    it("should prioritize exact word matches over partial", () => {
      const result = findBestMatch("exchange rate", mockDatabase);
      expect(result).not.toBeNull();
      // Should prefer "Exchange Rate API" over other exchange pages
      expect(result?.page.id).toBe("6");
    });
  });
});
