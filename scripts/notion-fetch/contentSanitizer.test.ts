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

    describe("heading hierarchy fixes", () => {
      it("should keep the first H1 and convert subsequent H1s to H2s", () => {
        const input = `# First Title
Content here
# Second Title
More content
# Third Title`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("# First Title");
        expect(result).toContain("## Second Title");
        expect(result).toContain("## Third Title");
        expect(result.match(/^# /gm)?.length).toBe(1);
      });

      it("should remove empty headings", () => {
        const input = `# Valid Title
#
## Valid H2
###
Content`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("# Valid Title");
        expect(result).toContain("## Valid H2");
        expect(result).not.toContain("#\n");
        expect(result).not.toContain("###   ");
      });

      it("should preserve H2 and H3 headings unchanged", () => {
        const input = `# Title
## Section
### Subsection
#### Deep heading
##### Deeper
###### Deepest`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toBe(input);
      });

      it("should handle real Notion export pattern", () => {
        const input = `# Setting up your phone
### Checklist
# Related Content
### Why is it important
# Troubleshooting`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("# Setting up your phone");
        expect(result).toContain("## Related Content");
        expect(result).toContain("## Troubleshooting");
        expect(result).toContain("### Checklist");
        expect(result).toContain("### Why is it important");
      });

      it("should handle mixed content with headings", () => {
        const input = `# Main Title
Some **bold** content here.

## Regular Section
# Another Title (should become H2)
More content with [links](#).

### Subsection
Content here.`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("# Main Title");
        expect(result).toContain("## Another Title (should become H2)");
        expect(result).toContain("## Regular Section");
        expect(result).toContain("### Subsection");
      });

      it("should handle headings with special characters", () => {
        const input = `# Title [H1]
# Another Title: Subtitle
# Title with {brackets}`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("# Title [H1]");
        expect(result).toContain("## Another Title: Subtitle");
        // Note: brackets get removed by other sanitization rules
        expect(result).toMatch(/## Title with.*brackets/);
      });

      it("should preserve indentation when normalizing headings", () => {
        const input = `   # Indented Title
  # Second Title
   ## Existing Indented H2`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("   # Indented Title");
        expect(result).toContain("  ## Second Title");
        expect(result).toContain("   ## Existing Indented H2");
      });

      it("should not affect code blocks with # symbols", () => {
        const input = `# Title
\`\`\`bash
# This is a comment in code
echo "# Not a heading"
\`\`\`
# Second Title`;
        const result = scriptModule.sanitizeMarkdownContent(input);
        expect(result).toContain("# Title");
        expect(result).toContain("## Second Title");
        expect(result).toContain("# This is a comment in code");
        expect(result).toContain('echo "# Not a heading"');
      });
    });
  });
});
