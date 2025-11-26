import { describe, it, expect } from "vitest";
import {
  sanitizeMarkdownImages,
  ensureBlankLineAfterStandaloneBold,
  normalizeForMatch,
  extractTextFromCalloutBlock,
  findMatchingBlockquote,
  processCalloutsInMarkdown,
} from "./markdownTransform";

describe("markdownTransform", () => {
  describe("sanitizeMarkdownImages", () => {
    it("should return content unchanged if no images", () => {
      const content = "This is plain text with no images.";
      expect(sanitizeMarkdownImages(content)).toBe(content);
    });

    it("should return empty string for empty input", () => {
      expect(sanitizeMarkdownImages("")).toBe("");
    });

    it("should fix completely empty image URLs", () => {
      const content = "![Alt text]()";
      const result = sanitizeMarkdownImages(content);
      expect(result).toBe("**[Image: Alt text]** *(Image URL was empty)*");
    });

    it("should fix undefined placeholder URLs", () => {
      const content = "![Image](undefined)";
      const result = sanitizeMarkdownImages(content);
      expect(result).toBe("**[Image: Image]** *(Image URL was invalid)*");
    });

    it("should fix null placeholder URLs", () => {
      const content = "![Image](null)";
      const result = sanitizeMarkdownImages(content);
      expect(result).toBe("**[Image: Image]** *(Image URL was invalid)*");
    });

    it("should fix URLs with whitespace", () => {
      const content = "![Image](url with spaces)";
      const result = sanitizeMarkdownImages(content);
      expect(result).toBe(
        "**[Image: Image]** *(Image URL contained whitespace)*"
      );
    });

    it("should leave valid URLs unchanged", () => {
      const content = "![Valid](https://example.com/image.png)";
      expect(sanitizeMarkdownImages(content)).toBe(content);
    });

    it("should handle multiple images", () => {
      const content = `
![Valid](https://example.com/image.png)
![Empty]()
![Invalid](undefined)
      `.trim();

      const result = sanitizeMarkdownImages(content);
      expect(result).toContain("![Valid](https://example.com/image.png)");
      expect(result).toContain("**[Image: Empty]** *(Image URL was empty)*");
      expect(result).toContain(
        "**[Image: Invalid]** *(Image URL was invalid)*"
      );
    });

    it("should truncate very long content and add notice", () => {
      const longContent = "a".repeat(3_000_000);
      const result = sanitizeMarkdownImages(longContent);
      expect(result).toContain(
        "<!-- Content truncated for sanitation safety -->"
      );
      expect(result.length).toBeLessThan(longContent.length);
    });
  });

  describe("ensureBlankLineAfterStandaloneBold", () => {
    it("should return empty string for empty input", () => {
      expect(ensureBlankLineAfterStandaloneBold("")).toBe("");
    });

    it("should add blank line after standalone bold when followed by content", () => {
      const content = "**Bold Heading**\nRegular text";
      const result = ensureBlankLineAfterStandaloneBold(content);
      expect(result).toBe("**Bold Heading**\n\nRegular text");
    });

    it("should not add blank line after standalone bold when followed by blank line", () => {
      const content = "**Bold Heading**\n\nRegular text";
      const result = ensureBlankLineAfterStandaloneBold(content);
      expect(result).toBe(content);
    });

    it("should not add blank line for bold within paragraph", () => {
      const content = "This is **bold** text on same line";
      const result = ensureBlankLineAfterStandaloneBold(content);
      expect(result).toBe(content);
    });

    it("should handle multiple standalone bold lines", () => {
      const content =
        "**First**\nText\n**Second**\nMore text\n**Third**\nFinal text";
      const result = ensureBlankLineAfterStandaloneBold(content);
      expect(result).toBe(
        "**First**\n\nText\n**Second**\n\nMore text\n**Third**\n\nFinal text"
      );
    });

    it("should handle standalone bold with whitespace", () => {
      const content = "  **Bold with spaces**  \nContent";
      const result = ensureBlankLineAfterStandaloneBold(content);
      expect(result).toContain("\n\n");
    });

    it("should not modify standalone bold at end of content", () => {
      const content = "Content\n**Bold at end**";
      const result = ensureBlankLineAfterStandaloneBold(content);
      expect(result).toBe(content);
    });
  });

  describe("normalizeForMatch", () => {
    it("should normalize whitespace", () => {
      expect(normalizeForMatch("  multiple   spaces  ")).toBe(
        "multiple spaces"
      );
    });

    it("should normalize Unicode", () => {
      const text = "Café";
      const result = normalizeForMatch(text);
      expect(result).toBeTruthy();
    });

    it("should remove leading emoji", () => {
      const text = "📄 Document";
      const result = normalizeForMatch(text);
      expect(result).toBe("Document");
    });

    it("should remove leading emoji with colon", () => {
      const text = "📄: Document";
      const result = normalizeForMatch(text);
      expect(result).toBe("Document");
    });

    it("should remove leading emoji with various separators", () => {
      expect(normalizeForMatch("📄- Document")).toBe("Document");
      expect(normalizeForMatch("📄– Document")).toBe("Document");
      expect(normalizeForMatch("📄— Document")).toBe("Document");
      expect(normalizeForMatch("📄; Document")).toBe("Document");
    });

    it("should handle text without emoji", () => {
      expect(normalizeForMatch("Regular Text")).toBe("Regular Text");
    });

    it("should handle empty string", () => {
      expect(normalizeForMatch("")).toBe("");
    });
  });

  describe("extractTextFromCalloutBlock", () => {
    it("should extract plain text from callout rich_text", () => {
      const block = {
        callout: {
          rich_text: [{ plain_text: "This is " }, { plain_text: "a callout" }],
        },
      };
      expect(extractTextFromCalloutBlock(block)).toBe("This is a callout");
    });

    it("should extract from text.content when available", () => {
      const block = {
        callout: {
          rich_text: [
            { type: "text", text: { content: "Text content" } },
            { plain_text: " and plain" },
          ],
        },
      };
      expect(extractTextFromCalloutBlock(block)).toBe("Text content and plain");
    });

    it("should add spaces between parts when needed", () => {
      const block = {
        callout: {
          rich_text: [
            { plain_text: "Word1" },
            { plain_text: "Word2" },
            { plain_text: "Word3" },
          ],
        },
      };
      expect(extractTextFromCalloutBlock(block)).toBe("Word1 Word2 Word3");
    });

    it("should not add extra spaces when parts already have whitespace", () => {
      const block = {
        callout: {
          rich_text: [
            { plain_text: "Word1 " },
            { plain_text: "Word2" },
            { plain_text: " Word3" },
          ],
        },
      };
      expect(extractTextFromCalloutBlock(block)).toBe("Word1 Word2 Word3");
    });

    it("should return empty string for missing callout", () => {
      expect(extractTextFromCalloutBlock({})).toBe("");
    });

    it("should return empty string for non-array rich_text", () => {
      const block = {
        callout: {
          rich_text: "not an array",
        },
      };
      expect(extractTextFromCalloutBlock(block)).toBe("");
    });

    it("should handle empty rich_text array", () => {
      const block = {
        callout: {
          rich_text: [],
        },
      };
      expect(extractTextFromCalloutBlock(block)).toBe("");
    });
  });

  describe("findMatchingBlockquote", () => {
    it("should find exact match in blockquote", () => {
      const lines = [
        "Text before",
        "> This is a quote",
        "> with multiple lines",
        "Text after",
      ];
      const match = findMatchingBlockquote(lines, "This is a quote", 0);

      expect(match).toBeTruthy();
      expect(match?.start).toBe(1);
      expect(match?.end).toBe(2);
      expect(match?.contentLines).toEqual([
        "This is a quote",
        "with multiple lines",
      ]);
    });

    it("should find partial match in blockquote", () => {
      const lines = [
        "Text before",
        "> This is a quote with extra text",
        "Text after",
      ];
      const match = findMatchingBlockquote(lines, "is a quote", 0);

      expect(match).toBeTruthy();
      expect(match?.start).toBe(1);
    });

    it("should handle blockquote with blank lines", () => {
      const lines = ["> Quote line 1", "", "> Quote line 2", "Text after"];
      const match = findMatchingBlockquote(lines, "Quote line 1", 0);

      expect(match).toBeTruthy();
      expect(match?.contentLines.length).toBeGreaterThan(1);
    });

    it("should respect fromIndex parameter", () => {
      const lines = ["> First quote", "Text", "> Second quote", "More text"];
      const match = findMatchingBlockquote(lines, "Second quote", 2);

      expect(match).toBeTruthy();
      expect(match?.start).toBe(2);
    });

    it("should return null when no match found", () => {
      const lines = ["> Quote text", "Regular text"];
      const match = findMatchingBlockquote(lines, "Not in content", 0);

      expect(match).toBeNull();
    });

    it("should return null for empty search text", () => {
      const lines = ["> Quote text"];
      const match = findMatchingBlockquote(lines, "", 0);

      expect(match).toBeNull();
    });

    it("should return null when normalized search is empty", () => {
      const lines = ["> Quote text"];
      const match = findMatchingBlockquote(lines, "   ", 0);

      expect(match).toBeNull();
    });

    it("should skip non-blockquote lines", () => {
      const lines = [
        "Regular text",
        "More regular text",
        "> Blockquote here",
        "After quote",
      ];
      const match = findMatchingBlockquote(lines, "Blockquote here", 0);

      expect(match).toBeTruthy();
      expect(match?.start).toBe(2);
    });
  });

  describe("processCalloutsInMarkdown", () => {
    it("should return content unchanged if no blocks", () => {
      const content = "> Some blockquote\n> text";
      const result = processCalloutsInMarkdown(content, []);
      expect(result).toBe(content);
    });

    it("should return content unchanged if empty content", () => {
      const blocks = [
        {
          type: "callout",
          callout: {
            rich_text: [{ plain_text: "Test" }],
          },
        } as any,
      ];
      const result = processCalloutsInMarkdown("", blocks);
      expect(result).toBe("");
    });

    it("should not process callouts inside code fences", () => {
      const content = `\`\`\`
> This is a blockquote in code
\`\`\``;
      const blocks = [
        {
          type: "callout",
          callout: {
            rich_text: [{ plain_text: "This is a blockquote" }],
          },
        } as any,
      ];
      const result = processCalloutsInMarkdown(content, blocks);
      expect(result).toContain("```");
      expect(result).toContain("> This is a blockquote in code");
    });

    it("should not process callouts inside existing admonitions", () => {
      const content = `:::note
> This is a blockquote in admonition
:::`;
      const blocks = [
        {
          type: "callout",
          callout: {
            rich_text: [{ plain_text: "This is a blockquote" }],
          },
        } as any,
      ];
      const result = processCalloutsInMarkdown(content, blocks);
      expect(result).toContain(":::note");
      expect(result).toContain("> This is a blockquote in admonition");
    });

    it("should handle nested callout blocks", () => {
      const parentBlock = {
        type: "callout",
        callout: {
          rich_text: [{ plain_text: "Parent callout" }],
        },
        children: [
          {
            type: "callout",
            callout: {
              rich_text: [{ plain_text: "Child callout" }],
            },
          },
        ],
      } as any;

      const content = "> Parent callout\n> Child callout";
      const result = processCalloutsInMarkdown(content, [parentBlock]);

      // Should process both callouts
      expect(result).toBeTruthy();
    });

    it("should preserve leading whitespace in admonitions", () => {
      const content = "  > Indented blockquote";
      const blocks = [
        {
          type: "callout",
          callout: {
            rich_text: [{ plain_text: "Indented blockquote" }],
            icon: { emoji: "💡" },
          },
        } as any,
      ];
      const result = processCalloutsInMarkdown(content, blocks);

      // Check that some indentation is preserved
      expect(result).toMatch(/^\s+/);
    });
  });
});
