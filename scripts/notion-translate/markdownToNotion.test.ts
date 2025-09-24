import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installTestNotionEnv } from "../test-utils";

describe("markdownToNotion", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./markdownToNotion");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./markdownToNotion");
    expect(typeof scriptModule).toBe("object");
  });
});
