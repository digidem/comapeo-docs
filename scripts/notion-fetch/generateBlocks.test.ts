import { describe, it, expect } from "vitest";

describe("generateBlocks", () => {
  it("should be able to import module", async () => {
    const generateBlocksModule = await import("./generateBlocks");
    expect(generateBlocksModule).toBeDefined();
  });

  it("should export generateBlocks function", async () => {
    const { generateBlocks } = await import("./generateBlocks");
    expect(typeof generateBlocks).toBe("function");
  });
});
