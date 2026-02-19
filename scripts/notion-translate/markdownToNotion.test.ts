import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  describe("unsupported nodes and frontmatter handling", () => {
    it("strips leading frontmatter before creating Notion blocks", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `---
title: Internal metadata
slug: hidden
---

# Visible heading`;

      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("heading_1" in blocks[0]).toBe(true);

      const headingText = (
        blocks[0] as {
          heading_1: { rich_text: Array<{ text: { content: string } }> };
        }
      ).heading_1.rich_text
        .map((item) => item.text.content)
        .join("");
      expect(headingText).toBe("Visible heading");
    });

    it("falls back to paragraph text for unsupported top-level html nodes", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const html = "<details><summary>Summary</summary>Body</details>";
      const blocks = await markdownToNotionBlocks(html);

      expect(blocks).toHaveLength(1);
      expect("paragraph" in blocks[0]).toBe(true);

      const paragraphText = (
        blocks[0] as {
          paragraph: { rich_text: Array<{ text: { content: string } }> };
        }
      ).paragraph.rich_text
        .map((item) => item.text.content)
        .join("");
      expect(paragraphText).toBe(html);
    });

    it("throws for frontmatter-only content and does not append content blocks", async () => {
      const { createNotionPageFromMarkdown } = await import(
        "./markdownToNotion"
      );

      const notion = {
        dataSources: {
          query: vi.fn(),
        },
        pages: {
          create: vi.fn(),
          update: vi.fn(),
        },
        blocks: {
          children: {
            append: vi.fn(),
            list: vi.fn(),
          },
          delete: vi.fn(),
        },
      };

      const frontmatterOnlyContent = `---
title: Metadata only
---
`;

      await expect(
        createNotionPageFromMarkdown(
          notion as any,
          "parent-page-id",
          "database-id",
          "Frontmatter Only",
          frontmatterOnlyContent,
          {},
          true,
          "es"
        )
      ).rejects.toThrow(
        "Translated content is empty - cannot create page. Please check if the English source has content."
      );

      expect(notion.pages.create).not.toHaveBeenCalled();
      expect(notion.blocks.children.append).not.toHaveBeenCalled();
    });

    it("logs diagnostics when non-empty markdown converts to zero blocks", async () => {
      const { createNotionPageFromMarkdown } = await import(
        "./markdownToNotion"
      );

      const notion = {
        dataSources: {
          query: vi.fn(),
        },
        pages: {
          create: vi.fn(),
          update: vi.fn(),
        },
        blocks: {
          children: {
            append: vi.fn(),
            list: vi.fn(),
          },
          delete: vi.fn(),
        },
      };
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        await expect(
          createNotionPageFromMarkdown(
            notion as any,
            "parent-page-id",
            "database-id",
            "Broken Definition",
            "[missing]: <>",
            {},
            true,
            "es"
          )
        ).rejects.toThrow(
          "Translated content is empty - cannot create page. Please check if the English source has content."
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("unsupported top-level nodes: definition")
        );
        expect(notion.pages.create).not.toHaveBeenCalled();
        expect(notion.blocks.children.append).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
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

  describe("inline formatting preservation", () => {
    it("preserves bold text formatting", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "This is **bold text** in a paragraph";
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("paragraph" in blocks[0]).toBe(true);

      const richText = (blocks[0] as { paragraph: { rich_text: unknown[] } })
        .paragraph.rich_text;
      expect(richText.length).toBe(3);

      const boldItem = richText.find((item: unknown) => {
        const rt = item as { annotations?: { bold?: boolean } };
        return rt.annotations?.bold === true;
      });
      expect(boldItem).toBeDefined();
      expect((boldItem as { text: { content: string } }).text.content).toBe(
        "bold text"
      );
    });

    it("preserves italic text formatting", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "This is *italic text* in a paragraph";
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("paragraph" in blocks[0]).toBe(true);

      const richText = (blocks[0] as { paragraph: { rich_text: unknown[] } })
        .paragraph.rich_text;

      const italicItem = richText.find((item: unknown) => {
        const rt = item as { annotations?: { italic?: boolean } };
        return rt.annotations?.italic === true;
      });
      expect(italicItem).toBeDefined();
      expect((italicItem as { text: { content: string } }).text.content).toBe(
        "italic text"
      );
    });

    it("preserves inline code formatting", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "Use `const x = 1` for inline code";
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("paragraph" in blocks[0]).toBe(true);

      const richText = (blocks[0] as { paragraph: { rich_text: unknown[] } })
        .paragraph.rich_text;

      const codeItem = richText.find((item: unknown) => {
        const rt = item as { annotations?: { code?: boolean } };
        return rt.annotations?.code === true;
      });
      expect(codeItem).toBeDefined();
      expect((codeItem as { text: { content: string } }).text.content).toBe(
        "const x = 1"
      );
    });

    it("preserves strikethrough text formatting (with gfm plugin)", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "This is ~~strikethrough~~ text";
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("paragraph" in blocks[0]).toBe(true);

      const richText = (blocks[0] as { paragraph: { rich_text: unknown[] } })
        .paragraph.rich_text;

      const combined = richText
        .map(
          (item: unknown) =>
            (item as { text: { content: string } }).text.content
        )
        .join("");
      expect(combined).toContain("strikethrough");
    });
  });

  describe("link URL preservation", () => {
    it("preserves link URL in rich_text", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "Check [this link](https://example.com) for more info";
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("paragraph" in blocks[0]).toBe(true);

      const richText = (blocks[0] as { paragraph: { rich_text: unknown[] } })
        .paragraph.rich_text;

      const linkItem = richText.find((item: unknown) => {
        const rt = item as { text?: { link?: { url: string } } };
        return rt.text?.link?.url === "https://example.com";
      });
      expect(linkItem).toBeDefined();
      expect((linkItem as { text: { content: string } }).text.content).toBe(
        "this link"
      );
    });
  });

  describe("code block handling", () => {
    it("uses code block type for large code blocks (>1900 chars)", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const longCode =
        "function test() {\n" + "  return 'x';\n".repeat(200) + "}";
      const markdown = "```javascript\n" + longCode + "\n```";

      const blocks = await markdownToNotionBlocks(markdown);

      const codeBlocks = blocks.filter((b) => "code" in b);
      expect(codeBlocks.length).toBeGreaterThan(0);

      const hasParagraphs = blocks.some((b) => "paragraph" in b);
      expect(hasParagraphs).toBe(false);
    });

    it("uses code block type for small code blocks (<=1900 chars)", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = "```js\nconst x = 1;\n```";
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect("code" in blocks[0]).toBe(true);
      expect((blocks[0] as { code: { language: string } }).code.language).toBe(
        "javascript"
      );
    });
  });

  describe("nested list support", () => {
    it("preserves nested list structure", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `- Item 1
  - Nested item 1
  - Nested item 2
- Item 2`;
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks.length).toBeGreaterThanOrEqual(3);

      const listItems = blocks.filter((b) => "bulleted_list_item" in b);
      expect(listItems.length).toBe(4);
    });
  });
});
