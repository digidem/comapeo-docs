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
            type: "text",
            text: { content: "This is a callout without icon" },
            plain_text: "This is a callout without icon",
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
              type: "text",
              text: { content: "Test content" },
              plain_text: "Test content",
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
            type: "text",
            text: { content: "**Important Note:**\nThis is the content" },
            plain_text: "**Important Note:**\nThis is the content",
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
            type: "text",
            text: {
              content: "**Heads up:** Remember to `bun install` before running",
            },
            plain_text:
              "**Heads up:** Remember to `bun install` before running",
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

    it("should handle multiple rich text objects", () => {
      const calloutProperties = {
        rich_text: [
          {
            type: "text",
            text: { content: "First part " },
            plain_text: "First part ",
          },
          {
            type: "text",
            text: { content: "second part" },
            plain_text: "second part",
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

      expect(result).toBe(":::tip 💡\nThis is helpful information\n:::\n");
    });

    it("should generate correct admonition syntax without title", () => {
      const processedCallout = {
        type: "warning" as const,
        title: undefined,
        content: "This is a warning message",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::warning\nThis is a warning message\n:::\n");
    });

    it("should handle empty content", () => {
      const processedCallout = {
        type: "note" as const,
        title: "Empty Note",
        content: "",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::note Empty Note\n:::\n");
    });

    it("should preserve multiline content", () => {
      const processedCallout = {
        type: "info" as const,
        title: undefined,
        content: "Line 1\nLine 2\nLine 3",
      };

      const result = calloutToAdmonition(processedCallout);

      expect(result).toBe(":::info\nLine 1\nLine 2\nLine 3\n:::\n");
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
              type: "text",
              text: { content: "See screen capture below" },
              plain_text: "See screen capture below",
            },
          ],
          icon: {
            type: "emoji",
            emoji: "👁️",
          },
          color: "green_background",
        },
      };

      const result = convertCalloutToAdmonition(calloutBlock as any, [
        "👁️ See screen capture below",
      ]);

      expect(result).toBe(":::tip 👁️\nSee screen capture below\n:::\n");
    });

    it("should return null for non-callout blocks", () => {
      const paragraphBlock = {
        type: "paragraph",
        id: "test-id",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "Regular paragraph" },
              plain_text: "Regular paragraph",
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
