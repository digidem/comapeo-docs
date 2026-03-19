import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mockOpenAIChatCompletionCreate,
  resetOpenAIMock,
} from "./test-openai-mock";
import { installTestNotionEnv } from "../test-utils";

type MockOpenAIRequest = {
  messages?: Array<{ role: string; content: string }>;
};

function extractPromptMarkdown(request: MockOpenAIRequest): {
  title: string;
  markdown: string;
} {
  const userPrompt =
    request.messages?.find((message) => message.role === "user")?.content ?? "";
  const titleMatch = userPrompt.match(/^title:\s*(.*)$/m);
  const markdownMarker = "\nmarkdown: ";
  const markdownIndex = userPrompt.indexOf(markdownMarker);

  return {
    title: titleMatch?.[1] ?? "",
    markdown:
      markdownIndex >= 0
        ? userPrompt.slice(markdownIndex + markdownMarker.length)
        : "",
  };
}

function installStructuredTranslationMock(
  mapResponse?: (payload: { title: string; markdown: string }) => {
    title: string;
    markdown: string;
  }
) {
  mockOpenAIChatCompletionCreate.mockImplementation(
    async (request: MockOpenAIRequest) => {
      const payload = extractPromptMarkdown(request);
      const translated = mapResponse
        ? mapResponse(payload)
        : {
            title: payload.title ? `Translated ${payload.title}` : "",
            markdown: payload.markdown,
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
}

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
      "Gamma paragraph.";

    mockOpenAIChatCompletionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                markdown:
                  "# Seção Um\n\nParágrafo alfa.\n\n# Seção Três\n\nParágrafo gama.",
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
                  "# Seção Um\n\nParágrafo alfa.\n\n# Seção Dois\n\nParágrafo beta.\n\n# Seção Três\n\nParágrafo gama.",
                title: "Título Traduzido",
              }),
            },
          },
        ],
      });

    const result = await translateText(source, "Original Title", "pt-BR", {
      chunkLimit: 8_500,
    });

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(2);
    expect(result.markdown).toContain("# Seção Dois");
    expect(result.title).toBe("Título Traduzido");
  });

  it("fails when repeated completeness retries still return incomplete content", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source =
      "# Section One\n\n" +
      "Alpha paragraph.\n\n" +
      "# Section Two\n\n" +
      "Beta paragraph.\n\n" +
      "# Section Three\n\n" +
      "Gamma paragraph.";

    mockOpenAIChatCompletionCreate.mockImplementation(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              markdown:
                "# Seção Um\n\nParágrafo alfa.\n\n# Seção Três\n\nParágrafo gama.",
              title: "Título Traduzido",
            }),
          },
        },
      ],
    }));

    await expect(
      translateText(source, "Original Title", "pt-BR", {
        chunkLimit: 8_500,
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "unexpected_error",
        isCritical: false,
      })
    );
    expect(mockOpenAIChatCompletionCreate.mock.calls.length).toBeGreaterThan(1);
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

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(2);
    expect(result.markdown.length).toBeGreaterThan(4_000);
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
    // Prompt overhead is ~2.6 K chars; a 3_200 limit leaves ~587 chars of
    // markdown per chunk, which fits one 375-char section but not two — so
    // the three sections produce exactly three API calls.
    const result = await translateText(source, "Original Title", "pt-BR", {
      chunkLimit: 3_200,
    });

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(3);
    expect(result.markdown).toContain("# Seção Um");
    expect(result.markdown).toContain("# Seção Dois");
    expect(result.markdown).toContain("# Seção Três");
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
});
