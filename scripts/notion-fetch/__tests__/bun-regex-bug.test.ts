import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Tests to replicate and validate workarounds for Bun's regex bug
 * where regex.exec() and matchAll() return 0 matches on large strings (700KB+)
 *
 * Issue: When processing large markdown files with embedded images,
 * the image detection regex fails in Bun but works in Node.js
 */

describe("Bun Regex Bug Replication", () => {
  const IMAGE_REGEX = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
  let largeMarkdownContent: string;
  let testFilePath: string;

  beforeAll(() => {
    // Create a large markdown string similar to what we get from Notion
    // This should be 700KB+ to trigger the Bun bug
    const baseContent = `# Test Document\n\nSome content here.\n\n`;

    // Add a large base64 image (simulate real Notion output)
    const largeBase64 = "data:image/png;base64," + "iVBORw0KGgo".repeat(100000); // ~700KB
    const imageWithBase64 = `![Large embedded image](${largeBase64})\n\n`;

    // Add several S3 URLs (the ones we need to detect and replace)
    const s3Images = [
      `![Screenshot 1](https://prod-files-secure.s3.us-west-2.amazonaws.com/c1033c29-9030-4781-b626-4cc/image1.png)\n`,
      `![Screenshot 2](https://prod-files-secure.s3.us-west-2.amazonaws.com/c1033c29-9030-4781-b626-4cc/image2.png)\n`,
      `![Screenshot 3](https://prod-files-secure.s3.us-west-2.amazonaws.com/c1033c29-9030-4781-b626-4cc/image3.png)\n`,
      `![Screenshot 4](https://prod-files-secure.s3.us-west-2.amazonaws.com/c1033c29-9030-4781-b626-4cc/image4.png)\n`,
      `![Screenshot 5](https://prod-files-secure.s3.us-west-2.amazonaws.com/c1033c29-9030-4781-b626-4cc/image5.png)\n`,
    ];

    largeMarkdownContent = baseContent + imageWithBase64 + s3Images.join("\n");

    // Save to temp file for debugging
    testFilePath = "/tmp/bun-regex-test-input.md";
    fs.writeFileSync(testFilePath, largeMarkdownContent, "utf-8");

    console.log(`Created test markdown: ${largeMarkdownContent.length} bytes`);
    console.log(`Saved to: ${testFilePath}`);
  });

  it("should have content larger than 700KB", () => {
    expect(largeMarkdownContent.length).toBeGreaterThan(700000);
  });

  it("should contain image markers", () => {
    const imageMarkerIndex = largeMarkdownContent.indexOf("![");
    expect(imageMarkerIndex).toBeGreaterThan(0);
  });

  it("should contain S3 URLs", () => {
    const s3Count = (largeMarkdownContent.match(/prod-files-secure\.s3/g) || [])
      .length;
    expect(s3Count).toBe(5);
  });

  describe("Regex Detection Methods", () => {
    it("FAILING IN BUN: should detect images using regex.exec()", () => {
      const matches: Array<{ alt: string; url: string }> = [];
      let match;

      // Reset regex
      IMAGE_REGEX.lastIndex = 0;

      while ((match = IMAGE_REGEX.exec(largeMarkdownContent)) !== null) {
        matches.push({
          alt: match[1],
          url: match[2],
        });

        // Safety limit
        if (matches.length > 100) break;
      }

      console.log(`regex.exec() found ${matches.length} matches`);

      // This SHOULD pass (we expect 6 images: 1 base64 + 5 S3)
      // but WILL FAIL in Bun due to the regex bug
      expect(matches.length).toBe(6);
    });

    it("FAILING IN BUN: should detect images using String.matchAll()", () => {
      // Reset regex
      IMAGE_REGEX.lastIndex = 0;

      const matches = Array.from(largeMarkdownContent.matchAll(IMAGE_REGEX));

      console.log(`matchAll() found ${matches.length} matches`);

      // This SHOULD pass but WILL FAIL in Bun
      expect(matches.length).toBe(6);
    });

    it("WORKAROUND: should detect images by splitting into smaller chunks", () => {
      /**
       * Workaround Strategy: Split the large string into smaller chunks
       * that won't trigger Bun's regex bug, then process each chunk
       */
      const CHUNK_SIZE = 100000; // 100KB chunks (well below the bug threshold)
      const matches: Array<{ alt: string; url: string; position: number }> = [];

      // Split by lines to avoid cutting images in half
      const lines = largeMarkdownContent.split("\n");
      let currentChunk = "";
      let currentPosition = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentChunk += line + "\n";

        // Process chunk when it reaches size limit or we're at the end
        if (currentChunk.length >= CHUNK_SIZE || i === lines.length - 1) {
          // Reset regex for each chunk
          IMAGE_REGEX.lastIndex = 0;

          let match;
          while ((match = IMAGE_REGEX.exec(currentChunk)) !== null) {
            matches.push({
              alt: match[1],
              url: match[2],
              position: currentPosition + match.index,
            });

            // Safety limit
            if (matches.length > 100) break;
          }

          currentPosition += currentChunk.length;
          currentChunk = "";
        }
      }

      console.log(`Chunk-based detection found ${matches.length} matches`);
      expect(matches.length).toBe(6);
    });

    it("WORKAROUND: should detect images using manual string parsing", () => {
      /**
       * Workaround Strategy: Parse images manually without regex
       * This is more verbose but guaranteed to work in any runtime
       */
      const matches: Array<{ alt: string; url: string; position: number }> = [];
      let position = 0;

      while (position < largeMarkdownContent.length) {
        const imageStart = largeMarkdownContent.indexOf("![", position);
        if (imageStart === -1) break;

        const altEnd = largeMarkdownContent.indexOf("]", imageStart + 2);
        if (altEnd === -1) break;

        const urlStart = largeMarkdownContent.indexOf("(", altEnd);
        if (urlStart === -1 || urlStart !== altEnd + 1) {
          position = imageStart + 2;
          continue;
        }

        const urlEnd = largeMarkdownContent.indexOf(")", urlStart + 1);
        if (urlEnd === -1) break;

        const alt = largeMarkdownContent.substring(imageStart + 2, altEnd);
        const url = largeMarkdownContent.substring(urlStart + 1, urlEnd).trim();

        matches.push({ alt, url, position: imageStart });
        position = urlEnd + 1;
      }

      console.log(`Manual parsing found ${matches.length} matches`);
      expect(matches.length).toBe(6);
    });

    it("WORKAROUND: should detect S3 URLs specifically using simpler pattern", () => {
      /**
       * Workaround Strategy: Use a simpler regex pattern just for S3 URLs
       * that might not trigger the bug, then extract the full markdown image
       */
      const S3_URL_PATTERN = /https:\/\/prod-files-secure\.s3[^\s)]+/g;
      const s3Urls: string[] = [];

      // Reset regex
      S3_URL_PATTERN.lastIndex = 0;

      let match;
      while ((match = S3_URL_PATTERN.exec(largeMarkdownContent)) !== null) {
        s3Urls.push(match[0]);
        if (s3Urls.length > 100) break; // Safety limit
      }

      console.log(`S3 URL pattern found ${s3Urls.length} URLs`);
      expect(s3Urls.length).toBe(5);
    });
  });

  describe("Image Extraction Validation", () => {
    it("should correctly identify S3 URLs vs local paths vs data URIs", () => {
      const testCases = [
        {
          markdown:
            "![test](https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png)",
          expectedType: "s3",
        },
        {
          markdown: "![test](./local/image.png)",
          expectedType: "local",
        },
        {
          markdown: "![test](data:image/png;base64,iVBORw0KGgo)",
          expectedType: "data-uri",
        },
        {
          markdown: "![test](/absolute/path/image.png)",
          expectedType: "absolute",
        },
      ];

      for (const { markdown, expectedType } of testCases) {
        const match = IMAGE_REGEX.exec(markdown);
        IMAGE_REGEX.lastIndex = 0; // Reset

        expect(match).not.toBeNull();

        if (match) {
          const url = match[2];

          if (url.startsWith("https://prod-files-secure.s3")) {
            expect(expectedType).toBe("s3");
          } else if (url.startsWith("data:")) {
            expect(expectedType).toBe("data-uri");
          } else if (url.startsWith("/")) {
            expect(expectedType).toBe("absolute");
          } else {
            expect(expectedType).toBe("local");
          }
        }
      }
    });
  });

  describe("Performance Comparison", () => {
    it("should measure performance of different detection methods", () => {
      const iterations = 10;
      const timings: Record<string, number> = {};

      // Method 1: regex.exec (will fail in Bun)
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        IMAGE_REGEX.lastIndex = 0;
        const matches: unknown[] = [];
        let match;
        while ((match = IMAGE_REGEX.exec(largeMarkdownContent)) !== null) {
          matches.push(match);
          if (matches.length > 100) break;
        }
      }
      timings.regexExec = performance.now() - start1;

      // Method 2: Manual parsing
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const matches: unknown[] = [];
        let position = 0;
        while (position < largeMarkdownContent.length) {
          const imageStart = largeMarkdownContent.indexOf("![", position);
          if (imageStart === -1) break;
          const altEnd = largeMarkdownContent.indexOf("]", imageStart + 2);
          if (altEnd === -1) break;
          const urlStart = largeMarkdownContent.indexOf("(", altEnd);
          if (urlStart === -1 || urlStart !== altEnd + 1) {
            position = imageStart + 2;
            continue;
          }
          const urlEnd = largeMarkdownContent.indexOf(")", urlStart + 1);
          if (urlEnd === -1) break;
          matches.push({ imageStart, urlEnd });
          position = urlEnd + 1;
          if (matches.length > 100) break;
        }
      }
      timings.manualParsing = performance.now() - start2;

      console.log("Performance timings (ms):", timings);

      // Manual parsing should be reasonably fast (under 5x slower than regex would be)
      expect(timings.manualParsing).toBeLessThan(5000);
    });
  });
});
