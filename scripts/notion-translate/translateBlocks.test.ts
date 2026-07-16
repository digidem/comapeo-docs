import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@notionhq/client";

const mockBlocksChildrenList = vi.fn();
const mockTranslateText = vi.fn();

vi.mock("../notionClient.js", () => ({
  enhancedNotion: {
    blocksChildrenList: mockBlocksChildrenList,
  },
}));

vi.mock("./translateFrontMatter.js", () => ({
  translateText: mockTranslateText,
}));

function blocksResponse(results: object[]) {
  return { results, has_more: false, next_cursor: null };
}

function createMockNotionClient() {
  return {
    pages: {
      create: vi.fn(),
      update: vi.fn(),
    },
    blocks: {
      children: {
        list: vi.fn(),
        append: vi.fn(),
      },
      delete: vi.fn(),
    },
  } as unknown as Client;
}

describe("translateNotionBlocksDirectly", () => {
  beforeEach(() => {
    mockBlocksChildrenList.mockReset();
    mockTranslateText.mockReset();

    mockTranslateText.mockImplementation(async (content: string) => ({
      markdown: `translated:${content}`,
      title: "",
    }));
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

  it("converts image blocks to placeholder paragraphs instead of static image callouts", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b3",
          type: "image",
          image: {
            type: "external",
            external: { url: "https://s3.example.com/img.png" },
            caption: [
              {
                type: "text",
                text: { content: "Diagram caption" },
                plain_text: "Diagram caption",
              },
            ],
          },
          has_children: false,
        },
      ])
    );
    mockTranslateText.mockResolvedValueOnce({
      markdown: "Legenda do diagrama",
      title: "",
    });

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    const block = result[0] as Record<string, unknown>;
    expect(block.type).toBe("paragraph");
    const paragraph = block.paragraph as {
      rich_text: Array<{ text: { content: string } }>;
    };
    expect(paragraph.rich_text[0].text.content).toBe(
      "[Image: Legenda do diagrama]"
    );
    expect(mockTranslateText).toHaveBeenCalledWith(
      "Diagram caption",
      "",
      "pt-BR"
    );
  });

  it("falls back to the source URL when an image block has no caption", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b4",
          type: "image",
          image: {
            type: "external",
            external: { url: "https://s3.example.com/img.png" },
            caption: [],
          },
          has_children: false,
        },
      ])
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    const block = result[0] as Record<string, unknown>;
    const paragraph = block.paragraph as {
      rich_text: Array<{ text: { content: string } }>;
    };
    expect(paragraph.rich_text[0].text.content).toBe(
      "[Image: https://s3.example.com/img.png]"
    );
    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it("keeps short rich-text paragraph translation intact", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b5",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "Short paragraph content" },
                plain_text: "Short paragraph content",
              },
            ],
          },
          has_children: false,
        },
      ])
    );
    mockTranslateText.mockResolvedValueOnce({
      markdown: "Parágrafo curto traduzido",
      title: "",
    });

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    const block = result[0] as Record<string, unknown>;
    expect(block.type).toBe("paragraph");
    const paragraph = block.paragraph as {
      rich_text: Array<{ text: { content: string }; plain_text: string }>;
    };
    expect(paragraph.rich_text[0].text.content).toBe(
      "Parágrafo curto traduzido"
    );
    expect(paragraph.rich_text[0].plain_text).toBe("Parágrafo curto traduzido");
    expect(mockTranslateText).toHaveBeenCalledWith(
      "Short paragraph content",
      "",
      "pt-BR"
    );
  });

  it("strips null icon/color from block type objects (Notion returns null but rejects on append)", async () => {
    mockBlocksChildrenList.mockResolvedValue(
      blocksResponse([
        {
          id: "b-callout-null-icon",
          type: "callout",
          callout: {
            rich_text: [
              {
                type: "text",
                text: { content: "Callout text" },
                plain_text: "Callout text",
              },
            ],
            icon: null,
            color: null,
          },
          has_children: false,
        },
        {
          id: "b-callout-valid-icon",
          type: "callout",
          callout: {
            rich_text: [
              {
                type: "text",
                text: { content: "Keeps icon" },
                plain_text: "Keeps icon",
              },
            ],
            icon: { type: "emoji", emoji: "💡" },
            color: "blue_background",
          },
          has_children: false,
        },
        {
          id: "b-paragraph-null-color",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "Text" },
                plain_text: "Text",
              },
            ],
            color: null,
          },
          has_children: false,
        },
      ])
    );

    const { translateNotionBlocksDirectly } = await import("./translateBlocks");
    const result = await translateNotionBlocksDirectly("page-id", "pt-BR");

    // Null icon/color stripped from callout
    const calloutNull = result[0] as Record<string, unknown>;
    const calloutNullObj = calloutNull.callout as Record<string, unknown>;
    expect(calloutNullObj.icon).toBeUndefined();
    expect(calloutNullObj.color).toBeUndefined();

    // Non-null icon/color preserved on callout
    const calloutValid = result[1] as Record<string, unknown>;
    const calloutValidObj = calloutValid.callout as Record<string, unknown>;
    expect(calloutValidObj.icon).toEqual({ type: "emoji", emoji: "💡" });
    expect(calloutValidObj.color).toBe("blue_background");

    // Null color stripped from paragraph
    const paragraph = result[2] as Record<string, unknown>;
    const paragraphObj = paragraph.paragraph as Record<string, unknown>;
    expect(paragraphObj.color).toBeUndefined();
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

  it("reuses the same created page on retry when append fails once", async () => {
    const notion = createMockNotionClient();
    const mockPageId = "page-created-once";

    vi.mocked(notion.pages.create).mockResolvedValue({
      id: mockPageId,
    } as never);
    vi.mocked(notion.pages.update).mockResolvedValue({} as never);
    vi.mocked(notion.blocks.children.list).mockResolvedValueOnce(
      blocksResponse([
        {
          id: "stale-block-id",
        },
      ]) as never
    );
    vi.mocked(notion.blocks.children.append)
      .mockRejectedValueOnce(new Error("append failed once"))
      .mockResolvedValueOnce({} as never);
    vi.mocked(notion.blocks.delete).mockResolvedValue({} as never);

    const { createNotionPageWithBlocks } = await import("./translateBlocks");
    const pageId = await createNotionPageWithBlocks(
      notion,
      "parent-page-id",
      "database-id",
      "Translated page",
      [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "Block content" },
              },
            ],
          },
        },
      ],
      {},
      "pt-BR",
      undefined,
      true
    );

    expect(pageId).toBe(mockPageId);
    expect(notion.pages.create).toHaveBeenCalledTimes(1);
    expect(notion.pages.update).toHaveBeenCalledTimes(1);
    expect(notion.pages.update).toHaveBeenCalledWith({
      page_id: mockPageId,
      properties: expect.objectContaining({
        "Content elements": {
          title: [{ text: { content: "Translated page" } }],
        },
      }),
    });
    expect(notion.blocks.children.list).toHaveBeenCalledTimes(1);
    expect(notion.blocks.delete).toHaveBeenCalledTimes(1);
    expect(notion.blocks.delete).toHaveBeenCalledWith({
      block_id: "stale-block-id",
    });
    expect(notion.blocks.children.append).toHaveBeenCalledTimes(2);
    expect(notion.blocks.children.append).toHaveBeenNthCalledWith(1, {
      block_id: mockPageId,
      children: expect.any(Array),
    });
    expect(notion.blocks.children.append).toHaveBeenNthCalledWith(2, {
      block_id: mockPageId,
      children: expect.any(Array),
    });
  });

  it("still creates a new page when forceCreate is true even if existingPageId is provided", async () => {
    const notion = createMockNotionClient();

    vi.mocked(notion.pages.create).mockResolvedValue({
      id: "new-force-created-page",
    } as never);
    vi.mocked(notion.blocks.children.append).mockResolvedValue({} as never);

    const { createNotionPageWithBlocks } = await import("./translateBlocks");
    const pageId = await createNotionPageWithBlocks(
      notion,
      "parent-page-id",
      "database-id",
      "Translated page",
      [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "Block content" },
              },
            ],
          },
        },
      ],
      {},
      "pt-BR",
      "existing-page-id",
      true
    );

    expect(pageId).toBe("new-force-created-page");
    expect(notion.pages.create).toHaveBeenCalledTimes(1);
    expect(notion.pages.update).not.toHaveBeenCalled();
    expect(notion.blocks.children.list).not.toHaveBeenCalled();
    expect(notion.blocks.children.append).toHaveBeenCalledWith({
      block_id: "new-force-created-page",
      children: expect.any(Array),
    });
  });
});
