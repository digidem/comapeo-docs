import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./test-openai-mock";
import { installTestNotionEnv } from "../test-utils";

describe("notion-translate translateCodeJson", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./translateCodeJson");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./translateCodeJson");
    expect(typeof scriptModule).toBe("object");
  });
});
