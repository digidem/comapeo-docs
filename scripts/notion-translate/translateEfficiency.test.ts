import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mockOpenAIChatCompletionCreate,
  resetOpenAIMock,
} from "./test-openai-mock";
import { installTestNotionEnv } from "../test-utils";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  extractPromptMarkdown,
  installStructuredTranslationMock,
} from "./test-translation-utils";
import type { MockOpenAIRequest } from "./test-translation-utils";

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dirname, "__fixtures__");

function loadFixture(name: string): string {
  const fixturePath = join(FIXTURES_DIR, `${name}.md`);
  if (existsSync(fixturePath)) {
    return readFileSync(fixturePath, "utf-8");
  }

  if (["small", "medium", "large"].includes(name)) {
    throw new Error(`Missing required fixture file: ${fixturePath}`);
  }

  if (name === "with-frontmatter") {
    return [
      "---",
      "title: Test Page",
      "sidebar_position: 1",
      "description: A test page for translations",
      "---",
      "",
      "# Content After Frontmatter",
      "",
      "Some body text here.",
      "",
      "## Second Section",
      "",
      "More body text.",
    ].join("\n");
  }

  if (name === "with-code-blocks") {
    return [
      "# Code Examples",
      "",
      "Here is some JavaScript:",
      "",
      "```js",
      'console.log("hello");',
      "```",
      "",
      "And some shell:",
      "",
      "```bash",
      "echo hello",
      "```",
      "",
      "And an indented block:",
      "",
      "```",
      "plain code block",
      "```",
    ].join("\n");
  }

  if (name === "with-images") {
    return [
      "# Page With Images",
      "",
      "![Screenshot](/images/screenshot.png)",
      "",
      "Some text between images.",
      "",
      "![Diagram](/images/diagram.svg)",
      "",
      "Final paragraph.",
    ].join("\n");
  }

  throw new Error(`Unknown fixture: ${name}`);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("translation efficiency", () => {
  let restoreEnv: () => void;

  const getDistinctPayloadBound = (sourceMarkdown: string): number => {
    const headingCount =
      (sourceMarkdown.match(/^#{1,6}\s/gm) ?? []).length || 1;
    const frontmatterAllowance = sourceMarkdown.startsWith("---\n") ? 2 : 1;
    return Math.max(2, headingCount + frontmatterAllowance);
  };

  beforeEach(() => {
    resetOpenAIMock();
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("small content translates in exactly 1 API call", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const small = loadFixture("small");
    await translateText(small, "Small Page", "pt-BR");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
  });

  it("oversized synthetic content does not send identical consecutive payloads", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const payloads: string[] = [];
    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const { markdown, title } = extractPromptMarkdown(request);
        payloads.push(markdown);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: title ? `Translated ${title}` : "",
                  markdown,
                }),
              },
            },
          ],
        };
      }
    );

    const oversized = Array.from(
      { length: 20 },
      (_, i) => `# Section ${i + 1}\n\n${"word ".repeat(1500)}\n`
    ).join("\n");
    await translateText(oversized, "Oversized Page", "pt-BR");

    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads.length).toBeLessThanOrEqual(
      getDistinctPayloadBound(oversized)
    );

    let previousPayload = payloads[0];
    for (const payload of payloads.slice(1)) {
      expect(payload).not.toBe(previousPayload);
      previousPayload = payload;
    }
  });

  it("real fixtures can be forced through chunking with a lower chunk limit", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const payloads: string[] = [];
    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const { markdown, title } = extractPromptMarkdown(request);
        payloads.push(markdown);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: title ? `Translated ${title}` : "",
                  markdown,
                }),
              },
            },
          ],
        };
      }
    );

    const medium = loadFixture("medium");
    const result = await translateText(medium, "Medium Page", "pt-BR", {
      chunkLimit: 5_000,
    });

    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads.length).toBeLessThanOrEqual(
      getDistinctPayloadBound(medium)
    );
    expect(result.markdown).toContain("## Key features of CoMapeo");
    expect(result.markdown).toContain("sidebar_position: 3");
  });

  // ---------------------------------------------------------------------------
  // Permanent regression coverage for the fast-path completeness retry bug.
  // ---------------------------------------------------------------------------
  it("completeness retry after fast-path failure uses different payload", async () => {
    const { translateText } = await import("./translateFrontMatter");

    // Content with multiple sections — small enough for the fast path
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
        const { markdown, title } = extractPromptMarkdown(request);
        payloads.push(markdown);
        callCount++;

        if (callCount === 1) {
          // First call: return only the first heading (triggers incomplete check)
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Seção Um",
                    markdown: "# Seção Um\n\nParágrafo alfa.",
                  }),
                },
              },
            ],
          };
        }

        // Subsequent calls: echo back valid translation
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: title ? `Translated ${title}` : "",
                  markdown,
                }),
              },
            },
          ],
        };
      }
    );

    const result = await translateText(source, "Test Page", "pt-BR");

    expect(payloads.length).toBe(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(result.markdown).toContain("# Section Four");
  });

  // ---------------------------------------------------------------------------
  // Same regression coverage, but triggered via frontmatter integrity failure.
  // ---------------------------------------------------------------------------
  it("frontmatter integrity retry forces chunking", async () => {
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
        const { markdown, title } = extractPromptMarkdown(request);
        payloads.push(markdown);
        callCount++;

        if (callCount === 1) {
          // First call: return translation missing frontmatter entirely
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Título Traduzido",
                    markdown:
                      "# Conteúdo Principal\n\nParágrafo um.\n\n## Sub Seção\n\nParágrafo dois.",
                  }),
                },
              },
            ],
          };
        }

        // Subsequent calls: echo valid translation preserving frontmatter
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: title ? `Translated ${title}` : "",
                  markdown,
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
    expect(result.markdown).toContain("title: Original Title");
    expect(result.markdown).toContain("sidebar_position: 3");
  });

  it("single-block completeness retry still forces a smaller payload", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source = "word ".repeat(1_800).trim();
    const payloads: string[] = [];
    let callCount = 0;

    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const { markdown, title } = extractPromptMarkdown(request);
        payloads.push(markdown);
        callCount++;

        if (callCount === 1) {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Título Traduzido",
                    markdown: "word ".repeat(50).trim(),
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
                  title: title ? `Translated ${title}` : "",
                  markdown,
                }),
              },
            },
          ],
        };
      }
    );

    const result = await translateText(source, "Single Block", "pt-BR");

    expect(payloads.length).toBe(3);
    expect(payloads[1]).not.toBe(payloads[0]);
    expect(payloads[1].length).toBeLessThan(payloads[0].length);
    expect(result.markdown).toBe(source);
  });

  it("reassembly completeness failures expose actionable diagnostics", async () => {
    const { translateText } = await import("./translateFrontMatter");

    const source = [
      "# Section One",
      "",
      "- Item one A",
      "- Item one B",
      "",
      `${"Alpha ".repeat(500).trim()}`,
      "",
      "# Section Two",
      "",
      "- Item two A",
      "- Item two B",
      "",
      `${"Beta ".repeat(500).trim()}`,
    ].join("\n");

    mockOpenAIChatCompletionCreate.mockImplementation(
      async (request: MockOpenAIRequest) => {
        const { markdown, title } = extractPromptMarkdown(request);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: title ? `Translated ${title}` : "",
                  markdown: markdown
                    .replace("# Section One", "# Seção Um")
                    .replace("# Section Two", "# Seção Dois")
                    .replace(/^- /gm, "")
                    .replace(/Alpha/g, "Alfa")
                    .replace(/Beta/g, "Beta"),
                }),
              },
            },
          ],
        };
      }
    );

    await expect(
      translateText(source, "Diagnostic Page", "pt-BR", {
        chunkLimit: 8_500,
      })
    ).rejects.toMatchObject({
      code: "completeness_check_failed",
      isCritical: false,
      details: {
        completeness: {
          stage: "reassembly",
          failedChecks: expect.arrayContaining(["bullet list loss: 4 → 0"]),
          metrics: expect.objectContaining({
            source: expect.objectContaining({ bulletListCount: 4 }),
            translated: expect.objectContaining({ bulletListCount: 0 }),
            lengthRatio: expect.any(Number),
          }),
        },
      },
      message: expect.stringContaining("metrics:"),
    });
  });
});

describe("translation correctness", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    resetOpenAIMock();
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("frontmatter integrity is preserved on the dedicated frontmatter fixture", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const content = loadFixture("with-frontmatter");

    const result = await translateText(content, "Test Page", "pt-BR");

    // The echo mock returns the markdown as-is, so keys must survive
    expect(result.markdown).toContain("title:");
    expect(result.markdown).toContain("sidebar_position:");
    expect(result.markdown).toContain("description:");
    expect(result.markdown).toMatch(/^---/);
  });

  it("top-level fenced code blocks survive translation", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const content = loadFixture("with-code-blocks");

    const inputFenceCount = (content.match(/^```/gm) || []).length;

    const result = await translateText(content, "Code Examples", "pt-BR");

    const outputFenceCount = (result.markdown.match(/^```/gm) || []).length;
    expect(outputFenceCount).toBe(inputFenceCount);
  });

  it("canonical image paths survive translation", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const content = loadFixture("with-images");

    const result = await translateText(content, "Page With Images", "pt-BR");

    expect(result.markdown).toContain("/images/screenshot.png");
    expect(result.markdown).toContain("/images/diagram.svg");
  });

  it("completeness check passes on valid translations", async () => {
    const { translateText } = await import("./translateFrontMatter");
    installStructuredTranslationMock();

    const fixtures = [
      "small",
      "medium",
      "large",
      "with-frontmatter",
      "with-code-blocks",
      "with-images",
    ];

    for (const name of fixtures) {
      const content = loadFixture(name);
      // Should not throw — the echo mock preserves structure
      await expect(
        translateText(content, `Fixture ${name}`, "pt-BR")
      ).resolves.toBeDefined();
    }
  });
});
