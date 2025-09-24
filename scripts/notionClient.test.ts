import { describe, it, expect } from "vitest";

describe("notionClient", () => {
  it("should be able to import without errors", async () => {
    // Set up minimal environment to allow import
    process.env.NOTION_API_KEY = "test-key";
    process.env.DATABASE_ID = "test-db";

    // Attempt to import the module
    const notionClientModule = await import("./notionClient");

    // Basic smoke test - check if essential exports exist
    expect(notionClientModule.notion).toBeDefined();
    expect(notionClientModule.enhancedNotion).toBeDefined();
    expect(notionClientModule.DATABASE_ID).toBeDefined();
  });

  it("should export enhancedNotion with required methods", async () => {
    process.env.NOTION_API_KEY = "test-key";
    process.env.DATABASE_ID = "test-db";

    const { enhancedNotion } = await import("./notionClient");

    expect(typeof enhancedNotion.databasesQuery).toBe("function");
    expect(typeof enhancedNotion.pagesRetrieve).toBe("function");
    expect(typeof enhancedNotion.blocksChildrenList).toBe("function");
  });

  it("should export DATABASE_ID from environment", async () => {
    process.env.NOTION_API_KEY = "test-key";
    process.env.DATABASE_ID = "test-db";

    const { DATABASE_ID } = await import("./notionClient");

    // Just check that DATABASE_ID is a non-empty string
    expect(typeof DATABASE_ID).toBe("string");
    expect(DATABASE_ID.length).toBeGreaterThan(0);
  });
});
