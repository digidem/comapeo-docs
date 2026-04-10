import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
