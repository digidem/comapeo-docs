import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as scriptModule from "./contentSanitizer";

describe("contentSanitizer", () => {
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
    expect(scriptModule).toBeDefined();
  });

  /**
   * TODO: Implement the following test cases
   *
   * AI-Generated Test Case Suggestions:
   * (Run `bun run ai:suggest-tests ./contentSanitizer.ts` to generate)
   *
   * 1. Test with valid input parameters
   * 2. Test error handling for invalid inputs
   * 3. Test edge cases and boundary conditions
   * 4. Test async operations and promise handling
   * 5. Test integration with external dependencies
   */

  describe("sanitizeMarkdownContent", () => {
    it("should handle normal markdown content without changes", () => {
      const input = "# Normal Heading\n\nThis is **bold** text with `code`.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe(input);
    });

    it("should remove curly brace expressions", () => {
      const input = "Text with {expression} and {{nested}} braces.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("Text with expression and nested braces.");
    });

    it("should preserve code blocks and inline code", () => {
      const input =
        "```js\nconst obj = {key: 'value'};\n```\nInline `{code}` here.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe(input); // Should remain unchanged
    });

    it("should fix malformed <link to section.> patterns", () => {
      const input = "Check <link to section.> for details.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("Check [link to section](#section) for details.");
    });

    it("should fix malformed <link to section> patterns (without dot)", () => {
      const input = "Check <LINK TO SECTION> for details.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("Check [link to section](#section) for details.");
    });

    it("should fix other malformed link tags with invalid attributes", () => {
      const input = "Visit <link href.example=value> page.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("Visit [link](#) page.");
    });

    it("should fix malformed Link tags with invalid attributes", () => {
      const input = "Visit <Link to.page=value> page.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("Visit [Link](#) page.");
    });

    it("should convert malformed JSX tags to markdown links", () => {
      const input = "<Component prop unquoted>";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("[Component](#component)");
    });

    it("should handle complex mixed content", () => {
      const input =
        "# Title\n\n{expression} with <link to section.> and `{preserved}` code.\n\n```js\n{code: 'block'}\n```";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toContain("[link to section](#section)");
      expect(result).toContain("expression with");
      expect(result).toContain("`{preserved}`");
      expect(result).toContain("```js\n{code: 'block'}\n```");
    });

    it("should handle empty strings", () => {
      const result = scriptModule.sanitizeMarkdownContent("");
      expect(result).toBe("");
    });

    it("should handle strings with only whitespace", () => {
      const input = "   \n\t  ";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe(input);
    });

    it("should handle nested curly braces", () => {
      const input = "Text with {{deeply {nested} content}} braces.";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).not.toContain("{");
      expect(result).not.toContain("}");
      expect(result).toContain("deeply nested content");
    });

    it("should preserve valid HTML/JSX tags", () => {
      const input = '<div className="valid">Content</div>';
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe(input);
    });

    it("should handle malformed tags with dots in attribute names", () => {
      const input = "<tag attr.name value>";
      const result = scriptModule.sanitizeMarkdownContent(input);
      expect(result).toBe("[tag](#tag)");
    });
  });

  describe("restoreSoftLineBreaks", () => {
    it("should convert single newlines between text into <br /> elements", () => {
      const input = "First line\nSecond line";
      const result = scriptModule.restoreSoftLineBreaks(input);
      expect(result).toBe("First line<br />\nSecond line");
    });

    it("should leave paragraph breaks (double newlines) untouched", () => {
      const input = "First paragraph\n\nSecond paragraph";
      const result = scriptModule.restoreSoftLineBreaks(input);
      expect(result).toBe(input);
    });

    it("should ignore newlines that start markdown list items", () => {
      const input = "Intro text\n- list item";
      const result = scriptModule.restoreSoftLineBreaks(input);
      expect(result).toBe(input);
    });

    it("should ignore newlines before numbered list items", () => {
      const input = "Intro text\n1. First item";
      const result = scriptModule.restoreSoftLineBreaks(input);
      expect(result).toBe(input);
    });

    it("should not modify content inside fenced code blocks", () => {
      const input = "```js\nconst x = 1;\nconst y = 2;\n```\nOutside";
      const result = scriptModule.restoreSoftLineBreaks(input);
      expect(result).toBe(input);
    });

    it("should normalize unicode line separators into <br /> line breaks", () => {
      const input = "Line one\u2028Line two";
      const result = scriptModule.restoreSoftLineBreaks(input);
      expect(result).toBe("Line one<br />\nLine two");
    });
  });
});
