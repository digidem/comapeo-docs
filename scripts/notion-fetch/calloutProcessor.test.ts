import { describe, it, expect } from "vitest";
import {
  CALLOUT_COLOR_MAPPING,
  processCalloutBlock,
  calloutToAdmonition,
  convertCalloutToAdmonition,
  isCalloutBlock,
} from "./calloutProcessor";

describe("calloutProcessor", () => {
  describe("CALLOUT_COLOR_MAPPING", () => {
    it("should map all expected Notion colors to Docusaurus admonition types", () => {
      expect(CALLOUT_COLOR_MAPPING.blue_background).toBe("info");
      expect(CALLOUT_COLOR_MAPPING.yellow_background).toBe("warning");
      expect(CALLOUT_COLOR_MAPPING.red_background).toBe("danger");
      expect(CALLOUT_COLOR_MAPPING.green_background).toBe("tip");
      expect(CALLOUT_COLOR_MAPPING.gray_background).toBe("note");
      expect(CALLOUT_COLOR_MAPPING.orange_background).toBe("caution");
      expect(CALLOUT_COLOR_MAPPING.purple_background).toBe("note");
      expect(CALLOUT_COLOR_MAPPING.pink_background).toBe("note");
      expect(CALLOUT_COLOR_MAPPING.brown_background).toBe("note");
      expect(CALLOUT_COLOR_MAPPING.default).toBe("note");
    });
  });

  describe("isCalloutBlock", () => {
    it("should identify callout blocks correctly", () => {
      const calloutBlock = { type: "callout", id: "test" };
      const paragraphBlock = { type: "paragraph", id: "test" };

      expect(isCalloutBlock(calloutBlock as any)).toBe(true);
      expect(isCalloutBlock(paragraphBlock as any)).toBe(false);
    });
  });

  describe("processCalloutBlock", () => {
    it("should process a basic callout with emoji icon", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: { content: "This is a test callout content", link: null },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "This is a test callout content",
            href: null,
          },
        ],
        icon: {
          type: "emoji" as const,
          emoji: "👁️",
        },
        color: "green_background" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["👁️ This is a test callout content"],
      });

      expect(result.type).toBe("tip");
      expect(result.title).toBe("👁️");
      expect(result.content).toBe("This is a test callout content");
    });

    it("should process a callout without icon", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: { content: "This is a callout without icon", link: null },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "This is a callout without icon",
            href: null,
          },
        ],
        color: "blue_background" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["This is a callout without icon"],
      });

      expect(result.type).toBe("info");
      expect(result.title).toBeUndefined();
      expect(result.content).toBe("This is a callout without icon");
    });

    it("should handle different color mappings", () => {
      const testCases = [
        { color: "red_background" as const, expectedType: "danger" },
        { color: "yellow_background" as const, expectedType: "warning" },
        { color: "orange_background" as const, expectedType: "caution" },
        { color: "gray_background" as const, expectedType: "note" },
        { color: "purple_background" as const, expectedType: "note" },
      ];

      testCases.forEach(({ color, expectedType }) => {
        const calloutProperties = {
          rich_text: [
            {
              type: "text" as const,
              text: { content: "Test content", link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "default" as const,
              },
              plain_text: "Test content",
              href: null,
            },
          ],
          color,
        };

        const result = processCalloutBlock(calloutProperties, {
          markdownLines: ["Test content"],
        });
        expect(result.type).toBe(expectedType);
      });
    });

    it("should extract title from content with bold formatting", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "**Important Note:**\nThis is the content",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "**Important Note:**\nThis is the content",
            href: null,
          },
        ],
        color: "default" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["**Important Note:**", "This is the content"],
      });

      expect(result.title).toBe("Important Note");
      expect(result.content).toBe("This is the content");
    });

    it("should pull inline title and preserve formatting", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "**Heads up:** Remember to `bun install` before running",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text:
              "**Heads up:** Remember to `bun install` before running",
            href: null,
          },
        ],
        color: "yellow_background" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: [
          "**Heads up:** Remember to `bun install` before running",
          "- Don't forget to copy the .env file",
        ],
      });

      expect(result.type).toBe("warning");
      expect(result.title).toBe("Heads up");
      expect(result.content).toBe(
        "Remember to `bun install` before running\n- Don't forget to copy the .env file"
      );
    });

    it("should pull inline bold title when separated by whitespace only", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content:
                "**Heads up** Remember to `bun install` before running the script",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text:
              "**Heads up** Remember to `bun install` before running the script",
            href: null,
          },
        ],
        color: "yellow_background" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: [
          "**Heads up** Remember to `bun install` before running the script",
        ],
      });

      expect(result.type).toBe("warning");
      expect(result.title).toBe("Heads up");
      expect(result.content).toBe(
        "Remember to `bun install` before running the script"
      );
    });

    it("should preserve content when icon is immediately followed by letters", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "👁️is required",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "👁️is required",
            href: null,
          },
        ],
        icon: {
          type: "emoji" as const,
          emoji: "👁️",
        },
        color: "default" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["👁️is required"],
      });

      expect(result.title).toBe("👁️");
      expect(result.content).toBe("👁️is required");
    });

    it("should preserve content with inverted punctuation", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Aviso ¿contenido importante",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "Aviso ¿contenido importante",
            href: null,
          },
        ],
        color: "default" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["Aviso ¿contenido importante"],
      });

      expect(result.title).toBe("Aviso");
      expect(result.content).toBe("contenido importante");
    });

    it("should preserve punctuation-prefixed terms after icon stripping", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "💡.NET support is required",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "💡.NET support is required",
            href: null,
          },
        ],
        icon: {
          type: "emoji" as const,
          emoji: "💡",
        },
        color: "default" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["💡.NET support is required"],
      });

      expect(result.title).toBe("💡");
      expect(result.content).toBe(".NET support is required");
    });

    it("should handle multiple rich text objects", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text" as const,
            text: { content: "First part ", link: null },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "First part ",
            href: null,
          },
          {
            type: "text" as const,
            text: { content: "second part", link: null },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default" as const,
            },
            plain_text: "second part",
            href: null,
          },
        ],
        icon: {
          type: "emoji" as const,
          emoji: "🔔",
        },
        color: "yellow_background" as const,
      };

      const result = processCalloutBlock(calloutProperties, {
        markdownLines: ["🔔 First part second part"],
      });

      expect(result.type).toBe("warning");
      expect(result.title).toBe("🔔");
      expect(result.content).toBe("First part second part");
    });
  });

  describe("calloutToAdmonition", () => {
    it("should generate correct admonition syntax with title", () => {
      const processedCallout = {
        type: "tip" as const,
        title: "💡",
        content: "This is helpful information",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::tip 💡\nThis is helpful information\n:::");
    });

    it("should generate correct admonition syntax without title", () => {
      const processedCallout = {
        type: "warning" as const,
        title: undefined,
        content: "This is a warning message",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::warning\nThis is a warning message\n:::");
    });

    it("should handle empty content", () => {
      const processedCallout = {
        type: "note" as const,
        title: "Empty Note",
        content: "",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::note Empty Note\n:::");
    });

    it("should preserve multiline content", () => {
      const processedCallout = {
        type: "info" as const,
        title: undefined,
        content: "Line 1\nLine 2\nLine 3",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::info\nLine 1\nLine 2\nLine 3\n:::");
    });

    it("should render children content after main content", () => {
      const processedCallout = {
        type: "tip" as const,
        title: "Note",
        content: "Main content here",
        children: "Child paragraph content",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(
        ":::tip Note\nMain content here\nChild paragraph content\n:::"
      );
    });

    it("should handle children with nested list", () => {
      const processedCallout = {
        type: "warning" as const,
        content: "Important warning",
        children: "- Item 1\n- Item 2\n- Item 3",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(
        ":::warning\nImportant warning\n- Item 1\n- Item 2\n- Item 3\n:::"
      );
    });

    it("should handle mixed children content", () => {
      const processedCallout = {
        type: "info" as const,
        title: "Info Title",
        content: "Main content",
        children:
          "First paragraph\n\n- List item 1\n- List item 2\n\nSecond paragraph",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(
        ":::info Info Title\nMain content\nFirst paragraph\n\n- List item 1\n- List item 2\n\nSecond paragraph\n:::"
      );
    });

    it("should handle empty children gracefully", () => {
      const processedCallout = {
        type: "note" as const,
        content: "Content only",
        children: "",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::note\nContent only\n:::");
    });
  });

  describe("convertCalloutToAdmonition", () => {
    it("should convert a complete callout block to admonition markdown", () => {
      const calloutBlock = {
        type: "callout",
        id: "test-id",
        callout: {
          rich_text: [
            {
              type: "text" as const,
              text: { content: "See screen capture below", link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "default" as const,
              },
              plain_text: "See screen capture below",
              href: null,
            },
          ],
          icon: {
            type: "emoji" as const,
            emoji: "👁️",
          },
          color: "green_background" as const,
        },
      };

      const result = convertCalloutToAdmonition(calloutBlock as any, [
        "👁️ See screen capture below",
      ]);

      expect(result).toBe(":::tip 👁️\nSee screen capture below\n:::");
    });

    it("should return null for non-callout blocks", () => {
      const paragraphBlock = {
        type: "paragraph",
        id: "test-id",
        paragraph: {
          rich_text: [
            {
              type: "text" as const,
              text: { content: "Regular paragraph", link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "default" as const,
              },
              plain_text: "Regular paragraph",
              href: null,
            },
          ],
        },
      };

      const result = convertCalloutToAdmonition(paragraphBlock as any, [
        "Regular paragraph",
      ]);

      expect(result).toBeNull();
    });

    it("should return null for callout block without callout properties", () => {
      const malformedBlock = {
        type: "callout",
        id: "test-id",
        // Missing callout properties
      };

      const result = convertCalloutToAdmonition(malformedBlock as any);

      expect(result).toBeNull();
    });
  });
});
