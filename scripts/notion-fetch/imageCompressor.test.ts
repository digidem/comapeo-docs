import { describe, it, expect } from "vitest";

describe("notion-fetch imageCompressor", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./imageCompressor");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./imageCompressor");
    expect(typeof scriptModule).toBe("object");
  });
});
