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
const mockBlocksChildrenList = vi.fn();
const mockPagesRetrieve = vi.fn();
const mockProcessAndReplaceImages = vi.fn();
const mockGetImageDiagnostics = vi.fn();
const mockValidateAndFixRemainingImages = vi.fn();

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
  // DATA_SOURCE_ID is primary, DATABASE_ID is fallback (standardization policy)
  DATABASE_ID: "test-database-id",
  DATA_SOURCE_ID: "test-data-source-id",
  n2m: mockN2m,
  enhancedNotion: {
    blocksChildrenList: mockBlocksChildrenList,
    pagesRetrieve: mockPagesRetrieve,
  },
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

vi.mock("../notion-fetch/imageReplacer", () => ({
  processAndReplaceImages: mockProcessAndReplaceImages,
  getImageDiagnostics: mockGetImageDiagnostics,
  validateAndFixRemainingImages: mockValidateAndFixRemainingImages,
  extractImageMatches: vi.fn().mockReturnValue([]),
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
    mockBlocksChildrenList.mockReset();
    mockN2m.pageToMarkdown.mockReset();
    mockN2m.toMarkdownString.mockReset();
    mockProcessAndReplaceImages.mockReset();
    mockGetImageDiagnostics.mockReset();
    mockValidateAndFixRemainingImages.mockReset();

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
    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: "# Hello\n\nEnglish markdown",
      stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
      metrics: {
        totalProcessed: 0,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 0,
      },
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 0,
      markdownMatches: 0,
      htmlMatches: 0,
      s3Matches: 0,
      s3Samples: [],
    });
    mockValidateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );
    mockBlocksChildrenList.mockResolvedValue({
      results: [
        {
          type: "paragraph",
          has_children: false,
          paragraph: { rich_text: [{ plain_text: "Translated content" }] },
        },
      ],
      has_more: false,
      next_cursor: null,
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

  describe("needsTranslationUpdate", () => {
    it("requests update when translation page has no meaningful content", async () => {
      const englishPage = createMockNotionPage({
        id: "english-page-1",
        title: "Hello World",
        status: "Ready for translation",
        language: "English",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      const translationPage = createMockNotionPage({
        id: "translation-page-1",
        title: "Ola Mundo",
        status: "Auto Translation Generated",
        language: "Portuguese",
        lastEdited: "2026-02-05T00:00:00.000Z",
      });

      mockBlocksChildrenList.mockResolvedValue({
        results: [
          {
            type: "paragraph",
            has_children: false,
            paragraph: { rich_text: [] },
          },
        ],
        has_more: false,
        next_cursor: null,
      });

      const { needsTranslationUpdate } = await import("./index");
      const result = await needsTranslationUpdate(englishPage, translationPage);

      expect(result).toMatchObject({
        needsUpdate: true,
        reason: "Translation is empty",
        blockCount: 0,
      });
    });

    it("skips update when translation has content and is newer than English", async () => {
      const englishPage = createMockNotionPage({
        id: "english-page-1",
        title: "Hello World",
        status: "Ready for translation",
        language: "English",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      const translationPage = createMockNotionPage({
        id: "translation-page-1",
        title: "Ola Mundo",
        status: "Auto Translation Generated",
        language: "Portuguese",
        lastEdited: "2026-02-05T00:00:00.000Z",
      });

      mockBlocksChildrenList.mockResolvedValue({
        results: [
          {
            type: "paragraph",
            has_children: false,
            paragraph: { rich_text: [{ plain_text: "Conteudo" }] },
          },
        ],
        has_more: false,
        next_cursor: null,
      });

      const { needsTranslationUpdate } = await import("./index");
      const result = await needsTranslationUpdate(englishPage, translationPage);

      expect(result).toMatchObject({
        needsUpdate: false,
        reason: "Translation has content",
        blockCount: 1,
      });
    });

    it("fails open when content inspection fails and requests update", async () => {
      const englishPage = createMockNotionPage({
        id: "english-page-1",
        title: "Hello World",
        status: "Ready for translation",
        language: "English",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      const translationPage = createMockNotionPage({
        id: "translation-page-1",
        title: "Ola Mundo",
        status: "Auto Translation Generated",
        language: "Portuguese",
        lastEdited: "2026-02-05T00:00:00.000Z",
      });

      mockBlocksChildrenList.mockRejectedValue(new Error("rate limit"));

      const { needsTranslationUpdate } = await import("./index");
      const result = await needsTranslationUpdate(englishPage, translationPage);

      expect(result).toMatchObject({
        needsUpdate: true,
        reason: "Unable to verify translation content",
      });
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

  it("verifies success contract: processedLanguages > 0 and all failures = 0", async () => {
    // Success contract from PRD:
    // - processedLanguages > 0 (at least one language was processed)
    // - failedTranslations = 0 (no document translation failures)
    // - codeJsonFailures = 0 (no UI string translation failures)
    // - themeFailures = 0 (no navbar/footer translation failures)
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    const summary = await main();

    // Verify success contract conditions
    expect(summary.processedLanguages).toBeGreaterThan(0);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.codeJsonFailures).toBe(0);
    expect(summary.themeFailures).toBe(0);

    // Verify no errors were logged
    expect(errorSpy).not.toHaveBeenCalled();

    // Verify TRANSLATION_SUMMARY was emitted
    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toBeDefined();
    expect(loggedSummary.processedLanguages).toBeGreaterThan(0);
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

  describe("CLI page-id mode", () => {
    it("parses and normalizes --page-id values", async () => {
      const { parseCliOptions } = await import("./index");

      expect(
        parseCliOptions(["--page-id", "2641b081-62d5-8035-9153-cac75e4f09f2"])
      ).toEqual({
        pageId: "2641b08162d580359153cac75e4f09f2",
      });

      expect(
        parseCliOptions(["--page-id=2641b08162d580359153cac75e4f09f2"])
      ).toEqual({
        pageId: "2641b08162d580359153cac75e4f09f2",
      });
    });

    it("throws a clear error for invalid --page-id values", async () => {
      const { parseCliOptions } = await import("./index");

      expect(() => parseCliOptions(["--page-id", "invalid-id"])).toThrow(
        "Invalid --page-id value"
      );
    });

    it("processes only the requested page in single-page mode", async () => {
      const targetPage = createMockNotionPage({
        id: "2641b08162d580359153cac75e4f09f2",
        title: "Target Page",
        status: "Ready for translation",
        language: "English",
        order: 7,
        parentItem: "parent-1",
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      const otherPage = createMockNotionPage({
        id: "2641b08162d5813a9fcecb1deca11158",
        title: "Other Page",
        status: "Ready for translation",
        language: "English",
        order: 8,
        parentItem: "parent-2",
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });

      mockFetchNotionData.mockImplementation(async (filter) => {
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Publish Status"
          )
        ) {
          return [targetPage, otherPage];
        }
        return [];
      });

      const { main } = await import("./index");
      const summary = await main({
        pageId: "2641b08162d580359153cac75e4f09f2",
      });

      expect(summary.totalEnglishPages).toBe(1);
      expect(mockCreateNotionPageFromMarkdown).toHaveBeenCalledTimes(2);
      // Markdown conversion is cached per source page and reused across languages.
      expect(mockN2m.pageToMarkdown).toHaveBeenCalledTimes(1);
      expect(mockN2m.pageToMarkdown).toHaveBeenNthCalledWith(
        1,
        "2641b08162d580359153cac75e4f09f2"
      );
    });

    it("bypasses missing Parent item relation for --page-id and looks up translation by source page id", async () => {
      const sourcePageId = "2641b08162d580359153cac75e4f09f2";
      const englishPage = createMockNotionPage({
        id: sourcePageId,
        title: "EN Page Without Parent",
        status: "Ready for translation",
        language: "English",
        order: 4,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      const existingPortugueseTranslation = createMockNotionPage({
        id: "2641b08162d5813a9fcecb1deca11158",
        title: "PT Existing",
        status: "Auto Translation Generated",
        language: "Portuguese",
        order: 4,
        parentItem: sourcePageId,
        elementType: "Page",
        lastEdited: "2026-01-01T00:00:00.000Z",
      });

      mockFetchNotionData.mockImplementation(async (filter) => {
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Publish Status"
          )
        ) {
          return [englishPage];
        }
        if (
          filter?.and?.some(
            (condition: {
              property?: string;
              relation?: { contains?: string };
            }) =>
              condition.property === "Parent item" &&
              condition.relation?.contains === sourcePageId
          )
        ) {
          return [existingPortugueseTranslation];
        }
        return [];
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { main } = await import("./index");
      const summary = await main({ pageId: sourcePageId });

      expect(summary.failedTranslations).toBe(0);
      expect(summary.skippedTranslations).toBe(0);
      expect(
        summary.failures.some(
          (failure) => failure.error === "Missing required Parent item relation"
        )
      ).toBe(false);

      expect(mockCreateNotionPageFromMarkdown).toHaveBeenCalledTimes(2);
      mockCreateNotionPageFromMarkdown.mock.calls.forEach((callArgs) => {
        expect(callArgs[1]).toBe(sourcePageId);
      });

      const lookedUpBySourceId = mockFetchNotionData.mock.calls.some(
        ([filter]) =>
          filter?.and?.some(
            (condition: {
              property?: string;
              relation?: { contains?: string };
            }) =>
              condition.property === "Parent item" &&
              condition.relation?.contains === sourcePageId
          )
      );
      expect(lookedUpBySourceId).toBe(true);

      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary.totalEnglishPages).toBe(1);
    });

    it("prefers real Parent item relation over source page id lookup when parent exists", async () => {
      const sourcePageId = "2641b08162d580359153cac75e4f09f2";
      const realParentId = "real-parent-123";
      const englishPage = createMockNotionPage({
        id: sourcePageId,
        title: "EN Page With Parent",
        status: "Ready for translation",
        language: "English",
        order: 4,
        parentItem: realParentId,
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      const correctTranslation = createMockNotionPage({
        id: "translation-correct-id",
        title: "PT Correct",
        status: "Auto Translation Generated",
        language: "Portuguese",
        order: 4,
        parentItem: realParentId,
        elementType: "Page",
        lastEdited: "2026-02-05T00:00:00.000Z",
      });

      mockFetchNotionData.mockImplementation(async (filter) => {
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Publish Status"
          )
        ) {
          return [englishPage];
        }
        if (
          filter?.and?.some(
            (condition: {
              property?: string;
              relation?: { contains?: string };
            }) =>
              condition.property === "Parent item" &&
              condition.relation?.contains === realParentId
          )
        ) {
          return [correctTranslation];
        }
        return [];
      });

      const { main } = await import("./index");
      await main({ pageId: sourcePageId });

      const queriedBySourceId = mockFetchNotionData.mock.calls.some(
        ([filter]) =>
          filter?.and?.some(
            (condition: {
              property?: string;
              relation?: { contains?: string };
            }) =>
              condition.property === "Parent item" &&
              condition.relation?.contains === sourcePageId
          )
      );
      expect(queriedBySourceId).toBe(false);

      const queriedByParentRelation = mockFetchNotionData.mock.calls.some(
        ([filter]) =>
          filter?.and?.some(
            (condition: {
              property?: string;
              relation?: { contains?: string };
            }) =>
              condition.property === "Parent item" &&
              condition.relation?.contains === realParentId
          )
      );
      expect(queriedByParentRelation).toBe(true);
      expect(mockCreateNotionPageFromMarkdown).toHaveBeenCalledTimes(0);
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

  it("does not block translation for generic signed amazonaws links outside Notion image URL families", async () => {
    const genericSignedUrl =
      "https://s3.amazonaws.com/example-bucket/file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600";
    mockTranslateText.mockResolvedValue({
      markdown: `Link: ${genericSignedUrl}`,
      title: "translated title",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 1,
      markdownMatches: 1,
      htmlMatches: 0,
      s3Matches: 1,
      s3Samples: [genericSignedUrl],
    });

    const { main } = await import("./index");
    const summary = await main();

    expect(summary.failedTranslations).toBe(0);
    expect(mockValidateAndFixRemainingImages).not.toHaveBeenCalled();
  });

  it("uses full raw Notion URL match count in blocking errors while capping sample output", async () => {
    const notionUrls = Array.from(
      { length: 7 },
      (_, index) =>
        `https://prod-files-secure.s3.us-west-2.amazonaws.com/image-${index}.png`
    );
    mockTranslateText.mockResolvedValue({
      markdown: notionUrls.join("\n"),
      title: "translated title",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 1,
      markdownMatches: 1,
      htmlMatches: 0,
      s3Matches: 1,
      s3Samples: [notionUrls[0]],
    });
    mockValidateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const errorLogLines = errorSpy.mock.calls.map((args) => args.join(" "));
    expect(
      errorLogLines.some((line) =>
        line.includes("still contains 7 Notion/S3 URLs")
      )
    ).toBe(true);
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

  it("exits with failure on theme-only translation failures and reports themeFailures > 0", async () => {
    // This test validates theme-only failure behavior per PRD Batch 4:
    // "Validate theme translation failure behavior: non-zero exit and themeFailures > 0"
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Track call count to differentiate code.json calls (2) from theme calls (4: 2 langs × 2 files)
    let translateJsonCallCount = 0;
    mockTranslateJson.mockImplementation(
      async (_json: string, _targetLang: string) => {
        translateJsonCallCount++;
        // First 2 calls are for code.json (pt and es) - succeed
        // Next 4 calls are for theme (navbar/footer for pt and es) - fail
        if (translateJsonCallCount <= 2) {
          return '{"hello": {"message": "Translated"}}';
        }
        throw new Error(
          `Theme translation failed (call ${translateJsonCallCount})`
        );
      }
    );

    const { main } = await import("./index");

    // Should throw due to theme failures
    await expect(main()).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const loggedSummary = findSummaryLog(logSpy);

    // Verify theme-specific failure counts
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      failedTranslations: 0, // Doc translations succeeded
      codeJsonFailures: 0, // code.json translations succeeded
      themeFailures: 4, // 2 languages × 2 theme files (navbar + footer) = 4 failures
    });

    // Verify all failures are theme-related (navbar.json or footer.json)
    expect(loggedSummary.failures).toHaveLength(4);
    loggedSummary.failures.forEach(
      (failure: { title: string; error: string; isCritical: boolean }) => {
        expect(["navbar.json", "footer.json"]).toContain(failure.title);
        expect(failure.error).toContain("Theme translation failed");
        // Note: isCritical is false because we throw a regular Error, not TranslationError
        // This is intentional - the test validates that theme failures cause workflow exit
        // regardless of the isCritical flag value
      }
    );

    // Verify error was logged (check last call which contains the fatal error message)
    const lastErrorCall = errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
    expect(String(lastErrorCall[0])).toContain(
      "Fatal error during translation process"
    );
  });

  it("emits TRANSLATION_SUMMARY even when required environment is missing", async () => {
    // This test verifies that env validation failures still emit TRANSLATION_SUMMARY
    // The env validation happens inside try/catch, so even early failures emit the summary
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Clear environment variables before importing the module
    const originalEnv = { ...process.env };
    delete process.env.NOTION_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DATA_SOURCE_ID;
    delete process.env.DATABASE_ID;

    try {
      // Import the module with empty environment to trigger env validation failure
      const { main } = await import("./index");

      // Use regex for partial match since error includes list of missing variables
      await expect(main()).rejects.toThrow(
        /Missing required environment variables/
      );

      // Verify that TRANSLATION_SUMMARY was still emitted despite env failure
      const summaryLine = logSpy.mock.calls
        .map((args) => args.map(String).join(" "))
        .find((line) => line.startsWith("TRANSLATION_SUMMARY "));

      expect(summaryLine).toBeTruthy();
      const loggedSummary = JSON.parse(
        summaryLine!.slice("TRANSLATION_SUMMARY ".length)
      );
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
    } finally {
      // Restore environment variables safely
      Object.assign(process.env, originalEnv);
    }
  });

  describe("code.json soft-fail behavior", () => {
    it("continues doc translation when code.json is missing (soft-fail)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock readFile to simulate ENOENT (file not found)
      mockReadFile.mockRejectedValue(
        Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })
      );

      const { main } = await import("./index");

      // Should NOT throw - should continue with doc translation
      const summary = await main();

      // Verify warning was logged (ignore Docusaurus warnings)
      const codeJsonWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("English code.json")
      );
      expect(codeJsonWarnings.length).toBeGreaterThan(0);

      // Verify doc translation still happened
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 2, // Docs were translated
        codeJsonFailures: 0, // No actual failures when source is missing (soft-fail)
        codeJsonSourceFileMissing: true, // Flag indicates source was missing
        themeFailures: 0, // Theme should still work (doesn't depend on code.json)
      });

      // Verify the failure is marked as non-critical
      const codeJsonFailure = summary.failures.find(
        (f) => f.title === "code.json (source file)"
      );
      expect(codeJsonFailure).toBeDefined();
      expect(codeJsonFailure?.isCritical).toBe(false);
      expect(codeJsonFailure?.error).toContain("Source file not found");

      // Verify TRANSLATION_SUMMARY was emitted
      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toEqual(summary);
    });

    it("continues doc translation when code.json is malformed (soft-fail)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock readFile to return invalid JSON
      mockReadFile.mockResolvedValue('{"invalid": json}');

      const { main } = await import("./index");

      // Should NOT throw - should continue with doc translation
      const summary = await main();

      // Verify warning was logged (ignore Docusaurus warnings)
      const codeJsonWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("English code.json")
      );
      expect(codeJsonWarnings.length).toBeGreaterThan(0);

      // Verify doc translation still happened
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 2, // Docs were translated
        codeJsonFailures: 0, // No actual failures when source is malformed (soft-fail)
        codeJsonSourceFileMissing: true, // Flag indicates source was malformed
        themeFailures: 0,
      });

      // Verify the failure is marked as non-critical
      const codeJsonFailure = summary.failures.find(
        (f) => f.title === "code.json (source file)"
      );
      expect(codeJsonFailure).toBeDefined();
      expect(codeJsonFailure?.isCritical).toBe(false);
      expect(codeJsonFailure?.error).toContain("Source file malformed");

      // Verify TRANSLATION_SUMMARY was emitted
      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toEqual(summary);
    });

    it("translates code.json successfully when file is valid", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Mock valid code.json
      mockReadFile.mockResolvedValue('{"hello": {"message": "Hello"}}');

      const { main } = await import("./index");

      const summary = await main();

      // Verify code.json-specific warnings (allow Docusaurus warnings)
      const codeJsonWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("English code.json")
      );
      expect(codeJsonWarnings.length).toBe(0);

      // Verify code.json was translated successfully
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 2,
        codeJsonFailures: 0, // No failures when file is valid
        codeJsonSourceFileMissing: false, // Source file was present
      });

      // Verify translateJson was called:
      // - 2 times for code.json (pt and es)
      // - 4 times for theme (navbar + footer) × 2 languages = 4
      // Total: 6 times
      expect(mockTranslateJson).toHaveBeenCalledTimes(6);

      // Verify TRANSLATION_SUMMARY was emitted
      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toEqual(summary);
    });

    it("reports individual code.json translation failures separately", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Mock valid code.json
      mockReadFile.mockResolvedValue('{"hello": {"message": "Hello"}}');

      // Mock translateJson to fail for Portuguese but succeed for Spanish
      mockTranslateJson.mockImplementation(
        async (_json: string, targetLang: string) => {
          if (targetLang === "Portuguese") {
            throw new Error("Portuguese translation failed");
          }
          return '{"hello": {"message": "Hola"}}';
        }
      );

      const { main } = await import("./index");

      // Should throw due to translation failures
      await expect(main()).rejects.toThrow(
        "Translation workflow completed with failures"
      );

      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toMatchObject({
        codeJsonFailures: 1, // Portuguese failed
        codeJsonSourceFileMissing: false, // Source file was present
      });

      // Verify the failure is for Portuguese code.json
      const ptFailure = loggedSummary.failures.find(
        (f: { title: string; language: string }) =>
          f.title === "code.json" && f.language === "pt-BR"
      );
      expect(ptFailure).toBeDefined();
      expect(ptFailure?.error).toContain("Portuguese translation failed");
    });
  });

  describe("workflow gating validation", () => {
    it("validates translation failure causes workflow to skip status-update and commit steps", async () => {
      // This test validates PRD Batch 5 requirement:
      // "translation failure causes workflow failure and skips status-update and commit steps"
      //
      // The workflow uses `if: success()` conditions on status-update and commit steps,
      // so when the translate step fails (non-zero exit), those steps won't run.
      //
      // This test verifies the translation script fails with non-zero exit on failures.
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Simulate translation failure
      mockTranslateText.mockRejectedValue(new Error("Translation API error"));

      const { main } = await import("./index");

      // Should throw due to translation failures (non-zero exit)
      await expect(main()).rejects.toThrow(
        "Translation workflow completed with failures"
      );

      const loggedSummary = findSummaryLog(logSpy);

      // Verify failure is recorded in summary
      expect(loggedSummary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        failedTranslations: 2, // Both pt and es failed
        codeJsonFailures: 0,
        themeFailures: 0,
      });

      // Verify TRANSLATION_SUMMARY was emitted even on failure
      expect(loggedSummary.failures).toHaveLength(2);

      // Verify error messages contain the expected error
      loggedSummary.failures.forEach((failure: { error: string }) => {
        expect(failure.error).toContain("Translation API error");
      });

      // Verify fatal error message was logged
      const lastErrorCall = errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
      expect(String(lastErrorCall[0])).toContain(
        "Fatal error during translation process"
      );

      // Key validation: The translation step exits with failure, which means
      // the GitHub Actions workflow's `if: success()` conditions on subsequent
      // steps (status-update, commit) will prevent them from running.
      // This is verified by the fact that main() throws (non-zero exit code).
    });

    it("validates success path: status update runs only when diff exists (newTranslations + updatedTranslations > 0)", async () => {
      // This test validates PRD Batch 5 requirement:
      // "Validate success path: status update runs and commit/push runs only when diff exists."
      //
      // The workflow uses the following condition on the status update step:
      // `if: success() && (steps.parse_summary.outputs.new_translations != '0' || steps.parse_summary.outputs.updated_translations != '0')`
      //
      // This ensures the status update step only runs when there are actual changes.
      //
      // This test validates the skipped scenario (no diff case). The case where
      // translations exist is covered by the "returns an accurate success summary" test.
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock translations to be up-to-date (translation page exists and is newer than English page)
      mockFetchNotionData.mockImplementation(async (filter) => {
        // Filter for parent item (translation lookup)
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Parent item"
          )
        ) {
          // Return a translation page that is newer than the English page
          return [
            createMockNotionPage({
              id: "translation-page-1",
              title: "Ola Mundo",
              status: "Auto Translation Generated",
              language: "Portuguese",
              order: 7,
              parentItem: "parent-1",
              elementType: "Page",
              lastEdited: "2026-02-10T00:00:00.000Z", // Newer than English page
            }),
          ];
        }
        // Filter for publish status (English pages)
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Publish Status"
          )
        ) {
          return [
            createMockNotionPage({
              id: "english-page-1",
              title: "Hello World",
              status: "Ready for translation",
              language: "English",
              order: 7,
              parentItem: "parent-1",
              elementType: "Page",
              lastEdited: "2026-02-01T00:00:00.000Z", // Older than translation
            }),
          ];
        }
        return [];
      });

      const { main } = await import("./index");
      const summary = await main();

      // Verify all translations were skipped (no new, no updated, all skipped)
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 0,
        updatedTranslations: 0,
        skippedTranslations: 2, // Both pt and es were skipped
        failedTranslations: 0,
      });

      const loggedSummary = findSummaryLog(logSpy);

      // Workflow gating validation:
      // - new_translations = '0'
      // - updated_translations = '0'
      // - Therefore: (new_translations != '0' || updated_translations != '0') = false
      // - The status update step will be SKIPPED
      expect(loggedSummary.newTranslations).toBe(0);
      expect(loggedSummary.updatedTranslations).toBe(0);

      // Note: The case where translations exist (newTranslations > 0 or updatedTranslations > 0)
      // is validated by the test "returns an accurate success summary and logs TRANSLATION_SUMMARY"
      // which shows newTranslations: 2, meaning the status update step would run.

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("validates secrets gate: missing required secret fails early in Validate required secrets", async () => {
      // This test validates PRD Batch 6 requirement:
      // "Validate secrets gate: missing required secret fails early in Validate required secrets."
      //
      // The GitHub Actions workflow has a "Validate required secrets" step (lines 72-96)
      // that checks for NOTION_API_KEY, DATA_SOURCE_ID/DATABASE_ID, and OPENAI_API_KEY
      // before running the translation step.
      //
      // This test validates that the translation script fails early when required
      // environment variables (which map to secrets) are missing.
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Clear all required environment variables before importing the module
      const originalEnv = { ...process.env };
      delete process.env.NOTION_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.DATA_SOURCE_ID;
      delete process.env.DATABASE_ID;

      try {
        // Import the module with empty environment to trigger env validation failure
        const { main } = await import("./index");

        // Should throw due to missing required environment variables
        await expect(main()).rejects.toThrow(
          /Missing required environment variables/
        );

        const loggedSummary = findSummaryLog(logSpy);

        // Verify TRANSLATION_SUMMARY was emitted with all zeros (early failure)
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

        // Verify the error message indicates which secrets are missing
        const lastErrorCall =
          errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
        expect(String(lastErrorCall[0])).toContain(
          "Fatal error during translation process"
        );

        // Key validation: The translation script fails early (before any Notion API calls)
        // due to missing required environment variables, which corresponds to the
        // "Validate required secrets" workflow step.
      } finally {
        // Restore environment variables safely
        Object.assign(process.env, originalEnv);
      }
    });
  });

  describe("deterministic file output", () => {
    it("produces identical file paths when running translation twice with no source changes", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});

      // Track all files written in the first run
      const firstRunFiles: Map<string, string> = new Map();

      // Capture writeFile calls in the first run
      mockWriteFile.mockImplementation(
        async (filePath: string, content: string) => {
          firstRunFiles.set(filePath, content);
          return Promise.resolve();
        }
      );

      const { main: main1 } = await import("./index");
      await main1();

      const firstRunFileCount = firstRunFiles.size;
      const firstRunFilePaths = Array.from(firstRunFiles.keys());

      // Reset mocks for second run
      mockWriteFile.mockClear();

      // Track all files written in the second run
      const secondRunFiles: Map<string, string> = new Map();
      mockWriteFile.mockImplementation(
        async (filePath: string, content: string) => {
          secondRunFiles.set(filePath, content);
          return Promise.resolve();
        }
      );

      // Reset other mocks for the second run
      mockFetchNotionData.mockReset();
      mockSortAndExpandNotionData.mockReset();
      mockFetchNotionData.mockImplementation(async (filter) => {
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Publish Status"
          )
        ) {
          return [
            createMockNotionPage({
              id: "english-page-1",
              title: "Hello World",
              status: "Ready for translation",
              language: "English",
              order: 7,
              parentItem: "parent-1",
              elementType: "Page",
              lastEdited: "2026-02-01T00:00:00.000Z",
            }),
          ];
        }
        return [];
      });
      mockSortAndExpandNotionData.mockImplementation(async (pages) => pages);

      // Get a fresh import for the second run
      const { main: main2 } = await import("./index");

      // Run translation a second time with the same source
      await main2();

      const secondRunFileCount = secondRunFiles.size;
      const secondRunFilePaths = Array.from(secondRunFiles.keys());

      // Verify: same number of files written
      expect(secondRunFileCount).toBe(firstRunFileCount);

      // Verify: identical file paths (no -1/-2 suffix drift)
      expect(secondRunFilePaths).toEqual(firstRunFilePaths);

      // Verify: file contents are identical
      for (const filePath of firstRunFilePaths) {
        expect(secondRunFiles.get(filePath)).toBe(firstRunFiles.get(filePath));
      }

      // Verify: no files have suffixes like -1, -2, -3
      const filesWithNumericSuffixes = firstRunFilePaths.filter(
        (path) =>
          /-\d+\.md$/.test(path) ||
          /-\d+\.json$/.test(path) ||
          /-\d+\/_category_\.json$/.test(path)
      );
      expect(filesWithNumericSuffixes).toEqual([]);
    });

    it("generates deterministic filenames using stable page ID", async () => {
      const { saveTranslatedContentToDisk } = await import("./index");

      const mockPage = createMockNotionPage({
        id: "abc123def456", // Stable ID
        title: "Test Page",
        elementType: "Page",
      });

      const mockConfig = {
        language: "pt-BR",
        notionLangCode: "Portuguese",
        outputDir: "/test/output",
      };

      const filePath1 = await saveTranslatedContentToDisk(
        mockPage,
        "# Test Content",
        mockConfig
      );

      const filePath2 = await saveTranslatedContentToDisk(
        mockPage,
        "# Test Content",
        mockConfig
      );

      // Both calls should produce the same exact path
      expect(filePath1).toBe(filePath2);

      // The filename should include the stable page ID (sanitized)
      expect(filePath1).toContain("abc123def456");
      expect(filePath1).toContain("test-page");
    });
  });

  describe("missing parent relation handling", () => {
    it("gracefully skips pages without Parent item relation and reports as non-critical failure", async () => {
      // Create a page WITHOUT parent relation
      const pageWithoutParent = createMockNotionPage({
        id: "page-no-parent",
        title: "Page Without Parent",
        status: "Ready for translation",
        language: "English",
        order: 1,
        parentItem: undefined, // Missing parent relation
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });

      // Setup mocks
      mockFetchNotionData.mockResolvedValueOnce([pageWithoutParent]);
      mockSortAndExpandNotionData.mockResolvedValueOnce([pageWithoutParent]);
      mockExtractTranslatableText.mockReturnValue({});
      mockGetLanguageName.mockReturnValue("Portuguese");
      mockReadFile.mockRejectedValue(new Error("ENOENT")); // Simulate missing code.json
      mockReaddir.mockResolvedValue(["pt", "es"]);
      mockStat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes("pt") || path.includes("es"),
      }));

      const logSpy = vi.spyOn(console, "log");
      const warnSpy = vi.spyOn(console, "warn");

      const { main } = await import("./index");

      // Should not throw - pages are skipped gracefully
      await expect(main()).resolves.not.toThrow();

      // Verify warning was logged
      const warnCalls = warnSpy.mock.calls
        .map((args) => args.map(String).join(" "))
        .join("\n");
      expect(warnCalls).toContain("Skipping");
      expect(warnCalls).toContain("missing required Parent item relation");

      // Verify summary shows skipped pages
      const summary = findSummaryLog(logSpy);
      expect(summary.skippedTranslations).toBeGreaterThan(0);

      // Verify failure is marked as non-critical
      expect(summary.failures).toBeDefined();
      const parentFailures = summary.failures.filter(
        (f: any) => f.error === "Missing required Parent item relation"
      );
      expect(parentFailures.length).toBeGreaterThan(0);
      expect(parentFailures[0].isCritical).toBe(false);

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("continues processing other pages when some lack parent relations", async () => {
      // Create multiple pages with mixed parent relations
      const pageWithParent = createMockNotionPage({
        id: "page-with-parent",
        title: "Page With Parent",
        status: "Ready for translation",
        language: "English",
        order: 1,
        parentItem: "parent-1",
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });

      const pageWithoutParent = createMockNotionPage({
        id: "page-no-parent",
        title: "Page Without Parent",
        status: "Ready for translation",
        language: "English",
        order: 2,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });

      // Setup mocks
      mockFetchNotionData.mockResolvedValueOnce([
        pageWithParent,
        pageWithoutParent,
      ]);
      mockSortAndExpandNotionData.mockResolvedValueOnce([
        pageWithParent,
        pageWithoutParent,
      ]);
      mockFetchNotionData.mockResolvedValue([]);
      mockTranslateText.mockResolvedValue({
        title: "Translated Title",
        markdown: "# Translated Content",
      });
      mockN2m.pageToMarkdown.mockResolvedValue([]);
      mockN2m.toMarkdownString.mockReturnValue({ parent: "# Test" });
      mockCreateNotionPageFromMarkdown.mockResolvedValue("new-page-id");
      mockExtractTranslatableText.mockReturnValue({});
      mockGetLanguageName.mockReturnValue("Portuguese");
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockReaddir.mockResolvedValue(["pt", "es"]);
      mockStat.mockImplementation(async (path: string) => ({
        isDirectory: () => path.includes("pt") || path.includes("es"),
      }));

      const logSpy = vi.spyOn(console, "log");

      const { main } = await import("./index");

      await main();

      const summary = findSummaryLog(logSpy);

      // Verify at least one page was processed successfully
      expect(
        summary.newTranslations + summary.updatedTranslations
      ).toBeGreaterThan(0);

      // Verify the page without parent was skipped (counted in skippedTranslations)
      expect(summary.skippedTranslations).toBeGreaterThan(0);

      // Verify both outcomes are tracked
      expect(summary.failures).toBeDefined();
      const parentFailures = summary.failures.filter(
        (f: any) => f.error === "Missing required Parent item relation"
      );
      expect(parentFailures.length).toBeGreaterThan(0);

      logSpy.mockRestore();
    });
  });

  describe("sibling translation lookup", () => {
    it("finds translation sibling by traversing parent block hierarchy", async () => {
      const englishPage = createMockNotionPage({
        id: "2641b08162d580359153cac75e4f09f2",
        title: "English Page",
        status: "Ready for translation",
        language: "English",
        order: 1,
        parentItem: undefined, // No parent relation
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      // Add parent block hierarchy info
      (englishPage as any).parent = {
        type: "page_id",
        page_id: "2621b08162d580beba78f50c3947b85e",
      };

      const portugueseSibling = createMockNotionPage({
        id: "2641b08162d5813a9fcecb1deca11158",
        title: "Portuguese Page",
        status: "Auto Translation Generated",
        language: "Portuguese",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-01-01T00:00:00.000Z",
      });

      // Mock blocksChildrenList to return sibling pages
      mockBlocksChildrenList.mockResolvedValue({
        results: [
          {
            id: englishPage.id,
            type: "child_page",
            object: "page",
          },
          {
            id: portugueseSibling.id,
            type: "child_page",
            object: "page",
          },
        ],
        has_more: false,
        next_cursor: null,
      });

      // Mock pagesRetrieve to return full page objects with properties
      mockPagesRetrieve.mockImplementation(
        async ({ page_id }: { page_id: string }) => {
          if (page_id === portugueseSibling.id) {
            return portugueseSibling;
          }
          return englishPage;
        }
      );

      const { findSiblingTranslations } = await import("./index");
      const result = await findSiblingTranslations(englishPage, "Portuguese");

      expect(result).not.toBeNull();
      expect(result?.id).toBe(portugueseSibling.id);
      expect(mockBlocksChildrenList).toHaveBeenCalledWith({
        block_id: "2621b08162d580beba78f50c3947b85e",
      });
      expect(mockPagesRetrieve).toHaveBeenCalledWith({
        page_id: portugueseSibling.id,
      });
    });

    it("returns null when no parent block exists", async () => {
      const englishPage = createMockNotionPage({
        id: "2641b08162d580359153cac75e4f09f2",
        title: "English Page",
        status: "Ready for translation",
        language: "English",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      // No parent block hierarchy info
      (englishPage as any).parent = undefined;

      const { findSiblingTranslations } = await import("./index");
      const result = await findSiblingTranslations(englishPage, "Portuguese");

      expect(result).toBeNull();
      expect(mockBlocksChildrenList).not.toHaveBeenCalled();
    });

    it("returns null when no language match found among siblings", async () => {
      const englishPage = createMockNotionPage({
        id: "2641b08162d580359153cac75e4f09f2",
        title: "English Page",
        status: "Ready for translation",
        language: "English",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      (englishPage as any).parent = {
        type: "page_id",
        page_id: "2621b08162d580beba78f50c3947b85e",
      };

      const spanishPage = createMockNotionPage({
        id: "spanish-page-id",
        title: "Spanish Page",
        status: "Auto Translation Generated",
        language: "Spanish",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-01-01T00:00:00.000Z",
      });

      mockBlocksChildrenList.mockResolvedValue({
        results: [
          {
            id: englishPage.id,
            type: "child_page",
            object: "page",
          },
          {
            id: spanishPage.id,
            type: "child_page",
            object: "page",
          },
        ],
        has_more: false,
        next_cursor: null,
      });

      mockPagesRetrieve.mockImplementation(
        async ({ page_id }: { page_id: string }) => {
          if (page_id === spanishPage.id) {
            return spanishPage;
          }
          return englishPage;
        }
      );

      const { findSiblingTranslations } = await import("./index");
      const result = await findSiblingTranslations(englishPage, "Portuguese");

      expect(result).toBeNull();
    });

    it("filters by language and returns first matching sibling", async () => {
      const englishPage = createMockNotionPage({
        id: "2641b08162d580359153cac75e4f09f2",
        title: "English Page",
        status: "Ready for translation",
        language: "English",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-02-01T00:00:00.000Z",
      });
      (englishPage as any).parent = {
        type: "page_id",
        page_id: "2621b08162d580beba78f50c3947b85e",
      };

      const portugueseSibling = createMockNotionPage({
        id: "pt-sibling-id",
        title: "PT Sibling",
        status: "Auto Translation Generated",
        language: "Portuguese",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-01-01T00:00:00.000Z",
      });

      const spanishSibling = createMockNotionPage({
        id: "es-sibling-id",
        title: "ES Sibling",
        status: "Auto Translation Generated",
        language: "Spanish",
        order: 1,
        parentItem: undefined,
        elementType: "Page",
        lastEdited: "2026-01-01T00:00:00.000Z",
      });

      mockBlocksChildrenList.mockResolvedValue({
        results: [
          { id: englishPage.id, type: "child_page", object: "page" },
          { id: portugueseSibling.id, type: "child_page", object: "page" },
          { id: spanishSibling.id, type: "child_page", object: "page" },
        ],
        has_more: false,
        next_cursor: null,
      });

      mockPagesRetrieve.mockImplementation(
        async ({ page_id }: { page_id: string }) => {
          if (page_id === portugueseSibling.id) return portugueseSibling;
          if (page_id === spanishSibling.id) return spanishSibling;
          return englishPage;
        }
      );

      const { findSiblingTranslations } = await import("./index");

      // Test Portuguese lookup
      const ptResult = await findSiblingTranslations(englishPage, "Portuguese");
      expect(ptResult?.id).toBe(portugueseSibling.id);

      // Test Spanish lookup
      const esResult = await findSiblingTranslations(englishPage, "Spanish");
      expect(esResult?.id).toBe(spanishSibling.id);
    });
  });
});
