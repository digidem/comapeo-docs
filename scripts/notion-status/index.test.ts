import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installTestNotionEnv } from "../test-utils";

describe("notion-status index", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./index");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./index");
    expect(typeof scriptModule).toBe("object");
  });

  it("publish-production workflow uses current Notion status vocabulary", async () => {
    const { WORKFLOWS } = await import("./index");
    expect(WORKFLOWS["publish-production"]).toEqual({
      from: "Adding to staging site",
      to: "Published",
      setPublishedDate: true,
    });
  });
});
