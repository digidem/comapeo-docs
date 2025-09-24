import { describe, it, expect } from "vitest";

describe("notion-fetch integration", () => {
  it("should have main function defined", async () => {
    // Set up minimal environment
    process.env.NOTION_API_KEY = "test-key";
    process.env.DATABASE_ID = "test-db";

    const indexModule = await import("./index");
    expect(typeof indexModule.main).toBe("function");
  });

  it("should export main function", async () => {
    process.env.NOTION_API_KEY = "test-key";
    process.env.DATABASE_ID = "test-db";

    const indexModule = await import("./index");
    expect(indexModule.main).toBeDefined();
  });
});
