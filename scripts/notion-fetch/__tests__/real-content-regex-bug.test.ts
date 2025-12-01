import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { extractImageMatches } from "../imageReplacer";

/**
 * Tests using ACTUAL runtime content from the problematic page
 * "Building a Custom Categories Set" to understand why the retry loop
 * doesn't detect and fix the remaining S3 URLs
 */

describe("Real Content Regex Bug Investigation", () => {
  const REAL_MARKDOWN_PATH =
    "/tmp/debug-markdown-building-a-custom-categories-set.md";

  it.skipIf(!fs.existsSync(REAL_MARKDOWN_PATH))(
    "should have the actual runtime markdown file available",
    () => {
      expect(fs.existsSync(REAL_MARKDOWN_PATH)).toBe(true);
    }
  );

  describe.skipIf(!fs.existsSync(REAL_MARKDOWN_PATH))(
    "Using Real Problematic Content",
    () => {
      let realMarkdown: string;

      beforeAll(() => {
        if (fs.existsSync(REAL_MARKDOWN_PATH)) {
          realMarkdown = fs.readFileSync(REAL_MARKDOWN_PATH, "utf-8");
          console.log(`Loaded real markdown: ${realMarkdown.length} bytes`);
        }
      });

      it("should be a large file (700KB+)", () => {
        expect(realMarkdown.length).toBeGreaterThan(700000);
      });

      it("should contain S3 URLs that need replacement", () => {
        const s3Count = (realMarkdown.match(/prod-files-secure\.s3/g) || [])
          .length;
        console.log(`Found ${s3Count} S3 URLs in markdown`);
        expect(s3Count).toBeGreaterThan(0);
      });

      it("should contain image markdown syntax", () => {
        const imageMarkerIndex = realMarkdown.indexOf("![");
        console.log(`First image marker at position: ${imageMarkerIndex}`);
        expect(imageMarkerIndex).toBeGreaterThan(0);
      });

      it("CRITICAL: extractImageMatches should detect images from real content", () => {
        /**
         * This is the actual function being called in the production code
         * If this returns 0 matches, the retry loop will never fix the S3 URLs
         */
        const matches = extractImageMatches(realMarkdown);

        console.log(`extractImageMatches found ${matches.length} images`);

        if (matches.length > 0) {
          console.log("First 3 matches:");
          matches.slice(0, 3).forEach((match, i) => {
            console.log(
              `  ${i + 1}. alt="${match.alt}" url="${match.url.substring(0, 80)}..."`
            );
          });
        }

        // This SHOULD find 9 images (1 base64 + 8 S3)
        // If it finds 0, that's the bug!
        expect(matches.length).toBeGreaterThan(0);
      });

      it("should identify which images are S3 URLs", () => {
        const matches = extractImageMatches(realMarkdown);
        const s3Images = matches.filter((m) =>
          m.url.includes("prod-files-secure.s3")
        );

        console.log(
          `Found ${s3Images.length} S3 images out of ${matches.length} total`
        );

        if (s3Images.length > 0) {
          console.log("S3 images:");
          s3Images.forEach((match, i) => {
            console.log(
              `  ${i + 1}. alt="${match.alt}" url="${match.url.substring(0, 80)}..."`
            );
          });
        }

        expect(s3Images.length).toBeGreaterThan(0);
      });

      it("should demonstrate why retry loop fails to fix S3 URLs", () => {
        /**
         * Simulate what happens in the retry loop:
         * 1. Extract image matches
         * 2. Filter for S3 URLs
         * 3. If none found, stop retrying
         */
        let currentMarkdown = realMarkdown;
        let attemptNumber = 0;
        const MAX_ATTEMPTS = 5;

        while (attemptNumber < MAX_ATTEMPTS) {
          attemptNumber++;

          // This is what the retry loop does
          const matches = extractImageMatches(currentMarkdown);
          const s3Images = matches.filter((m) =>
            m.url.includes("prod-files-secure.s3")
          );

          console.log(
            `Attempt ${attemptNumber}: Found ${matches.length} images, ${s3Images.length} are S3`
          );

          if (s3Images.length === 0) {
            console.log(
              `No S3 images found, stopping retry loop at attempt ${attemptNumber}`
            );
            break;
          }

          // In real code, we would process and replace images here
          // For this test, we just simulate one replacement
          if (s3Images.length > 0) {
            const firstS3 = s3Images[0];
            currentMarkdown = currentMarkdown.replace(
              `![${firstS3.alt}](${firstS3.url})`,
              `![${firstS3.alt}](/images/replaced.png)`
            );
          }
        }

        // If extractImageMatches returns 0, attemptNumber will be 1
        // (one attempt, found nothing, stopped immediately)
        console.log(`Total retry attempts: ${attemptNumber}`);
        expect(attemptNumber).toBeGreaterThan(1); // Should make multiple attempts
      });
    }
  );

  describe.skipIf(!fs.existsSync(REAL_MARKDOWN_PATH))(
    "Manual String Parsing as Workaround",
    () => {
      let realMarkdown: string;

      beforeAll(() => {
        if (fs.existsSync(REAL_MARKDOWN_PATH)) {
          realMarkdown = fs.readFileSync(REAL_MARKDOWN_PATH, "utf-8");
        }
      });

      it("should detect images using manual parsing instead of regex", () => {
        /**
         * This is a workaround that doesn't rely on regex
         * which seems to have issues in Bun with large strings
         */
        const manualMatches: Array<{
          alt: string;
          url: string;
          position: number;
        }> = [];
        let position = 0;

        while (position < realMarkdown.length) {
          const imageStart = realMarkdown.indexOf("![", position);
          if (imageStart === -1) break;

          const altEnd = realMarkdown.indexOf("]", imageStart + 2);
          if (altEnd === -1) break;

          const urlStart = realMarkdown.indexOf("(", altEnd);
          if (urlStart === -1 || urlStart !== altEnd + 1) {
            position = imageStart + 2;
            continue;
          }

          const urlEnd = realMarkdown.indexOf(")", urlStart + 1);
          if (urlEnd === -1) break;

          const alt = realMarkdown.substring(imageStart + 2, altEnd);
          const url = realMarkdown.substring(urlStart + 1, urlEnd).trim();

          manualMatches.push({ alt, url, position: imageStart });
          position = urlEnd + 1;

          // Safety limit
          if (manualMatches.length > 100) break;
        }

        console.log(`Manual parsing found ${manualMatches.length} images`);

        const s3Images = manualMatches.filter((m) =>
          m.url.includes("prod-files-secure.s3")
        );
        console.log(`  Of which ${s3Images.length} are S3 URLs`);

        expect(manualMatches.length).toBeGreaterThan(0);
        expect(s3Images.length).toBeGreaterThan(0);
      });

      it("should compare regex vs manual parsing results", () => {
        // Regex approach
        const regexMatches = extractImageMatches(realMarkdown);

        // Manual approach
        const manualMatches: Array<{ alt: string; url: string }> = [];
        let position = 0;

        while (position < realMarkdown.length) {
          const imageStart = realMarkdown.indexOf("![", position);
          if (imageStart === -1) break;

          const altEnd = realMarkdown.indexOf("]", imageStart + 2);
          if (altEnd === -1) break;

          const urlStart = realMarkdown.indexOf("(", altEnd);
          if (urlStart === -1 || urlStart !== altEnd + 1) {
            position = imageStart + 2;
            continue;
          }

          const urlEnd = realMarkdown.indexOf(")", urlStart + 1);
          if (urlEnd === -1) break;

          const alt = realMarkdown.substring(imageStart + 2, altEnd);
          const url = realMarkdown.substring(urlStart + 1, urlEnd).trim();

          manualMatches.push({ alt, url });
          position = urlEnd + 1;

          if (manualMatches.length > 100) break;
        }

        console.log(`Comparison:`);
        console.log(
          `  Regex (extractImageMatches): ${regexMatches.length} images`
        );
        console.log(
          `  Manual parsing:              ${manualMatches.length} images`
        );

        // If regex returns 0 but manual returns > 0, that proves the Bun bug
        if (regexMatches.length === 0 && manualMatches.length > 0) {
          console.log(
            `\n⚠️  BUN REGEX BUG CONFIRMED: Regex returns 0, manual parsing works!`
          );
        }

        expect(manualMatches.length).toBeGreaterThan(0);
      });
    }
  );
});
