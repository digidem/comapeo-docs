/**
 * Result of image URL validation
 */
export interface ImageUrlValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Validates and sanitizes image URLs to prevent broken references
 *
 * @param url - The URL to validate
 * @returns Validation result with sanitized URL or error message
 */
export function validateAndSanitizeImageUrl(
  url: string
): ImageUrlValidationResult {
  if (typeof url !== "string") {
    return { isValid: false, error: "URL is empty or not a string" };
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl || trimmedUrl === "") {
    return { isValid: false, error: "URL is empty after trimming" };
  }

  // Check for obvious invalid patterns
  if (trimmedUrl === "undefined" || trimmedUrl === "null") {
    return { isValid: false, error: "URL contains literal undefined/null" };
  }

  // Validate URL format
  try {
    const urlObj = new URL(trimmedUrl);
    // Ensure it's a reasonable protocol
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return { isValid: false, error: `Invalid protocol: ${urlObj.protocol}` };
    }
    return { isValid: true, sanitizedUrl: trimmedUrl };
  } catch (err: unknown) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as any).message)
        : "Unknown URL parse error";
    return { isValid: false, error: `Invalid URL format: ${message}` };
  }
}

/**
 * Creates a fallback image reference when download fails
 *
 * @param originalMarkdown - The original markdown image syntax
 * @param imageUrl - The URL that failed to download
 * @param index - The index of the image (for numbering)
 * @returns Markdown fallback text with HTML comment
 */
export function createFallbackImageMarkdown(
  originalMarkdown: string,
  imageUrl: string,
  index: number
): string {
  // Extract alt text from original markdown
  const altMatch = originalMarkdown.match(/!\[(.*?)\]/);
  const altText = altMatch?.[1] || `Image ${index + 1}`;

  // Create a placeholder that documents the original URL for recovery
  const fallbackComment = `<!-- Failed to download image: ${imageUrl} -->`;
  const placeholderText = `**[Image ${index + 1}: ${altText}]** *(Image failed to download)*`;

  return `${fallbackComment}\n${placeholderText}`;
}
