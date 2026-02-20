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

    it("preserves thematic-break markdown that starts with ---", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `---

# Keep this heading`;

      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(2);
      expect("divider" in blocks[0]).toBe(true);
      expect("heading_1" in blocks[1]).toBe(true);
    });

    it("preserves unterminated frontmatter-like content", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `---
title: Missing closing delimiter
Body stays intact`;

      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(2);
      expect("divider" in blocks[0]).toBe(true);

      const paragraphText = (
        blocks[1] as {
          paragraph: { rich_text: Array<{ text: { content: string } }> };
        }
      ).paragraph.rich_text
        .map((item) => item.text.content)
        .join("");

      expect(paragraphText).toContain("title: Missing closing delimiter");
      expect(paragraphText).toContain("Body stays intact");
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
      ).rejects.toThrow("Translated content is empty");

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
        ).rejects.toThrow("Translated content is empty");

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

  it("preserves empty list items as whitespace blocks", async () => {
    const { markdownToNotionBlocks } = await import("./markdownToNotion");

    const markdown = "1. First\n2.\n3. Third";
    const blocks = await markdownToNotionBlocks(markdown);

    const listBlocks = blocks.filter(
      (block) => "numbered_list_item" in block
    ) as Array<{
      numbered_list_item: { rich_text: Array<{ text: { content: string } }> };
    }>;

    expect(listBlocks).toHaveLength(3);
    expect(listBlocks[1].numbered_list_item.rich_text[0].text.content).toBe(
      " "
    );
  });

  it("maps additional code language aliases to Notion-supported values", async () => {
    const { markdownToNotionBlocks } = await import("./markdownToNotion");

    const tsxMarkdown = "```tsx\nconst v = 1;\n```";
    const tsxBlocks = await markdownToNotionBlocks(tsxMarkdown);
    const tsxCodeBlock = tsxBlocks.find((block) => "code" in block) as {
      code: { language: string };
    };

    expect(tsxCodeBlock.code.language).toBe("typescript");

    const lessMarkdown = "```less\n@color: #4D926F;\n```";
    const lessBlocks = await markdownToNotionBlocks(lessMarkdown);
    const lessCodeBlock = lessBlocks.find((block) => "code" in block) as {
      code: { language: string };
    };

    expect(lessCodeBlock.code.language).toBe("less");
  });

  it("throws a specific safety error when markdown generates too many blocks", async () => {
    const { createNotionPageFromMarkdown } = await import("./markdownToNotion");

    const notion = {
      dataSources: {
        query: vi.fn().mockResolvedValue({ results: [] }),
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

    const hugeMarkdown = Array.from(
      { length: 1001 },
      (_, index) => `- item ${index}`
    ).join("\n");

    await expect(
      createNotionPageFromMarkdown(
        notion as any,
        "parent-page-id",
        "database-id",
        "Huge Page",
        hugeMarkdown,
        {},
        true,
        "es"
      )
    ).rejects.toThrow("Translated content exceeds Notion block safety limit");
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

  describe("table support", () => {
    it("converts a markdown table to a Notion table block", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `| Name | Age |
| --- | --- |
| Alice | 30 |
| Bob | 25 |`;

      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      const tableBlock = blocks[0] as {
        type: string;
        table: {
          table_width: number;
          has_column_header: boolean;
          has_row_header: boolean;
          children: Array<{
            type: string;
            table_row: { cells: Array<Array<{ text: { content: string } }>> };
          }>;
        };
      };

      expect(tableBlock.type).toBe("table");
      expect(tableBlock.table.table_width).toBe(2);
      expect(tableBlock.table.has_column_header).toBe(true);
      expect(tableBlock.table.has_row_header).toBe(false);
      expect(tableBlock.table.children).toHaveLength(3);
      expect(tableBlock.table.children[0].type).toBe("table_row");

      const headerCells = tableBlock.table.children[0].table_row.cells;
      expect(headerCells[0][0].text.content).toBe("Name");
      expect(headerCells[1][0].text.content).toBe("Age");

      const row1Cells = tableBlock.table.children[1].table_row.cells;
      expect(row1Cells[0][0].text.content).toBe("Alice");
      expect(row1Cells[1][0].text.content).toBe("30");
    });

    it("converts a single-row table (no header) correctly", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `| Col A | Col B |
| --- | --- |`;

      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(1);
      const tableBlock = blocks[0] as {
        type: string;
        table: {
          table_width: number;
          has_column_header: boolean;
          children: unknown[];
        };
      };

      expect(tableBlock.type).toBe("table");
      expect(tableBlock.table.table_width).toBe(2);
      expect(tableBlock.table.children).toHaveLength(1);
    });

    it("does not fall back to plain text for table nodes", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `| Header |
| --- |
| Cell |`;

      const blocks = await markdownToNotionBlocks(markdown);

      const paragraphBlocks = blocks.filter((b) => "paragraph" in b);
      expect(paragraphBlocks).toHaveLength(0);
      expect(blocks.some((b) => "table" in b)).toBe(true);
    });
  });

  describe("nested list support", () => {
    it("emits empty parent list item before nested children", async () => {
      const { markdownToNotionBlocks } = await import("./markdownToNotion");

      const markdown = `1.
   - child`;
      const blocks = await markdownToNotionBlocks(markdown);

      expect(blocks).toHaveLength(2);
      expect("numbered_list_item" in blocks[0]).toBe(true);
      expect("bulleted_list_item" in blocks[1]).toBe(true);

      const parent = blocks[0] as {
        numbered_list_item: { rich_text: Array<{ text: { content: string } }> };
      };
      expect(parent.numbered_list_item.rich_text[0].text.content).toBe(" ");
    });

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
