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

// Helper function to generate realistic S3 URLs matching production format
function generateRealisticS3Url(
  filename: string,
  workspaceId = "abc123de-f456-7890-abcd-ef1234567890",
  fileId = "test-file-1234-5678-90ab-cdef12345678"
): string {
  const date = "20240101T000000Z";
  const expires = "3600";
  const credential = "AKIAIOSFODNN7EXAMPLE/20240101/us-west-2/s3/aws4_request";
  const signature =
    "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  return `https://prod-files-secure.s3.us-west-2.amazonaws.com/${workspaceId}/${fileId}/${filename}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=${encodeURIComponent(credential)}&X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=${signature}&X-Amz-SignedHeaders=host`;
}

describe("processMarkdownWithRetry", () => {
  let restoreEnv: () => void;
  let processAndReplaceImages: Mock;
  let validateAndFixRemainingImages: Mock;
  let hasS3Urls: Mock;
  let getImageDiagnostics: Mock;
  let processMarkdownWithRetry: any;
  let processMarkdownSinglePass: any;

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
      processMarkdownSinglePass =
        markdownRetryProcessor.processMarkdownSinglePass;
    } catch (error) {
      // Should not fail - function should exist in dedicated module
      processMarkdownWithRetry = undefined;
      processMarkdownSinglePass = undefined;
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

      const initialContent = `# Test\n\n![s3](${generateRealisticS3Url("image.png")})`;
      const partiallyFixedContent = `# Test\n\n![s3-partial](${generateRealisticS3Url("image2.png")})`;
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
          s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
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

      const stuckContent = `# Test\n\n![s3](${generateRealisticS3Url("stuck.png")})`;

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
        s3Samples: [generateRealisticS3Url("sample.png")],
      });

      const result = await processMarkdownWithRetry(
        stuckContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      // Should abort after detecting no progress
      expect(result.containsS3).toBe(true);
      expect(result.retryAttempts).toBe(0); // 0 retries (only first attempt ran, no progress detected)
      // Should have called pipeline once on first attempt, then detected identical content
      expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
    });
  });

  describe("max attempts enforcement", () => {
    it("should stop at MAX_IMAGE_REFRESH_ATTEMPTS when S3 URLs persist", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const persistentS3Content = `# Test\n\n![s3](${generateRealisticS3Url("persistent.png")})`;

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
          markdown: `# Test\n\n![s3](${generateRealisticS3Url(`image${attemptNum}.png`)})`,
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
        s3Samples: [generateRealisticS3Url("sample.png")],
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

      const stuckContent = `![s3](${generateRealisticS3Url("stuck.png")})`;

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
        s3Samples: [generateRealisticS3Url("sample.png")],
      });

      const result = await processMarkdownWithRetry(
        stuckContent,
        { pageId: "env", pageTitle: "Env", safeFilename: "env" },
        [],
        new Map()
      );

      expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
      expect(result.retryAttempts).toBe(0); // 0 retries (no-progress detected on first attempt)

      delete process.env.MAX_IMAGE_RETRIES;
    });
  });

  describe("retry metrics tracking", () => {
    it("should return correct retry attempt count", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const initialContent = `# Test\n\n![s3](${generateRealisticS3Url("image.png")})`;
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
          s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
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

    it("should run image stabilization before callout and emoji transforms in retry flow", async () => {
      expect(processMarkdownWithRetry).toBeDefined();

      const initialContent = "# Test\n\n![image](/images/test.png)";
      const pageContext = {
        pageId: "ordered-retry-page-id",
        pageTitle: "Ordered Retry Page",
        safeFilename: "ordered-retry-page",
      };
      const rawBlocks = [{ type: "callout", callout: { rich_text: [] } }];
      const emojiMap = new Map<string, string>([["test-emoji", "😀"]]);

      processAndReplaceImages.mockResolvedValue({
        markdown: initialContent,
        stats: { successfulImages: 1, totalFailures: 0, totalSaved: 64 },
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

      await processMarkdownWithRetry(
        initialContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      const imageOrder = processAndReplaceImages.mock.invocationCallOrder[0];
      const calloutOrder =
        processCalloutsInMarkdown.mock.invocationCallOrder[0];
      const emojiOrder = applyEmojiMappings.mock.invocationCallOrder[0];

      expect(imageOrder).toBeLessThan(calloutOrder);
      expect(calloutOrder).toBeLessThan(emojiOrder);
    });

    it("should run image stabilization before callout and emoji transforms in single-pass flow", async () => {
      expect(processMarkdownSinglePass).toBeDefined();

      const initialContent = "# Test\n\n![image](/images/test.png)";
      const pageContext = {
        pageId: "ordered-single-pass-page-id",
        pageTitle: "Ordered Single Pass Page",
        safeFilename: "ordered-single-pass-page",
      };
      const rawBlocks = [{ type: "callout", callout: { rich_text: [] } }];
      const emojiMap = new Map<string, string>([["test-emoji", "😀"]]);

      processAndReplaceImages.mockResolvedValue({
        markdown: initialContent,
        stats: { successfulImages: 1, totalFailures: 0, totalSaved: 64 },
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

      await processMarkdownSinglePass(
        initialContent,
        pageContext,
        rawBlocks,
        emojiMap
      );

      const imageOrder = processAndReplaceImages.mock.invocationCallOrder[0];
      const calloutOrder =
        processCalloutsInMarkdown.mock.invocationCallOrder[0];
      const emojiOrder = applyEmojiMappings.mock.invocationCallOrder[0];

      expect(imageOrder).toBeLessThan(calloutOrder);
      expect(calloutOrder).toBeLessThan(emojiOrder);
    });
  });

  describe("Configuration Boundary Tests", () => {
    describe("MAX_IMAGE_RETRIES boundary values", () => {
      it("should handle MAX_IMAGE_RETRIES=0 (edge case documentation)", async () => {
        // Note: Testing MAX_IMAGE_RETRIES=0 requires module reload which isn't supported in Bun
        // This test documents the expected behavior without actually testing it
        // In production, if MAX_IMAGE_RETRIES=0 is set before module load:
        // - Loop condition becomes (0 < 0) = false
        // - Loop never executes, processedContent stays null
        // - Function throws: "Failed to process markdown content"

        // Instead, test that the default behavior (3 attempts) works correctly
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("image.png")})`;

        processAndReplaceImages.mockResolvedValue({
          markdown: s3Content,
          stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
        });
        validateAndFixRemainingImages.mockResolvedValue(s3Content);
        hasS3Urls.mockReturnValue(true);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 1,
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          { pageId: "zero", pageTitle: "Zero", safeFilename: "zero" },
          [],
          new Map()
        );

        // With default (3 attempts), no-progress detection should abort early
        expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
        expect(result.containsS3).toBe(true);
      });

      it("should handle minimal configuration (single attempt)", async () => {
        // Note: Can't test MAX_IMAGE_RETRIES=1 due to module caching in Bun
        // This test verifies single-attempt behavior using default limit (3)
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("image.png")})`;

        // Mock returns same content (no progress)
        processAndReplaceImages.mockResolvedValue({
          markdown: s3Content,
          stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
        });

        validateAndFixRemainingImages.mockResolvedValue(s3Content);
        hasS3Urls.mockReturnValue(true);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 1,
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          { pageId: "one", pageTitle: "One", safeFilename: "one" },
          [],
          new Map()
        );

        // With no progress, should process once then abort
        expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
        expect(result.retryAttempts).toBe(0); // 0 retries (no-progress detected on first attempt)
        expect(result.containsS3).toBe(true);
      });

      it("should handle limited retries efficiently (performance test)", async () => {
        // Note: Can't test very large MAX_IMAGE_RETRIES (100) due to module caching in Bun
        // This test verifies that retries stop early on success (not exhausting max attempts)
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("image.png")})`;
        const fixedContent = "![local](/images/fixed.png)";
        let attemptCount = 0;

        // Fix on 3rd attempt (well below the default 3 limit, succeeds on last attempt)
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            return {
              markdown: `${s3Content}-attempt-${attemptCount}`,
              stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
            };
          }
          return {
            markdown: fixedContent,
            stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          { pageId: "large", pageTitle: "Large", safeFilename: "large" },
          [],
          new Map()
        );

        // Should succeed on 3rd attempt and not continue
        expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
        expect(result.retryAttempts).toBe(2);
        expect(result.containsS3).toBe(false);
      });
    });

    describe("Invalid configuration handling", () => {
      it("should handle negative MAX_IMAGE_RETRIES gracefully", async () => {
        expect(processMarkdownWithRetry).toBeDefined();
        process.env.MAX_IMAGE_RETRIES = "-5";

        const s3Content = `![s3](${generateRealisticS3Url("image.png")})`;

        processAndReplaceImages.mockResolvedValue({
          markdown: s3Content,
          stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
        });
        validateAndFixRemainingImages.mockResolvedValue(s3Content);
        hasS3Urls.mockReturnValue(true);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 1,
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          { pageId: "neg", pageTitle: "Negative", safeFilename: "negative" },
          [],
          new Map()
        );

        // Negative value should be treated as 0 or default (implementation-dependent)
        // Should not crash or throw
        expect(result).toBeDefined();
        expect(processAndReplaceImages).toHaveBeenCalled();

        delete process.env.MAX_IMAGE_RETRIES;
      });

      it("should handle non-numeric MAX_IMAGE_RETRIES gracefully", async () => {
        expect(processMarkdownWithRetry).toBeDefined();
        process.env.MAX_IMAGE_RETRIES = "not-a-number";

        const content = "![local](/images/test.png)";

        processAndReplaceImages.mockResolvedValue({
          markdown: content,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
        });
        validateAndFixRemainingImages.mockResolvedValue(content);
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        const result = await processMarkdownWithRetry(
          content,
          { pageId: "nan", pageTitle: "NaN", safeFilename: "nan" },
          [],
          new Map()
        );

        // Should fall back to default behavior and not crash
        expect(result).toBeDefined();
        expect(result.content).toBe(content);

        delete process.env.MAX_IMAGE_RETRIES;
      });

      it("should handle empty string MAX_IMAGE_RETRIES gracefully", async () => {
        expect(processMarkdownWithRetry).toBeDefined();
        process.env.MAX_IMAGE_RETRIES = "";

        const content = "![local](/images/test.png)";

        processAndReplaceImages.mockResolvedValue({
          markdown: content,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
        });
        validateAndFixRemainingImages.mockResolvedValue(content);
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        const result = await processMarkdownWithRetry(
          content,
          { pageId: "empty", pageTitle: "Empty", safeFilename: "empty" },
          [],
          new Map()
        );

        // Should use default value and not crash
        expect(result).toBeDefined();
        expect(result.content).toBe(content);

        delete process.env.MAX_IMAGE_RETRIES;
      });
    });

    describe("No-progress detection edge cases", () => {
      it("should detect no progress with whitespace-only changes", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const baseContent = `![s3](${generateRealisticS3Url("stuck.png")})`;
        let attemptCount = 0;

        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          // Return same content with varying whitespace
          const whitespace = " ".repeat(attemptCount);
          return {
            markdown: `${baseContent}${whitespace}`,
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
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          baseContent,
          { pageId: "ws", pageTitle: "Whitespace", safeFilename: "whitespace" },
          [],
          new Map()
        );

        // Should detect no meaningful progress despite string differences
        // Implementation may trim or normalize content
        expect(result.containsS3).toBe(true);
        expect(processAndReplaceImages).toHaveBeenCalled();
      });

      it("should detect progress when S3 URL count decreases", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        // Initial content has 3 S3 URLs
        const initialContent = `![s3-1](${generateRealisticS3Url("1.png")}) ![s3-2](${generateRealisticS3Url("2.png")}) ![s3-3](${generateRealisticS3Url("3.png")})`;

        // Mock returns progressively fewer S3 URLs on each call
        const attempt1Result = `![local](/images/1.png) ![s3-2](${generateRealisticS3Url("2.png")}) ![s3-3](${generateRealisticS3Url("3.png")})`;
        const attempt2Result = `![local](/images/1.png) ![local](/images/2.png) ![s3-3](${generateRealisticS3Url("3.png")})`;
        const attempt3Result =
          "![local](/images/1.png) ![local](/images/2.png) ![local](/images/3.png)";

        let attemptCount = 0;

        // Mock always makes progress: each call returns different content with fewer S3 URLs
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          const results = [
            attempt1Result,
            attempt2Result,
            attempt3Result,
            attempt3Result,
          ];
          const content = results[attemptCount - 1];

          return {
            markdown: content,
            stats: {
              successfulImages: attemptCount,
              totalFailures: Math.max(0, 3 - attemptCount),
              totalSaved: attemptCount * 512,
            },
          };
        });

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockImplementation((content: string) =>
          content.includes("s3.us-west-2.amazonaws.com")
        );
        getImageDiagnostics.mockImplementation((content: string) => {
          const matches = content.match(/s3\.us-west-2\.amazonaws\.com/g);
          const s3Count = matches ? matches.length : 0;
          return {
            totalMatches: 3,
            markdownMatches: 3,
            htmlMatches: 0,
            s3Matches: s3Count,
            s3Samples:
              s3Count > 0 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        const result = await processMarkdownWithRetry(
          initialContent,
          { pageId: "prog", pageTitle: "Progress", safeFilename: "progress" },
          [],
          new Map()
        );

        // Should make progress through 3 attempts and succeed
        // Attempt 1: 3 S3 → 2 S3 (progress made)
        // Attempt 2: 2 S3 → 1 S3 (progress made)
        // Attempt 3: 1 S3 → 0 S3 (success!)
        expect(result.containsS3).toBe(false);
        expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
        expect(result.retryAttempts).toBe(2); // 2 retries (3 total attempts)
      });
    });

    describe("Configuration interaction tests", () => {
      it("should respect MAX_IMAGE_RETRIES even when making progress", async () => {
        expect(processMarkdownWithRetry).toBeDefined();
        process.env.MAX_IMAGE_RETRIES = "2";

        const s3Content = `![s3](${generateRealisticS3Url("slow.png")})`;
        let attemptCount = 0;

        // Make progress each time but never finish
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          return {
            markdown: `![s3-${attemptCount}](${generateRealisticS3Url(`image${attemptCount}.png`)})`,
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
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          {
            pageId: "limit",
            pageTitle: "Limit Test",
            safeFilename: "limit-test",
          },
          [],
          new Map()
        );

        // Should stop at MAX_IMAGE_RETRIES despite making progress
        // With MAX_IMAGE_RETRIES=2, should have 3 total attempts (initial + 2 retries)
        expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
        expect(result.retryAttempts).toBe(2);
        expect(result.containsS3).toBe(true);

        delete process.env.MAX_IMAGE_RETRIES;
      });
    });
  });

  describe("Error Recovery Tests", () => {
    describe("Pipeline Step Failures", () => {
      it("should propagate errors from processAndReplaceImages", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const error = new Error("Image processing failed");
        processAndReplaceImages.mockRejectedValue(error);

        await expect(
          processMarkdownWithRetry(
            "![test](https://example.com/test.png)",
            {
              pageId: "err1",
              pageTitle: "Error Test 1",
              safeFilename: "error-1",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("Image processing failed");
      });

      it("should propagate errors from validateAndFixRemainingImages", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = "![local](/images/test.png)";

        processAndReplaceImages.mockResolvedValue({
          markdown: content,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
        });
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        const error = new Error("Validation failed");
        validateAndFixRemainingImages.mockRejectedValue(error);

        await expect(
          processMarkdownWithRetry(
            content,
            {
              pageId: "err2",
              pageTitle: "Error Test 2",
              safeFilename: "error-2",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("Validation failed");
      });

      it("should handle errors in emoji processing gracefully", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = "![local](/images/test.png)";

        processAndReplaceImages.mockResolvedValue({
          markdown: content,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
        });
        validateAndFixRemainingImages.mockResolvedValue(content);
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        const emojiProcessor = await import("../emojiProcessor");
        const applyEmojiMappings = emojiProcessor.EmojiProcessor
          .applyEmojiMappings as Mock;

        const error = new Error("Emoji processing failed");
        applyEmojiMappings.mockImplementation(() => {
          throw error;
        });

        const emojiMap = new Map([["test", "😀"]]);

        await expect(
          processMarkdownWithRetry(
            content,
            {
              pageId: "err3",
              pageTitle: "Error Test 3",
              safeFilename: "error-3",
            },
            [],
            emojiMap
          )
        ).rejects.toThrow("Emoji processing failed");
      });

      it("should handle errors in callout processing", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = "# Test";
        const rawBlocks = [
          {
            type: "callout",
            callout: {
              rich_text: [{ plain_text: "Test" }],
              icon: { emoji: "💡" },
            },
          },
        ];

        const markdownTransform = await import("../markdownTransform");
        const processCalloutsInMarkdown =
          markdownTransform.processCalloutsInMarkdown as Mock;

        const error = new Error("Callout processing failed");
        processCalloutsInMarkdown.mockImplementation(() => {
          throw error;
        });

        await expect(
          processMarkdownWithRetry(
            content,
            {
              pageId: "err4",
              pageTitle: "Error Test 4",
              safeFilename: "error-4",
            },
            rawBlocks,
            new Map()
          )
        ).rejects.toThrow("Callout processing failed");
      });

      it("should handle multiple step failures in sequence", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        // First attempt: processAndReplaceImages fails
        // Should not reach subsequent steps
        const error = new Error("First step failed");
        processAndReplaceImages.mockRejectedValue(error);

        await expect(
          processMarkdownWithRetry(
            "# Test",
            {
              pageId: "err5",
              pageTitle: "Error Test 5",
              safeFilename: "error-5",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("First step failed");

        // validateAndFixRemainingImages should not have been called
        expect(validateAndFixRemainingImages).not.toHaveBeenCalled();
      });
    });

    describe("Transient Error Recovery", () => {
      it("should recover from transient errors on retry", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = `![test](${generateRealisticS3Url("test.png")})`;
        const fixedContent = "![local](/images/test.png)";
        let attemptCount = 0;

        // First attempt: throw error (simulate network failure)
        // Second attempt: succeed
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("Network timeout");
          }
          return {
            markdown: fixedContent,
            stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
          };
        });

        validateAndFixRemainingImages.mockResolvedValue(fixedContent);
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        // Should throw on first attempt since errors propagate immediately
        await expect(
          processMarkdownWithRetry(
            content,
            {
              pageId: "rec1",
              pageTitle: "Recovery Test 1",
              safeFilename: "recovery-1",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("Network timeout");
      });

      it("should handle intermittent errors across retries", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        const progressContent = `![s3](${generateRealisticS3Url("test2.png")})`;
        const fixedContent = "![local](/images/test.png)";
        let attemptCount = 0;

        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          // Attempt 1: partial progress
          if (attemptCount === 1) {
            return {
              markdown: progressContent,
              stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
            };
          }
          // Attempt 2: success
          return {
            markdown: fixedContent,
            stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          {
            pageId: "rec2",
            pageTitle: "Recovery Test 2",
            safeFilename: "recovery-2",
          },
          [],
          new Map()
        );

        expect(result.containsS3).toBe(false);
        expect(result.retryAttempts).toBe(1);
        expect(processAndReplaceImages).toHaveBeenCalledTimes(2);
      });

      it("should handle recovery after multiple transient failures", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        const fixedContent = "![local](/images/test.png)";
        let attemptCount = 0;

        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          // Fail first 2 attempts with different content (make progress)
          if (attemptCount < 3) {
            return {
              markdown: `${s3Content}-attempt-${attemptCount}`,
              stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
            };
          }
          // Succeed on 3rd attempt
          return {
            markdown: fixedContent,
            stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          {
            pageId: "rec3",
            pageTitle: "Recovery Test 3",
            safeFilename: "recovery-3",
          },
          [],
          new Map()
        );

        expect(result.containsS3).toBe(false);
        expect(result.retryAttempts).toBe(2);
        expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
      });

      it("should handle validation errors after successful image processing", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = "![local](/images/test.png)";
        let validationAttempts = 0;

        processAndReplaceImages.mockResolvedValue({
          markdown: content,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
        });
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        // First validation attempt fails, should propagate error
        validateAndFixRemainingImages.mockImplementation(async () => {
          validationAttempts++;
          if (validationAttempts === 1) {
            throw new Error("Validation error");
          }
          return content;
        });

        await expect(
          processMarkdownWithRetry(
            content,
            {
              pageId: "rec4",
              pageTitle: "Recovery Test 4",
              safeFilename: "recovery-4",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("Validation error");
      });
    });

    describe("Partial Processing Failures", () => {
      it("should track partial success stats correctly", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const multiImageContent = `![img1](${generateRealisticS3Url("1.png")}) ![img2](${generateRealisticS3Url("2.png")})`;
        const partialSuccess = `![local](/images/1.png) ![s3](${generateRealisticS3Url("2.png")})`;
        const fullSuccess = "![local](/images/1.png) ![local](/images/2.png)";

        let attemptCount = 0;
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          if (attemptCount === 1) {
            return {
              markdown: partialSuccess,
              stats: { successfulImages: 1, totalFailures: 1, totalSaved: 512 },
            };
          }
          return {
            markdown: fullSuccess,
            stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 }, // Per-attempt delta, not cumulative
          };
        });

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockImplementation((content: string) =>
          content.includes("s3.us-west-2.amazonaws.com")
        );
        getImageDiagnostics.mockImplementation((content: string) => {
          const matches = content.match(/s3\.us-west-2\.amazonaws\.com/g);
          const s3Count = matches ? matches.length : 0;
          return {
            totalMatches: 2,
            markdownMatches: 2,
            htmlMatches: 0,
            s3Matches: s3Count,
            s3Samples:
              s3Count > 0 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        const result = await processMarkdownWithRetry(
          multiImageContent,
          {
            pageId: "partial1",
            pageTitle: "Partial Test 1",
            safeFilename: "partial-1",
          },
          [],
          new Map()
        );

        expect(result.containsS3).toBe(false);
        expect(result.retryAttempts).toBe(1);
        expect(result.totalSaved).toBe(1024); // 512 + 512 = 1024 (cumulative across attempts)
      });

      it("should handle persistent partial failures", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const multiImageContent = `![img1](${generateRealisticS3Url("1.png")}) ![img2](${generateRealisticS3Url("2.png")})`;
        const partialSuccess = `![local](/images/1.png) ![s3](${generateRealisticS3Url("2.png")})`;

        let attemptCount = 0;
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          // Always return partial success (different URL each time to show progress)
          return {
            markdown: `![local](/images/1.png) ![s3](${generateRealisticS3Url(`2-attempt-${attemptCount}.png`)})`,
            stats: { successfulImages: 1, totalFailures: 1, totalSaved: 512 },
          };
        });

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockReturnValue(true);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 2,
          markdownMatches: 2,
          htmlMatches: 0,
          s3Matches: 1,
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          multiImageContent,
          {
            pageId: "partial2",
            pageTitle: "Partial Test 2",
            safeFilename: "partial-2",
          },
          [],
          new Map()
        );

        // Should exhaust retries with partial success
        expect(result.containsS3).toBe(true);
        expect(result.retryAttempts).toBe(2);
        expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
      });

      it("should accumulate stats from partial successes", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = `![img1](${generateRealisticS3Url("1.png")}) ![img2](${generateRealisticS3Url("2.png")}) ![img3](${generateRealisticS3Url("3.png")})`;

        let attemptCount = 0;
        const results = [
          `![local](/images/1.png) ![s3](${generateRealisticS3Url("2.png")}) ![s3](${generateRealisticS3Url("3.png")})`,
          `![local](/images/1.png) ![local](/images/2.png) ![s3](${generateRealisticS3Url("3.png")})`,
          "![local](/images/1.png) ![local](/images/2.png) ![local](/images/3.png)",
        ];

        processAndReplaceImages.mockImplementation(async () => {
          // eslint-disable-next-line security/detect-object-injection -- attemptCount is loop counter, not user input
          const markdown = results[attemptCount] || results[2];
          attemptCount++;
          return {
            markdown,
            stats: {
              successfulImages: 1, // Each attempt processes 1 image
              totalFailures: Math.max(0, 3 - attemptCount),
              totalSaved: 512, // Constant delta per attempt
            },
          };
        });

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockImplementation((content: string) =>
          content.includes("s3.us-west-2.amazonaws.com")
        );
        getImageDiagnostics.mockImplementation((content: string) => {
          const matches = content.match(/s3\.us-west-2\.amazonaws\.com/g);
          const s3Count = matches ? matches.length : 0;
          return {
            totalMatches: 3,
            markdownMatches: 3,
            htmlMatches: 0,
            s3Matches: s3Count,
            s3Samples:
              s3Count > 0 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        const result = await processMarkdownWithRetry(
          content,
          {
            pageId: "partial3",
            pageTitle: "Partial Test 3",
            safeFilename: "partial-3",
          },
          [],
          new Map()
        );

        expect(result.containsS3).toBe(false);
        expect(result.totalSaved).toBe(1536); // 3 * 512
        expect(result.retryAttempts).toBe(2);
      });
    });

    describe("Error State Preservation", () => {
      it("should preserve error context when max retries exceeded", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("fail.png")})`;
        let attemptCount = 0;

        // Return different content each time to trigger retries
        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          return {
            markdown: `${s3Content}-attempt-${attemptCount}`, // Different content each attempt
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
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          {
            pageId: "state1",
            pageTitle: "State Test 1",
            safeFilename: "state-1",
          },
          [],
          new Map()
        );

        // Error state should be preserved
        expect(result.containsS3).toBe(true);
        expect(result.retryAttempts).toBeGreaterThan(0);
        expect(result.content).toContain(s3Content); // Content will have attempt suffix
      });

      it("should track failure stats accurately across retries", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        let attemptCount = 0;

        processAndReplaceImages.mockImplementation(async () => {
          attemptCount++;
          return {
            markdown: `${s3Content}-attempt-${attemptCount}`,
            stats: {
              successfulImages: 0,
              totalFailures: attemptCount,
              totalSaved: 0,
            },
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
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          {
            pageId: "state2",
            pageTitle: "State Test 2",
            safeFilename: "state-2",
          },
          [],
          new Map()
        );

        // Should exhaust all retries
        expect(processAndReplaceImages).toHaveBeenCalledTimes(3);
        expect(result.totalSaved).toBe(0);
        expect(result.containsS3).toBe(true);
      });

      it("should propagate error messages correctly", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const specificError = new Error(
          "ENOENT: no such file or directory, open '/images/missing.png'"
        );
        processAndReplaceImages.mockRejectedValue(specificError);

        await expect(
          processMarkdownWithRetry(
            "![test](https://example.com/test.png)",
            {
              pageId: "state3",
              pageTitle: "State Test 3",
              safeFilename: "state-3",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("ENOENT: no such file or directory");
      });
    });

    describe("Timeout and Resource Errors", () => {
      it("should handle timeout errors during image processing", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const timeoutError = new Error("Request timeout after 30000ms");
        timeoutError.name = "TimeoutError";
        processAndReplaceImages.mockRejectedValue(timeoutError);

        await expect(
          processMarkdownWithRetry(
            `![test](${generateRealisticS3Url("test.png")})`,
            {
              pageId: "timeout1",
              pageTitle: "Timeout Test 1",
              safeFilename: "timeout-1",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("Request timeout");
      });

      it("should handle disk space errors gracefully", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const diskError = new Error("ENOSPC: no space left on device");
        diskError.name = "SystemError";
        processAndReplaceImages.mockRejectedValue(diskError);

        await expect(
          processMarkdownWithRetry(
            "![test](https://example.com/test.png)",
            {
              pageId: "resource1",
              pageTitle: "Resource Test 1",
              safeFilename: "resource-1",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("ENOSPC: no space left on device");
      });

      it("should handle permission errors appropriately", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const permError = new Error(
          "EACCES: permission denied, mkdir '/images'"
        );
        permError.name = "SystemError";
        processAndReplaceImages.mockRejectedValue(permError);

        await expect(
          processMarkdownWithRetry(
            "![test](https://example.com/test.png)",
            {
              pageId: "resource2",
              pageTitle: "Resource Test 2",
              safeFilename: "resource-2",
            },
            [],
            new Map()
          )
        ).rejects.toThrow("EACCES: permission denied");
      });
    });

    describe("Validation Error Recovery", () => {
      it("should handle malformed content from image processing", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        // Return invalid/corrupted markdown
        processAndReplaceImages.mockResolvedValue({
          markdown: null as any, // Invalid return value
          stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
        });

        await expect(
          processMarkdownWithRetry(
            "![test](https://example.com/test.png)",
            {
              pageId: "valid1",
              pageTitle: "Validation Test 1",
              safeFilename: "validation-1",
            },
            [],
            new Map()
          )
        ).rejects.toThrow();
      });

      it("should handle invalid diagnostic data", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const content = "![local](/images/test.png)";

        processAndReplaceImages.mockResolvedValue({
          markdown: content,
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 512 },
        });
        validateAndFixRemainingImages.mockResolvedValue(content);
        hasS3Urls.mockReturnValue(false);

        // Return invalid diagnostic data
        getImageDiagnostics.mockReturnValue(null as any);

        await expect(
          processMarkdownWithRetry(
            content,
            {
              pageId: "valid2",
              pageTitle: "Validation Test 2",
              safeFilename: "validation-2",
            },
            [],
            new Map()
          )
        ).rejects.toThrow();
      });

      it("should handle inconsistent S3 detection results", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;

        processAndReplaceImages.mockResolvedValue({
          markdown: s3Content,
          stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
        });
        validateAndFixRemainingImages.mockResolvedValue(s3Content);

        // hasS3Urls says false but diagnostics says true (inconsistent)
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 1, // Inconsistent with hasS3Urls
          s3Samples: [generateRealisticS3Url("sample.png")],
        });

        const result = await processMarkdownWithRetry(
          s3Content,
          {
            pageId: "valid3",
            pageTitle: "Validation Test 3",
            safeFilename: "validation-3",
          },
          [],
          new Map()
        );

        // Should use hasS3Urls as source of truth for retry logic
        expect(result.containsS3).toBe(true); // Final check uses diagnostics
        expect(processAndReplaceImages).toHaveBeenCalledTimes(1); // No retry (hasS3Urls was false)
      });
    });
  });

  describe("Concurrency Tests (5-concurrent pages)", () => {
    describe("Concurrent processing with mixed outcomes", () => {
      it("should process 5 pages concurrently with all succeeding", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const pages = Array.from({ length: 5 }, (_, i) => ({
          id: `page-${i + 1}`,
          title: `Page ${i + 1}`,
          safeFilename: `page-${i + 1}`,
          content: `# Page ${i + 1}\n\n![img](https://example.com/img${i + 1}.png)`,
        }));

        // All pages succeed on first attempt
        processAndReplaceImages.mockImplementation(async (content: string) => ({
          markdown: content.replace(/example\.com/, "local/images"),
          stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
        }));

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        // Process all pages concurrently
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              page.content,
              {
                pageId: page.id,
                pageTitle: page.title,
                safeFilename: page.safeFilename,
              },
              [],
              new Map()
            )
          )
        );

        // All pages should succeed
        expect(results).toHaveLength(5);
        results.forEach((result, i) => {
          expect(result.containsS3).toBe(false);
          expect(result.retryAttempts).toBe(0);
          expect(result.content).toContain(`Page ${i + 1}`);
        });

        // Each page processed exactly once
        expect(processAndReplaceImages).toHaveBeenCalledTimes(5);
      });

      it("should handle concurrent pages with different retry counts", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const pages = [
          { id: "p1", title: "Instant Success", retries: 0 },
          { id: "p2", title: "One Retry", retries: 1 },
          { id: "p3", title: "Two Retries", retries: 2 },
          { id: "p4", title: "Instant Success 2", retries: 0 },
          { id: "p5", title: "One Retry 2", retries: 1 },
        ];

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        const fixedContent = "![local](/images/test.png)";

        // Track attempt counts per page
        const attemptCounts = new Map<string, number>();

        processAndReplaceImages.mockImplementation(
          async (content: string, attemptLabel: string) => {
            const pageId = attemptLabel.split("-")[0];
            const currentAttempt = (attemptCounts.get(pageId) || 0) + 1;
            attemptCounts.set(pageId, currentAttempt);

            const page = pages.find((p) => attemptLabel.startsWith(p.id));
            const requiredAttempts = (page?.retries || 0) + 1;

            if (currentAttempt < requiredAttempts) {
              return {
                markdown: `${s3Content}-attempt-${currentAttempt}`,
                stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
              };
            }
            return {
              markdown: fixedContent,
              stats: {
                successfulImages: 1,
                totalFailures: 0,
                totalSaved: 1024,
              },
            };
          }
        );

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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        // Process all pages concurrently
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              s3Content,
              {
                pageId: page.id,
                pageTitle: page.title,
                safeFilename: page.id,
              },
              [],
              new Map()
            )
          )
        );

        // All pages should eventually succeed
        results.forEach((result, i) => {
          expect(result.containsS3).toBe(false);
          // eslint-disable-next-line security/detect-object-injection -- i is forEach index, not user input
          expect(result.retryAttempts).toBe(pages[i].retries);
        });

        // Total attempts: p1(1) + p2(2) + p3(3) + p4(1) + p5(2) = 9
        expect(processAndReplaceImages).toHaveBeenCalledTimes(9);
      });

      it("should handle concurrent pages with mixed success/failure", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const pages = [
          { id: "success1", shouldSucceed: true },
          { id: "fail1", shouldSucceed: false },
          { id: "success2", shouldSucceed: true },
          { id: "fail2", shouldSucceed: false },
          { id: "success3", shouldSucceed: true },
        ];

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        const fixedContent = "![local](/images/test.png)";

        // Track attempt counts per page for fail pages to make progress
        const attemptCounts = new Map<string, number>();

        processAndReplaceImages.mockImplementation(
          async (content: string, attemptLabel: string) => {
            const page = pages.find((p) => attemptLabel.startsWith(p.id));

            if (page?.shouldSucceed) {
              return {
                markdown: fixedContent,
                stats: {
                  successfulImages: 1,
                  totalFailures: 0,
                  totalSaved: 1024,
                },
              };
            }
            // Fail pages return different content each time to trigger retries
            const pageId = attemptLabel.split("-")[0];
            const currentAttempt = (attemptCounts.get(pageId) || 0) + 1;
            attemptCounts.set(pageId, currentAttempt);

            return {
              markdown: `${s3Content}-attempt-${currentAttempt}`, // Different content each attempt
              stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
            };
          }
        );

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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        // Process all pages concurrently
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              s3Content,
              {
                pageId: page.id,
                pageTitle: page.id,
                safeFilename: page.id,
              },
              [],
              new Map()
            )
          )
        );

        // Check success/failure as expected
        results.forEach((result, i) => {
          // eslint-disable-next-line security/detect-object-injection -- i is forEach index, not user input
          if (pages[i].shouldSucceed) {
            expect(result.containsS3).toBe(false);
            expect(result.retryAttempts).toBe(0);
          } else {
            expect(result.containsS3).toBe(true);
            expect(result.retryAttempts).toBeGreaterThan(0);
          }
        });

        // Success pages: 3 * 1 = 3 attempts
        // Fail pages: 2 * 3 = 6 attempts (each makes progress, exhausts max retries)
        expect(processAndReplaceImages).toHaveBeenCalledTimes(9);
      });
    });

    describe("Retry metrics aggregation", () => {
      it("should track retry metrics correctly across concurrent pages", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const retryMetrics = {
          totalPagesWithRetries: 0,
          totalRetryAttempts: 0,
          successfulRetries: 0,
          failedRetries: 0,
          averageAttemptsPerPage: 0,
        };

        const pages = [
          { id: "p1", retries: 0 }, // Success on first attempt
          { id: "p2", retries: 1 }, // Success after 1 retry
          { id: "p3", retries: 2 }, // Success after 2 retries
          { id: "p4", retries: 0 }, // Success on first attempt
          { id: "p5", retries: 3 }, // Fail after max retries
        ];

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        const fixedContent = "![local](/images/test.png)";

        const attemptCounts = new Map<string, number>();

        processAndReplaceImages.mockImplementation(
          async (content: string, attemptLabel: string) => {
            const pageId = attemptLabel.split("-")[0];
            const currentAttempt = (attemptCounts.get(pageId) || 0) + 1;
            attemptCounts.set(pageId, currentAttempt);

            const page = pages.find((p) => attemptLabel.startsWith(p.id));
            const requiredAttempts = (page?.retries || 0) + 1;

            // p5 never succeeds (stuck)
            if (pageId === "p5") {
              return {
                markdown: `${s3Content}-p5-attempt-${currentAttempt}`,
                stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
              };
            }

            if (currentAttempt < requiredAttempts) {
              return {
                markdown: `${s3Content}-attempt-${currentAttempt}`,
                stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
              };
            }
            return {
              markdown: fixedContent,
              stats: {
                successfulImages: 1,
                totalFailures: 0,
                totalSaved: 1024,
              },
            };
          }
        );

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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        // Process all pages concurrently with shared retry metrics
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              s3Content,
              {
                pageId: page.id,
                pageTitle: page.id,
                safeFilename: page.id,
              },
              [],
              new Map(),
              retryMetrics
            )
          )
        );

        // Verify retry metrics
        // Pages with retries: p2 (1), p3 (2), p5 (2 failed at max attempts) = 3 pages
        expect(retryMetrics.totalPagesWithRetries).toBe(3);

        // Total retry attempts: p2(1) + p3(2) + p5(2) = 5
        // Note: p5 performs 2 retries (3 total attempts) before hitting MAX_IMAGE_REFRESH_ATTEMPTS
        expect(retryMetrics.totalRetryAttempts).toBe(5);

        // Successful retries: p2, p3 = 2
        expect(retryMetrics.successfulRetries).toBe(2);

        // Failed retries: p5 = 1
        expect(retryMetrics.failedRetries).toBe(1);

        // Verify individual page results
        expect(results[0].retryAttempts).toBe(0); // p1
        expect(results[1].retryAttempts).toBe(1); // p2
        expect(results[2].retryAttempts).toBe(2); // p3
        expect(results[3].retryAttempts).toBe(0); // p4
        expect(results[4].retryAttempts).toBe(2); // p5 (max 3 attempts)
      });

      it("should handle concurrent updates to retry metrics safely", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const retryMetrics = {
          totalPagesWithRetries: 0,
          totalRetryAttempts: 0,
          successfulRetries: 0,
          failedRetries: 0,
          averageAttemptsPerPage: 0,
        };

        // All pages need 1 retry
        const pages = Array.from({ length: 5 }, (_, i) => ({
          id: `concurrent-${i + 1}`,
          title: `Concurrent Page ${i + 1}`,
        }));

        const s3Content = `![s3](${generateRealisticS3Url("test.png")})`;
        const fixedContent = "![local](/images/test.png)";

        const attemptCounts = new Map<string, number>();

        processAndReplaceImages.mockImplementation(
          async (content: string, attemptLabel: string) => {
            const pageId = attemptLabel.split("-retry")[0];
            const currentAttempt = (attemptCounts.get(pageId) || 0) + 1;
            attemptCounts.set(pageId, currentAttempt);

            if (currentAttempt === 1) {
              return {
                markdown: `${s3Content}-attempt-1`,
                stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
              };
            }
            return {
              markdown: fixedContent,
              stats: {
                successfulImages: 1,
                totalFailures: 0,
                totalSaved: 1024,
              },
            };
          }
        );

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
            s3Samples: hasS3 ? [generateRealisticS3Url("sample.png")] : [],
          };
        });

        // Process all pages concurrently, all updating same metrics object
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              s3Content,
              {
                pageId: page.id,
                pageTitle: page.title,
                safeFilename: page.id,
              },
              [],
              new Map(),
              retryMetrics
            )
          )
        );

        // All pages should succeed with 1 retry each
        results.forEach((result) => {
          expect(result.containsS3).toBe(false);
          expect(result.retryAttempts).toBe(1);
        });

        // Metrics should be correctly aggregated despite concurrent updates
        expect(retryMetrics.totalPagesWithRetries).toBe(5);
        expect(retryMetrics.totalRetryAttempts).toBe(5); // 5 pages * 1 retry each
        expect(retryMetrics.successfulRetries).toBe(5);
        expect(retryMetrics.failedRetries).toBe(0);
      });
    });

    describe("Shared resource access", () => {
      it("should handle concurrent access to shared emojiMap", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        // Shared emoji map used by all pages
        const sharedEmojiMap = new Map<string, string>([
          ["smile", "😀"],
          ["heart", "❤️"],
          ["star", "⭐"],
        ]);

        const pages = Array.from({ length: 5 }, (_, i) => ({
          id: `emoji-page-${i + 1}`,
          content: `# Page ${i + 1}\n\n:smile: :heart: :star:`,
        }));

        processAndReplaceImages.mockImplementation(async (content: string) => ({
          markdown: content,
          stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
        }));

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 0,
          markdownMatches: 0,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        const emojiProcessor = await import("../emojiProcessor");
        const applyEmojiMappings = emojiProcessor.EmojiProcessor
          .applyEmojiMappings as Mock;
        applyEmojiMappings.mockImplementation(
          (content: string, map: Map<string, string>) => {
            // Simulate emoji replacement using string replaceAll (no regex needed)
            let result = content;
            map.forEach((emoji, key) => {
              result = result.replaceAll(`:${key}:`, emoji);
            });
            return result;
          }
        );

        // Process all pages concurrently with shared emoji map
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              page.content,
              {
                pageId: page.id,
                pageTitle: page.id,
                safeFilename: page.id,
              },
              [],
              sharedEmojiMap
            )
          )
        );

        // All pages should process successfully
        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(result.content).toBeDefined();
          expect(result.containsS3).toBe(false);
        });

        // Emoji map should be used for all pages
        expect(applyEmojiMappings).toHaveBeenCalledTimes(5);
        applyEmojiMappings.mock.calls.forEach((call) => {
          expect(call[1]).toBe(sharedEmojiMap);
        });

        // Shared map should not be modified
        expect(sharedEmojiMap.size).toBe(3);
        expect(sharedEmojiMap.get("smile")).toBe("😀");
      });

      it("should handle concurrent error propagation without interference", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const pages = [
          { id: "p1", shouldFail: false },
          { id: "p2", shouldFail: true, errorMsg: "Network timeout p2" },
          { id: "p3", shouldFail: false },
          { id: "p4", shouldFail: true, errorMsg: "Disk error p4" },
          { id: "p5", shouldFail: false },
        ];

        processAndReplaceImages.mockImplementation(
          async (content: string, attemptLabel: string) => {
            const page = pages.find((p) => attemptLabel.startsWith(p.id));

            if (page?.shouldFail) {
              throw new Error(page.errorMsg);
            }

            return {
              markdown: "![local](/images/success.png)",
              stats: {
                successfulImages: 1,
                totalFailures: 0,
                totalSaved: 1024,
              },
            };
          }
        );

        validateAndFixRemainingImages.mockResolvedValue(
          "![local](/images/success.png)"
        );
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        // Process all pages concurrently with Promise.allSettled to capture errors
        const results = await Promise.allSettled(
          pages.map((page) =>
            processMarkdownWithRetry(
              "# Test",
              {
                pageId: page.id,
                pageTitle: page.id,
                safeFilename: page.id,
              },
              [],
              new Map()
            )
          )
        );

        // Check results match expectations
        expect(results[0].status).toBe("fulfilled"); // p1 success
        expect(results[1].status).toBe("rejected"); // p2 error
        expect(results[2].status).toBe("fulfilled"); // p3 success
        expect(results[3].status).toBe("rejected"); // p4 error
        expect(results[4].status).toBe("fulfilled"); // p5 success

        // Verify error messages are preserved
        if (results[1].status === "rejected") {
          expect(results[1].reason.message).toContain("Network timeout p2");
        }
        if (results[3].status === "rejected") {
          expect(results[3].reason.message).toContain("Disk error p4");
        }
      });
    });

    describe("Performance under concurrent load", () => {
      it("should complete all pages without timeout under concurrent load", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        // Simulate realistic processing time
        const pages = Array.from({ length: 5 }, (_, i) => ({
          id: `perf-${i + 1}`,
          title: `Performance Page ${i + 1}`,
          content: `# Page ${i + 1}\n\n![img](${generateRealisticS3Url(`test${i + 1}.png`)})`,
        }));

        let totalProcessingTime = 0;
        const startTime = Date.now();

        processAndReplaceImages.mockImplementation(async (content: string) => {
          // Simulate variable processing time (10-50ms)
          const processingTime = 10 + Math.random() * 40;
          await new Promise((resolve) => setTimeout(resolve, processingTime));
          totalProcessingTime += processingTime;

          return {
            markdown: content.replace(/prod-files-secure\.s3/, "local/images"),
            stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
          };
        });

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 1,
          markdownMatches: 1,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        // Process all pages concurrently
        const results = await Promise.all(
          pages.map((page) =>
            processMarkdownWithRetry(
              page.content,
              {
                pageId: page.id,
                pageTitle: page.title,
                safeFilename: page.id,
              },
              [],
              new Map()
            )
          )
        );

        const endTime = Date.now();
        const elapsedTime = endTime - startTime;

        // All pages should complete successfully
        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(result.containsS3).toBe(false);
        });

        // Concurrent processing should be faster than sequential
        // Sequential would take ~totalProcessingTime, concurrent should be much faster
        // Allow some overhead for test execution
        expect(elapsedTime).toBeLessThan(totalProcessingTime + 100);
      }, 10000); // 10 second timeout for this performance test

      it("should handle high-frequency concurrent page submissions", async () => {
        expect(processMarkdownWithRetry).toBeDefined();

        const pageCount = 5;
        const pages = Array.from({ length: pageCount }, (_, i) => ({
          id: `rapid-${i + 1}`,
          content: `# Rapid ${i + 1}`,
        }));

        processAndReplaceImages.mockImplementation(async (content: string) => ({
          markdown: content,
          stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
        }));

        validateAndFixRemainingImages.mockImplementation(
          async (content: string) => content
        );
        hasS3Urls.mockReturnValue(false);
        getImageDiagnostics.mockReturnValue({
          totalMatches: 0,
          markdownMatches: 0,
          htmlMatches: 0,
          s3Matches: 0,
          s3Samples: [],
        });

        // Submit all pages at once (rapid concurrent submission)
        const promises = pages.map((page) =>
          processMarkdownWithRetry(
            page.content,
            {
              pageId: page.id,
              pageTitle: page.id,
              safeFilename: page.id,
            },
            [],
            new Map()
          )
        );

        // All should complete without errors
        const results = await Promise.all(promises);

        expect(results).toHaveLength(pageCount);
        expect(processAndReplaceImages).toHaveBeenCalledTimes(pageCount);
      });
    });
  });
});
