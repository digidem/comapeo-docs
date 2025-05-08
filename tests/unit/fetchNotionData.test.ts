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
import { fetchNotionData, fetchNotionDataByLanguage } from "../../scripts/fetchNotionData.js";
import { DATABASE_ID } from "../../scripts/notionClient.js";

describe.skip("Fetch Notion Data", () => {
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

  test("should fetch published pages for a specific language", async () => {
    // Mock the database query to return Portuguese pages
    mockDatabasesQuery.mockImplementationOnce(async () => ({
      results: [
        {
          id: "page2",
          properties: {
            [NOTION_PROPERTIES.TITLE]: {
              title: [{ plain_text: "Página de Teste" }]
            },
            [NOTION_PROPERTIES.LANGUAGE]: {
              select: { name: "Portuguese" }
            },
            [NOTION_PROPERTIES.PUBLISHED]: {
              checkbox: true
            }
          }
        }
      ]
    }));

    const pages = await fetchNotionDataByLanguage("Portuguese");

    // Check that the database query was called with the correct parameters
    expect(mockDatabasesQuery).toHaveBeenCalledWith({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: NOTION_PROPERTIES.LANGUAGE,
            select: {
              equals: "Portuguese"
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
    expect(pages[0].id).toBe("page2");
    expect(pages[0].properties[NOTION_PROPERTIES.TITLE].title[0].plain_text).toBe("Página de Teste");
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
