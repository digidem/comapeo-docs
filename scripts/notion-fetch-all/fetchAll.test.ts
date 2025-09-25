import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installTestNotionEnv } from "../test-utils";

vi.mock("sharp", () => {
  const createPipeline = () => {
    const pipeline: any = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      png: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from("")),
    };
    return pipeline;
  };

  const sharpMock = vi.fn(() => createPipeline());

  return {
    default: sharpMock,
  };
});

describe("notion-fetch-all fetchAll", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./fetchAll");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./fetchAll");
    expect(typeof scriptModule).toBe("object");
  });
});
