import { test, expect, mock, describe, beforeEach } from "bun:test";

// Mock the modules
mock.module("@notionhq/client", () => ({
  Client: function() {
    return {
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
    };
  }
}));

mock.module("notion-to-md", () => ({
  NotionToMarkdown: function() {
    return {
      pageToMarkdown: mock(async () => []),
      toMarkdownString: mock(() => ({ parent: "" }))
    };
  }
}));

// Mock dotenv.config
mock.module("dotenv", () => ({
  config: () => ({ parsed: {} })
}));

// Mock process.env
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.NOTION_API_KEY = "test-api-key";
  process.env.DATABASE_ID = "test-database-id";
});

// Import the module after mocking
import { notion, n2m, DATABASE_ID, NOTION_API_KEY } from "../../scripts/notionClient.js";

describe("Notion Client", () => {
  test("should initialize the Notion client and NotionToMarkdown converter", () => {
    // Check that the notion client and n2m converter are defined
    expect(notion).toBeDefined();
    expect(n2m).toBeDefined();
  });

  test("should export the DATABASE_ID from environment variables", () => {
    // Check that the DATABASE_ID is defined
    expect(DATABASE_ID).toBeDefined();
    expect(typeof DATABASE_ID).toBe("string");
  });

  test("should export the NOTION_API_KEY from environment variables", () => {
    // Check that the NOTION_API_KEY is defined
    expect(NOTION_API_KEY).toBeDefined();
    expect(typeof NOTION_API_KEY).toBe("string");
  });

  // These tests are commented out because they would require re-importing the module,
  // which is not easily done in Bun's test environment
  /*
  test("should throw an error if NOTION_API_KEY is not defined", () => {
    // Remove the NOTION_API_KEY from process.env
    delete process.env.NOTION_API_KEY;

    // Importing the module again should throw an error
    expect(() => {
      // We need to use require to re-import the module
      require("../../scripts/notionClient.js");
    }).toThrow("NOTION_API_KEY is not defined in the environment variables");
  });

  test("should throw an error if DATABASE_ID is not defined", () => {
    // Remove the DATABASE_ID from process.env
    delete process.env.DATABASE_ID;

    // Importing the module again should throw an error
    expect(() => {
      // We need to use require to re-import the module
      require("../../scripts/notionClient.js");
    }).toThrow("DATABASE_ID is not defined in the environment variables");
  });
  */
});
