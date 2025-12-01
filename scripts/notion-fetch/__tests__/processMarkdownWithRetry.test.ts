import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { installTestNotionEnv } from "../../test-utils";

// Mock all external dependencies
vi.mock("../imageReplacer", () => ({
  processAndReplaceImages: vi.fn(),
  validateAndFixRemainingImages: vi.fn(),
  hasS3Urls: vi.fn(),
  getImageDiagnostics: vi.fn(),
}));

vi.mock("../markdownTransform", () => ({
  processCalloutsInMarkdown: vi.fn((content) => content),
}));

vi.mock("../emojiProcessor", () => ({
  EmojiProcessor: {
    applyEmojiMappings: vi.fn((content) => content),
    processPageEmojis: vi.fn((pageId, content) =>
      Promise.resolve({
        content: content || "",
        totalSaved: 0,
        processedCount: 0,
      })
    ),
  },
}));

describe("processMarkdownWithRetry", () => {
  let restoreEnv: () => void;
  let processAndReplaceImages: Mock;
  let validateAndFixRemainingImages: Mock;
  let hasS3Urls: Mock;
  let getImageDiagnostics: Mock;
  let processMarkdownWithRetry: any;

  beforeEach(async () => {
    restoreEnv = installTestNotionEnv();
    vi.clearAllMocks();

    // Import mocked functions
    const imageReplacer = await import("../imageReplacer");
    processAndReplaceImages = imageReplacer.processAndReplaceImages as Mock;
    validateAndFixRemainingImages =
      imageReplacer.validateAndFixRemainingImages as Mock;
    hasS3Urls = imageReplacer.hasS3Urls as Mock;
    getImageDiagnostics = imageReplacer.getImageDiagnostics as Mock;

    // Import the function we're testing
    try {
      const markdownRetryProcessor = await import("../markdownRetryProcessor");
      processMarkdownWithRetry =
        markdownRetryProcessor.processMarkdownWithRetry;
    } catch (error) {
      // Should not fail - function should exist in dedicated module
      processMarkdownWithRetry = undefined;
    }
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("first attempt success (no retries needed)", () => {
    it("should process content successfully on first attempt when no S3 URLs remain", async () => {
      // This test will fail because processMarkdownWithRetry doesn't exist yet
      expect(processMarkdownWithRetry).toBeDefined();

      const initialContent = "# Test\n\n![image](/images/local.png)";
      const pageContext = {
        pageId: "test-page-id",
        pageTitle: "Test Page",
        safeFilename: "test-page",
      };
      const rawBlocks: any[] = [];
      const emojiMap = new Map<string, string>();

      // Mock: No S3 URLs in processed content
      processAndReplaceImages.mockResolvedValue({
        markdown: initialContent,
        stats: {
          successfulImages: 1,
          totalFailures: 0,
          totalSaved: 1024,
        },
      });
      validateAndFixRemainingImages.mockResolvedValue(initialContent);
      hasS3Urls.mockReturnValue(false);
      getImageDiagnostics.mockReturnValue({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 0,
        s3Samples: [],
      });

      const result = await processMarkdownWithRetry(
        initialContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      expect(result.content).toBe(initialContent);
      expect(result.totalSaved).toBe(1024);
      expect(result.fallbackEmojiCount).toBe(0);
      expect(result.containsS3).toBe(false);
      expect(result.retryAttempts).toBe(0); // No retries needed
      expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
    });
  });

  describe("retry behavior", () => {
    it("should retry when S3 URLs remain after first attempt", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const initialContent =
        "# Test\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";
      const partiallyFixedContent =
        "# Test\n\n![s3-partial](https://prod-files-secure.s3.us-west-2.amazonaws.com/image2.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";
      const fullyFixedContent = "# Test\n\n![local](/images/fixed.png)";

      const pageContext = {
        pageId: "retry-page-id",
        pageTitle: "Retry Test Page",
        safeFilename: "retry-test-page",
      };
      const rawBlocks: any[] = [];
      const emojiMap = new Map<string, string>();

      // First attempt: some S3 URLs remain
      // Second attempt: all S3 URLs fixed
      let attemptCount = 0;
      processAndReplaceImages.mockImplementation(async (content: string) => {
        attemptCount++;
        if (attemptCount === 1) {
          return {
            markdown: partiallyFixedContent,
            stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
          };
        }
        return {
          markdown: fullyFixedContent,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 2048 },
        };
      });

      validateAndFixRemainingImages.mockImplementation(
        async (content: string) => content
      );

      hasS3Urls.mockImplementation((content: string) => {
        return content.includes("s3.us-west-2.amazonaws.com");
      });

      getImageDiagnostics.mockImplementation((content: string) => {
        const hasS3 = content.includes("s3.us-west-2.amazonaws.com");
        return {
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: hasS3 ? 1 : 0,
          s3Samples: hasS3
            ? ["https://prod-files-secure.s3.us-west-2.amazonaws.com/..."]
            : [],
        };
      });

      const result = await processMarkdownWithRetry(
        initialContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      expect(result.content).toBe(fullyFixedContent);
      expect(result.containsS3).toBe(false);
      expect(result.retryAttempts).toBe(1); // 1 retry (2 total attempts)
      expect(processAndReplaceImages).toHaveBeenCalledTimes(2);
    });

    it("should stop retrying when content is identical (no progress)", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const stuckContent =
        "# Test\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/stuck.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";

      const pageContext = {
        pageId: "stuck-page-id",
        pageTitle: "Stuck Page",
        safeFilename: "stuck-page",
      };
      const rawBlocks: any[] = [];
      const emojiMap = new Map<string, string>();

      // Always returns the same content (no progress)
      processAndReplaceImages.mockResolvedValue({
        markdown: stuckContent,
        stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
      });

      validateAndFixRemainingImages.mockResolvedValue(stuckContent);
      hasS3Urls.mockReturnValue(true);
      getImageDiagnostics.mockReturnValue({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 1,
        s3Samples: ["https://prod-files-secure.s3.us-west-2.amazonaws.com/..."],
      });

      const result = await processMarkdownWithRetry(
        stuckContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      // Should abort after detecting no progress
      expect(result.containsS3).toBe(true);
      expect(result.retryAttempts).toBe(1); // 1 retry attempt made before detecting no progress
      // Should have called pipeline once on first attempt, then detected identical on increment
      expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
    });
  });

  describe("max attempts enforcement", () => {
    it("should stop at MAX_IMAGE_REFRESH_ATTEMPTS when S3 URLs persist", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const persistentS3Content =
        "# Test\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/persistent.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";

      const pageContext = {
        pageId: "persistent-page-id",
        pageTitle: "Persistent S3 Page",
        safeFilename: "persistent-page",
      };
      const rawBlocks: any[] = [];
      const emojiMap = new Map<string, string>();

      // Always returns content with different S3 URLs (making progress but never finishing)
      let attemptNum = 0;
      processAndReplaceImages.mockImplementation(async () => {
        attemptNum++;
        return {
          markdown: `# Test\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/image${attemptNum}.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)`,
          stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
        };
      });

      validateAndFixRemainingImages.mockImplementation(
        async (content: string) => content
      );
      hasS3Urls.mockReturnValue(true);
      getImageDiagnostics.mockReturnValue({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 1,
        s3Samples: ["https://prod-files-secure.s3.us-west-2.amazonaws.com/..."],
      });

      const result = await processMarkdownWithRetry(
        persistentS3Content,
        pageContext,
        rawBlocks,
        emojiMap
      );

      // Should stop at exactly MAX_IMAGE_REFRESH_ATTEMPTS (default 3)
      expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
      expect(result.containsS3).toBe(true);
      expect(result.retryAttempts).toBe(2); // 2 retries (3 total attempts)
    });
  });

  describe("error handling and configuration", () => {
    it("should surface errors from processAndReplaceImages", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const boom = new Error("pipeline failed");
      processAndReplaceImages.mockRejectedValue(boom);

      await expect(
        processMarkdownWithRetry(
          "![img](https://example.com/img.png)",
          { pageId: "err", pageTitle: "Err", safeFilename: "err" },
          [],
          new Map()
        )
      ).rejects.toThrow("pipeline failed");
    });

    it("should honor MAX_IMAGE_RETRIES env override", async () => {
      expect(processMarkdownWithRetry).toBeDefined();
      process.env.MAX_IMAGE_RETRIES = "2";

      const stuckContent =
        "![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/stuck.png?X-Amz-Expires=1)";

      processAndReplaceImages.mockResolvedValue({
        markdown: stuckContent,
        stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
      });
      validateAndFixRemainingImages.mockResolvedValue(stuckContent);
      hasS3Urls.mockReturnValue(true);
      getImageDiagnostics.mockReturnValue({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 1,
        s3Samples: ["https://prod-files-secure.s3.us-west-2.amazonaws.com/..."],
      });

      const result = await processMarkdownWithRetry(
        stuckContent,
        { pageId: "env", pageTitle: "Env", safeFilename: "env" },
        [],
        new Map()
      );

      expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
      expect(result.retryAttempts).toBe(1); // one retry attempt allowed by env override

      delete process.env.MAX_IMAGE_RETRIES;
    });
  });

  describe("retry metrics tracking", () => {
    it("should return correct retry attempt count", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const initialContent =
        "# Test\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";
      const fixedContent = "# Test\n\n![local](/images/fixed.png)";

      const pageContext = {
        pageId: "metrics-page-id",
        pageTitle: "Metrics Test Page",
        safeFilename: "metrics-page",
      };
      const rawBlocks: any[] = [];
      const emojiMap = new Map<string, string>();

      // Fail twice, succeed on third attempt
      let attemptCount = 0;
      processAndReplaceImages.mockImplementation(async (content: string) => {
        attemptCount++;
        if (attemptCount < 3) {
          return {
            markdown: `${initialContent}-attempt-${attemptCount}`, // Different content each time
            stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
          };
        }
        return {
          markdown: fixedContent,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 3072 },
        };
      });

      validateAndFixRemainingImages.mockImplementation(
        async (content: string) => content
      );

      hasS3Urls.mockImplementation((content: string) =>
        content.includes("s3.us-west-2.amazonaws.com")
      );

      getImageDiagnostics.mockImplementation((content: string) => {
        const hasS3 = content.includes("s3.us-west-2.amazonaws.com");
        return {
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: hasS3 ? 1 : 0,
          s3Samples: hasS3
            ? ["https://prod-files-secure.s3.us-west-2.amazonaws.com/..."]
            : [],
        };
      });

      const result = await processMarkdownWithRetry(
        initialContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      expect(result.retryAttempts).toBe(2); // 2 retries = 3 total attempts
      expect(result.totalSaved).toBe(3072);
      expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
    });
  });

  describe("content transformations", () => {
    it("should preserve all content transformation steps", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const initialContent = "# Test\n\n![image](/images/test.png)";
      const pageContext = {
        pageId: "transform-page-id",
        pageTitle: "Transform Test Page",
        safeFilename: "transform-page",
      };
      const rawBlocks = [
        {
          type: "callout",
          callout: {
            rich_text: [{ plain_text: "Test callout" }],
            icon: { emoji: "💡" },
          },
        },
      ];
      const emojiMap = new Map<string, string>([["test-emoji", "😀"]]);

      processAndReplaceImages.mockResolvedValue({
        markdown: initialContent,
        stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
      });
      validateAndFixRemainingImages.mockResolvedValue(initialContent);
      hasS3Urls.mockReturnValue(false);
      getImageDiagnostics.mockReturnValue({
        totalMatches: 1,
        markdownMatches: 1,
        htmlMatches: 0,
        s3Matches: 0,
        s3Samples: [],
      });

      const markdownTransform = await import("../markdownTransform");
      const processCalloutsInMarkdown =
        markdownTransform.processCalloutsInMarkdown as Mock;

      const emojiProcessor = await import("../emojiProcessor");
      const applyEmojiMappings = emojiProcessor.EmojiProcessor
        .applyEmojiMappings as Mock;

      const result = await processMarkdownWithRetry(
        initialContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      // Verify all transformation functions were called
      expect(processCalloutsInMarkdown).toHaveBeenCalledWith(
        initialContent,
        rawBlocks
      );
      expect(processAndReplaceImages).toHaveBeenCalled();
      expect(applyEmojiMappings).toHaveBeenCalledWith(
        expect.any(String),
        emojiMap
      );
      expect(validateAndFixRemainingImages).toHaveBeenCalled();

      expect(result.content).toBeDefined();
      expect(result.totalSaved).toBeGreaterThanOrEqual(0);
    });
  });
});
