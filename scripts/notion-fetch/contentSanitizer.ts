/**
 * Content sanitization utilities for fixing malformed HTML/JSX tags in markdown content
 * that cause MDX compilation errors in Docusaurus.
 */

import { createSafeSlug } from "./slugUtils";

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
    const headingMatch = line.match(/^(\s{0,3})(#{1,6})\s*(.*)$/);

    if (!headingMatch) return line;

    const [, leadingWhitespace, hashes, text] = headingMatch;
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
        return `${leadingWhitespace}## ${trimmedText}`;
      }
    }

    // Keep other heading levels unchanged
    return line;
  });

  return fixedLines.join("\n");
}

function createCodeBlockMasker(content: string): {
  content: string;
  codeBlocks: string[];
  codeBlockPlaceholders: string[];
} {
  const lines = content.split("\n");
  const codeBlocks: string[] = [];
  const codeBlockPlaceholders: string[] = [];
  const maskedLines: string[] = [];

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let blockLines: string[] = [];

  for (const line of lines) {
    if (!inFence) {
      const openingMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

      if (!openingMatch) {
        maskedLines.push(line);
        continue;
      }

      const fence = openingMatch[1];
      fenceChar = fence[0];
      fenceLength = fence.length;
      blockLines = [line];
      inFence = true;
      continue;
    }

    blockLines.push(line);

    if (isClosingFenceLine(line, fenceChar, fenceLength)) {
      codeBlocks.push(blockLines.join("\n"));
      const placeholder = `__CODEBLOCK_${codeBlocks.length - 1}__`;
      codeBlockPlaceholders.push(placeholder);
      maskedLines.push(placeholder);
      inFence = false;
      blockLines = [];
    }
  }

  if (inFence) {
    codeBlocks.push(blockLines.join("\n"));
    const placeholder = `__CODEBLOCK_${codeBlocks.length - 1}__`;
    codeBlockPlaceholders.push(placeholder);
    maskedLines.push(placeholder);
  }

  return {
    content: maskedLines.join("\n"),
    codeBlocks,
    codeBlockPlaceholders,
  };
}

function isClosingFenceLine(
  line: string,
  fenceChar: string,
  fenceLength: number
): boolean {
  let i = 0;

  while (i < line.length && line.charAt(i) === " ") {
    i++;
  }

  if (i > 3) {
    return false;
  }

  let fenceCount = 0;
  while (i < line.length && line.charAt(i) === fenceChar) {
    fenceCount++;
    i++;
  }

  if (fenceCount < fenceLength) {
    return false;
  }

  while (i < line.length) {
    if (line.charAt(i) !== " " && line.charAt(i) !== "\t") {
      return false;
    }
    i++;
  }

  return true;
}

function maskCodeFences(content: string): {
  content: string;
  codeBlocks: string[];
  codeBlockPlaceholders: string[];
} {
  return createCodeBlockMasker(content);
}

function restoreCodeFences(content: string, codeBlocks: string[]): string {
  let restoredContent = content;
  for (const [index, codeBlock] of codeBlocks.entries()) {
    restoredContent = restoredContent.replaceAll(
      `__CODEBLOCK_${index}__`,
      codeBlock
    );
  }
  return restoredContent;
}

function maskInlineCodeSpans(content: string): {
  content: string;
  codeSpans: string[];
} {
  const codeSpans: string[] = [];
  const output: string[] = [];

  let i = 0;
  while (i < content.length) {
    const currentChar = content.charAt(i);
    if (currentChar !== "`") {
      output.push(currentChar);
      i++;
      continue;
    }

    let openingLength = 0;
    while (
      i + openingLength < content.length &&
      content.charAt(i + openingLength) === "`"
    ) {
      openingLength++;
    }

    let scanIndex = i + openingLength;
    let closingIndex = -1;
    while (scanIndex < content.length) {
      const nextBacktick = content.indexOf("`", scanIndex);
      if (nextBacktick === -1) {
        break;
      }

      let closingLength = 0;
      while (
        nextBacktick + closingLength < content.length &&
        content.charAt(nextBacktick + closingLength) === "`"
      ) {
        closingLength++;
      }

      if (closingLength === openingLength) {
        closingIndex = nextBacktick;
        break;
      }

      scanIndex = nextBacktick + closingLength;
    }

    if (closingIndex === -1) {
      output.push(content.slice(i, i + openingLength));
      i += openingLength;
      continue;
    }

    const codeSpan = content.slice(i, closingIndex + openingLength);
    codeSpans.push(codeSpan);
    output.push(`__CODESPAN_${codeSpans.length - 1}__`);
    i = closingIndex + openingLength;
  }

  return {
    content: output.join(""),
    codeSpans,
  };
}

export function injectExplicitHeadingIds(content: string): string {
  if (!content) {
    return content;
  }

  const {
    content: maskedContent,
    codeBlocks,
    codeBlockPlaceholders,
  } = maskCodeFences(content);
  const reservedIds = new Set<string>();
  const headingCounts = new Map<string, number>();

  const lines = maskedContent.split("\n");
  for (const line of lines) {
    if (
      codeBlockPlaceholders.some((placeholder) => line.includes(placeholder))
    ) {
      continue;
    }

    const fullMatch = line.match(
      /^(\s{0,3})(#{1,6})\s+(.+?)\s*\{#([^}]+)\}\s*$/
    );
    if (fullMatch) {
      const [, , , , explicitId] = fullMatch;
      if (explicitId) {
        reservedIds.add(explicitId);
      }
      continue;
    }

    const explicitIdMatch = line.match(/\s\{#([^}]+)\}\s*$/);
    if (explicitIdMatch) {
      const explicitId = explicitIdMatch[1];
      reservedIds.add(explicitId);
    }
  }

  const updatedLines = lines.map((line) => {
    if (
      codeBlockPlaceholders.some((placeholder) => line.includes(placeholder))
    ) {
      return line;
    }

    const explicitHeadingMatch = line.match(
      /^(\s{0,3})(#{1,6})\s+(.+?)\s*\{#([^}]+)\}\s*$/
    );
    if (explicitHeadingMatch) {
      return line;
    }

    const headingMatch = line.match(/^(\s{0,3})(#{1,6})\s+(.+?)\s*$/);
    if (!headingMatch) {
      return line;
    }

    const [, leadingWhitespace, hashes, headingText] = headingMatch;
    const baseId = createSafeSlug(headingText);
    if (!baseId) {
      return line;
    }

    let counter = headingCounts.get(baseId) ?? 0;
    let headingId = counter === 0 ? baseId : `${baseId}-${counter}`;
    while (reservedIds.has(headingId) || headingCounts.has(headingId)) {
      counter++;
      headingId = `${baseId}-${counter}`;
    }
    headingCounts.set(baseId, counter + 1);
    if (headingId !== baseId) {
      headingCounts.set(headingId, 1);
    }

    return `${leadingWhitespace}${hashes} ${headingText} {#${headingId}}`;
  });

  return restoreCodeFences(updatedLines.join("\n"), codeBlocks);
}

/**
 * Sanitizes markdown content to fix malformed HTML/JSX tags that cause MDX compilation errors
 * @param content - The markdown content string
 * @returns Sanitized content with fixed HTML/JSX tags
 */
export function sanitizeMarkdownContent(content: string): string {
  // Fix specific malformed patterns that cause MDX errors

  // 0. Mask code fences (```...```) and inline code (`...`) to avoid altering them
  const {
    content: maskedContent,
    codeBlocks,
    codeBlockPlaceholders,
  } = maskCodeFences(content);
  const { content: maskedWithCodeSpans, codeSpans } =
    maskInlineCodeSpans(maskedContent);
  content = maskedWithCodeSpans;

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
  content = restoreCodeFences(content, codeBlocks);
  let restoredContent = content;
  for (const [index, codeSpan] of codeSpans.entries()) {
    restoredContent = restoredContent.replaceAll(
      `__CODESPAN_${index}__`,
      codeSpan
    );
  }
  content = restoredContent;

  return content;
}
