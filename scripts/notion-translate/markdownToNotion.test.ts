import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./test-openai-mock";
import { installTestNotionEnv } from "../test-utils";

describe("markdownToNotion", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./markdownToNotion");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./markdownToNotion");
    expect(typeof scriptModule).toBe("object");
  });

  describe("markdownToNotionBlocks – Notion 2000-char rich_text limit", () => {
    it("should split a blockquote longer than 2000 chars into multiple rich_text items", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      // Build a blockquote whose text is ~2844 chars (replicating the real failure)
      const longText = "A".repeat(2844);
      const markdown = `> ${longText}`;

      const blocks = await markdownToNotionBlocks(markdown);

      const quoteBlocks = blocks.filter((b) => "quote" in b);
      expect(quoteBlocks.length).toBeGreaterThanOrEqual(1);

      // Every rich_text item in every quote block must be ≤ 2000 chars
      for (const block of quoteBlocks) {
        const richText = (
          block as {
            quote: { rich_text: Array<{ text: { content: string } }> };
          }
        ).quote.rich_text;
        for (const item of richText) {
          expect(item.text.content.length).toBeLessThanOrEqual(2000);
        }
      }

      // The combined text should equal the original
      const combined = quoteBlocks
        .flatMap(
          (b) =>
            (
              b as {
                quote: { rich_text: Array<{ text: { content: string } }> };
              }
            ).quote.rich_text
        )
        .map((item) => item.text.content)
        .join("");
      expect(combined).toBe(longText);
    });

    it("should keep a short blockquote as a single rich_text item", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "> Short quote text";
      const blocks = await markdownToNotionBlocks(markdown);

      const quoteBlocks = blocks.filter((b) => "quote" in b);
      expect(quoteBlocks.length).toBe(1);
      const richText = (quoteBlocks[0] as { quote: { rich_text: unknown[] } })
        .quote.rich_text;
      expect(richText.length).toBe(1);
    });

    it("should split a paragraph longer than 2000 chars into multiple rich_text items", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const longText = "B".repeat(2500);
      const blocks = await markdownToNotionBlocks(longText);

      const paragraphBlocks = blocks.filter((b) => "paragraph" in b);
      expect(paragraphBlocks.length).toBeGreaterThanOrEqual(1);

      for (const block of paragraphBlocks) {
        const richText = (
          block as {
            paragraph: { rich_text: Array<{ text: { content: string } }> };
          }
        ).paragraph.rich_text;
        for (const item of richText) {
          expect(item.text.content.length).toBeLessThanOrEqual(2000);
        }
      }

      const combined = paragraphBlocks
        .flatMap(
          (b) =>
            (
              b as {
                paragraph: { rich_text: Array<{ text: { content: string } }> };
              }
            ).paragraph.rich_text
        )
        .map((item) => item.text.content)
        .join("");
      expect(combined).toBe(longText);
    });

    it("should prefer splitting at word boundaries for long natural-language text", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const sentence = "This is a natural language sentence for split testing.";
      const longText = `${sentence} `.repeat(80).trim();
      expect(longText.length).toBeGreaterThan(1900);

      const blocks = await markdownToNotionBlocks(longText);
      const paragraphBlocks = blocks.filter((b) => "paragraph" in b);
      expect(paragraphBlocks.length).toBe(1);

      const richText = (
        paragraphBlocks[0] as {
          paragraph: { rich_text: Array<{ text: { content: string } }> };
        }
      ).paragraph.rich_text;
      expect(richText.length).toBeGreaterThan(1);

      for (const item of richText) {
        expect(item.text.content.length).toBeLessThanOrEqual(2000);
      }

      for (const item of richText.slice(0, -1)) {
        expect(item.text.content.endsWith(" ")).toBe(true);
      }

      const combined = richText.map((item) => item.text.content).join("");
      expect(combined).toBe(longText);
    });

    it("should split a list item longer than 2000 chars into multiple rich_text items", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const longItem = "List item content ".repeat(150).trim();
      expect(longItem.length).toBeGreaterThan(1900);

      const blocks = await markdownToNotionBlocks(`- ${longItem}`);
      const listBlocks = blocks.filter((b) => "bulleted_list_item" in b);
      expect(listBlocks.length).toBe(1);

      const richText = (
        listBlocks[0] as {
          bulleted_list_item: {
            rich_text: Array<{ text: { content: string } }>;
          };
        }
      ).bulleted_list_item.rich_text;
      expect(richText.length).toBeGreaterThan(1);

      for (const item of richText) {
        expect(item.text.content.length).toBeLessThanOrEqual(2000);
      }

      const combined = richText.map((item) => item.text.content).join("");
      expect(combined).toBe(longItem);
    });

    it("should split a heading longer than 2000 chars into multiple rich_text items", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const longHeading = "Heading text ".repeat(220).trim();
      expect(longHeading.length).toBeGreaterThan(1900);

      const blocks = await markdownToNotionBlocks(`# ${longHeading}`);
      const headingBlocks = blocks.filter((b) => "heading_1" in b);
      expect(headingBlocks.length).toBe(1);

      const richText = (
        headingBlocks[0] as {
          heading_1: { rich_text: Array<{ text: { content: string } }> };
        }
      ).heading_1.rich_text;
      expect(richText.length).toBeGreaterThan(1);

      for (const item of richText) {
        expect(item.text.content.length).toBeLessThanOrEqual(2000);
      }

      const combined = richText.map((item) => item.text.content).join("");
      expect(combined).toBe(longHeading);
    });
  });
});
