import { describe, it, expect, beforeAll } from "vitest";
import { extractImageMatches } from "../imageReplacer";

/**
 * Tests using synthetic large content that mimics the problematic page
 * to ensure the Bun regex bug fallback continues to detect S3 URLs.
 */

describe("Real Content Regex Bug Investigation", () => {
  let realMarkdown: string;

  beforeAll(() => {
    const baseContent = "# Title\n\n".repeat(1000);
    const largeBase64 = "data:image/png;base64," + "iVBORw0KGgo".repeat(100000); // ~700KB
    const base64Image = `![Embedded](${largeBase64})\n\n`;

    const s3Images = Array.from(
      { length: 8 },
      (_, i) =>
        `![S3 ${i + 1}](https://prod-files-secure.s3.us-west-2.amazonaws.com/fake-${i}.png)`
    ).join("\n");

    realMarkdown = `${baseContent}${base64Image}${s3Images}\n`;
  });

  it("should be a large file (700KB+)", () => {
    expect(realMarkdown.length).toBeGreaterThan(700000);
  });

  it("should contain S3 URLs that need replacement", () => {
    const s3Count = (realMarkdown.match(/prod-files-secure\.s3/g) || []).length;
    expect(s3Count).toBeGreaterThan(0);
  });

  it("CRITICAL: extractImageMatches should detect images from synthetic content", () => {
    const matches = extractImageMatches(realMarkdown);
    expect(matches.length).toBeGreaterThan(0);

    const s3Images = matches.filter((m) =>
      m.url.includes("prod-files-secure.s3")
    );
    expect(s3Images.length).toBeGreaterThan(0);
  });

  it("should compare regex vs manual parsing results", () => {
    const regexMatches = extractImageMatches(realMarkdown);

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

    // We expect both approaches to find at least the S3 URLs
    expect(manualMatches.length).toBeGreaterThan(0);
    expect(regexMatches.length).toBeGreaterThan(0);
  });
});
