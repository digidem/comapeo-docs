import { describe, it, expect } from "vitest";

describe("markdownToNotion", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./markdownToNotion");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./markdownToNotion");
    expect(typeof scriptModule).toBe("object");
  });
});
