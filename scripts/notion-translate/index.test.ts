import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockNotionPage, installTestNotionEnv } from "../test-utils";

const mockFetchNotionData = vi.fn();
const mockSortAndExpandNotionData = vi.fn();
const mockTranslateText = vi.fn();
const mockTranslateJson = vi.fn();
const mockExtractTranslatableText = vi.fn();
const mockGetLanguageName = vi.fn();
const mockCreateNotionPageFromMarkdown = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockAccess = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();

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
  notion: {},
  DATABASE_ID: "test-database-id",
  DATA_SOURCE_ID: "test-data-source-id",
  n2m: mockN2m,
}));

vi.mock("../fetchNotionData.js", () => ({
  fetchNotionData: mockFetchNotionData,
  sortAndExpandNotionData: mockSortAndExpandNotionData,
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

vi.mock("./markdownToNotion", () => ({
  createNotionPageFromMarkdown: mockCreateNotionPageFromMarkdown,
}));

function findSummaryLog(logSpy: ReturnType<typeof vi.spyOn>) {
  const summaryLine = logSpy.mock.calls
    .map((args) => args.map(String).join(" "))
    .find((line) => line.startsWith("TRANSLATION_SUMMARY "));

  expect(summaryLine).toBeTruthy();
  return JSON.parse(summaryLine!.slice("TRANSLATION_SUMMARY ".length));
}

describe("notion-translate index", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    vi.resetModules();

    const englishPage = createMockNotionPage({
      id: "english-page-1",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      order: 7,
      parentItem: "parent-1",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });

    mockFetchNotionData.mockReset();
    mockSortAndExpandNotionData.mockReset();
    mockTranslateText.mockReset();
    mockTranslateJson.mockReset();
    mockExtractTranslatableText.mockReset();
    mockGetLanguageName.mockReset();
    mockCreateNotionPageFromMarkdown.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockAccess.mockReset();
    mockReaddir.mockReset();
    mockStat.mockReset();
    mockN2m.pageToMarkdown.mockReset();
    mockN2m.toMarkdownString.mockReset();

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
    mockSortAndExpandNotionData.mockImplementation(async (pages) => pages);
    mockN2m.pageToMarkdown.mockResolvedValue([]);
    mockN2m.toMarkdownString.mockReturnValue({
      parent: "# Hello\n\nEnglish markdown",
    });
    mockTranslateText.mockResolvedValue({
      markdown: "# Ola",
      title: "Ola",
    });
    mockTranslateJson.mockResolvedValue("{}");
    mockExtractTranslatableText.mockReturnValue({
      "homepage.cta": { message: "Get started" },
    });
    mockGetLanguageName.mockImplementation((lang: string) =>
      lang === "pt" ? "Portuguese" : "Spanish"
    );
    mockCreateNotionPageFromMarkdown.mockResolvedValue("translation-page-id");
    mockReadFile.mockResolvedValue('{"hello":{"message":"Hello"}}');
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockAccess.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    mockReaddir.mockResolvedValue(["es", "pt"]);
    mockStat.mockResolvedValue({
      isDirectory: () => true,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("returns an accurate success summary and logs TRANSLATION_SUMMARY", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    const summary = await main();

    expect(summary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      newTranslations: 2,
      updatedTranslations: 0,
      skippedTranslations: 0,
      failedTranslations: 0,
      codeJsonFailures: 0,
      themeFailures: 0,
    });
    expect(summary.failures).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toEqual(summary);
  });

  it("fails with explicit contract when no pages are ready for translation", async () => {
    mockFetchNotionData.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "No English pages found with status 'Ready for translation'."
    );

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 0,
      processedLanguages: 0,
      newTranslations: 0,
      updatedTranslations: 0,
      skippedTranslations: 0,
      failedTranslations: 0,
      codeJsonFailures: 0,
      themeFailures: 0,
    });
  });

  it("exits with failure on partial doc translation failures and reports counts", async () => {
    mockTranslateText.mockImplementation(
      async (_markdown: string, _title: string, targetLanguage: string) => {
        if (targetLanguage === "es") {
          throw new Error("es translation failed");
        }
        return {
          markdown: "# translated",
          title: "translated title",
        };
      }
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      failedTranslations: 1,
      codeJsonFailures: 0,
      themeFailures: 0,
    });
    expect(loggedSummary.failures).toHaveLength(1);
  });

  it("exits with failure on total code/theme translation failures and reports counts", async () => {
    mockTranslateJson.mockRejectedValue(new Error("openai outage"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      codeJsonFailures: 2,
      themeFailures: 4,
    });
    expect(loggedSummary.failures).toHaveLength(6);
  });
});
