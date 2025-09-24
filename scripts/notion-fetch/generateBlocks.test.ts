import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installTestNotionEnv } from "../test-utils";

describe("generateBlocks", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const generateBlocksModule = await import("./generateBlocks");
    expect(generateBlocksModule).toBeDefined();
  });

  it("should export generateBlocks function", async () => {
    const { generateBlocks } = await import("./generateBlocks");
    expect(typeof generateBlocks).toBe("function");
  });
});
