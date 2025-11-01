/**
 * Content sanitization utilities for fixing malformed HTML/JSX tags in markdown content
 * that cause MDX compilation errors in Docusaurus.
 */

const EMOJI_STYLE_MARKERS = ["display:", "height:", "margin:"];

const isEmojiStyleObject = (snippet: string): boolean =>
  EMOJI_STYLE_MARKERS.every((marker) => snippet.includes(marker));

const isEmojiImgTag = (snippet: string): boolean =>
  snippet.includes('className="emoji"');

/**
 * Fixes heading hierarchy issues from Notion exports to ensure proper TOC generation.
 * - Keeps only the first H1 (page title)
 * - Converts subsequent H1s to H2s
 * - Removes empty headings
 * @param content - The markdown content string with code blocks already masked
 * @param codeBlockPlaceholders - Array of code block placeholders to skip
 * @returns Content with fixed heading hierarchy
 */
function fixHeadingHierarchy(
  content: string,
  codeBlockPlaceholders: string[]
): string {
  const lines = content.split("\n");
  let firstH1Found = false;

  const fixedLines = lines.map((line) => {
    // Skip lines that are code block placeholders
    if (
      codeBlockPlaceholders.some((placeholder) => line.includes(placeholder))
    ) {
      return line;
    }

    // Match markdown headings: # Heading text
    const headingMatch = line.match(/^(#{1,6})\s*(.*)$/);

    if (!headingMatch) return line;

    const [, hashes, text] = headingMatch;
    const level = hashes.length;
    const trimmedText = text.trim();

    // Remove empty headings (e.g., "# " or "#" with no content)
    if (trimmedText === "") {
      return "";
    }

    // Handle H1 headings
    if (level === 1) {
      if (!firstH1Found) {
        // Keep the first H1 as the page title
        firstH1Found = true;
        return line;
      } else {
        // Convert subsequent H1s to H2s
        return `## ${trimmedText}`;
      }
    }

    // Keep other heading levels unchanged
    return line;
  });

  return fixedLines.join("\n");
}

/**
 * Sanitizes markdown content to fix malformed HTML/JSX tags that cause MDX compilation errors
 * @param content - The markdown content string
 * @returns Sanitized content with fixed HTML/JSX tags
 */
export function sanitizeMarkdownContent(content: string): string {
  // Fix specific malformed patterns that cause MDX errors

  // 0. Mask code fences (```...```) and inline code (`...`) to avoid altering them
  const codeBlocks: string[] = [];
  const codeSpans: string[] = [];
  const codeBlockPlaceholders: string[] = [];

  content = content.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    const placeholder = `__CODEBLOCK_${codeBlocks.length - 1}__`;
    codeBlockPlaceholders.push(placeholder);
    return placeholder;
  });
  content = content.replace(/`[^`\n]*`/g, (m) => {
    codeSpans.push(m);
    return `__CODESPAN_${codeSpans.length - 1}__`;
  });

  // 1. Fix heading hierarchy for proper TOC generation (after masking code blocks)
  content = fixHeadingHierarchy(content, codeBlockPlaceholders);

  // 2. Aggressively strip all curly-brace expressions by unwrapping to inner text
  // BUT preserve JSX style objects for emoji images
  // Run a few passes to handle simple nesting like {{text}}
  for (let i = 0; i < 5 && /\{[^{}]*\}/.test(content); i++) {
    content = content.replace(/\{([^{}]*)\}/g, (match, inner) =>
      isEmojiStyleObject(match) ? match : String(inner).trim()
    );
  }

  // 3. Fix malformed <link to section.> patterns (the main issue from the error)
  content = content.replace(
    /<link\s+to\s+section\.?>/gi,
    "[link to section](#section)"
  );

  // 4. Fix other malformed <link> tags with invalid attributes (spaces, dots in attr names)
  content = content.replace(/<link\s+[^>]*[^\w\s"=-][^>]*>/g, "[link](#)");

  // 5. Fix malformed <Link> tags with invalid attributes
  content = content.replace(/<Link\s+[^>]*[^\w\s"=-][^>]*>/g, "[Link](#)");

  // 6. Fix general malformed tags with dots or spaces in attribute names
  // This catches patterns like <tag attr.name> or <tag attr value> (without quotes)
  // BUT exclude emoji img tags which are valid HTML
  content = content.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*?)([.\s]+)([^>]*?)>/g,
    (match, tagName, before, separator, after) => {
      if (tagName.toLowerCase() === "img" && isEmojiImgTag(before + after)) {
        return match;
      }

      // Only replace if the separator indicates malformed attributes
      if (
        separator.includes(".") ||
        (separator.includes(" ") && !before.includes("="))
      ) {
        return `[${tagName}](#${tagName.toLowerCase()})`;
      }
      return match; // Keep valid tags
    }
  );

  // 7. Fix unquoted attribute values in JSX (e.g., <tag attr value> -> <tag attr="value">)
  // BUT exclude emoji img tags which are valid HTML
  content = content.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([^>\s"=]+)(\s|>)/g,
    (match, tagName, attrName, attrValue, suffix) =>
      tagName.toLowerCase() === "img" && isEmojiImgTag(match)
        ? match
        : `<${tagName} ${attrName}="${attrValue}"${suffix}`
  );

  // 8. Final hard cleanup: strip any remaining { ... } to avoid MDX/Acorn errors
  // BUT preserve JSX style objects for emoji images
  // Run a few passes to handle simple nesting like {{text}}.
  for (let i = 0; i < 3 && /\{[^{}]*\}/.test(content); i++) {
    content = content.replace(/\{([^{}]*)\}/g, (match, inner) =>
      isEmojiStyleObject(match) ? match : inner
    );
  }

  // 9. Restore masked code blocks and inline code
  content = content.replace(
    /__CODEBLOCK_(\d+)__/g,
    (_m, i) => codeBlocks[Number(i)]
  );
  content = content.replace(
    /__CODESPAN_(\d+)__/g,
    (_m, i) => codeSpans[Number(i)]
  );

  return content;
}
