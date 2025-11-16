/**
 * Emoji Mapping Module
 *
 * Handles emoji name normalization, markdown replacement patterns,
 * and applying emoji mappings to markdown content.
 */

// Constants for inline emoji styling
const INLINE_EMOJI_STYLE =
  'className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}}';

/**
 * Normalize emoji name by removing colons and trimming whitespace
 */
export const normalizeEmojiName = (plainText: string): string =>
  plainText.replace(/:/g, "").trim();

/**
 * Escape special characters for use in RegExp
 */
export const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build inline emoji HTML tag with styling
 */
export const buildInlineEmoji = (src: string, alt: string): string =>
  `<img src="${src}" alt="${alt}" ${INLINE_EMOJI_STYLE} />`;

/**
 * Apply custom emoji mappings to markdown content
 *
 * Replaces emoji references (plain text and [img] patterns) with inline HTML
 */
export function applyEmojiMappings(
  markdownContent: string,
  emojiMap: Map<string, string>
): string {
  let processedContent = markdownContent;

  // Pre-validate and sanitize emoji names before creating RegExp patterns
  const emojiEntries = Array.from(emojiMap.entries())
    .filter(([plainText, _localPath]) => {
      // Only process valid emoji names (alphanumeric, hyphens, underscores, colons)
      return /^[:a-zA-Z0-9_-]+$/.test(plainText);
    })
    .map(([plainText, localPath]) => {
      const name = normalizeEmojiName(plainText);
      const escapedPlainText = escapeForRegExp(plainText);
      const escapedName = escapeForRegExp(name);

      return {
        inline: buildInlineEmoji(localPath, name),
        plainText: escapedPlainText,
        escapedName: escapedName,
      };
    });

  // Replace plain text emoji references
  for (const { inline, plainText } of emojiEntries) {
    // Use string replace with escaped pattern for safety
    // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern is pre-validated and escaped
    const plainTextPattern = new RegExp(plainText, "g");
    processedContent = processedContent.replace(plainTextPattern, inline);
  }

  // Replace [img] markdown patterns
  for (const { escapedName, inline } of emojiEntries) {
    // Build safe regex patterns with validated, escaped names
    const patterns = [
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
      new RegExp(`\\[img\\]\\(#img\\)\\s*\\[\\s*${escapedName}\\s*\\]`, "gi"),
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
      new RegExp(`\\[img\\]\\(#img\\)\\[${escapedName}\\]`, "gi"),
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
      new RegExp(`\\[img\\]\\(#img\\)\\s+\\[\\s*${escapedName}\\s*\\]`, "gi"),
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
      new RegExp(`\\[img\\]\\s*\\[\\s*${escapedName}\\s*\\]`, "gi"),
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern uses pre-validated and escaped name
      new RegExp(`\\[img\\]\\[${escapedName}\\]`, "gi"),
    ];

    for (const pattern of patterns) {
      processedContent = processedContent.replace(pattern, inline);
    }
  }

  return processedContent;
}
