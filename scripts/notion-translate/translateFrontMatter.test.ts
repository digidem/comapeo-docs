import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mockOpenAIChatCompletionCreate,
  resetOpenAIMock,
} from "./test-openai-mock";
import {
  DEFAULT_OPENAI_MAX_TOKENS,
  CUSTOM_API_MAX_OUTPUT_TOKENS,
} from "../constants";
import { installTestNotionEnv } from "../test-utils";
import {
  extractPromptMarkdown,
  installStructuredTranslationMock,
} from "./test-translation-utils";
import type { MockOpenAIRequest } from "./test-translation-utils";

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

  it("omits max_tokens for the standard OpenAI backend", async () => {
    vi.doMock("../constants.js", async () => {
      const actual =
        await vi.importActual<typeof import("../constants.js")>(
          "../constants.js"
        );
      return {
        ...actual,
        OPENAI_BASE_URL: undefined,
        IS_CUSTOM_OPENAI_API: false,
      };
    });

    try {
      vi.resetModules();
      const { translateText } = await import("./translateFrontMatter");

      await translateText("# Body", "Title", "pt-BR");

      expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
      const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0] as {
        max_tokens?: number;
        response_format?: { type?: string };
      };
      expect(request).not.toHaveProperty("max_tokens");
      expect(request.response_format?.type).toBe("json_schema");
    } finally {
      vi.doUnmock("../constants.js");
      vi.resetModules();
    }
  });

  it("includes max_tokens only for custom OpenAI-compatible backends", async () => {
    vi.doMock("../constants.js", async () => {
      const actual =
        await vi.importActual<typeof import("../constants.js")>(
          "../constants.js"
        );
      return {
        ...actual,
        OPENAI_BASE_URL: "https://custom.example/v1",
        IS_CUSTOM_OPENAI_API: true,
      };
    });

    try {
      vi.resetModules();
      const { translateText } = await import("./translateFrontMatter");

      await translateText("# Body", "Title", "pt-BR");

      expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
      const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0] as {
        max_tokens?: number;
        response_format?: { type?: string };
      };
      expect(request.max_tokens).toBe(DEFAULT_OPENAI_MAX_TOKENS);
      expect(request.response_format?.type).toBe("json_object");
    } finally {
      vi.doUnmock("../constants.js");
      vi.resetModules();
    }
  });

  it("scales max_tokens proportionally to input text length for custom API", async () => {
    vi.doMock("../constants.js", async () => {
      const actual =
        await vi.importActual<typeof import("../constants.js")>(
          "../constants.js"
        );
      return {
        ...actual,
        OPENAI_BASE_URL: "https://custom.example/v1",
        IS_CUSTOM_OPENAI_API: true,
      };
    });

    try {
      vi.resetModules();
      const { translateText } = await import("./translateFrontMatter");

      // Use structured mock that echoes content back to pass completeness checks
      installStructuredTranslationMock();

      // Use text small enough to fit in a single chunk for custom API
      // (CUSTOM_API_CHUNK_MAX_CHARS = 12_000, minus prompt overhead ~2_600 = ~9_400 budget)
      const textLength = 8_000;
      const longText = "A".repeat(textLength);
      await translateText(longText, "Title", "pt-BR");

      expect(mockOpenAIChatCompletionCreate).toHaveBeenCalled();
      const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0] as {
        max_tokens?: number;
      };
      expect(request.max_tokens).toBe(
        Math.min(
          CUSTOM_API_MAX_OUTPUT_TOKENS,
          Math.max(DEFAULT_OPENAI_MAX_TOKENS, Math.ceil(textLength / 2))
        )
      );
    } finally {
      vi.doUnmock("../constants.js");
      vi.resetModules();
    }
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

  it("chunks long-form content proactively below model-derived maximums", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const largeContent =
      "# Section One\n\n" +
      "word ".repeat(14_000) +
      "\n# Section Two\n\n" +
      "word ".repeat(14_000);

    const result = await translateText(largeContent, "Large Page", "pt-BR");

    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeGreaterThan(1);
    expect(result.markdown).toContain("# Section Two");
  });

  it("retries with smaller chunks when a valid response omits a section", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Section One\n\n" +
      "Alpha paragraph.\n\n" +
      "# Section Two\n\n" +
      "Beta paragraph.\n\n" +
      "# Section Three\n\n" +
      "Gamma paragraph.\n\n" +
      "# Section Four\n\n" +
      "Delta paragraph.";

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "# Seção Um\n\nParágrafo alfa.\n\n# Seção Quatro\n\nParágrafo delta.",
                title: "Título Traduzido",
              }),
            },
          },
        ],
      })
      .mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "# Seção Um\n\nParágrafo alfa.\n\n# Seção Dois\n\nParágrafo beta.\n\n# Seção Três\n\nParágrafo gama.\n\n# Seção Quatro\n\nParágrafo delta.",
                title: "Título Traduzido",
              }),
            },
          },
        ],
      });

    const result = await translateText(source, "Original Title", "pt-BR", {
      chunkLimit: 8_500,
    });

    const payloads = mockOpenAIChatCompletionCreate.mock.calls.map(
      (call) => extractPromptMarkdown(call[0] as MockOpenAIRequest).markdown
    );

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(payloads[2]).not.toBe(payloads[1]);
    expect(result.markdown).toContain("# Seção Dois");
    expect(result.title).toBe("Título Traduzido");
  });

  it("forces smaller payloads after a fast-path completeness failure", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source = [
      "# Section One",
      "",
      "Alpha paragraph with enough text to be meaningful.",
      "",
      "# Section Two",
      "",
      "Beta paragraph with enough text to be meaningful.",
      "",
      "# Section Three",
      "",
      "Gamma paragraph with enough text to be meaningful.",
      "",
      "# Section Four",
      "",
      "Delta paragraph with enough text to be meaningful.",
    ].join("\n");

    const payloads: string[] = [];
    let callCount = 0;

    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        payloads.push(payload.markdown);
        callCount++;

        if (callCount === 1) {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    markdown: "# Seção Um\n\nParágrafo alfa.",
                    title: "Título Traduzido",
                  }),
                },
              },
            ],
          };
        }

        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown,
                  title: "Título Traduzido",
                }),
              },
            },
          ],
        };
      }
    );

    const result = await translateText(source, "Original Title", "pt-BR");

    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(result.markdown).toContain("# Section Four");
    expect(result.title).toBe("Título Traduzido");
  });

  it("forces smaller payloads after a fast-path frontmatter integrity failure", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source = [
      "---",
      "title: Original Title",
      "sidebar_position: 3",
      "---",
      "",
      "# Main Content",
      "",
      "Body paragraph one.",
      "",
      "## Sub Section",
      "",
      "Body paragraph two.",
    ].join("\n");

    const payloads: string[] = [];
    let callCount = 0;

    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        payloads.push(payload.markdown);
        callCount++;

        if (callCount === 1) {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    markdown:
                      "# Conteúdo Principal\n\nParágrafo um.\n\n## Sub Seção\n\nParágrafo dois.",
                    title: "Título Traduzido",
                  }),
                },
              },
            ],
          };
        }

        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown,
                  title: "Título Traduzido",
                }),
              },
            },
          ],
        };
      }
    );

    const result = await translateText(source, "Original Title", "pt-BR");

    expect(payloads.length).toBe(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(result.markdown).toContain("sidebar_position: 3");
    expect(result.title).toBe("Título Traduzido");
  });

  it("forces chunking for fast-path retries on single-block content", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source = "word ".repeat(1_800).trim();
    const payloads: string[] = [];
    let callCount = 0;

    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        payloads.push(payload.markdown);
        callCount++;

        if (callCount === 1) {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    markdown: "word ".repeat(50).trim(),
                    title: "Título Traduzido",
                  }),
                },
              },
            ],
          };
        }

        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown,
                  title: "Título Traduzido",
                }),
              },
            },
          ],
        };
      }
    );

    const result = await translateText(source, "Original Title", "pt-BR");

    expect(payloads.length).toBe(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(result.markdown).toBe(source);
  });

  it("fails when repeated completeness retries still return incomplete content", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Section One\n\n" +
      "Alpha paragraph.\n\n" +
      "# Section Two\n\n" +
      "Beta paragraph.\n\n" +
      "# Section Three\n\n" +
      "Gamma paragraph.\n\n" +
      "# Section Four\n\n" +
      "Delta paragraph.";

    mockOpenAIChatCompletionCreate.mockImplementation(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "# Seção Um\n\nParágrafo alfa.\n\n# Seção Quatro\n\nParágrafo delta.",
              title: "Título Traduzido",
            }),
          },
        },
      ],
    }));

    const translationPromise = translateText(
      source,
      "Original Title",
      "pt-BR",
      {
        chunkLimit: 8_500,
      }
    );

    await expect(translationPromise).rejects.toMatchObject({
      code: "completeness_check_failed",
      isCritical: false,
      details: {
        completeness: {
          stage: "chunk",
          failedChecks: expect.arrayContaining(["heading loss: 3 → 2"]),
          metrics: expect.objectContaining({
            source: expect.objectContaining({ headingCount: 3 }),
            translated: expect.objectContaining({ headingCount: 2 }),
            lengthRatio: expect.any(Number),
          }),
        },
      },
    });

    await expect(translationPromise).rejects.toThrow(/metrics:/);
    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not count bullet lists inside YAML frontmatter towards structure validation", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "---\n" +
      "title: Page\n" +
      "keywords:\n" +
      "  - one\n" +
      "  - two\n" +
      "  - three\n" +
      "  - four\n" +
      "---\n\n" +
      "# Section One\n\n" +
      "Body paragraph.";

    // The translated version turns the keywords list into an inline array
    mockOpenAIChatCompletionCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "---\n" +
                "title: Page\n" +
                "keywords: [one, two, three, four]\n" +
                "---\n\n" +
                "# Seção Um\n\n" +
                "Parágrafo do corpo.",
              title: "Página",
            }),
          },
        },
      ],
    });

    const result = await translateText(source, "Original Title", "pt-BR");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    expect(result.markdown).toContain("Seção Um");
  });

  it("treats heavy structural shrinkage as incomplete long-form translation", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Long Section\n\n" +
      Array.from(
        { length: 160 },
        (_, index) => `Paragraph ${index} with repeated explanatory content.`
      ).join("\n\n");

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown: "# Seção Longa\n\nResumo curto.",
                title: "Título Traduzido",
              }),
            },
          },
        ],
      })
      .mockImplementation(async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown.replace(/Paragraph/g, "Parágrafo"),
                  title: "Título Traduzido",
                }),
              },
            },
          ],
        };
      });

    const result = await translateText(source, "Original Title", "pt-BR", {
      chunkLimit: 25_000,
    });

    const payloads = mockOpenAIChatCompletionCreate.mock.calls.map(
      (call) => extractPromptMarkdown(call[0] as MockOpenAIRequest).markdown
    );

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(payloads[2]).not.toBe(payloads[1]);
    expect(result.markdown.length).toBeGreaterThan(4_000);
  });

  it("does not count marker-like text inside fenced code blocks toward completeness checks", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Section One\n\n" +
      "```md\n" +
      "# not a real heading\n" +
      "- fake bullet\n" +
      "1. fake number\n" +
      ":::note\n" +
      "table | row\n" +
      "```\n\n" +
      "Plain paragraph.";

    mockOpenAIChatCompletionCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "# Seção Um\n\n```md\n" +
                "not a real heading\n" +
                "fake bullet\n" +
                "fake number\n" +
                ":::note\n" +
                "table | row\n" +
                "```\n\n" +
                "Parágrafo simples.",
              title: "Título Traduzido",
            }),
          },
        },
      ],
    });

    const result = await translateText(source, "Original Title", "pt-BR");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    expect(result.markdown).toContain("Parágrafo simples.");
    expect(result.markdown).toContain("not a real heading");
  });

  it("retries when an indented fenced block is dropped during translation", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Section One\n\n" +
      "- Item one\n\n" +
      "  ```js\n" +
      "  console.log('keep me');\n" +
      "  ```\n\n" +
      "Plain paragraph.";

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "# Seção Um\n\n" + "- Item um\n\n" + "Plain paragraph.",
                title: "Título Traduzido",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "# Seção Um\n\n" +
                  "- Item um\n\n" +
                  "  ```js\n" +
                  "  console.log('keep me');\n" +
                  "  ```\n\n" +
                  "Parágrafo simples.",
                title: "Título Traduzido",
              }),
            },
          },
        ],
      });

    const result = await translateText(source, "Original Title", "pt-BR");

    const payloads = mockOpenAIChatCompletionCreate.mock.calls.map(
      (call) => extractPromptMarkdown(call[0] as MockOpenAIRequest).markdown
    );

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(payloads[2]).not.toBe(payloads[1]);
    expect(result.markdown).toContain("console.log('keep me');");
    expect(result.markdown).toContain("Parágrafo simples.");
  });

  it("retries chunked translations when the reassembled markdown is structurally incomplete", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Section One\n\n" +
      "- Item one A\n" +
      "- Item one B\n\n" +
      "Alpha ".repeat(500) +
      "\n\n# Section Two\n\n" +
      "- Item two A\n" +
      "- Item two B\n\n" +
      "Beta ".repeat(500);

    let callCount = 0;
    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        callCount++;
        const payload = extractPromptMarkdown(request);
        const translated =
          callCount <= 2
            ? {
                title: "Título Traduzido",
                markdown: payload.markdown
                  .replace("# Section One", "# Seção Um")
                  .replace("# Section Two", "# Seção Dois")
                  .replace(/^- /gm, "")
                  .replace(/Alpha/g, "Alfa")
                  .replace(/Beta/g, "Beta")
                  .replace(/Gamma/g, "Gama"),
              }
            : {
                title: "Título Traduzido",
                markdown: payload.markdown
                  .replace("# Section One", "# Seção Um")
                  .replace("# Section Two", "# Seção Dois")
                  .replace(/Alpha/g, "Alfa")
                  .replace(/Beta/g, "Beta")
                  .replace(/Gamma/g, "Gama"),
              };

        return {
          choices: [
            {
              message: {
                content: JSON.stringify(translated),
              },
            },
          ],
        };
      }
    );

    const result = await translateText(source, "Original Title", "pt-BR", {
      chunkLimit: 8_500,
    });

    expect(callCount).toBeGreaterThan(2);
    expect(result.markdown).toContain("Item one A");
    expect(result.markdown).toContain("Item two B");
    expect(result.markdown).toContain("# Seção Dois");
  });

  it("preserves complete heading structures when chunking by sections", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock(({ title, markdown }) => ({
      title: title ? `Translated ${title}` : "",
      markdown: markdown
        .replace("# Section One", "# Seção Um")
        .replace("# Section Two", "# Seção Dois")
        .replace("# Section Three", "# Seção Três")
        .replace(/Alpha/g, "Alfa")
        .replace(/Gamma/g, "Gama"),
    }));

    const source =
      "# Section One\n\n" +
      "Alpha ".repeat(60) +
      "\n\n# Section Two\n\n" +
      "Beta ".repeat(60) +
      "\n\n# Section Three\n\n" +
      "Gamma ".repeat(60);

    // chunkLimit is the *total* request budget (prompt overhead + markdown).
    // Prompt overhead is ~3.05 K chars; a 3_600 limit leaves ~551 chars of
    // markdown per chunk, which fits one ~375-char section but not two — so
    // the three sections produce exactly three initial API calls.
    const result = await translateText(source, "Original Title", "pt-BR", {
      chunkLimit: 3_600,
    });

    // Behavioural assertions: all three translated headings must survive
    expect(result.markdown).toContain("# Seção Um");
    expect(result.markdown).toContain("# Seção Dois");
    expect(result.markdown).toContain("# Seção Três");

    // Structural assertion: the initial API payloads show section-level
    // chunking (each chunk contains exactly one heading).
    const payloads = mockOpenAIChatCompletionCreate.mock.calls.map(
      (call) => extractPromptMarkdown(call[0] as MockOpenAIRequest).markdown
    );
    const firstPassPayloads = payloads.slice(0, 3);
    expect(firstPassPayloads.length).toBeGreaterThanOrEqual(3);
    expect(firstPassPayloads[0]).toContain("# Section One");
    expect(firstPassPayloads[0]).not.toContain("# Section Two");
    expect(firstPassPayloads[1]).toContain("# Section Two");
    expect(firstPassPayloads[1]).not.toContain("# Section One");
    expect(firstPassPayloads[2]).toContain("# Section Three");
  });

  it("continues to classify token overflow errors as non-critical token_overflow code", async () => {
    const { translateText } = await import("./translateFrontMatter");

    mockOpenAIChatCompletionCreate.mockRejectedValue({
      status: 400,
      message:
        "Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 486881 tokens.",
    });

    await expect(translateText("# Body", "Title", "pt-BR")).rejects.toEqual(
      expect.objectContaining({
        code: "token_overflow",
        isCritical: false,
      })
    );
  });

  it("classifies DeepSeek maximum-context errors as token_overflow", async () => {
    const { translateText } = await import("./translateFrontMatter");

    mockOpenAIChatCompletionCreate.mockRejectedValue({
      status: 400,
      message:
        "This model's maximum context length is 131072 tokens. However, you requested 211994 tokens (211994 in the messages, 0 in the completion).",
    });

    await expect(translateText("# Body", "Title", "pt-BR")).rejects.toEqual(
      expect.objectContaining({
        code: "token_overflow",
        isCritical: false,
      })
    );
  });

  it("classifies finish_reason:length as non-critical token_overflow", async () => {
    const { translateText } = await import("./translateFrontMatter");

    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: "length",
          message: {
            content: '{"markdown":"partial content',
          },
        },
      ],
    });

    await expect(translateText("# Body", "Title", "pt-BR")).rejects.toEqual(
      expect.objectContaining({
        code: "token_overflow",
        isCritical: false,
      })
    );
  });

  it("retries with smaller chunks when finish_reason:length is returned", async () => {
    const { translateText } = await import("./translateFrontMatter");

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "length",
            message: {
              content: '{"markdown":"partial content',
            },
          },
        ],
      })
      .mockImplementation(async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        return {
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown,
                  title: "Translated Title",
                }),
              },
            },
          ],
        };
      });

    const result = await translateText(
      "# Small page\n\nJust a paragraph.",
      "Small",
      "pt-BR"
    );

    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeGreaterThan(1);
    expect(result.title).toBe("Translated Title");
    expect(result.markdown).toContain("Just a paragraph.");
  });

  it("takes the single-call fast path for small content", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const result = await translateText(
      "# Small page\n\nJust a paragraph.",
      "Small",
      "pt-BR"
    );

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    expect(result.title).toBe("Translated Small");
    expect(result.markdown).toBe("# Small page\n\nJust a paragraph.");
  });

  it("chunks large content and calls the API once per chunk", async () => {
    const { translateText, splitMarkdownIntoChunks } = await import(
      "./translateFrontMatter"
    );
    installStructuredTranslationMock();

    // Build content that is larger than the chunk threshold
    const bigSection1 = "# Section One\n\n" + "word ".repeat(100_000);
    const bigSection2 = "\n# Section Two\n\n" + "word ".repeat(100_000);
    const bigContent = bigSection1 + bigSection2;

    // Sanity: verify it would be split
    const chunks = splitMarkdownIntoChunks(bigContent, 500_000);
    expect(chunks.length).toBeGreaterThan(1);

    // translateText should call the API once per chunk
    const result = await translateText(bigContent, "Big Page", "pt-BR");

    expect(
      mockOpenAIChatCompletionCreate.mock.calls.length
    ).toBeGreaterThanOrEqual(2);
    expect(result.title).toBe("Translated Big Page");
    expect(result.markdown).toContain("# Section Two");
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it("retries the fast path with adaptive splitting on token overflow", async () => {
    const { translateText } = await import("./translateFrontMatter");

    mockOpenAIChatCompletionCreate
      .mockRejectedValueOnce({
        status: 400,
        message:
          "This model's maximum context length is 131072 tokens. However, you requested 211603 tokens (211603 in the messages, 0 in the completion).",
      })
      .mockImplementation(async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown,
                  title: "Translated Title",
                }),
              },
            },
          ],
        };
      });

    const result = await translateText(
      "# Small page\n\nJust a paragraph.",
      "Small",
      "pt-BR"
    );

    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeGreaterThan(1);
    expect(result.title).toBe("Translated Title");
    expect(result.markdown).toContain("Just a paragraph.");
  });

  it("masks and restores data URL images during translation", async () => {
    const { translateText } = await import("./translateFrontMatter");
    const dataUrl = `data:image/png;base64,${"A".repeat(6000)}`;
    const placeholderPath = "/images/__data_url_placeholder_0__.png";

    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown: `![image](${placeholderPath})\n\nTranslated`,
              title: "Translated Title",
            }),
          },
        },
      ],
    });

    const source = `![image](${dataUrl})\n\nBody text`;
    const result = await translateText(source, "Title", "pt-BR");

    const firstCallArgs = mockOpenAIChatCompletionCreate.mock.calls[0][0] as {
      messages?: Array<{ role: string; content: string }>;
    };
    const userPrompt = firstCallArgs.messages?.[1]?.content ?? "";

    expect(userPrompt).not.toContain(dataUrl);
    expect(userPrompt).toContain(placeholderPath);
    expect(result.markdown).toContain(dataUrl);
  });

  it("retries when placeholder integrity check fails", async () => {
    const { translateText } = await import("./translateFrontMatter");
    const dataUrl = `data:image/png;base64,${"B".repeat(6000)}`;
    const placeholderPath = "/images/__data_url_placeholder_0__.png";

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown: "![image](/images/changed-path.png)\n\nTranslated",
                title: "Translated Title",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown: `![image](${placeholderPath})\n\nTranslated`,
                title: "Translated Title",
              }),
            },
          },
        ],
      });

    const source = `![image](${dataUrl})\n\nBody text`;
    const result = await translateText(source, "Title", "pt-BR");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(2);
    expect(result.markdown).toContain(dataUrl);
  });

  it("retries when a canonical /images path is rewritten", async () => {
    const { translateText } = await import("./translateFrontMatter");
    const canonicalImagePath = "/images/example.png";

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown: "![image](/images/changed-path.png)\n\nTranslated",
                title: "Translated Title",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown: `![image](${canonicalImagePath})\n\nTranslated`,
                title: "Translated Title",
              }),
            },
          },
        ],
      });

    const source = `![image](${canonicalImagePath})\n\nBody text`;
    const result = await translateText(source, "Title", "pt-BR");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(2);
    expect(result.markdown).toContain(canonicalImagePath);
  });

  it("splitMarkdownIntoChunks does not split on headings inside fenced code blocks", async () => {
    const { splitMarkdownIntoChunks } = await import("./translateFrontMatter");

    const content =
      "# Real Heading\n\n```\n# not a heading\n```\n\n# Another Heading\n\ntext\n";

    // With a small limit, only the real headings should be split boundaries
    const chunks = splitMarkdownIntoChunks(content, 40);

    // The "# not a heading" line inside the fence should stay in one chunk
    const joined = chunks.join("");
    expect(joined).toBe(content); // round-trip must be lossless
    const fenceChunk = chunks.find((c) => c.includes("```"));
    expect(fenceChunk).toBeDefined();
    expect(fenceChunk).toContain("# not a heading");
  });

  it("splitMarkdownIntoChunks does not split on headings inside indented fenced code blocks", async () => {
    const { splitMarkdownIntoChunks } = await import("./translateFrontMatter");

    const content =
      "# Real Heading\n\n" +
      "- Item one\n\n" +
      "  ```\n" +
      "  # not a heading\n" +
      "  ```\n\n" +
      "# Another Heading\n\n" +
      "text\n";

    const chunks = splitMarkdownIntoChunks(content, 55);

    const joined = chunks.join("");
    expect(joined).toBe(content);
    const fenceChunk = chunks.find((c) => c.includes("  ```"));
    expect(fenceChunk).toBeDefined();
    expect(fenceChunk).toContain("# not a heading");
  });

  it("splitMarkdownIntoChunks reassembly is lossless", async () => {
    const { splitMarkdownIntoChunks } = await import("./translateFrontMatter");

    const original =
      "# Heading 1\n\nParagraph one.\n\n# Heading 2\n\nParagraph two.\n";
    const chunks = splitMarkdownIntoChunks(original, 30);
    const reassembled = chunks.join("");
    expect(reassembled).toBe(original);
  });

  it("splitMarkdownIntoChunks splits an oversized leading paragraph (no current accumulation bug)", async () => {
    const { splitMarkdownIntoChunks } = await import("./translateFrontMatter");

    // Leading paragraph exceeds the chunk limit with no preceding content
    const bigParagraph = "a".repeat(200);
    const chunks = splitMarkdownIntoChunks(bigParagraph, 50);

    // Every chunk must respect the limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    // Round-trip must be lossless
    expect(chunks.join("")).toBe(bigParagraph);
  });

  it("splitMarkdownIntoChunks splits an oversized leading line (splitByLines leading bug)", async () => {
    const { splitMarkdownIntoChunks } = await import("./translateFrontMatter");

    // A single very long line with no newlines (worst case for splitByLines)
    const longLine = "x".repeat(300);
    const chunks = splitMarkdownIntoChunks(longLine, 100);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
    expect(chunks.join("")).toBe(longLine);
  });

  // parseFrontmatterKeys unit tests

  it("parseFrontmatterKeys returns empty array when no frontmatter is present", async () => {
    const { parseFrontmatterKeys } = await import("./translateFrontMatter");
    expect(parseFrontmatterKeys("# Heading\n\nBody.")).toEqual([]);
  });

  it("parseFrontmatterKeys extracts top-level keys from frontmatter", async () => {
    const { parseFrontmatterKeys } = await import("./translateFrontMatter");
    const md =
      "---\n" +
      "title: My Page\n" +
      "slug: /my-page\n" +
      "sidebar_position: 2\n" +
      "---\n\n" +
      "# Body";
    expect(parseFrontmatterKeys(md)).toEqual([
      "title",
      "slug",
      "sidebar_position",
    ]);
  });

  it("parseFrontmatterKeys ignores indented lines (nested values)", async () => {
    const { parseFrontmatterKeys } = await import("./translateFrontMatter");
    const md =
      "---\n" +
      "title: My Page\n" +
      "keywords:\n" +
      "  - one\n" +
      "  - two\n" +
      "---\n\n" +
      "# Body";
    expect(parseFrontmatterKeys(md)).toEqual(["title", "keywords"]);
  });

  it("parseFrontmatterKeys returns empty array when frontmatter closing marker is missing", async () => {
    const { parseFrontmatterKeys } = await import("./translateFrontMatter");
    const md = "---\ntitle: My Page\n# Body";
    expect(parseFrontmatterKeys(md)).toEqual([]);
  });

  it("parseFrontmatterKeys ignores body-level horizontal-rule blocks without anchor keys", async () => {
    const { parseFrontmatterKeys } = await import("./translateFrontMatter");
    const md =
      "---\n\n" +
      "Video: @[document_4997224092760278339_trimmed.mp4](https://drive.google.com/file/d/14l9AjdANFSzhtCC94h0DHw2Xolt11_Yq/view?usp=drive_link)\n\n" +
      "---";

    expect(parseFrontmatterKeys(md)).toEqual([]);
  });

  it("parseFrontmatterKeys keeps real frontmatter and ignores later Video blocks", async () => {
    const { parseFrontmatterKeys } = await import("./translateFrontMatter");
    const md =
      "---\n" +
      "title: My Page\n" +
      "slug: /my-page\n" +
      "sidebar_position: 2\n" +
      "---\n\n" +
      "# Main Content\n\n" +
      "Body paragraph one.\n\n" +
      "---\n\n" +
      "Video: @[document_4997224092760278339_trimmed.mp4](https://drive.google.com/file/d/14l9AjdANFSzhtCC94h0DHw2Xolt11_Yq/view?usp=drive_link)\n\n" +
      "---\n\n" +
      "## Sub Section\n\n" +
      "Body paragraph two.";

    expect(parseFrontmatterKeys(md)).toEqual([
      "title",
      "slug",
      "sidebar_position",
    ]);
  });

  // Frontmatter integrity integration tests

  it("succeeds when a later chunk contains a body-level Video block", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "---\n" +
      "title: My Page\n" +
      "slug: /my-page\n" +
      "sidebar_position: 2\n" +
      "---\n\n" +
      "# Main Content\n\n" +
      `${"Body paragraph one. ".repeat(180)}\n\n` +
      "---\n\n" +
      "Video: @[document_4997224092760278339_trimmed.mp4](https://drive.google.com/file/d/14l9AjdANFSzhtCC94h0DHw2Xolt11_Yq/view?usp=drive_link)\n\n" +
      "---\n\n" +
      "## Sub Section\n\n" +
      `${"Body paragraph two. ".repeat(180)}`;

    const payloads: string[] = [];

    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const payload = extractPromptMarkdown(request);
        payloads.push(payload.markdown);

        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: payload.markdown,
                  title: "Minha Página",
                }),
              },
            },
          ],
        };
      }
    );

    // chunkLimit is the *total* request budget (prompt overhead + markdown).
    // Prompt overhead is ~3.05 K chars; a 6_000 limit leaves ~2.9 K chars of
    // markdown per chunk, which produces 7 chunks with the Video block in a
    // later chunk (not the first), and the round-trip preserves newlines so
    // frontmatter integrity is maintained.
    const result = await translateText(source, "My Page", "pt-BR", {
      chunkLimit: 6_000,
    });

    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeGreaterThan(1);
    expect(
      payloads.slice(1).some((payload) => payload.includes("Video: @["))
    ).toBe(true);
    expect(result.markdown).toContain("## Sub Section");
    expect(result.markdown).toContain("Video: @[");
    expect(result.markdown).toContain("slug: /my-page");
  });

  it("fails when a critical frontmatter field is dropped by translation", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "---\n" +
      "title: My Page\n" +
      "slug: /my-page\n" +
      "sidebar_position: 2\n" +
      "---\n\n" +
      "# Body\n\nSome content.";

    // Translation drops slug from the frontmatter
    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "---\n" +
                "title: Minha Página\n" +
                "sidebar_position: 2\n" +
                "---\n\n" +
                "# Corpo\n\nAlgum conteúdo.",
              title: "Minha Página",
            }),
          },
        },
      ],
    });

    await expect(
      translateText(source, "My Page", "pt-BR")
    ).rejects.toMatchObject({
      code: "schema_invalid",
      isCritical: false,
      message: expect.stringContaining("slug"),
    });
  });

  it("fails when a non-critical frontmatter key is dropped by translation", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "---\n" +
      "title: My Page\n" +
      "description: A description\n" +
      "---\n\n" +
      "# Body\n\nSome content.";

    // Translation drops description
    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "---\n" +
                "title: Minha Página\n" +
                "---\n\n" +
                "# Corpo\n\nAlgum conteúdo.",
              title: "Minha Página",
            }),
          },
        },
      ],
    });

    await expect(
      translateText(source, "My Page", "pt-BR")
    ).rejects.toMatchObject({
      code: "schema_invalid",
      isCritical: false,
      message: expect.stringContaining("description"),
    });
  });

  it("fails when translation adds an unexpected critical frontmatter field", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source = "---\ntitle: My Page\n---\n\n# Body\n\nSome content.";

    // Translation invents a slug field
    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "---\n" +
                "title: Minha Página\n" +
                "slug: /invented\n" +
                "---\n\n" +
                "# Corpo\n\nAlgum conteúdo.",
              title: "Minha Página",
            }),
          },
        },
      ],
    });

    await expect(
      translateText(source, "My Page", "pt-BR")
    ).rejects.toMatchObject({
      code: "schema_invalid",
      isCritical: false,
      message: expect.stringContaining("slug"),
    });
  });

  it("retries and succeeds when frontmatter integrity fails on first attempt but passes on retry", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "---\n" +
      "title: My Page\n" +
      "slug: /my-page\n" +
      "---\n\n" +
      "# Body\n\nSome content.";

    // First call drops slug (integrity failure); second call preserves it.
    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "---\n" +
                  "title: Minha Página\n" +
                  "---\n\n" +
                  "# Corpo\n\nAlgum conteúdo.",
                title: "Minha Página",
              }),
            },
          },
        ],
      })
      .mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "---\n" +
                  "title: Minha Página\n" +
                  "slug: /my-page\n" +
                  "---\n\n" +
                  "# Corpo\n\nAlgum conteúdo.",
                title: "Minha Página",
              }),
            },
          },
        ],
      });

    const result = await translateText(source, "My Page", "pt-BR");
    expect(result.markdown).toContain("slug: /my-page");
    expect(result.markdown).toContain("title: Minha Página");
  });

  it("passes when all frontmatter keys are preserved in translation", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "---\n" +
      "title: My Page\n" +
      "slug: /my-page\n" +
      "sidebar_position: 2\n" +
      "---\n\n" +
      "# Body\n\nSome content.";

    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "---\n" +
                "title: Minha Página\n" +
                "slug: /my-page\n" +
                "sidebar_position: 2\n" +
                "---\n\n" +
                "# Corpo\n\nAlgum conteúdo.",
              title: "Minha Página",
            }),
          },
        },
      ],
    });

    const result = await translateText(source, "My Page", "pt-BR");
    expect(result.markdown).toContain("slug: /my-page");
    expect(result.markdown).toContain("sidebar_position: 2");
  });

  it("passes when markdown has no frontmatter and translation has none either", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const result = await translateText(
      "# No Frontmatter\n\nJust body.",
      "Title",
      "pt-BR"
    );
    expect(result).toBeDefined();
  });

  it("throws token_overflow when max recursion depth is exhausted", async () => {
    const { translateText } = await import("./translateFrontMatter");

    // Always return finish_reason: "length" to trigger recursive splitting
    // until maxDepth (default 10) is exhausted.
    mockOpenAIChatCompletionCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: "length",
          message: {
            content: '{"markdown":"partial',
          },
        },
      ],
    });

    const longText = "A".repeat(10_000);
    await expect(translateText(longText, "Title", "pt-BR")).rejects.toEqual(
      expect.objectContaining({
        code: "token_overflow",
        isCritical: false,
      })
    );

    // Verify the recursion was bounded — with default maxDepth=10,
    // the first branch makes 11 calls (one per level) before throwing.
    // The total should be well under 100.
    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeLessThan(100);
  });
});
