const LOCALE_IMAGE_PLACEHOLDER_PREFIX = "/images/__locale_ref__/";
const REMOTE_IMAGE_PLACEHOLDER_PREFIX = "/images/__remote_ref__/";
export const HYPERLINKED_MARKDOWN_IMAGE_REGEX =
  /\[!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
export const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(\s*((?:\\\)|[^)])+?)\s*\)/g;
export const HTML_IMAGE_TAG_REGEX = /<img\b[^>]*>/gi;

export function isCanonicalImagePath(path: string): boolean {
  return path.startsWith("/images/");
}

function isRemoteImagePath(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

export function isLocaleImagePlaceholderPath(path: string): boolean {
  return path.startsWith(LOCALE_IMAGE_PLACEHOLDER_PREFIX);
}

export function isRemoteImagePlaceholderPath(path: string): boolean {
  return path.startsWith(REMOTE_IMAGE_PLACEHOLDER_PREFIX);
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

export function encodeRemoteImagePlaceholderPath(
  remoteImagePath: string
): string {
  if (isRemoteImagePlaceholderPath(remoteImagePath)) {
    return remoteImagePath;
  }

  if (!isRemoteImagePath(remoteImagePath)) {
    return remoteImagePath;
  }

  const encodedPath = Buffer.from(remoteImagePath, "utf8").toString(
    "base64url"
  );
  return `${REMOTE_IMAGE_PLACEHOLDER_PREFIX}${encodedPath}`;
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

export function decodeRemoteImagePlaceholderPath(
  imagePath: string
): string | null {
  if (!isRemoteImagePlaceholderPath(imagePath)) {
    return null;
  }

  const encodedPath = imagePath.slice(REMOTE_IMAGE_PLACEHOLDER_PREFIX.length);
  if (!encodedPath) {
    return null;
  }

  try {
    const decodedPath = Buffer.from(encodedPath, "base64url").toString("utf8");
    return isRemoteImagePath(decodedPath) ? decodedPath : null;
  } catch {
    return null;
  }
}

export function rewriteLocaleImagePlaceholderPath(path: string): string {
  const decodedCanonicalPath = decodeLocaleImagePlaceholderPath(path);
  if (decodedCanonicalPath !== null) {
    return decodedCanonicalPath;
  }

  const decodedRemotePath = decodeRemoteImagePlaceholderPath(path);
  if (decodedRemotePath !== null) {
    return decodedRemotePath;
  }

  if (path.startsWith("images/")) {
    return `/${path}`;
  }

  return path;
}

export function decodeLocaleImagePlaceholderPaths(content: string): string {
  if (!content.includes(LOCALE_IMAGE_PLACEHOLDER_PREFIX)) {
    return content;
  }

  return content.replace(
    /\/images\/__locale_ref__\/[A-Za-z0-9_-]+/g,
    (imagePath) => decodeLocaleImagePlaceholderPath(imagePath) ?? imagePath
  );
}

export function decodeRemoteImagePlaceholderPaths(content: string): string {
  if (!content.includes(REMOTE_IMAGE_PLACEHOLDER_PREFIX)) {
    return content;
  }

  return content.replace(
    /\/images\/__remote_ref__\/[A-Za-z0-9_-]+/g,
    (imagePath) => decodeRemoteImagePlaceholderPath(imagePath) ?? imagePath
  );
}

export function replaceCanonicalMarkdownImagesWithPlaceholders(
  markdownContent: string
): string {
  if (
    !markdownContent.includes("/images/") &&
    !markdownContent.includes("http://") &&
    !markdownContent.includes("https://") &&
    !markdownContent.toLowerCase().includes("<img")
  ) {
    return markdownContent;
  }

  const toPlaceholderUrl = (imageRef: string): string => {
    const normalizedImageRef = imageRef.replace(/\\\)/g, ")");

    if (isCanonicalImagePath(normalizedImageRef)) {
      return encodeLocaleImagePlaceholderPath(normalizedImageRef);
    }

    if (isRemoteImagePath(normalizedImageRef)) {
      return encodeRemoteImagePlaceholderPath(normalizedImageRef);
    }

    return normalizedImageRef;
  };

  const replaceHtmlImageTag = (tag: string): string => {
    const imageRef = /(?:^|\s)src=(["'])(.*?)\1/i.exec(tag)?.[2];
    if (!imageRef) {
      return tag;
    }

    const placeholderUrl = toPlaceholderUrl(imageRef);
    if (placeholderUrl === imageRef) {
      return tag;
    }

    return tag.replace(
      /(\bsrc=(["']))([^"']+)(\2)/i,
      (_full, prefix: string, _quote: string, _src: string, suffix: string) =>
        `${prefix}${placeholderUrl}${suffix}`
    );
  };

  return markdownContent
    .replace(
      HYPERLINKED_MARKDOWN_IMAGE_REGEX,
      (full, altText: string, imageRef: string, linkRef: string) => {
        const normalizedImageRef = imageRef.replace(/\\\)/g, ")");
        const placeholderUrl = toPlaceholderUrl(imageRef);
        if (placeholderUrl === normalizedImageRef) {
          return full;
        }

        return `[![${altText}](${placeholderUrl})](${linkRef})`;
      }
    )
    .replace(
      MARKDOWN_IMAGE_REGEX,
      (full, altText: string, imageRef: string) => {
        const normalizedImageRef = imageRef.replace(/\\\)/g, ")");
        const placeholderUrl = toPlaceholderUrl(imageRef);
        if (placeholderUrl === normalizedImageRef) {
          return full;
        }

        return `![${altText}](${placeholderUrl})`;
      }
    )
    .replace(HTML_IMAGE_TAG_REGEX, replaceHtmlImageTag);
}
