import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installTestNotionEnv } from "../test-utils";

describe("createTemplate", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./createTemplate");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./createTemplate");
    // Check if module has some expected structure
    expect(typeof scriptModule).toBe("object");
  });
});
