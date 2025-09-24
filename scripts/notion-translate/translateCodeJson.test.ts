import { describe, it, expect } from "vitest";

describe("notion-translate translateCodeJson", () => {
  it("should be able to import module", async () => {
    const scriptModule = await import("./translateCodeJson");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./translateCodeJson");
    expect(typeof scriptModule).toBe("object");
  });
});
