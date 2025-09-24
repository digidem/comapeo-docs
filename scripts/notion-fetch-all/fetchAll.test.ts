import { describe, it, expect } from "vitest";

describe("notion-fetch-all fetchAll", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./fetchAll");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./fetchAll");
    expect(typeof scriptModule).toBe("object");
  });
});
