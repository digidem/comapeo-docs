import { describe, it, expect, beforeEach, vi } from "vitest";

const blocksChildrenList = vi.fn();

vi.mock("./notionClient", () => ({
  enhancedNotion: {
    blocksChildrenList,
  },
  DATABASE_ID: "test-db",
  DATA_SOURCE_ID: "test-data-source",
}));

const createBlock = (overrides: Record<string, unknown> = {}) => ({
  id: `block-${Math.random().toString(16).slice(2)}`,
  has_children: false,
  type: "paragraph",
  ...overrides,
});

describe("fetchNotionBlocks", () => {
  beforeEach(() => {
    blocksChildrenList.mockReset();
  });

  it("fetches all paginated results until has_more is false", async () => {
    const blockA = createBlock({ id: "block-a" });
    const blockB = createBlock({ id: "block-b" });

    blocksChildrenList
      .mockResolvedValueOnce({
        results: [blockA],
        has_more: true,
        next_cursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        results: [blockB],
        has_more: false,
        next_cursor: null,
      });

    const { fetchNotionBlocks } = await import("./fetchNotionData");
    const blocks = await fetchNotionBlocks("parent-block");

    expect(blocksChildrenList).toHaveBeenCalledTimes(2);
    expect(blocksChildrenList).toHaveBeenNthCalledWith(1, {
      block_id: "parent-block",
      page_size: 100,
    });
    expect(blocksChildrenList).toHaveBeenNthCalledWith(2, {
      block_id: "parent-block",
      page_size: 100,
      start_cursor: "cursor-1",
    });
    expect(blocks.map((b) => b.id)).toEqual(["block-a", "block-b"]);
  });

  it("recursively fetches child blocks when has_children is true", async () => {
    const child = createBlock({ id: "child-1" });
    const parent = createBlock({
      id: "parent-child",
      has_children: true,
    });

    blocksChildrenList
      .mockResolvedValueOnce({
        results: [parent],
        has_more: false,
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        results: [child],
        has_more: false,
        next_cursor: null,
      });

    const { fetchNotionBlocks } = await import("./fetchNotionData");
    const [result] = await fetchNotionBlocks("parent-block");

    expect(result.children).toEqual([child]);
    expect(blocksChildrenList).toHaveBeenNthCalledWith(2, {
      block_id: "parent-child",
      page_size: 100,
    });
  });
});
