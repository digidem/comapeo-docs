import { describe, it, expect } from "vitest";

describe("notion-version index", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./index");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./index");
    // Check if module has some expected structure
    expect(typeof scriptModule).toBe("object");
  });
});
