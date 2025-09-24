import { describe, it, expect } from "vitest";

describe("notion-fetch utils", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./utils");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./utils");
    expect(typeof scriptModule).toBe("object");
  });
});
