import { describe, it, expect } from "vitest";

describe("notion-placeholders index", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./index");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./index");
    expect(typeof scriptModule).toBe("object");
  });
});
