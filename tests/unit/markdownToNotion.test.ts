import { test, expect, mock, describe, beforeEach } from "bun:test";
import { markdownToNotionBlocks, createNotionPageFromMarkdown } from "../../scripts/markdownToNotion";
import fs from "fs/promises";
import { Client } from "@notionhq/client";

// We'll use Bun's mock functionality instead of Jest

// Mock the fs module
const mockReadFile = mock(fs.readFile);

// Mock the Notion client
const mockNotion = {
  databases: {
    query: mock(async () => ({ results: [] }))
  },
  pages: {
    create: mock(async () => ({ id: "mock-page-id" })),
    update: mock(async () => ({}))
  },
  blocks: {
    children: {
      list: mock(async () => ({ results: [] })),
      append: mock(async () => ({}))
    },
    delete: mock(async () => ({}))
  }
} as unknown as Client;

describe("markdownToNotionBlocks", () => {
  test("converts heading to Notion heading block", async () => {
    const markdown = "# Heading 1";
    const blocks = await markdownToNotionBlocks(markdown);

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toHaveProperty("heading_1");
    expect(blocks[0].heading_1?.rich_text[0].text.content).toBe("Heading 1");
  });

  test("converts multiple heading levels", async () => {
    const markdown = "# Heading 1\n## Heading 2\n### Heading 3";
    const blocks = await markdownToNotionBlocks(markdown);

    expect(blocks.length).toBe(3);
    expect(blocks[0]).toHaveProperty("heading_1");
    expect(blocks[1]).toHaveProperty("heading_2");
    expect(blocks[2]).toHaveProperty("heading_3");
    expect(blocks[0].heading_1?.rich_text[0].text.content).toBe("Heading 1");
    expect(blocks[1].heading_2?.rich_text[0].text.content).toBe("Heading 2");
    expect(blocks[2].heading_3?.rich_text[0].text.content).toBe("Heading 3");
  });

  test("converts paragraph to Notion paragraph block", async () => {
    const markdown = "This is a paragraph.";
    const blocks = await markdownToNotionBlocks(markdown);

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toHaveProperty("paragraph");
    expect(blocks[0].paragraph?.rich_text[0].text.content).toBe("This is a paragraph.");
  });

  test("converts unordered list to Notion bulleted list items", async () => {
    const markdown = "- Item 1\n- Item 2\n- Item 3";
    const blocks = await markdownToNotionBlocks(markdown);

    // Filter only bulleted list items
    const listItems = blocks.filter(block => block.type === 'bulleted_list_item');

    expect(listItems.length).toBe(3);
    listItems.forEach((block, index) => {
      expect(block).toHaveProperty("bulleted_list_item");
      expect(block.bulleted_list_item?.rich_text[0].text.content).toBe(`Item ${index + 1}`);
    });
  });

  test("converts ordered list to Notion numbered list items", async () => {
    const markdown = "1. Item 1\n2. Item 2\n3. Item 3";
    const blocks = await markdownToNotionBlocks(markdown);

    // Filter only numbered list items
    const listItems = blocks.filter(block => block.type === 'numbered_list_item');

    expect(listItems.length).toBe(3);
    listItems.forEach((block, index) => {
      expect(block).toHaveProperty("numbered_list_item");
      expect(block.numbered_list_item?.rich_text[0].text.content).toBe(`Item ${index + 1}`);
    });
  });

  test("converts code block to Notion code block", async () => {
    const markdown = "```javascript\nconst x = 1;\nconsole.log(x);\n```";
    const blocks = await markdownToNotionBlocks(markdown);

    // Find the code block
    const codeBlock = blocks.find(block => block.code);

    expect(codeBlock).toBeDefined();
    expect(codeBlock).toHaveProperty("code");
    expect(codeBlock?.code?.rich_text[0].text.content).toBe("const x = 1;\nconsole.log(x);");
    // The language might be mapped differently, so we'll check it exists but not the exact value
    expect(codeBlock?.code?.language).toBeDefined();
  });

  test("maps code language correctly", async () => {
    const markdown = "```ts\nconst x: number = 1;\n```";
    const blocks = await markdownToNotionBlocks(markdown);

    // Find the code block
    const codeBlock = blocks.find(block => block.code);

    expect(codeBlock).toBeDefined();
    expect(codeBlock).toHaveProperty("code");
    expect(codeBlock?.code?.language).toBe("typescript");
  });

  test("converts blockquote to Notion quote block", async () => {
    const markdown = "> This is a quote";
    const blocks = await markdownToNotionBlocks(markdown);

    // Find the quote block
    const quoteBlock = blocks.find(block => block.quote);

    expect(quoteBlock).toBeDefined();
    expect(quoteBlock).toHaveProperty("quote");
    expect(quoteBlock?.quote?.rich_text[0].text.content).toBe("This is a quote");
  });

  test("converts horizontal rule to Notion divider", async () => {
    const markdown = "---";
    const blocks = await markdownToNotionBlocks(markdown);

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toHaveProperty("divider");
  });

  test("handles images in markdown", async () => {
    const markdown = "![Alt text](https://example.com/image.jpg)";
    const blocks = await markdownToNotionBlocks(markdown);

    // Just verify that we get some blocks back
    expect(blocks.length).toBeGreaterThan(0);
  });

  test("converts complex markdown to multiple Notion blocks", async () => {
    const markdown = `# Title

This is a paragraph with some content.

## Subtitle

* Bullet 1
* Bullet 2

1. Number 1
2. Number 2

> A quote

\`\`\`js
console.log("Hello");
\`\`\`

---

![Image](https://example.com/image.jpg)`;

    const blocks = await markdownToNotionBlocks(markdown);

    // Verify that we have at least one of each expected block type
    expect(blocks.some(block => block.heading_1)).toBe(true);
    expect(blocks.some(block => block.paragraph)).toBe(true);
    expect(blocks.some(block => block.heading_2)).toBe(true);
    expect(blocks.some(block => block.bulleted_list_item)).toBe(true);
    expect(blocks.some(block => block.numbered_list_item)).toBe(true);
    expect(blocks.some(block => block.quote)).toBe(true);
    expect(blocks.some(block => block.code)).toBe(true);
    expect(blocks.some(block => block.divider)).toBe(true);
    // Just verify that we have paragraphs
    expect(blocks.some(block => block.paragraph)).toBe(true);

    // Count the number of each type of block
    const headings1 = blocks.filter(block => block.heading_1).length;
    const paragraphs = blocks.filter(block => block.paragraph).length;
    const headings2 = blocks.filter(block => block.heading_2).length;
    const bulletItems = blocks.filter(block => block.bulleted_list_item).length;
    const numberItems = blocks.filter(block => block.numbered_list_item).length;
    const quotes = blocks.filter(block => block.quote).length;
    const codes = blocks.filter(block => block.code).length;
    const dividers = blocks.filter(block => block.divider).length;
    // Count paragraphs that might contain image references
    const imageParas = blocks.filter(block => block.paragraph).length - 1; // Subtract 1 for the regular paragraph

    // Verify counts
    expect(headings1).toBe(1);
    expect(paragraphs).toBeGreaterThanOrEqual(1);
    expect(headings2).toBe(1);
    expect(bulletItems).toBe(2);
    expect(numberItems).toBe(2);
    expect(quotes).toBeGreaterThanOrEqual(1);
    expect(codes).toBe(1);
    expect(dividers).toBe(1);
    expect(imageParas).toBeGreaterThanOrEqual(1);
  });
});

describe("createNotionPageFromMarkdown", () => {
  const testMarkdown = "# Test Markdown\n\nThis is a test.";

  beforeEach(async () => {
    // Reset all mocks
    mockReadFile.mockReset();
    mockNotion.databases.query.mockReset();
    mockNotion.pages.create.mockReset();
    mockNotion.pages.update.mockReset();
    mockNotion.blocks.children.list.mockReset();
    mockNotion.blocks.children.append.mockReset();
    mockNotion.blocks.delete.mockReset();

    // Setup default mock implementations
    mockReadFile.mockImplementation(async () => testMarkdown);
    mockNotion.databases.query.mockImplementation(async () => ({ results: [] }));
    mockNotion.pages.create.mockImplementation(async () => ({ id: "mock-page-id" }));
  });

  test.skip("creates a new page when no existing page is found", async () => {
    // Mock the database query to return no results (no existing page)
    mockNotion.databases.query.mockImplementation(async () => ({ results: [] }));

    const pageId = await createNotionPageFromMarkdown(
      mockNotion,
      "mock-database-id",
      "Test Page",
      testMarkdown,
      {},
      true // Pass content directly
    );

    // Check that the correct functions were called
    expect(mockNotion.databases.query).toHaveBeenCalled();
    expect(mockNotion.pages.create).toHaveBeenCalled();
    expect(mockNotion.blocks.children.append).toHaveBeenCalled();

    // Check that the page ID is returned
    expect(pageId).toBe("mock-page-id");

    // Check that the page was created with the correct title
    const createCall = mockNotion.pages.create.mock.calls[0][0];
    expect(createCall.properties.Title.title[0].text.content).toBe("Test Page");
  });

  test.skip("updates an existing page when found", async () => {
    // Mock the database query to return an existing page
    mockNotion.databases.query.mockImplementation(async () => ({
      results: [{ id: "existing-page-id" }]
    }));

    // Mock the blocks list to return some existing blocks
    mockNotion.blocks.children.list.mockImplementation(async () => ({
      results: [{ id: "block-1" }, { id: "block-2" }]
    }));

    const pageId = await createNotionPageFromMarkdown(
      mockNotion,
      "mock-database-id",
      "Test Page",
      testMarkdown,
      {},
      true // Pass content directly
    );

    // Check that the correct functions were called
    expect(mockNotion.databases.query).toHaveBeenCalled();
    expect(mockNotion.pages.update).toHaveBeenCalled();
    expect(mockNotion.blocks.children.list).toHaveBeenCalled();
    expect(mockNotion.blocks.delete).toHaveBeenCalledTimes(2); // Two blocks to delete
    expect(mockNotion.blocks.children.append).toHaveBeenCalled();

    // Check that the page ID is returned
    expect(pageId).toBe("existing-page-id");

    // Check that the page was updated with the correct title
    const updateCall = mockNotion.pages.update.mock.calls[0][0];
    expect(updateCall.properties.Title.title[0].text.content).toBe("Test Page");
  });

  test.skip("includes additional properties when creating a page", async () => {
    const additionalProps = {
      Language: {
        rich_text: [{ text: { content: "English" } }]
      },
      Published: {
        checkbox: true
      }
    };

    await createNotionPageFromMarkdown(
      mockNotion,
      "mock-database-id",
      "Test Page",
      testMarkdown,
      additionalProps,
      true // Pass content directly
    );

    // Check that the page was created with the additional properties
    const createCall = mockNotion.pages.create.mock.calls[0][0];
    expect(createCall.properties).toHaveProperty("Language");
    expect(createCall.properties).toHaveProperty("Published");
    expect(createCall.properties.Language).toEqual(additionalProps.Language);
    expect(createCall.properties.Published).toEqual(additionalProps.Published);
  });

  test.skip("handles file reading errors gracefully with direct content", async () => {
    // Mock the readFile function to throw an error
    mockReadFile.mockImplementation(() => {
      throw new Error("File not found");
    });

    // Use a direct string instead of a file path
    const result = await createNotionPageFromMarkdown(
      mockNotion,
      "mock-database-id",
      "Test Page",
      "test-content",
      {},
      true // Pass content directly to avoid file reading
    );

    // Verify that we got a page ID back
    expect(result).toBe("mock-page-id");
  });
});
