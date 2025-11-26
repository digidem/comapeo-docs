import { describe, it, expect } from "vitest";
import {
  validateAndSanitizeImageUrl,
  createFallbackImageMarkdown,
} from "./imageValidation";

describe("imageValidation", () => {
  describe("validateAndSanitizeImageUrl", () => {
    it("should validate correct HTTPS URLs", () => {
      const result = validateAndSanitizeImageUrl(
        "https://example.com/image.png"
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com/image.png");
      expect(result.error).toBeUndefined();
    });

    it("should validate correct HTTP URLs", () => {
      const result = validateAndSanitizeImageUrl(
        "http://example.com/image.jpg"
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe("http://example.com/image.jpg");
    });

    it("should trim whitespace from URLs", () => {
      const result = validateAndSanitizeImageUrl(
        "  https://example.com/image.png  "
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com/image.png");
    });

    it("should reject empty strings", () => {
      const result = validateAndSanitizeImageUrl("");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL is empty after trimming");
    });

    it("should reject whitespace-only strings", () => {
      const result = validateAndSanitizeImageUrl("   ");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL is empty after trimming");
    });

    it("should reject null input", () => {
      const result = validateAndSanitizeImageUrl(null as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL is empty or not a string");
    });

    it("should reject undefined input", () => {
      const result = validateAndSanitizeImageUrl(undefined as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL is empty or not a string");
    });

    it("should reject non-string input", () => {
      const result = validateAndSanitizeImageUrl(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL is empty or not a string");
    });

    it("should reject literal 'undefined' string", () => {
      const result = validateAndSanitizeImageUrl("undefined");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL contains literal undefined/null");
    });

    it("should reject literal 'null' string", () => {
      const result = validateAndSanitizeImageUrl("null");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("URL contains literal undefined/null");
    });

    it("should reject invalid protocols", () => {
      const result = validateAndSanitizeImageUrl("ftp://example.com/image.png");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid protocol: ftp:");
    });

    it("should reject file:// protocol", () => {
      const result = validateAndSanitizeImageUrl("file:///path/to/image.png");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid protocol: file:");
    });

    it("should reject javascript: protocol", () => {
      const result = validateAndSanitizeImageUrl("javascript:alert('xss')");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid protocol: javascript:");
    });

    it("should reject malformed URLs", () => {
      const result = validateAndSanitizeImageUrl("not a url at all");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid URL format");
    });

    it("should reject URLs with invalid characters", () => {
      const result = validateAndSanitizeImageUrl("https://exam ple.com/image");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid URL format");
    });

    it("should accept URLs with query parameters", () => {
      const result = validateAndSanitizeImageUrl(
        "https://example.com/image.png?size=large&format=png"
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe(
        "https://example.com/image.png?size=large&format=png"
      );
    });

    it("should accept URLs with fragments", () => {
      const result = validateAndSanitizeImageUrl(
        "https://example.com/image.png#section"
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com/image.png#section");
    });

    it("should accept URLs with ports", () => {
      const result = validateAndSanitizeImageUrl(
        "https://example.com:8080/image.png"
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com:8080/image.png");
    });

    it("should accept URLs with authentication", () => {
      const result = validateAndSanitizeImageUrl(
        "https://user:pass@example.com/image.png"
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe(
        "https://user:pass@example.com/image.png"
      );
    });
  });

  describe("createFallbackImageMarkdown", () => {
    it("should create fallback with extracted alt text", () => {
      const original = "![My Image](https://example.com/image.png)";
      const url = "https://example.com/image.png";
      const result = createFallbackImageMarkdown(original, url, 0);

      expect(result).toContain("<!-- Failed to download image:");
      expect(result).toContain(url);
      expect(result).toContain("**[Image 1: My Image]**");
      expect(result).toContain("*(Image failed to download)*");
    });

    it("should use default alt text when none provided", () => {
      const original = "![](https://example.com/image.png)";
      const url = "https://example.com/image.png";
      const result = createFallbackImageMarkdown(original, url, 2);

      expect(result).toContain("**[Image 3: Image 3]**");
    });

    it("should handle complex alt text", () => {
      const original =
        "![Screenshot of the settings page](https://example.com/image.png)";
      const url = "https://example.com/image.png";
      const result = createFallbackImageMarkdown(original, url, 5);

      expect(result).toContain(
        "**[Image 6: Screenshot of the settings page]**"
      );
    });

    it("should include URL in HTML comment", () => {
      const original = "![Test](https://example.com/test.png)";
      const url = "https://example.com/test.png";
      const result = createFallbackImageMarkdown(original, url, 0);

      expect(result).toContain("<!-- Failed to download image:");
      expect(result).toContain("https://example.com/test.png");
      expect(result).toContain("-->");
    });

    it("should number images correctly with 1-based index", () => {
      expect(createFallbackImageMarkdown("![](url)", "url", 0)).toContain(
        "Image 1"
      );
      expect(createFallbackImageMarkdown("![](url)", "url", 5)).toContain(
        "Image 6"
      );
      expect(createFallbackImageMarkdown("![](url)", "url", 99)).toContain(
        "Image 100"
      );
    });

    it("should create multi-line output with comment and placeholder", () => {
      const result = createFallbackImageMarkdown(
        "![Test](url)",
        "https://example.com/image.png",
        0
      );
      const lines = result.split("\n");

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain("<!--");
      expect(lines[1]).toContain("**[Image");
    });

    it("should handle alt text with special characters", () => {
      const original =
        "![Image with & and : chars](https://example.com/img.png)";
      const url = "https://example.com/img.png";
      const result = createFallbackImageMarkdown(original, url, 0);

      expect(result).toContain("Image with & and : chars");
    });

    it("should handle alt text with brackets", () => {
      const original = "![Image [with] brackets](https://example.com/img.png)";
      const url = "https://example.com/img.png";
      const result = createFallbackImageMarkdown(original, url, 0);

      expect(result).toContain("Image [with");
    });
  });
});
