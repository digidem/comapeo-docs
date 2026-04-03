const LOCALE_IMAGE_PLACEHOLDER_PREFIX = "/images/__locale_ref__/";
export const HYPERLINKED_MARKDOWN_IMAGE_REGEX =
  /\[!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
export const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
export const HTML_IMAGE_TAG_REGEX = /<img\b[^>]*>/gi;

export function isCanonicalImagePath(path: string): boolean {
  return path.startsWith("/images/");
}

export function isLocaleImagePlaceholderPath(path: string): boolean {
  return path.startsWith(LOCALE_IMAGE_PLACEHOLDER_PREFIX);
}

export function encodeLocaleImagePlaceholderPath(
  canonicalImagePath: string
): string {
  if (isLocaleImagePlaceholderPath(canonicalImagePath)) {
    return canonicalImagePath;
  }

  if (!isCanonicalImagePath(canonicalImagePath)) {
    return canonicalImagePath;
  }

  const encodedPath = Buffer.from(canonicalImagePath, "utf8").toString(
    "base64url"
  );
  return `${LOCALE_IMAGE_PLACEHOLDER_PREFIX}${encodedPath}`;
}

export function decodeLocaleImagePlaceholderPath(
  imagePath: string
): string | null {
  if (!isLocaleImagePlaceholderPath(imagePath)) {
    return null;
  }

  const encodedPath = imagePath.slice(LOCALE_IMAGE_PLACEHOLDER_PREFIX.length);
  if (!encodedPath) {
    return null;
  }

  try {
    const decodedPath = Buffer.from(encodedPath, "base64url").toString("utf8");
    return isCanonicalImagePath(decodedPath) ? decodedPath : null;
  } catch {
    return null;
  }
}

export function rewriteLocaleImagePlaceholderPath(path: string): string {
  const decodedPath = decodeLocaleImagePlaceholderPath(path);
  if (decodedPath !== null) {
    return decodedPath;
  }

  if (path.startsWith("images/")) {
    return `/${path}`;
  }

  return path;
}

export function replaceCanonicalMarkdownImagesWithPlaceholders(
  markdownContent: string
): string {
  if (
    !markdownContent.includes("/images/") &&
    !markdownContent.toLowerCase().includes("<img")
  ) {
    return markdownContent;
  }

  const toPlaceholderUrl = (imageRef: string): string =>
    encodeLocaleImagePlaceholderPath(imageRef.replace(/\\\)/g, ")"));

  const replaceHtmlImageTag = (tag: string): string => {
    const imageRef = /(?:^|\s)src=(["'])(.*?)\1/i.exec(tag)?.[2];
    if (!imageRef || !isCanonicalImagePath(imageRef)) {
      return tag;
    }

    return tag.replace(
      /(\bsrc=(["']))([^"']+)(\2)/i,
      (_full, prefix: string, _quote: string, src: string, suffix: string) =>
        `${prefix}${toPlaceholderUrl(src)}${suffix}`
    );
  };

  return markdownContent
    .replace(
      HYPERLINKED_MARKDOWN_IMAGE_REGEX,
      (full, altText: string, imageRef: string, linkRef: string) => {
        const normalizedImageRef = imageRef.replace(/\\\)/g, ")");
        if (!isCanonicalImagePath(normalizedImageRef)) {
          return full;
        }

        return `[![${altText}](${toPlaceholderUrl(normalizedImageRef)})](${linkRef})`;
      }
    )
    .replace(
      MARKDOWN_IMAGE_REGEX,
      (full, altText: string, imageRef: string) => {
        const normalizedImageRef = imageRef.replace(/\\\)/g, ")");
        if (!isCanonicalImagePath(normalizedImageRef)) {
          return full;
        }

        return `![${altText}](${toPlaceholderUrl(normalizedImageRef)})`;
      }
    )
    .replace(HTML_IMAGE_TAG_REGEX, replaceHtmlImageTag);
}
