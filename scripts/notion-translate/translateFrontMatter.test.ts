import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mockOpenAIChatCompletionCreate,
  resetOpenAIMock,
} from "./test-openai-mock";
import { installTestNotionEnv } from "../test-utils";

describe("notion-translate translateFrontMatter", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    resetOpenAIMock();
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await import("./translateFrontMatter");
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await import("./translateFrontMatter");
    expect(typeof scriptModule).toBe("object");
  });

  it("delegates to OpenAI chat.completions.create and returns the parsed payload", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const result = await translateText("# Body", "Title", "pt-BR");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      markdown: "# translated\n\nMock content",
      title: "Mock Title",
    });
  });

  it("classifies OpenAI quota errors as critical translation errors", async () => {
    const { translateText } = await import("./translateFrontMatter");

    mockOpenAIChatCompletionCreate.mockRejectedValueOnce({
      status: 429,
      message: "You exceeded your current quota",
    });

    await expect(translateText("# Body", "Title", "pt-BR")).rejects.toEqual(
      expect.objectContaining({
        code: "quota_exceeded",
        isCritical: true,
      })
    );
  });
});
