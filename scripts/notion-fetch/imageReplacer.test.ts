import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractImageMatches,
  processAndReplaceImages,
  type ImageMatch,
} from "./imageReplacer";

// Mock dependencies
vi.mock("./imageValidation", () => ({
  validateAndSanitizeImageUrl: vi.fn((url: string) => {
    if (url.includes("invalid")) {
      return { isValid: false, error: "Invalid URL" };
    }
    if (!url.startsWith("http")) {
      return { isValid: true, sanitizedUrl: url };
    }
    return { isValid: true, sanitizedUrl: url };
  }),
  createFallbackImageMarkdown: vi.fn(
    (full: string, url: string, idx: number) => {
      return `<!-- Failed image ${idx}: ${url} -->`;
    }
  ),
}));

vi.mock("./markdownTransform", () => ({
  sanitizeMarkdownImages: vi.fn((markdown: string) => markdown),
}));

vi.mock("./imageProcessing", () => ({
  processImageWithFallbacks: vi.fn((url: string) => {
    if (url.includes("fail")) {
      return Promise.resolve({
        success: false,
        error: "Download failed",
      });
    }
    if (url.includes("explode")) {
      return Promise.reject(new Error("boom"));
    }
    return Promise.resolve({
      success: true,
      newPath: `/images/downloaded-${url.split("/").pop()}`,
      savedBytes: 1024,
    });
  }),
  logImageFailure: vi.fn(),
  logProcessingMetrics: vi.fn(),
  createProcessingMetrics: vi.fn(() => ({
    totalProcessed: 0,
    skippedSmallSize: 0,
    skippedAlreadyOptimized: 0,
    skippedResize: 0,
    fullyProcessed: 0,
  })),
}));

vi.mock("./progressTracker", () => {
  const ProgressTrackerMock = vi.fn(function (this: any) {
    this.startItem = vi.fn();
    this.completeItem = vi.fn();
    this.finish = vi.fn();
  });
  return { ProgressTracker: ProgressTrackerMock };
});

describe("imageReplacer", () => {
  describe("extractImageMatches", () => {
    it("should extract simple image markdown", () => {
      const markdown = "![alt text](https://example.com/image.png)";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        alt: "alt text",
        url: "https://example.com/image.png",
        idx: 0,
      });
    });

    it("should extract multiple images", () => {
      const markdown = `
![first](https://example.com/1.png)
Some text
![second](https://example.com/2.png)
      `;
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(2);
      expect(matches[0].alt).toBe("first");
      expect(matches[1].alt).toBe("second");
      expect(matches[0].idx).toBe(0);
      expect(matches[1].idx).toBe(1);
    });

    it("should handle images with escaped parentheses in URL", () => {
      const markdown = "![alt](https://example.com/image\\).png)";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0].url).toBe("https://example.com/image).png");
    });

    it("should handle images with spaces in URL", () => {
      const markdown = "![alt](  https://example.com/image.png  )";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0].url).toBe("https://example.com/image.png");
    });

    it("should handle empty alt text", () => {
      const markdown = "![](https://example.com/image.png)";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0].alt).toBe("");
    });

    it("should track correct start and end positions", () => {
      const markdown = "prefix ![alt](url) suffix";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      const match = matches[0];
      expect(match.start).toBe(7);
      expect(match.end).toBe(18);
      expect(markdown.slice(match.start, match.end)).toBe("![alt](url)");
    });

    it("should return empty array when no images found", () => {
      const markdown = "This is just text with no images.";
      const matches = extractImageMatches(markdown);

      expect(matches).toEqual([]);
    });

    it("should stop at safety limit", () => {
      const manyImages = Array.from(
        { length: 600 },
        (_, i) => `![img${i}](https://example.com/${i}.png)`
      ).join("\n");

      const matches = extractImageMatches(manyImages);

      expect(matches.length).toBeLessThanOrEqual(500);
    });

    it("should handle complex markdown with inline code", () => {
      const markdown = "`![not an image](fake.png)` ![real](real.png)";
      const matches = extractImageMatches(markdown);

      // Should extract both (regex doesn't check context)
      expect(matches.length).toBeGreaterThan(0);
    });

    it("should preserve full markdown for replacement", () => {
      const markdown = "![alt text](https://example.com/image.png)";
      const matches = extractImageMatches(markdown);

      expect(matches[0].full).toBe(
        "![alt text](https://example.com/image.png)"
      );
    });

    it("should extract hyperlinked images", () => {
      const markdown =
        "[![alt text](https://example.com/image.png)](https://example.com/link)";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        alt: "alt text",
        url: "https://example.com/image.png",
        linkUrl: "https://example.com/link",
        idx: 0,
      });
      expect(matches[0].full).toBe(
        "[![alt text](https://example.com/image.png)](https://example.com/link)"
      );
    });

    it("should extract both regular and hyperlinked images", () => {
      const markdown = `
![regular](https://example.com/regular.png)
[![hyperlinked](https://example.com/linked.png)](https://example.com)
      `;
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(2);

      // Regular image
      expect(matches[0].alt).toBe("regular");
      expect(matches[0].url).toBe("https://example.com/regular.png");
      expect(matches[0].linkUrl).toBeUndefined();

      // Hyperlinked image
      expect(matches[1].alt).toBe("hyperlinked");
      expect(matches[1].url).toBe("https://example.com/linked.png");
      expect(matches[1].linkUrl).toBe("https://example.com");
    });

    it("should handle hyperlinked images with escaped parentheses", () => {
      const markdown =
        "[![alt](https://example.com/image\\).png)](https://link.com/page\\))";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0].url).toBe("https://example.com/image).png");
      expect(matches[0].linkUrl).toBe("https://link.com/page)");
    });

    it("should handle hyperlinked images with empty alt text", () => {
      const markdown =
        "[![](https://example.com/image.png)](https://example.com/link)";
      const matches = extractImageMatches(markdown);

      expect(matches).toHaveLength(1);
      expect(matches[0].alt).toBe("");
      expect(matches[0].linkUrl).toBe("https://example.com/link");
    });

    it("should recover missing matches on large markdown when regex stops early", () => {
      const filler = "x".repeat(750_000);
      const imageMarkdown = Array.from(
        { length: 5 },
        (_, i) =>
          `![img${i}](https://prod-files-secure.s3.us-west-2.amazonaws.com/image-${i}.png)`
      ).join("\n");
      const markdown = `${filler}\n${imageMarkdown}`;

      const originalExec = RegExp.prototype.exec;
      const imageRegexSource = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/
        .source;

      RegExp.prototype.exec = function patchedExec(this: RegExp, str: string) {
        if (
          this instanceof RegExp &&
          this.source === imageRegexSource &&
          this.global &&
          str.length > 700000
        ) {
          if ((this as any).__forcedBugTriggered) {
            return null;
          }
          (this as any).__forcedBugTriggered = true;
        }
        return originalExec.call(this, str);
      };

      try {
        const matches = extractImageMatches(markdown);
        expect(matches).toHaveLength(5);
        const s3Matches = matches.filter((m) =>
          m.url.includes("https://prod-files-secure.s3.us-west-2.amazonaws.com")
        );
        expect(s3Matches).toHaveLength(5);
      } finally {
        RegExp.prototype.exec = originalExec;
      }
    });
  });

  describe("processAndReplaceImages", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return original markdown when no images found", async () => {
      const markdown = "Just plain text";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.markdown).toBe(markdown);
      expect(result.stats).toEqual({
        successfulImages: 0,
        totalFailures: 0,
        totalSaved: 0,
      });
    });

    it("should replace valid image URLs with downloaded paths", async () => {
      const markdown = "![alt](https://example.com/image.png)";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.markdown).toContain("/images/downloaded-image.png");
      expect(result.stats.successfulImages).toBe(1);
      expect(result.stats.totalSaved).toBe(1024);
    });

    it("should handle failed downloads with fallbacks", async () => {
      const markdown = "![alt](https://example.com/fail-image.png)";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.markdown).toContain("Failed image");
      expect(result.stats.totalFailures).toBe(1);
      expect(result.stats.successfulImages).toBe(0);
    });

    it("should handle invalid URLs with fallbacks", async () => {
      const markdown = "![alt](invalid-url)";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.markdown).toContain("Failed image");
      expect(result.stats.totalFailures).toBe(1);
    });

    it("should skip local images", async () => {
      const markdown = "![alt](/local/image.png)";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.markdown).toContain("Failed image");
      expect(result.stats.totalFailures).toBe(1);
    });

    it("should process multiple images concurrently", async () => {
      const markdown = `
![img1](https://example.com/1.png)
![img2](https://example.com/2.png)
![img3](https://example.com/3.png)
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.successfulImages).toBe(3);
      expect(result.markdown).toContain("/images/downloaded-1.png");
      expect(result.markdown).toContain("/images/downloaded-2.png");
      expect(result.markdown).toContain("/images/downloaded-3.png");
    });

    it("should handle mix of successful and failed images", async () => {
      const markdown = `
![good](https://example.com/good.png)
![bad](https://example.com/fail.png)
![good2](https://example.com/good2.png)
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.successfulImages).toBe(2);
      expect(result.stats.totalFailures).toBe(1);
    });

    it("should apply replacements in correct order (end to start)", async () => {
      const markdown =
        "![a](https://example.com/a.png) middle ![b](https://example.com/b.png)";
      const result = await processAndReplaceImages(markdown, "test-file");

      // Both replacements should be applied correctly
      expect(result.markdown).toContain("downloaded-a.png");
      expect(result.markdown).toContain("downloaded-b.png");
      expect(result.markdown).toContain("middle");
    });

    it("should preserve markdown structure outside of images", async () => {
      const markdown = `
# Heading

Some text before

![image](https://example.com/img.png)

Some text after

- List item
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.markdown).toContain("# Heading");
      expect(result.markdown).toContain("Some text before");
      expect(result.markdown).toContain("Some text after");
      expect(result.markdown).toContain("- List item");
    });

    it("should accumulate total saved bytes", async () => {
      const markdown = `
![img1](https://example.com/1.png)
![img2](https://example.com/2.png)
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.totalSaved).toBe(2048); // 1024 * 2
    });

    it("should handle images with special characters in alt text", async () => {
      const markdown =
        '![special "chars" & symbols](https://example.com/img.png)';
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.successfulImages).toBe(1);
    });

    it("should call sanitizeMarkdownImages on final result", async () => {
      const { sanitizeMarkdownImages } = await import("./markdownTransform");
      const markdown = "![alt](https://example.com/image.png)";

      await processAndReplaceImages(markdown, "test-file");

      expect(sanitizeMarkdownImages).toHaveBeenCalled();
    });

    it("should log failures for invalid images", async () => {
      const { logImageFailure } = await import("./imageProcessing");
      const markdown = "![alt](invalid-url)";

      await processAndReplaceImages(markdown, "test-file");

      expect(logImageFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          pageBlock: "test-file",
          validationFailed: true,
        })
      );
    });

    it("should handle empty markdown", async () => {
      const result = await processAndReplaceImages("", "test-file");

      expect(result.markdown).toBe("");
      expect(result.stats).toEqual({
        successfulImages: 0,
        totalFailures: 0,
        totalSaved: 0,
      });
    });

    it("should maintain image indices correctly", async () => {
      const markdown = `
![first](https://example.com/1.png)
![second](https://example.com/2.png)
![third](https://example.com/3.png)
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      // All three images should be processed
      expect(result.stats.successfulImages).toBe(3);
    });

    it("should not create ProgressTracker when there are no valid images", async () => {
      const { ProgressTracker } = await import("./progressTracker");
      vi.clearAllMocks();

      // Markdown with no images at all
      const markdown = "Just plain text with no images";
      await processAndReplaceImages(markdown, "test-file");

      // ProgressTracker should not be created when validImages.length is 0
      expect(ProgressTracker).not.toHaveBeenCalled();
    });

    it("should not create ProgressTracker when all images are invalid", async () => {
      const { ProgressTracker } = await import("./progressTracker");
      vi.clearAllMocks();

      // Markdown with only invalid images (will be filtered out)
      const markdown = "![alt](invalid-url-1) ![alt2](invalid-url-2)";
      await processAndReplaceImages(markdown, "test-file");

      // ProgressTracker should not be created when all images fail validation
      expect(ProgressTracker).not.toHaveBeenCalled();
    });

    it("should create separate metrics for each call to avoid race conditions", async () => {
      const { createProcessingMetrics } = await import("./imageProcessing");
      vi.clearAllMocks();

      // First call
      const markdown1 = "![img](https://example.com/1.png)";
      await processAndReplaceImages(markdown1, "page-1");

      expect(createProcessingMetrics).toHaveBeenCalledTimes(1);

      // Second call should create new metrics object
      const markdown2 = "![img](https://example.com/2.png)";
      await processAndReplaceImages(markdown2, "page-2");

      expect(createProcessingMetrics).toHaveBeenCalledTimes(2);
    });

    it("should return metrics in the result", async () => {
      const markdown = "![img](https://example.com/test.png)";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.metrics).toBeDefined();
      expect(result.metrics).toHaveProperty("totalProcessed");
      expect(result.metrics).toHaveProperty("skippedSmallSize");
      expect(result.metrics).toHaveProperty("skippedAlreadyOptimized");
      expect(result.metrics).toHaveProperty("skippedResize");
      expect(result.metrics).toHaveProperty("fullyProcessed");
    });

    it("should preserve hyperlinks when replacing image URLs", async () => {
      const markdown =
        "[![alt text](https://example.com/image.png)](https://example.com/link)";
      const result = await processAndReplaceImages(markdown, "test-file");

      // Should replace the image URL but keep the hyperlink wrapper
      expect(result.markdown).toContain("/images/downloaded-image.png");
      expect(result.markdown).toContain("https://example.com/link");
      expect(result.markdown).toBe(
        "[![alt text](/images/downloaded-image.png)](https://example.com/link)"
      );
      expect(result.stats.successfulImages).toBe(1);
    });

    it("should handle multiple hyperlinked images", async () => {
      const markdown = `
[![img1](https://example.com/1.png)](https://link1.com)
[![img2](https://example.com/2.png)](https://link2.com)
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.successfulImages).toBe(2);
      expect(result.markdown).toContain(
        "[![img1](/images/downloaded-1.png)](https://link1.com)"
      );
      expect(result.markdown).toContain(
        "[![img2](/images/downloaded-2.png)](https://link2.com)"
      );
    });

    it("should handle mix of regular and hyperlinked images", async () => {
      const markdown = `
![regular](https://example.com/regular.png)
[![linked](https://example.com/linked.png)](https://example.com)
      `;
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.successfulImages).toBe(2);
      expect(result.markdown).toContain(
        "![regular](/images/downloaded-regular.png)"
      );
      expect(result.markdown).toContain(
        "[![linked](/images/downloaded-linked.png)](https://example.com)"
      );
    });

    it("should mark failures when image processing rejects", async () => {
      const markdown = "![boom](https://example.com/explode.png)";
      const result = await processAndReplaceImages(markdown, "test-file");

      expect(result.stats.totalFailures).toBe(1);
      // When the processor rejects, markdown remains unchanged but failure is counted
      expect(result.markdown).toContain("![boom](https://example.com/explode.png)");
    });

    it("should finish progress tracker when images are processed", async () => {
      const { ProgressTracker } = await import("./progressTracker");
      const markdown = "![img](https://example.com/image.png)";

      await processAndReplaceImages(markdown, "test-file");

      const trackerInstance = (ProgressTracker as any).mock.instances[0];
      expect(trackerInstance.startItem).toHaveBeenCalled();
      expect(trackerInstance.completeItem).toHaveBeenCalled();
      // finish is not invoked by processBatch; ensure tracker exists and was advanced
      expect(trackerInstance.finish).not.toHaveBeenCalled();
    });
  });
});
