import { describe, expect, it } from "vitest";
import {
  decodeLocaleImagePlaceholderPath,
  decodeRemoteImagePlaceholderPath,
  decodeRemoteImagePlaceholderPaths,
  encodeLocaleImagePlaceholderPath,
  encodeRemoteImagePlaceholderPath,
  isLocaleImagePlaceholderPath,
  isRemoteImagePlaceholderPath,
  replaceCanonicalMarkdownImagesWithPlaceholders,
  rewriteLocaleImagePlaceholderPath,
} from "./localeImagePlaceholders";

describe("localeImagePlaceholders", () => {
  it("encodes and decodes canonical image paths deterministically", () => {
    const canonicalPath = "/images/getting-started/screenshot.png";

    const placeholderPath = encodeLocaleImagePlaceholderPath(canonicalPath);

    expect(placeholderPath).toMatch(
      /^\/images\/__locale_ref__\/[A-Za-z0-9_-]+$/
    );
    expect(isLocaleImagePlaceholderPath(placeholderPath)).toBe(true);
    expect(decodeLocaleImagePlaceholderPath(placeholderPath)).toBe(
      canonicalPath
    );
  });

  it("does not re-encode existing locale placeholder paths", () => {
    const placeholderPath =
      "/images/__locale_ref__/L2ltYWdlcy9zY3JlZW5zaG90LnBuZw";

    expect(encodeLocaleImagePlaceholderPath(placeholderPath)).toBe(
      placeholderPath
    );
  });

  it("returns null for invalid locale placeholder paths", () => {
    expect(
      decodeLocaleImagePlaceholderPath("/images/__locale_ref__/not-base64!!!")
    ).toBeNull();
    expect(
      decodeLocaleImagePlaceholderPath(
        "/images/__locale_ref__/aHR0cHM6Ly9leGFtcGxlLmNvbS9mb28ucG5n"
      )
    ).toBeNull();
  });

  it("encodes and decodes remote image URLs deterministically", () => {
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png";

    const placeholderPath = encodeRemoteImagePlaceholderPath(remoteImageUrl);

    expect(placeholderPath).toMatch(
      /^\/images\/__remote_ref__\/[A-Za-z0-9_-]+$/
    );
    expect(isRemoteImagePlaceholderPath(placeholderPath)).toBe(true);
    expect(decodeRemoteImagePlaceholderPath(placeholderPath)).toBe(
      remoteImageUrl
    );
  });

  it("rewrites canonical markdown images to placeholder URLs", () => {
    const markdown = [
      "![Screenshot](/images/getting-started/screenshot.png)",
      "",
      "[![Diagram](/images/getting-started/diagram.png)](https://example.com)",
      "",
      '<img src="/images/getting-started/figure.png" alt="Figure" />',
    ].join("\n");

    const rewritten = replaceCanonicalMarkdownImagesWithPlaceholders(markdown);

    expect(rewritten).toContain("/images/__locale_ref__/");
    expect(rewritten).not.toContain("/images/getting-started/screenshot.png");
    expect(rewritten).not.toContain("/images/getting-started/diagram.png");
    expect(rewritten).not.toContain("/images/getting-started/figure.png");
  });

  it("rewrites remote markdown images to placeholder URLs", () => {
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png";
    const markdown = [
      `![Screenshot](${remoteImageUrl})`,
      "",
      `[![Diagram](${remoteImageUrl})](https://example.com)`,
      "",
      `<img src="${remoteImageUrl}" alt="Figure" />`,
    ].join("\n");

    const rewritten = replaceCanonicalMarkdownImagesWithPlaceholders(markdown);

    expect(rewritten).toContain("/images/__remote_ref__/");
    expect(rewritten).not.toContain(remoteImageUrl);
  });

  it("rewrites placeholder paths back to canonical image paths", () => {
    const canonicalPath = "/images/getting-started/screenshot.png";
    const placeholderPath = encodeLocaleImagePlaceholderPath(canonicalPath);

    expect(rewriteLocaleImagePlaceholderPath(placeholderPath)).toBe(
      canonicalPath
    );
    expect(rewriteLocaleImagePlaceholderPath("images/foo.png")).toBe(
      "/images/foo.png"
    );
  });

  it("rewrites remote placeholder paths back to remote image URLs", () => {
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png";
    const placeholderPath = encodeRemoteImagePlaceholderPath(remoteImageUrl);

    expect(rewriteLocaleImagePlaceholderPath(placeholderPath)).toBe(
      remoteImageUrl
    );
  });

  it("decodes remote image placeholders within markdown content", () => {
    const remoteImageUrl =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png";
    const placeholderPath = encodeRemoteImagePlaceholderPath(remoteImageUrl);
    const content = [
      `![Screenshot](${placeholderPath})`,
      "",
      `<img src="${placeholderPath}" alt="Figure" />`,
    ].join("\n");

    const decodedContent = decodeRemoteImagePlaceholderPaths(content);

    expect(decodedContent).toContain(remoteImageUrl);
    expect(decodedContent).not.toContain(placeholderPath);
  });

  it("preserves non-src attributes when rewriting multi-attribute <img> tags", () => {
    const tag =
      '<img src="/images/emojis/smile.png" alt="smile" className="emoji" style={{display: "inline"}} />';

    const rewritten = replaceCanonicalMarkdownImagesWithPlaceholders(tag);

    // src should be rewritten to a placeholder URL
    expect(rewritten).toContain("/images/__locale_ref__/");
    expect(rewritten).not.toContain("/images/emojis/smile.png");
    // All other attributes must be preserved unchanged
    expect(rewritten).toContain('alt="smile"');
    expect(rewritten).toContain('className="emoji"');
    expect(rewritten).toContain('style={{display: "inline"}}');
  });

  it("round-trips emoji subfolder paths through placeholder encoding", () => {
    const emojiPath = "/images/emojis/icon.png";

    const placeholder = encodeLocaleImagePlaceholderPath(emojiPath);

    expect(isLocaleImagePlaceholderPath(placeholder)).toBe(true);
    expect(decodeLocaleImagePlaceholderPath(placeholder)).toBe(emojiPath);

    // Also verify the full markdown image round-trips through replaceCanonicalMarkdownImagesWithPlaceholders
    const markdown = `![emoji](${emojiPath})`;
    const rewritten = replaceCanonicalMarkdownImagesWithPlaceholders(markdown);

    expect(rewritten).toContain("/images/__locale_ref__/");
    expect(rewritten).not.toContain(emojiPath);
    // Extract the placeholder path from the rewritten markdown and verify it decodes back
    const placeholderMatch = rewritten.match(
      /\/images\/__locale_ref__\/[A-Za-z0-9_-]+/
    );
    expect(placeholderMatch).not.toBeNull();
    expect(decodeLocaleImagePlaceholderPath(placeholderMatch![0])).toBe(
      emojiPath
    );
  });
});
