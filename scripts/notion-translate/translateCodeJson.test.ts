import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mockOpenAIChatCompletionCreate,
  resetOpenAIMock,
} from "./test-openai-mock";
import { DEFAULT_OPENAI_MAX_TOKENS } from "../constants.js";
import { installTestNotionEnv } from "../test-utils";

type MockOpenAIRequest = {
  response_format?: { type?: string };
  max_tokens?: number;
};

const SAMPLE_CODE_JSON = JSON.stringify(
  {
    Welcome: {
      message: "Welcome to our application",
      description: "Greeting message on homepage",
    },
  },
  null,
  2
);

async function importTranslateCodeJson(
  options: { openaiBaseUrl?: string } = {}
) {
  vi.resetModules();
  vi.doMock("../constants.js", async () => {
    const actual =
      await vi.importActual<typeof import("../constants.js")>(
        "../constants.js"
      );
    return {
      ...actual,
      OPENAI_BASE_URL: options.openaiBaseUrl,
      IS_CUSTOM_OPENAI_API: !!options.openaiBaseUrl,
    };
  });
  return import("./translateCodeJson");
}

describe("notion-translate translateCodeJson", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    resetOpenAIMock();
    restoreEnv = installTestNotionEnv();
  });

  afterEach(() => {
    vi.doUnmock("../constants.js");
    vi.resetModules();
    restoreEnv();
  });

  it("should be able to import module", async () => {
    const scriptModule = await importTranslateCodeJson();
    expect(scriptModule).toBeDefined();
  });

  it("should export expected functions", async () => {
    const scriptModule = await importTranslateCodeJson();
    expect(typeof scriptModule.translateJson).toBe("function");
    expect(typeof scriptModule.extractTranslatableText).toBe("function");
    expect(typeof scriptModule.getLanguageName).toBe("function");
  });

  it("uses json_object response format without max_tokens on standard OpenAI", async () => {
    const { translateJson } = await importTranslateCodeJson();

    mockOpenAIChatCompletionCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: SAMPLE_CODE_JSON,
          },
        },
      ],
    });

    const result = await translateJson(SAMPLE_CODE_JSON, "Portuguese");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0] as
      | MockOpenAIRequest
      | undefined;
    expect(request?.response_format?.type).toBe("json_object");
    expect(request).not.toHaveProperty("max_tokens");
    expect(result).toContain('"message": "Welcome to our application"');
  });

  it("adds max_tokens only for custom OpenAI-compatible backends", async () => {
    const { translateJson } = await importTranslateCodeJson({
      openaiBaseUrl: "https://custom.example/v1",
    });

    mockOpenAIChatCompletionCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: SAMPLE_CODE_JSON,
          },
        },
      ],
    });

    await translateJson(SAMPLE_CODE_JSON, "Portuguese");

    expect(mockOpenAIChatCompletionCreate).toHaveBeenCalledTimes(1);
    const request = mockOpenAIChatCompletionCreate.mock.calls[0]?.[0] as
      | MockOpenAIRequest
      | undefined;
    expect(request?.response_format?.type).toBe("json_object");
    expect(request?.max_tokens).toBe(DEFAULT_OPENAI_MAX_TOKENS);
  });

  describe("extractTranslatableText", () => {
    it("extracts navbar item labels and logo.alt", async () => {
      const { extractTranslatableText } = await importTranslateCodeJson();

      const result = extractTranslatableText(
        {
          logo: { alt: "CoMapeo" },
          items: [
            { label: "Documentation", type: "docSidebar" },
            { label: "GitHub", href: "https://github.com/example" },
          ],
        },
        "navbar"
      );

      expect(result).toEqual({
        "item.label.Documentation": {
          message: "Documentation",
          description: "Navbar item with label Documentation",
        },
        "item.label.GitHub": {
          message: "GitHub",
          description: "Navbar item with label GitHub",
        },
        "logo.alt": {
          message: "CoMapeo",
          description: "The alt text of navbar logo",
        },
      });
    });

    it("omits logo.alt when navbar config has no logo", async () => {
      const { extractTranslatableText } = await importTranslateCodeJson();

      const result = extractTranslatableText(
        { items: [{ label: "Documentation" }] },
        "navbar"
      );

      expect(result).not.toHaveProperty("logo.alt");
      expect(result["item.label.Documentation"]).toBeDefined();
    });

    it("extracts footer section titles and item labels in both the legacy and Docusaurus runtime key formats", async () => {
      const { extractTranslatableText } = await importTranslateCodeJson();

      const result = extractTranslatableText(
        {
          links: [
            {
              title: "CoMapeo",
              items: [{ label: "Website", href: "https://comapeo.app" }],
            },
          ],
          copyright: "Made with love",
        },
        "footer"
      );

      expect(result["links.title.CoMapeo"]).toEqual({
        message: "CoMapeo",
        description: "Footer section title: CoMapeo",
      });
      expect(result["link.title.CoMapeo"]).toEqual({
        message: "CoMapeo",
        description:
          "The title of the footer links column with title=CoMapeo in the footer",
      });
      expect(result["links.CoMapeo.Website"]).toEqual({
        message: "Website",
        description: "Footer link label: Website",
      });
      expect(result["link.item.label.Website"]).toEqual({
        message: "Website",
        description:
          "The label of footer link with label=Website linking to https://comapeo.app",
      });
      expect(result.copyright).toEqual({
        message: "Made with love",
        description: "Footer copyright text",
      });
    });
  });
});
