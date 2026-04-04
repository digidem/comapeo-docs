import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNotionPage, installTestNotionEnv } from "../test-utils";
import {
  encodeLocaleImagePlaceholderPath,
  encodeRemoteImagePlaceholderPath,
} from "../shared/localeImagePlaceholders.js";

const mockFetchNotionData = vi.fn();
const mockSortAndExpandNotionData = vi.fn();
const mockTranslateText = vi.fn();
const mockTranslateJson = vi.fn();
const mockExtractTranslatableText = vi.fn();
const mockGetLanguageName = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockAccess = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockPagesRetrieve = vi.fn();
const mockNotionDataSourcesQuery = vi.fn();
const mockNotionPagesCreate = vi.fn();
const mockNotionPagesUpdate = vi.fn();
const mockNotionBlocksChildrenList = vi.fn();
const mockNotionBlocksChildrenAppend = vi.fn();
const mockNotionBlocksDelete = vi.fn();
const mockResolveCanonicalDocsRelativePath = vi.fn();
const mockTranslateNotionBlocksDirectly = vi.fn();
const mockCreateNotionPageWithBlocks = vi.fn();

const mockN2m = {
  pageToMarkdown: vi.fn(),
  toMarkdownString: vi.fn(),
};

vi.mock("fs/promises", () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
    readdir: mockReaddir,
    stat: mockStat,
  },
}));

vi.mock("../notionClient", () => ({
  notion: {
    dataSources: {
      query: mockNotionDataSourcesQuery,
    },
    pages: {
      create: mockNotionPagesCreate,
      update: mockNotionPagesUpdate,
    },
    blocks: {
      children: {
        list: mockNotionBlocksChildrenList,
        append: mockNotionBlocksChildrenAppend,
      },
      delete: mockNotionBlocksDelete,
    },
  },
  DATABASE_ID: "test-database-id",
  DATA_SOURCE_ID: "test-data-source-id",
  n2m: mockN2m,
  enhancedNotion: {
    dataSourcesQuery: mockNotionDataSourcesQuery,
    pagesRetrieve: mockPagesRetrieve,
  },
}));

vi.mock("../fetchNotionData.js", () => ({
  fetchNotionData: mockFetchNotionData,
  sortAndExpandNotionData: mockSortAndExpandNotionData,
}));

vi.mock("../notion-fetch/pageMetadataCache.js", () => ({
  resolveCanonicalDocsRelativePath: mockResolveCanonicalDocsRelativePath,
}));

vi.mock("./translateFrontMatter", () => ({
  translateText: mockTranslateText,
  TranslationError: class TranslationError extends Error {
    isCritical = true;
  },
}));

vi.mock("./translateCodeJson", () => ({
  translateJson: mockTranslateJson,
  extractTranslatableText: mockExtractTranslatableText,
  getLanguageName: mockGetLanguageName,
}));

vi.mock("./translateBlocks.js", () => ({
  translateNotionBlocksDirectly: mockTranslateNotionBlocksDirectly,
  createNotionPageWithBlocks: mockCreateNotionPageWithBlocks,
}));

describe("translation image placeholder flow", () => {
  let restoreEnv: () => void;

  const runTranslation = async (
    englishPage: ReturnType<typeof createMockNotionPage>
  ) => {
    mockFetchNotionData.mockImplementation(async (filter) => {
      if (
        filter?.and?.some(
          (condition: { property?: string }) =>
            condition.property === "Publish Status"
        )
      ) {
        return [englishPage];
      }
      return [];
    });

    const { main } = await import("./index");
    return main();
  };

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.DATA_SOURCE_ID = "test-data-source-id";

    mockFetchNotionData.mockReset();
    mockSortAndExpandNotionData.mockReset();
    mockTranslateText.mockReset();
    mockTranslateJson.mockReset();
    mockExtractTranslatableText.mockReset();
    mockGetLanguageName.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockAccess.mockReset();
    mockReaddir.mockReset();
    mockStat.mockReset();
    mockPagesRetrieve.mockReset();
    mockNotionDataSourcesQuery.mockReset();
    mockNotionPagesCreate.mockReset();
    mockNotionPagesUpdate.mockReset();
    mockNotionBlocksChildrenList.mockReset();
    mockNotionBlocksChildrenAppend.mockReset();
    mockNotionBlocksDelete.mockReset();
    mockResolveCanonicalDocsRelativePath.mockReset();
    mockTranslateNotionBlocksDirectly.mockReset();
    mockCreateNotionPageWithBlocks.mockReset();
    mockN2m.pageToMarkdown.mockReset();
    mockN2m.toMarkdownString.mockReset();

    mockSortAndExpandNotionData.mockImplementation(async (pages) => pages);
    mockResolveCanonicalDocsRelativePath.mockReturnValue(null);
    mockN2m.pageToMarkdown.mockResolvedValue([]);
    mockN2m.toMarkdownString.mockReturnValue({
      parent: "English markdown content",
    });
    mockTranslateText.mockResolvedValue({
      markdown: "# Ola\n\nConteudo traduzido",
      title: "Ola",
    });
    mockTranslateJson.mockResolvedValue("{}");
    mockExtractTranslatableText.mockReturnValue({
      "homepage.cta": { message: "Get started" },
    });
    mockGetLanguageName.mockImplementation((lang: string) =>
      lang === "pt" ? "Portuguese" : "Spanish"
    );
    mockTranslateNotionBlocksDirectly.mockResolvedValue([
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Translated block" } }],
        },
      },
    ]);
    mockCreateNotionPageWithBlocks.mockResolvedValue(undefined);
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (String(filePath).endsWith("code.json")) {
        return '{"hello":{"message":"Hello"}}';
      }
      return [
        "---",
        'title: "Installing CoMapeo"',
        "---",
        "",
        "![Screenshot](/images/screenshot.png)",
        "",
        "English markdown content",
      ].join("\n");
    });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockAccess.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    mockReaddir.mockResolvedValue(["es", "pt"]);
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockNotionDataSourcesQuery.mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    });
    mockNotionPagesCreate.mockResolvedValue({ id: "new-page-id" });
    mockNotionPagesUpdate.mockResolvedValue({});
    mockNotionBlocksChildrenList.mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    });
    mockNotionBlocksChildrenAppend.mockResolvedValue({});
    mockNotionBlocksDelete.mockResolvedValue({});
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("placeholderizes canonical markdown images before translation", async () => {
    const englishPage = createMockNotionPage({
      id: "canonical-page",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockResolveCanonicalDocsRelativePath.mockReturnValue(
      "getting-started-essentials/installing-comapeo.md"
    );

    await runTranslation(englishPage);
    const placeholderPath = encodeLocaleImagePlaceholderPath(
      "/images/screenshot.png"
    );

    expect(mockN2m.pageToMarkdown).not.toHaveBeenCalled();
    expect(mockTranslateText).toHaveBeenCalledWith(
      expect.stringContaining(placeholderPath),
      "Hello World",
      "pt-BR"
    );
    expect(
      mockTranslateText.mock.calls.some((call) =>
        String(call[0]).includes("/images/screenshot.png")
      )
    ).toBe(false);
  });

  it("replaces markdown image syntax with text placeholders in Notion-converted fallback mode", async () => {
    const englishPage = createMockNotionPage({
      id: "converted-page",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/remote-image.png";
    mockN2m.toMarkdownString.mockReturnValue({
      parent: `![Remote image](${remoteImageUrl})\n\nBody copy`,
    });
    mockTranslateText.mockImplementation(
      async (text: string, title: string) => ({
        markdown: text,
        title,
      })
    );

    await runTranslation(englishPage);

    expect(mockN2m.pageToMarkdown).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledWith(
      expect.stringContaining("[Image: Remote image]"),
      "Hello World",
      "pt-BR"
    );
    expect(
      mockWriteFile.mock.calls.some(
        ([, content]) =>
          String(content).includes("[Image: Remote image]") &&
          !String(content).includes(remoteImageUrl) &&
          !String(content).includes("/images/__remote_ref__/")
      )
    ).toBe(true);
  });

  it("fails when translated markdown unexpectedly still contains Notion image URLs", async () => {
    const englishPage = createMockNotionPage({
      id: "failure-page",
      title: "Failure Case",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const translatedWithS3 =
      "![img](https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";
    mockTranslateText.mockResolvedValue({
      markdown: translatedWithS3,
      title: "Failure Case",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    expect(
      errorSpy.mock.calls.some((args) =>
        args.join(" ").includes("still contains 1 Notion/S3 URLs")
      )
    ).toBe(true);
  });

  it("fails when translated markdown hides a Notion S3 URL behind a remote placeholder", async () => {
    const englishPage = createMockNotionPage({
      id: "placeholder-bypass-page",
      title: "Placeholder Bypass",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png";
    const remotePlaceholder = encodeRemoteImagePlaceholderPath(remoteImageUrl);
    mockTranslateText.mockResolvedValue({
      markdown: `![img](${remotePlaceholder})`,
      title: "Placeholder Bypass",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    expect(
      errorSpy.mock.calls.some((args) =>
        args.join(" ").includes("still contains 1 Notion/S3 URLs")
      )
    ).toBe(true);
  });

  it("skips markdown and image preparation for title pages", async () => {
    const titlePage = createMockNotionPage({
      id: "title-page-1",
      title: "Section Title",
      status: "Ready for translation",
      language: "English",
      elementType: "Title",
      parentItem: "parent-1",
    });

    await runTranslation(titlePage);

    expect(mockN2m.pageToMarkdown).not.toHaveBeenCalled();
    expect(mockTranslateText).not.toHaveBeenCalled();
    expect(mockTranslateNotionBlocksDirectly).not.toHaveBeenCalled();
  });

  it("keeps non-image markdown unchanged before translation", async () => {
    const englishPage = createMockNotionPage({
      id: "text-only-page",
      title: "Text Only",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockN2m.toMarkdownString.mockReturnValue({
      parent: "Just plain text content without any images",
    });

    await runTranslation(englishPage);

    expect(mockTranslateText).toHaveBeenCalledWith(
      "Just plain text content without any images",
      "Text Only",
      "pt-BR"
    );
  });
});
