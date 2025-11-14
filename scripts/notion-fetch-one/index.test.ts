import { describe, it, expect } from "vitest";

/**
 * Calculate Levenshtein distance between two strings
 * (Copied from index.ts for testing)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalize a string for comparison
 * (Copied from index.ts for testing)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

/**
 * Calculate fuzzy match score between two strings
 * (Copied from index.ts for testing)
 */
function fuzzyMatchScore(search: string, target: string): number {
  const normalizedSearch = normalizeString(search);
  const normalizedTarget = normalizeString(target);

  // Exact match (after normalization)
  if (normalizedSearch === normalizedTarget) {
    return 1000;
  }

  // Substring match
  if (normalizedTarget.includes(normalizedSearch)) {
    return 500 + (normalizedSearch.length / normalizedTarget.length) * 100;
  }

  // Levenshtein distance based score
  const distance = levenshteinDistance(normalizedSearch, normalizedTarget);
  const maxLen = Math.max(normalizedSearch.length, normalizedTarget.length);
  const similarity = 1 - distance / maxLen;

  return similarity * 100;
}

/**
 * Extract full title from a Notion title property by joining all rich text fragments
 * This handles titles with multiple fragments (bold, italics, emojis, etc.)
 * (Copied from index.ts for testing)
 */
function extractFullTitle(titleProperty: any): string {
  if (!titleProperty) {
    return "Untitled";
  }

  // Try 'title' property first (for Title property type)
  if (Array.isArray(titleProperty.title) && titleProperty.title.length > 0) {
    return titleProperty.title
      .map((fragment: any) => fragment.plain_text || "")
      .join("");
  }

  // Fallback to 'name' property (for other property types)
  if (Array.isArray(titleProperty.name) && titleProperty.name.length > 0) {
    return titleProperty.name
      .map((fragment: any) => fragment.plain_text || "")
      .join("");
  }

  return "Untitled";
}

/**
 * Find the best matching page by title
 * (Copied from index.ts for testing)
 */
function findBestMatch(
  searchTerm: string,
  pages: Array<Record<string, any>>
): { page: Record<string, any>; score: number } | null {
  if (pages.length === 0) {
    return null;
  }

  let bestMatch: { page: Record<string, any>; score: number } | null = null;

  for (const page of pages) {
    const properties = page.properties || {};
    const titleProperty = properties["Title"] || properties["Name"];
    const title = extractFullTitle(titleProperty);

    const score = fuzzyMatchScore(searchTerm, title);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { page, score };
    }
  }

  return bestMatch;
}

// Helper to create mock Notion pages
function createMockPage(title: string, id = "mock-id"): Record<string, any> {
  return {
    id,
    properties: {
      Title: {
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

      queries.forEach((query) => {
        const result = findBestMatch(query, mockDatabase);
        expect(result).not.toBeNull();
        // Should match either page 2 (Understanding How Exchange Works) or page 7 (How to Configure Exchange Settings)
        // depending on the query
        expect(result?.score).toBeGreaterThan(400);
      });
    });

    it("should handle typos with fuzzy matching", () => {
      const result = findBestMatch("exhange", mockDatabase); // typo: missing 'c'
      expect(result).not.toBeNull();
      // Should still find an exchange-related page
      expect(result?.score).toBeGreaterThan(50);
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
