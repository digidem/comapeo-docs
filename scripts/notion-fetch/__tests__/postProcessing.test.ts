
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processAndReplaceImages, validateAndFixRemainingImages } from "../imageReplacer";
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
    const s3Url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/test-image.jpg";
    const markdown = `Here is an image: ![Alt](${s3Url})`;
    const safeFilename = "test-page";

    // First pass simulation: mock failure (fallback used)
    // This simulates the state BEFORE the final pass
    // In the actual code, processAndReplaceImages returns the markdown.
    // If it failed, it returned markdown with the original URL.

    // Now we test validateAndFixRemainingImages
    // We mock processImageWithFallbacks to SUCCEED this time
    const { processImageWithFallbacks } = await import("../imageProcessing");
    vi.mocked(processImageWithFallbacks).mockResolvedValue({
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
    const s3Url1 = "https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.jpg";
    const s3Url2 = "https://prod-files-secure.s3.us-west-2.amazonaws.com/img2.jpg";
    const markdown = `![1](${s3Url1}) and ![2](${s3Url2})`;
    const safeFilename = "test-page";

    const { processImageWithFallbacks } = await import("../imageProcessing");
    vi.mocked(processImageWithFallbacks).mockImplementation(async (url) => ({
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
});
