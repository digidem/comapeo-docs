import { test, expect, mock, describe, beforeEach } from "bun:test";
import { MAIN_LANGUAGE, NOTION_PROPERTIES } from "../../scripts/constants.js";

// Mock the notion client
const mockDatabasesQuery = mock(async () => ({
  results: [
    {
      id: "page1",
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: "Test Page" }]
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: MAIN_LANGUAGE }
        },
        [NOTION_PROPERTIES.PUBLISHED]: {
          checkbox: true
        },
        [NOTION_PROPERTIES.ORDER]: {
          number: 1
        }
      }
    }
  ]
}));

const mockBlocksChildrenList = mock(async ({ block_id }) => {
  if (block_id === "page1") {
    return {
      results: [
        { id: "block1", type: "paragraph", has_children: false },
        { id: "block2", type: "heading_1", has_children: false },
        { id: "block3", type: "bulleted_list_item", has_children: true }
      ]
    };
  } else if (block_id === "block3") {
    return {
      results: [
        { id: "block3-1", type: "paragraph", has_children: false }
      ]
    };
  }
  return { results: [] };
});

// Mock the notionClient module
mock.module("../../scripts/notionClient.js", () => ({
  notion: {
    databases: {
      query: mockDatabasesQuery
    },
    blocks: {
      children: {
        list: mockBlocksChildrenList
      }
    }
  },
  DATABASE_ID: "test-database-id"
}));

// Import the module after mocking
import { fetchNotionData, fetchNotionPage, fetchNotionBlocks } from "../../scripts/fetchNotionData.js";
import { DATABASE_ID } from "../../scripts/notionClient.js";

describe("Fetch Notion Data", () => {
  beforeEach(() => {
    // Reset all mocks
    mockDatabasesQuery.mockClear();
    mockBlocksChildrenList.mockClear();
  });

  test("should fetch published English pages from Notion", async () => {
    const pages = await fetchNotionData();

    // Check that the database query was called with the correct parameters
    expect(mockDatabasesQuery).toHaveBeenCalledWith({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: NOTION_PROPERTIES.LANGUAGE,
            select: {
              equals: MAIN_LANGUAGE
            }
          },
          {
            property: NOTION_PROPERTIES.PUBLISHED,
            checkbox: {
              equals: true
            }
          }
        ]
      }
    });

    // Check that the pages were returned
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBe(1);
    expect(pages[0].id).toBe("page1");
    expect(pages[0].properties[NOTION_PROPERTIES.TITLE].title[0].plain_text).toBe("Test Page");
  });

  test("should fetch a specific Notion page by ID", async () => {
    const page = await fetchNotionPage("page1");

    // Check that the blocks list was called with the correct parameters
    expect(mockBlocksChildrenList).toHaveBeenCalledWith({
      block_id: "page1"
    });

    // Check that the page content was returned
    expect(page).toHaveProperty("results");
    expect(Array.isArray(page.results)).toBe(true);
    expect(page.results.length).toBe(3);
  });

  test("should recursively fetch Notion blocks", async () => {
    const blocks = await fetchNotionBlocks("page1");

    // Check that the blocks list was called with the correct parameters
    expect(mockBlocksChildrenList).toHaveBeenCalledWith({
      block_id: "page1",
      page_size: 100
    });

    // Check that the blocks were returned
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBe(3);

    // Check that nested blocks were fetched recursively
    expect(mockBlocksChildrenList).toHaveBeenCalledWith({
      block_id: "block3",
      page_size: 100
    });

    // Check that the nested blocks were added to the parent block
    const blockWithChildren = blocks.find(block => block.id === "block3");
    expect(blockWithChildren).toHaveProperty("children");
    expect(Array.isArray(blockWithChildren.children)).toBe(true);
    expect(blockWithChildren.children.length).toBe(1);
    expect(blockWithChildren.children[0].id).toBe("block3-1");
  });

  test("should handle errors when fetching data", async () => {
    // Mock the database query to throw an error
    mockDatabasesQuery.mockImplementationOnce(() => {
      throw new Error("Database query error");
    });

    // The function should throw an error
    await expect(fetchNotionData()).rejects.toThrow("Database query error");
  });

  test("should handle errors when fetching a page", async () => {
    // Mock the blocks list to throw an error
    mockBlocksChildrenList.mockImplementationOnce(() => {
      throw new Error("Blocks list error");
    });

    // The function should throw an error
    await expect(fetchNotionPage("page1")).rejects.toThrow("Blocks list error");
  });

  test("should handle errors when fetching blocks", async () => {
    // Mock the blocks list to throw an error
    mockBlocksChildrenList.mockImplementationOnce(() => {
      throw new Error("Blocks list error");
    });

    // The function should throw an error
    await expect(fetchNotionBlocks("page1")).rejects.toThrow("Blocks list error");
  });
});
