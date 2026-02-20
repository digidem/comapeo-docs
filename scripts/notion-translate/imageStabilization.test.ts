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

describe("image stabilization in translation pipeline", () => {
  let restoreEnv: () => void;

  const findSummaryLog = (logSpy: ReturnType<typeof vi.spyOn>) => {
    const summaryLine = logSpy.mock.calls
      .map((args) => args.map(String).join(" "))
      .find((line) => line.startsWith("TRANSLATION_SUMMARY "));
    expect(summaryLine).toBeTruthy();
    return JSON.parse(summaryLine!.slice("TRANSLATION_SUMMARY ".length));
  };

  const setupFetchMocks = (
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
  };

  const runTranslation = async (
    englishPage: ReturnType<typeof createMockNotionPage>
  ) => {
    setupFetchMocks(englishPage);
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
    mockCreateNotionPageFromMarkdown.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockAccess.mockReset();
    mockReaddir.mockReset();
    mockStat.mockReset();
    mockBlocksChildrenList.mockReset();
    mockPagesRetrieve.mockReset();
    mockN2m.pageToMarkdown.mockReset();
    mockN2m.toMarkdownString.mockReset();
    mockProcessAndReplaceImages.mockReset();
    mockGetImageDiagnostics.mockReset();
    mockValidateAndFixRemainingImages.mockReset();

    mockSortAndExpandNotionData.mockImplementation(async (pages) => pages);
    mockN2m.pageToMarkdown.mockResolvedValue([]);
    mockN2m.toMarkdownString.mockReturnValue({
      parent:
        "![img](https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png)\n\nContent",
    });
    mockTranslateText.mockResolvedValue({
      markdown: "# Ola\n\n![img](/images/test_0.png)\n\nConteudo",
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
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockBlocksChildrenList.mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    });

    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: "![img](/images/test_0.png)\n\nContent",
      stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
      metrics: {
        totalProcessed: 1,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 1,
      },
    });

    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 1,
      markdownMatches: 1,
      htmlMatches: 0,
      s3Matches: 0,
      s3Samples: [],
    });
    mockValidateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("passes image-stabilized markdown to translateText", async () => {
    const englishPage = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    await runTranslation(englishPage);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
      expect.stringContaining("prod-files-secure.s3.us-west-2.amazonaws.com"),
      "hello-world-abc123def"
    );
    expect(mockTranslateText).toHaveBeenCalledWith(
      "![img](/images/test_0.png)\n\nContent",
      "Hello World",
      expect.any(String)
    );
    expect(mockProcessAndReplaceImages).toHaveBeenCalledTimes(1);
  });

  it("throws when image download fails", async () => {
    const englishPage = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: "<!-- Failed to download image -->",
      stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
      metrics: {
        totalProcessed: 1,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 0,
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );
    expect(mockTranslateText).not.toHaveBeenCalled();
    const summary = findSummaryLog(logSpy);
    expect(
      summary.failures.some((failure: { error: string }) =>
        /image.*failed to download/i.test(failure.error)
      )
    ).toBe(true);
  });

  it("throws when translated content still contains S3 URLs", async () => {
    const englishPage = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 1,
      markdownMatches: 1,
      htmlMatches: 0,
      s3Matches: 1,
      s3Samples: ["https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx"],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );
    const summary = findSummaryLog(logSpy);
    const s3Failure = summary.failures.find((failure: { error: string }) =>
      /Notion\/S3 URLs/.test(failure.error)
    );
    expect(s3Failure).toBeDefined();
    expect(s3Failure.error).toContain("Offending URLs (redacted):");
    expect(s3Failure.error).not.toContain("X-Amz-Algorithm");
  });

  it("redacts signed params embedded in encoded Notion image path samples", async () => {
    const englishPage = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    const encodedSignedNotionImageUrl =
      "https://www.notion.so/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2Fxxx%2Fimage.png%3FX-Amz-Algorithm%3DAWS4-HMAC-SHA256%26X-Amz-Expires%3D3600?table=block&id=abc123";

    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 1,
      markdownMatches: 1,
      htmlMatches: 0,
      s3Matches: 1,
      s3Samples: [encodedSignedNotionImageUrl],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );
    const summary = findSummaryLog(logSpy);
    const s3Failure = summary.failures.find((failure: { error: string }) =>
      /Notion\/S3 URLs/.test(failure.error)
    );

    expect(s3Failure).toBeDefined();
    expect(s3Failure.error).toContain(
      "https://www.notion.so/image/<redacted>?<redacted>"
    );
    expect(s3Failure.error).not.toContain("X-Amz-Algorithm");
    expect(s3Failure.error).not.toContain("X-Amz-Expires");
  });

  it("throws when translated content contains a raw S3 URL outside image syntax", async () => {
    const englishPage = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    mockTranslateText.mockResolvedValue({
      markdown:
        "# Ola\n\nUse this link: https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600",
      title: "Ola",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 0,
      markdownMatches: 0,
      htmlMatches: 0,
      s3Matches: 0,
      s3Samples: [],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );
    const summary = findSummaryLog(logSpy);
    expect(
      summary.failures.some((failure: { error: string }) =>
        /Notion\/S3 URLs/.test(failure.error)
      )
    ).toBe(true);
  });

  it("passes through already-stabilized content unchanged", async () => {
    const stableMarkdown = "![img](/images/existing_0.png)\n\nText content";
    const englishPage = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockN2m.toMarkdownString.mockReturnValue({ parent: stableMarkdown });
    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: stableMarkdown,
      stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
      metrics: {
        totalProcessed: 0,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 0,
      },
    });

    await runTranslation(englishPage);

    expect(mockTranslateText).toHaveBeenCalledWith(
      stableMarkdown,
      "Hello World",
      expect.any(String)
    );
  });

  it("allows empty stabilized markdown content", async () => {
    const englishPage = createMockNotionPage({
      id: "empty-content-page",
      title: "Empty Content",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: "",
      stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
      metrics: {
        totalProcessed: 0,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 0,
      },
    });

    await runTranslation(englishPage);

    expect(mockTranslateText).toHaveBeenCalledWith(
      "",
      "Empty Content",
      expect.any(String)
    );
  });

  it("reuses empty stabilized markdown across languages without falling into null checks", async () => {
    const englishPage = createMockNotionPage({
      id: "empty-cache-page",
      title: "Empty Cache",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: "",
      stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
      metrics: {
        totalProcessed: 0,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 0,
      },
    });

    await runTranslation(englishPage);

    expect(mockN2m.pageToMarkdown).toHaveBeenCalledTimes(1);
    expect(mockProcessAndReplaceImages).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledTimes(2);
    expect(mockTranslateText).toHaveBeenNthCalledWith(
      1,
      "",
      "Empty Cache",
      expect.any(String)
    );
    expect(mockTranslateText).toHaveBeenNthCalledWith(
      2,
      "",
      "Empty Cache",
      expect.any(String)
    );
  });

  it("deduplicates offending URL sample output when both detector paths report the same URL", async () => {
    const englishPage = createMockNotionPage({
      id: "dedup-page",
      title: "Dedup URL",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const duplicateUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/duplicate.png";
    mockTranslateText.mockResolvedValue({
      markdown: `![img](${duplicateUrl})`,
      title: "Dedup URL",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 2,
      markdownMatches: 2,
      htmlMatches: 0,
      s3Matches: 2,
      s3Samples: [duplicateUrl, duplicateUrl],
    });
    mockValidateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );
    const summary = findSummaryLog(logSpy);
    const s3Failure = summary.failures.find((failure: { error: string }) =>
      /Notion\/S3 URLs/.test(failure.error)
    );

    expect(s3Failure).toBeDefined();
    expect(s3Failure.error).toContain("still contains 2 Notion/S3 URLs");
    expect(s3Failure.error).toContain(
      "Offending URLs (redacted): https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/duplicate.png"
    );
    expect(s3Failure.error).not.toContain(", ");
  });

  it("catches URLs via getImageDiagnostics when raw regex does not match", async () => {
    const englishPage = createMockNotionPage({
      id: "diagnostics-only-page",
      title: "Diagnostics Only",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const notionProxyUrl =
      "https://www.notion.so/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2Fxxx%2Fimage.png";
    mockTranslateText.mockResolvedValue({
      markdown: `Check this image: ${notionProxyUrl}`,
      title: "Diagnostics Only",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 1,
      markdownMatches: 0,
      htmlMatches: 1,
      s3Matches: 1,
      s3Samples: [notionProxyUrl],
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );
    const summary = findSummaryLog(logSpy);
    const s3Failure = summary.failures.find((failure: { error: string }) =>
      /Notion\/S3 URLs/.test(failure.error)
    );

    expect(s3Failure).toBeDefined();
    expect(s3Failure.error).toContain("still contains 1 Notion/S3 URLs");
  });

  it("reports correct count when getImageDiagnostics catches more than raw regex", async () => {
    const englishPage = createMockNotionPage({
      id: "diagnostics-count-page",
      title: "Diagnostics Count",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockTranslateText.mockResolvedValue({
      markdown: `Link: https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/raw.png and https://www.notion.so/image/https%3A%2F%2Fexample.com%2Fproxied.png`,
      title: "Diagnostics Count",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 2,
      markdownMatches: 1,
      htmlMatches: 1,
      s3Matches: 2,
      s3Samples: [
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/raw.png",
        "https://www.notion.so/image/https%3A%2F%2Fexample.com%2Fproxied.png",
      ],
    });
    mockValidateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const errorLogLines = errorSpy.mock.calls.map((args) => args.join(" "));
    expect(
      errorLogLines.some((line) =>
        line.includes("still contains 2 Notion/S3 URLs")
      )
    ).toBe(true);
  });

  it("does not undercount when diagnostics detects more Notion URLs than regex raw matching", async () => {
    const englishPage = createMockNotionPage({
      id: "detector-count-page",
      title: "Detector Count",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const rawMatchedUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/raw-only.png";
    mockTranslateText.mockResolvedValue({
      markdown: `Link: ${rawMatchedUrl}`,
      title: "Detector Count",
    });
    mockGetImageDiagnostics.mockReturnValue({
      totalMatches: 3,
      markdownMatches: 3,
      htmlMatches: 0,
      s3Matches: 3,
      s3Samples: [
        rawMatchedUrl,
        "https://www.notion.so/image/https%3A%2F%2Fexample.com%2Ffoo.png",
        "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/bar.png",
      ],
    });
    mockValidateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runTranslation(englishPage)).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const errorLogLines = errorSpy.mock.calls.map((args) => args.join(" "));
    expect(
      errorLogLines.some((line) =>
        line.includes("still contains 3 Notion/S3 URLs")
      )
    ).toBe(true);
  });

  it("runs final remediation pass when translated markdown still has S3 image URLs", async () => {
    const englishPage = createMockNotionPage({
      id: "remediation-page",
      title: "Needs Remediation",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const translatedWithS3 =
      "![img](https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600)";
    const fixedMarkdown = "![img](/images/fixed_0.png)";
    mockTranslateText.mockResolvedValue({
      markdown: translatedWithS3,
      title: "Needs Remediation",
    });
    mockGetImageDiagnostics
      .mockReturnValueOnce({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 1,
        s3Samples: [translatedWithS3],
      })
      .mockReturnValueOnce({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 0,
        s3Samples: [],
      })
      .mockReturnValueOnce({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 1,
        s3Samples: [translatedWithS3],
      })
      .mockReturnValue({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 0,
        s3Samples: [],
      });
    mockValidateAndFixRemainingImages.mockResolvedValue(fixedMarkdown);

    await runTranslation(englishPage);

    expect(mockValidateAndFixRemainingImages).toHaveBeenCalledTimes(2);
    expect(mockValidateAndFixRemainingImages).toHaveBeenCalledWith(
      translatedWithS3,
      "needs-remediation-remediationpage"
    );
    expect(
      mockCreateNotionPageFromMarkdown.mock.calls.every(
        (call: unknown[]) => call[4] === fixedMarkdown
      )
    ).toBe(true);
  });

  it("skips image processing for title pages", async () => {
    const titlePage = createMockNotionPage({
      id: "title-page-1",
      title: "Section Title",
      status: "Ready for translation",
      language: "English",
      elementType: "Title",
      parentItem: "parent-1",
    });

    await runTranslation(titlePage);

    expect(mockProcessAndReplaceImages).not.toHaveBeenCalled();
    expect(mockGetImageDiagnostics).not.toHaveBeenCalled();
    expect(mockN2m.pageToMarkdown).not.toHaveBeenCalled();
  });

  it("reuses stabilized markdown across language runs for the same page", async () => {
    const englishPage = createMockNotionPage({
      id: "cache-page-1",
      title: "Cache Test",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    await runTranslation(englishPage);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledTimes(2);
  });

  it("caches and reuses markdown for pages with no images", async () => {
    const englishPage = createMockNotionPage({
      id: "no-images-page",
      title: "Text Only",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockN2m.toMarkdownString.mockReturnValue({
      parent: "Just plain text content without any images",
    });
    mockProcessAndReplaceImages.mockResolvedValue({
      markdown: "Just plain text content without any images",
      stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
      metrics: {
        totalProcessed: 0,
        skippedSmallSize: 0,
        skippedAlreadyOptimized: 0,
        skippedResize: 0,
        fullyProcessed: 0,
      },
    });

    await runTranslation(englishPage);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledTimes(2);
    expect(mockTranslateText).toHaveBeenNthCalledWith(
      1,
      "Just plain text content without any images",
      "Text Only",
      expect.any(String)
    );
    expect(mockTranslateText).toHaveBeenNthCalledWith(
      2,
      "Just plain text content without any images",
      "Text Only",
      expect.any(String)
    );
  });

  it("does not share cache between different pages", async () => {
    const page1 = createMockNotionPage({
      id: "page-1",
      title: "First Page",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    const page2 = createMockNotionPage({
      id: "page-2",
      title: "Second Page",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });
    mockN2m.toMarkdownString
      .mockResolvedValueOnce({ parent: "Content from page 1" })
      .mockResolvedValueOnce({ parent: "Content from page 2" });
    mockProcessAndReplaceImages
      .mockResolvedValueOnce({
        markdown: "Stabilized page 1",
        stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
        metrics: {
          totalProcessed: 0,
          skippedSmallSize: 0,
          skippedAlreadyOptimized: 0,
          skippedResize: 0,
          fullyProcessed: 0,
        },
      })
      .mockResolvedValueOnce({
        markdown: "Stabilized page 2",
        stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
        metrics: {
          totalProcessed: 0,
          skippedSmallSize: 0,
          skippedAlreadyOptimized: 0,
          skippedResize: 0,
          fullyProcessed: 0,
        },
      });

    await runTranslation(page1);
    await runTranslation(page2);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledTimes(2);
  });

  it("falls back correctly when cache is not provided", async () => {
    const englishPage = createMockNotionPage({
      id: "fallback-test",
      title: "Fallback Test",
      status: "Ready for translation",
      language: "English",
      parentItem: "parent-1",
      elementType: "Page",
    });

    await runTranslation(englishPage);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledTimes(2);
  });

  describe("generateSafeFilename (via processAndReplaceImages call)", () => {
    it("generates slug with page ID suffix", async () => {
      const page = createMockNotionPage({
        id: "abc-123-def",
        title: "Hello World",
        status: "Ready for translation",
        language: "English",
        parentItem: "parent-1",
        elementType: "Page",
      });

      await runTranslation(page);

      expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
        expect.any(String),
        "hello-world-abc123def"
      );
    });

    it("handles special characters in title", async () => {
      const page = createMockNotionPage({
        id: "page-id-1",
        title: "Héllo Wörld",
        status: "Ready for translation",
        language: "English",
        parentItem: "parent-1",
        elementType: "Page",
      });

      await runTranslation(page);

      expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
        expect.any(String),
        "hllo-wrld-pageid1"
      );
    });

    it("uses untitled fallback for empty title", async () => {
      const page = createMockNotionPage({
        id: "page-id-2",
        title: "",
        status: "Ready for translation",
        language: "English",
        parentItem: "parent-1",
        elementType: "Page",
      });

      await runTranslation(page);

      expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
        expect.any(String),
        "untitled-pageid2"
      );
    });

    it("truncates long titles to MAX_SLUG_LENGTH", async () => {
      const page = createMockNotionPage({
        id: "page-id-3",
        title: "a".repeat(100),
        status: "Ready for translation",
        language: "English",
        parentItem: "parent-1",
        elementType: "Page",
      });

      await runTranslation(page);

      const [, safeFilename] = mockProcessAndReplaceImages.mock.calls[0];
      const slugPart = String(safeFilename).split("-pageid3")[0];
      expect(slugPart.length).toBeLessThanOrEqual(50);
    });
  });
});
