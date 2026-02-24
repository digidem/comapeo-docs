import { describe, it, expect, beforeEach, vi } from "vitest";

const mockBlocksChildrenList = vi.fn();
const mockTranslateText = vi.fn();
const mockExistsSync = vi.fn();
const mockExtractImageMatches = vi.fn();

vi.mock("../notionClient.js", () => ({
  enhancedNotion: {
    blocksChildrenList: mockBlocksChildrenList,
  },
}));

vi.mock("./translateFrontMatter.js", () => ({
  translateText: mockTranslateText,
}));

vi.mock("node:fs", () => ({
  default: { existsSync: mockExistsSync },
}));

vi.mock("../notion-fetch/imageReplacer.js", () => ({
  extractImageMatches: mockExtractImageMatches,
}));

function blocksResponse(results: object[]) {
  return { results, has_more: false, next_cursor: null };
}

describe("translateNotionBlocksDirectly", () => {
  beforeEach(() => {
    mockBlocksChildrenList.mockReset();
    mockTranslateText.mockReset();
    mockExistsSync.mockReset();
    mockExtractImageMatches.mockReset();

    mockTranslateText.mockResolvedValue({ markdown: "translated", title: "" });
    mockExtractImageMatches.mockReturnValue([]);
    mockExistsSync.mockReturnValue(false);
  });

  it("replaces invalid bookmark URL with INVALID_URL_PLACEHOLDER", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b1",
          type: "bookmark",
          bookmark: { url: "not-a-valid-url", caption: [] },
          has_children: false,
        },
      ])
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    const block = result[0] as Record<string, unknown>;
    const bookmark = block.bookmark as { url: string };
    // Should use the default INVALID_URL_PLACEHOLDER value
    expect(bookmark.url).toBe("https://example.com/invalid-url-removed");
  });

  it("preserves a valid URL in a bookmark block unchanged", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b2",
          type: "bookmark",
          bookmark: { url: "https://example.com/valid", caption: [] },
          has_children: false,
        },
      ])
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    const block = result[0] as Record<string, unknown>;
    expect((block.bookmark as { url: string }).url).toBe(
      "https://example.com/valid"
    );
  });

  it("falls back to index-based filename when orderedImagePaths is empty", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b3",
          type: "image",
          image: {
            type: "external",
            external: { url: "https://s3.example.com/img.png" },
          },
          has_children: false,
        },
      ])
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly(
      "page-id",
      "pt-BR",
      "mypage"
    );

    const block = result[0] as Record<string, unknown>;
    expect(block.type).toBe("callout");
    const callout = block.callout as {
      rich_text: Array<{ text: { content: string } }>;
    };
    // Fallback path should include the sanitized page name and index
    expect(callout.rich_text[0].text.content).toContain("mypage");
    expect(callout.rich_text[0].text.content).toContain("_0");
    expect(callout.rich_text[0].text.content).toMatch(/static\/images\//);
  });

  it("uses matched path from orderedImagePaths when file exists on disk", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b4",
          type: "image",
          image: {
            type: "external",
            external: { url: "https://s3.example.com/img.png" },
          },
          has_children: false,
        },
      ])
    );
    // Simulate the file existing at the resolved path
    mockExistsSync.mockImplementation((p: string) =>
      p.endsWith("specific.png")
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly(
      "page-id",
      "pt-BR",
      "mypage",
      ["/images/specific.png"]
    );

    const block = result[0] as Record<string, unknown>;
    const callout = block.callout as {
      rich_text: Array<{ text: { content: string } }>;
    };
    expect(callout.rich_text[0].text.content).toBe(
      "static/images/specific.png"
    );
  });

  it("consumes orderedImagePaths for inline images to prevent block-image index drift", async () => {
    // Page has: paragraph with inline image, then a standalone image block.
    // orderedImagePaths has two entries: first for the inline, second for the block.
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b5",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "![alt](/images/inline.png) text" },
              },
            ],
          },
          has_children: false,
        },
        {
          id: "b6",
          type: "image",
          image: {
            type: "external",
            external: { url: "https://s3.example.com/img.png" },
          },
          has_children: false,
        },
      ])
    );

    // The inline image match in the paragraph rich_text should consume the first path
    mockExtractImageMatches.mockReturnValue(["![alt](/images/inline.png)"]);
    // The second path corresponds to the block image
    mockExistsSync.mockImplementation((p: string) => p.endsWith("block.png"));
    mockTranslateText.mockResolvedValue({
      markdown: "![alt](/images/inline.png) text",
      title: "",
    });

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly(
      "page-id",
      "pt-BR",
      "mypage",
      ["/images/inline.png", "/images/block.png"]
    );

    // The image block (result[1]) should use the second path, not the first
    const imgBlock = result[1] as Record<string, unknown>;
    expect(imgBlock.type).toBe("callout");
    const callout = imgBlock.callout as {
      rich_text: Array<{ text: { content: string } }>;
    };
    expect(callout.rich_text[0].text.content).toBe("static/images/block.png");
  });

  it("strips Notion-internal metadata fields from output blocks", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "block-id-to-strip",
          type: "paragraph",
          paragraph: { rich_text: [] },
          has_children: false,
          created_time: "2024-01-01",
          last_edited_time: "2024-01-02",
          created_by: { id: "user-1" },
          parent: { type: "page_id", page_id: "parent" },
          archived: false,
        },
      ])
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    const block = result[0] as Record<string, unknown>;
    expect(block.id).toBeUndefined();
    expect(block.created_time).toBeUndefined();
    expect(block.last_edited_time).toBeUndefined();
    expect(block.parent).toBeUndefined();
    expect(block.archived).toBeUndefined();
    expect(block.type).toBe("paragraph");
  });
});
