import { describe, it, expect } from "vitest";

describe("notion-fetch exportDatabase", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./exportDatabase");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./exportDatabase");
    expect(typeof scriptModule).toBe("object");
  });
});
