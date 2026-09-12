import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULT_OPENAI_MAX_TOKENS } from "../../constants.js";

const mockOpenAIChatCompletionCreate = vi.fn();

class MockOpenAI {
  chat = {
    completions: {
      create: mockOpenAIChatCompletionCreate,
    },
  };

  constructor(public config: { apiKey?: string } = {}) {}
}

vi.mock("openai", () => ({
  default: MockOpenAI,
}));

const SAMPLE_JSON = JSON.stringify(
  {
    "item.label.Documentation": {
      message: "Documentation",
      description: "Navbar item",
    },
  },
  null,
  2
);

async function importTranslateJson(options: { openaiBaseUrl?: string } = {}) {
  vi.resetModules();
  vi.doMock("../../constants.js", async () => {
    const actual =
      await vi.importActual<typeof import("../../constants.js")>(
        "../../constants.js"
      );
    return {
      ...actual,
      OPENAI_BASE_URL: options.openaiBaseUrl,
      IS_CUSTOM_OPENAI_API: !!options.openaiBaseUrl,
    };
  });
  return import("../translateJson.js");
}

describe("translate-theme: translateJson", () => {
  beforeEach(() => {
    mockOpenAIChatCompletionCreate.mockReset();
  });

  afterEach(() => {
    vi.doUnmock("../../constants.js");
    vi.resetModules();
  });

  it("uses json_object response format without max_tokens on standard OpenAI", async () => {
    const { translateJson } = await importTranslateJson();

    mockOpenAIChatCompletionCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: SAMPLE_JSON,
          },
        },
      ],
    });

    const result = await translateJson(SAMPLE_JSON, "Portuguese");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0];
    expect(request?.response_format?.type).toBe("json_object");
    expect(request).not.toHaveProperty("max_tokens");
    expect(result).toContain('"message": "Documentation"');
  });

  it("adds max_tokens for custom OpenAI backend", async () => {
    const { translateJson } = await importTranslateJson({
      openaiBaseUrl: "https://custom.example/v1",
    });

    mockOpenAIChatCompletionCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: SAMPLE_JSON,
          },
        },
      ],
    });

    await translateJson(SAMPLE_JSON, "Portuguese");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0];
    expect(request?.response_format?.type).toBe("json_object");
    expect(request?.max_tokens).toBe(DEFAULT_OPENAI_MAX_TOKENS);
  });

  it("throws after retries if OpenAI returns empty response", async () => {
    const { translateJson } = await importTranslateJson();

    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });

    await expect(translateJson(SAMPLE_JSON, "Spanish")).rejects.toThrow(
      /Invalid JSON after 3 attempts/
    );
  });
});
