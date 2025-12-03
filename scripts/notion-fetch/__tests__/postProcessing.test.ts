import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  processAndReplaceImages,
  validateAndFixRemainingImages,
} from "../imageReplacer";
import { processImageWithFallbacks } from "../imageProcessing";

// Mock dependencies
vi.mock("../imageProcessing", () => ({
  processImageWithFallbacks: vi.fn(),
  createProcessingMetrics: vi.fn(() => ({})),
  logProcessingMetrics: vi.fn(),
  logImageFailure: vi.fn(),
}));

vi.mock("../imageValidation", () => ({
  validateAndSanitizeImageUrl: vi.fn((url) => ({
    isValid: true,
    sanitizedUrl: url,
  })),
  createFallbackImageMarkdown: vi.fn((full, url) => full), // Fallback keeps original
}));

vi.mock("../markdownTransform", () => ({
  sanitizeMarkdownImages: vi.fn((md) => md),
}));

vi.mock("../timeoutUtils", () => ({
  processBatch: vi.fn(async (items, processor) => {
    // Simple pass-through for testing
    const results = [];
    for (const item of items) {
      results.push({ status: "fulfilled", value: await processor(item) });
    }
    return results;
  }),
}));

describe("Final Pass Image Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect and fix remaining S3 URLs", async () => {
    const s3Url =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/test-image.jpg";
    const markdown = `Here is an image: ![Alt](${s3Url})`;
    const safeFilename = "test-page";

    // First pass simulation: mock failure (fallback used)
    // This simulates the state BEFORE the final pass
    // In the actual code, processAndReplaceImages returns the markdown.
    // If it failed, it returned markdown with the original URL.

    // Now we test validateAndFixRemainingImages
    // We mock processImageWithFallbacks to SUCCEED this time
    const { processImageWithFallbacks } = await import("../imageProcessing");
    (processImageWithFallbacks as any).mockResolvedValue({
      success: true,
      newPath: "/images/fixed.jpg",
      savedBytes: 100,
      fallbackUsed: false,
    });

    const result = await validateAndFixRemainingImages(markdown, safeFilename);

    // Expect the URL to be replaced
    expect(result).toContain("/images/fixed.jpg");
    expect(result).not.toContain(s3Url);
    expect(processImageWithFallbacks).toHaveBeenCalled();
  });

  it("should not modify markdown if no S3 URLs are present", async () => {
    const markdown = "Here is a local image: ![Alt](/images/local.jpg)";
    const safeFilename = "test-page";

    const { processImageWithFallbacks } = await import("../imageProcessing");

    const result = await validateAndFixRemainingImages(markdown, safeFilename);

    expect(result).toBe(markdown);
    expect(processImageWithFallbacks).not.toHaveBeenCalled();
  });

  it("should handle multiple S3 URLs", async () => {
    const s3Url1 =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.jpg";
    const s3Url2 =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/img2.jpg";
    const markdown = `![1](${s3Url1}) and ![2](${s3Url2})`;
    const safeFilename = "test-page";

    const { processImageWithFallbacks } = await import("../imageProcessing");
    (processImageWithFallbacks as any).mockImplementation(async (url) => ({
      success: true,
      newPath: url.includes("img1") ? "/images/1.jpg" : "/images/2.jpg",
      savedBytes: 100,
      fallbackUsed: false,
    }));

    const result = await validateAndFixRemainingImages(markdown, safeFilename);

    expect(result).toContain("/images/1.jpg");
    expect(result).toContain("/images/2.jpg");
    expect(result).not.toContain("amazonaws.com");
  });

  describe("Edge Case: Partial Failures", () => {
    it("should replace successful URLs and keep failed URLs", async () => {
      const s3Url1 =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/success.jpg";
      const s3Url2 =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/fail.jpg";
      const markdown = `![Success](${s3Url1}) ![Fail](${s3Url2})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockImplementation(async (url) => {
        if (url.includes("success")) {
          return {
            success: true,
            newPath: "/images/success.jpg",
            savedBytes: 100,
            fallbackUsed: false,
          };
        } else {
          return {
            success: false,
            error: "Download failed",
            fallbackUsed: true,
          };
        }
      });

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      // Successful URL should be replaced
      expect(result).toContain("/images/success.jpg");
      // Failed URL should remain (or be handled by fallback)
      expect(processImageWithFallbacks).toHaveBeenCalledTimes(2);
    });

    it("should handle all failures gracefully", async () => {
      const s3Url1 =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/fail1.jpg";
      const s3Url2 =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/fail2.jpg";
      const markdown = `![1](${s3Url1}) ![2](${s3Url2})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockResolvedValue({
        success: false,
        error: "Network error",
        fallbackUsed: true,
      });

      // Should not throw, should return markdown (possibly with fallbacks)
      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });

  describe("Edge Case: Empty and Text-Only Markdown", () => {
    it("should handle empty markdown", async () => {
      const markdown = "";
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toBe("");
      expect(processImageWithFallbacks).not.toHaveBeenCalled();
    });

    it("should handle markdown with only whitespace", async () => {
      const markdown = "   \n\n   \t   ";
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toBe(markdown);
      expect(processImageWithFallbacks).not.toHaveBeenCalled();
    });

    it("should handle markdown with only text (no images)", async () => {
      const markdown =
        "# Heading\n\nSome text without any images.\n\n## Another section";
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toBe(markdown);
      expect(processImageWithFallbacks).not.toHaveBeenCalled();
    });
  });

  describe("Edge Case: Invalid and Encoded URLs", () => {
    it("should handle S3 URLs with special characters", async () => {
      const s3Url =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/image%20with%20spaces.jpg";
      const markdown = `![Alt](${s3Url})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockResolvedValue({
        success: true,
        newPath: "/images/encoded.jpg",
        savedBytes: 100,
        fallbackUsed: false,
      });

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toContain("/images/encoded.jpg");
      // Function is called with: (url, blockName, imageIndex, fullMatch, existingLocalPaths)
      expect(processImageWithFallbacks).toHaveBeenCalledWith(
        expect.stringContaining("image%20with%20spaces.jpg"),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should handle malformed S3 URLs gracefully", async () => {
      const malformedUrl =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/";
      const markdown = `![Alt](${malformedUrl})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockResolvedValue({
        success: false,
        error: "Invalid URL",
        fallbackUsed: true,
      });

      // Should not throw
      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toBeDefined();
    });

    it("should handle S3 URLs with query parameters", async () => {
      const s3Url =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/img.jpg?X-Amz-Signature=abc123";
      const markdown = `![Alt](${s3Url})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockResolvedValue({
        success: true,
        newPath: "/images/with-query.jpg",
        savedBytes: 100,
        fallbackUsed: false,
      });

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toContain("/images/with-query.jpg");
      expect(result).not.toContain("X-Amz-Signature");
    });
  });

  describe("Edge Case: Mixed URL Types", () => {
    it("should only process S3 URLs and leave local URLs untouched", async () => {
      const s3Url =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/remote.jpg";
      const localUrl = "/images/local.jpg";
      const markdown = `![Remote](${s3Url}) ![Local](${localUrl})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockResolvedValue({
        success: true,
        newPath: "/images/fixed-remote.jpg",
        savedBytes: 100,
        fallbackUsed: false,
      });

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      // S3 URL should be replaced
      expect(result).toContain("/images/fixed-remote.jpg");
      expect(result).not.toContain("amazonaws.com");

      // Local URL should remain unchanged
      expect(result).toContain(localUrl);

      // Only S3 URL should be processed
      expect(processImageWithFallbacks).toHaveBeenCalledTimes(1);
    });

    it("should handle external non-S3 URLs correctly", async () => {
      const s3Url =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/s3.jpg";
      const externalUrl = "https://example.com/external.jpg";
      const markdown = `![S3](${s3Url}) ![External](${externalUrl})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      let callCount = 0;
      (processImageWithFallbacks as any).mockImplementation(
        async (url: string) => {
          callCount++;
          return {
            success: true,
            newPath: `/images/processed-${callCount}.jpg`,
            savedBytes: 100,
            fallbackUsed: false,
          };
        }
      );

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      // The function processes all remaining image URLs during final pass validation
      // Both URLs will be processed, but S3 detection happens in the calling code
      expect(processImageWithFallbacks).toHaveBeenCalled();

      // Result should contain processed images
      expect(result).toContain("/images/processed");
    });
  });

  describe("Edge Case: Large Batches", () => {
    it("should handle 20+ S3 URLs efficiently", async () => {
      const urls = Array.from(
        { length: 25 },
        (_, i) =>
          `https://prod-files-secure.s3.us-west-2.amazonaws.com/img${i}.jpg`
      );
      const markdown = urls.map((url, i) => `![${i}](${url})`).join(" ");
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");
      (processImageWithFallbacks as any).mockImplementation(async (url) => ({
        success: true,
        newPath: `/images/${url.match(/img(\d+)\.jpg/)?.[1]}.jpg`,
        savedBytes: 100,
        fallbackUsed: false,
      }));

      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      // All URLs should be processed
      expect(processImageWithFallbacks).toHaveBeenCalledTimes(25);

      // No S3 URLs should remain
      expect(result).not.toContain("amazonaws.com");

      // All images should be replaced with local paths
      for (let i = 0; i < 25; i++) {
        expect(result).toContain(`/images/${i}.jpg`);
      }
    });
  });

  describe("Edge Case: Retry Exhaustion", () => {
    it("should handle persistent failures after retries", async () => {
      const s3Url =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/persistent-fail.jpg";
      const markdown = `![Fail](${s3Url})`;
      const safeFilename = "test-page";

      const { processImageWithFallbacks } = await import("../imageProcessing");

      // Simulate exhausted retries
      (processImageWithFallbacks as any).mockResolvedValue({
        success: false,
        error: "Max retries exceeded",
        fallbackUsed: true,
      });

      // Should not throw, should handle gracefully
      const result = await validateAndFixRemainingImages(
        markdown,
        safeFilename
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });
});
