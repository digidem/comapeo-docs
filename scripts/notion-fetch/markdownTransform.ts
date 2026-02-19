import type {
  BlockObjectResponse,
  CalloutBlockObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { n2m } from "../notionClient";
import { convertCalloutToAdmonition, isCalloutBlock } from "./calloutProcessor";

type CalloutBlockNode = CalloutBlockObjectResponse & {
  children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
};

const LEADING_LOCALE_SPACE_PATTERN = /^[\s\u00A0\u2007\u202F]+/u;
const LEADING_LOCALE_SEPARATOR_PATTERN =
  /^[\s\u00A0\u2007\u202F:;!?¡¿\-\u2013\u2014\u2212\u2011\u2012\uFF1A\uFE55\uA789\uFF1B\uFF0C\u3001\u3002\uFF0E\u00B7\u2022\u30FB\.]+/u;

function convertBlocksToMarkdown(
  blocks: Array<PartialBlockObjectResponse | BlockObjectResponse>
): string {
  if (!blocks || blocks.length === 0) {
    return "";
  }
  try {
    const markdown = n2m.toMarkdownString(
      blocks as Parameters<typeof n2m.toMarkdownString>[0]
    );
    return markdown.parent || "";
  } catch {
    return "";
  }
}

// Runtime note: Grapheme segmentation is most accurate with Intl.Segmenter
// (available in modern Node/Bun runtimes used by this repository).
function isExtendedPictographic(char: string): boolean {
  return /\p{Extended_Pictographic}/u.test(char);
}

function getLeadingEmojiGraphemeFallback(text: string): string {
  if (!text) {
    return "";
  }

  const firstCodePoint = text.codePointAt(0);
  if (firstCodePoint === undefined) {
    return "";
  }

  const firstChar = String.fromCodePoint(firstCodePoint);
  if (!isExtendedPictographic(firstChar)) {
    return "";
  }

  let offset = firstChar.length;
  while (offset < text.length) {
    const nextCodePoint = text.codePointAt(offset);
    if (nextCodePoint === undefined) {
      break;
    }

    const nextChar = String.fromCodePoint(nextCodePoint);
    if (nextCodePoint === 0xfe0f || nextCodePoint === 0xfe0e) {
      offset += nextChar.length;
      continue;
    }

    if (nextCodePoint === 0x200d) {
      const afterJoiner = offset + nextChar.length;
      const joinedCodePoint = text.codePointAt(afterJoiner);
      if (joinedCodePoint === undefined) {
        break;
      }

      const joinedChar = String.fromCodePoint(joinedCodePoint);
      if (!isExtendedPictographic(joinedChar)) {
        break;
      }

      offset = afterJoiner + joinedChar.length;
      continue;
    }

    break;
  }

  return text.slice(0, offset);
}

function getFirstGrapheme(text: string): string {
  const SegmenterCtor = (Intl as { Segmenter?: typeof Intl.Segmenter })
    .Segmenter;
  if (SegmenterCtor) {
    const segmenter = new SegmenterCtor(undefined, {
      granularity: "grapheme",
    });
    const segments = segmenter.segment(text);
    for (const segment of segments) {
      if (typeof segment?.segment === "string") {
        return segment.segment;
      }
      break;
    }
  }

  const emojiPrefix = getLeadingEmojiGraphemeFallback(text);
  if (emojiPrefix) {
    return emojiPrefix;
  }

  return Array.from(text)[0] ?? "";
}

/**
 * Post-process markdown to ensure no broken image references remain
 */
export function sanitizeMarkdownImages(content: string): string {
  if (!content) return content;

  // Cap processing size to avoid ReDoS on pathological inputs
  const MAX_LEN = 2_000_000;
  const text = content.length > MAX_LEN ? content.slice(0, MAX_LEN) : content;

  // If no images found, just check for truncation
  if (text.indexOf("![") === -1) {
    if (text.length !== content.length) {
      return text + "\n\n<!-- Content truncated for sanitation safety -->";
    }
    return content;
  }

  let sanitized = text;

  // Pattern 1: Completely empty URLs
  sanitized = sanitized.replace(
    /!\[([^\]]*)\]\(\s*\)/g,
    "**[Image: $1]** *(Image URL was empty)*"
  );

  // Pattern 2: Invalid literal placeholders
  sanitized = sanitized.replace(
    /!\[([^\]]*)\]\(\s*(?:undefined|null)\s*\)/g,
    "**[Image: $1]** *(Image URL was invalid)*"
  );

  // Pattern 3: Unencoded whitespace inside URL (safe regex without nested greedy scans)
  // Matches any whitespace in the URL excluding escaped closing parens and %20
  sanitized = sanitized.replace(
    /!\[([^\]]*)\]\(\s*([^()\s][^()\r\n]*?(?:\s+)[^()\r\n]*?)\s*\)/g,
    "**[Image: $1]** *(Image URL contained whitespace)*"
  );

  // If we truncated, append a notice to avoid corrupting content silently
  if (text.length !== content.length) {
    return sanitized + "\n\n<!-- Content truncated for sanitation safety -->";
  }
  return sanitized;
}

/**
 * Ensure standalone bold lines (`**Heading**`) are treated as their own paragraphs
 * by inserting a blank line when missing. This preserves Notion formatting where
 * bold text represents a section title followed by descriptive copy.
 */
export function ensureBlankLineAfterStandaloneBold(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is bounded by lines.length in this loop
    const line = lines[i];
    result.push(line);

    const nextLine = lines[i + 1];
    const isStandaloneBold = /^\s*\*\*[^*].*\*\*\s*$/.test(line.trim());
    const nextLineHasContent =
      nextLine !== undefined && nextLine.trim().length > 0;

    if (isStandaloneBold && nextLineHasContent) {
      result.push("");
    }
  }

  return result.join("\n");
}

/**
 * Normalize text for matching by handling Unicode variants and emoji
 */
export function normalizeForMatch(text: string): string {
  // Normalize Unicode to reduce variant mismatches (e.g., emoji, punctuation)
  const nfkc =
    typeof text.normalize === "function" ? text.normalize("NFKC") : text;

  let stripped = nfkc.replace(LEADING_LOCALE_SPACE_PATTERN, "");
  const firstGrapheme = getFirstGrapheme(stripped);
  if (firstGrapheme && /\p{Extended_Pictographic}/u.test(firstGrapheme)) {
    stripped = stripped.slice(firstGrapheme.length);
    stripped = stripped.replace(LEADING_LOCALE_SEPARATOR_PATTERN, "");
  }

  return stripped.replace(/\s+/g, " ").trim();
}

/**
 * Extract text content from a callout block for matching
 */
const isRichTextItemArray = (value: unknown): value is RichTextItemResponse[] =>
  Array.isArray(value);

const isCalloutBlockWithRichText = (
  block: unknown
): block is Pick<CalloutBlockObjectResponse, "callout"> => {
  if (!block || typeof block !== "object") {
    return false;
  }

  const calloutValue = (block as { callout?: unknown }).callout;
  if (!calloutValue || typeof calloutValue !== "object") {
    return false;
  }

  return isRichTextItemArray(
    (calloutValue as { rich_text?: unknown }).rich_text
  );
};

/**
 * Extract text content from a callout block for matching
 */
export function extractTextFromCalloutBlock(block: unknown): string {
  if (!isCalloutBlockWithRichText(block)) {
    return "";
  }

  const rich = block.callout.rich_text;

  const parts = rich.map((item) => {
    if (typeof item.plain_text === "string") {
      return item.plain_text;
    }
    if (item.type === "text" && item.text.content != null) {
      return item.text.content;
    }
    return "";
  });

  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is bounded by parts.length in this loop
    const cur = parts[i];
    if (!cur) continue;
    if (
      result.length > 0 &&
      !/\s$/.test(result[result.length - 1]) &&
      !/^\s/.test(cur)
    ) {
      result.push(" ");
    }
    result.push(cur);
  }
  return result.join("");
}

/**
 * Find a matching blockquote in markdown lines based on search text
 */
export function findMatchingBlockquote(
  lines: string[],
  searchText: string,
  fromIndex: number
): { start: number; end: number; contentLines: string[] } | null {
  const normalizedSearch = normalizeForMatch(searchText);
  if (!normalizedSearch) return null;

  const stripQuote = (line: string) => line.replace(/^\s*>+\s?/, "");

  for (let i = fromIndex; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is bounded by lines.length in this loop
    if (!lines[i].trimStart().startsWith(">")) continue;

    const blockLines: string[] = [];
    let end = i;
    while (end < lines.length) {
      // eslint-disable-next-line security/detect-object-injection -- end is bounded by lines.length in this loop
      const l = lines[end];
      if (l.trim() === "") {
        // allow blank lines inside the blockquote region
        blockLines.push(l);
        end++;
        continue;
      }
      if (!l.trimStart().startsWith(">")) break;
      blockLines.push(l);
      end++;
    }
    end -= 1;

    const contentLines = blockLines.map((line) =>
      line.trim() === "" ? "" : stripQuote(line)
    );
    const normalizedContent = normalizeForMatch(contentLines.join(" "));

    if (normalizedContent.includes(normalizedSearch)) {
      return { start: i, end, contentLines };
    }

    i = end;
  }

  return null;
}

/**
 * Process callout blocks in the markdown string to convert them to Docusaurus admonitions
 */
export function processCalloutsInMarkdown(
  markdownContent: string,
  blocks: Array<PartialBlockObjectResponse | BlockObjectResponse>
): string {
  if (!markdownContent || !blocks || blocks.length === 0) {
    return markdownContent;
  }

  const lines = markdownContent.split("\n");
  const calloutBlocks: CalloutBlockNode[] = [];

  function collectCallouts(
    blockList: Array<PartialBlockObjectResponse | BlockObjectResponse>
  ) {
    for (const block of blockList) {
      if (isCalloutBlock(block)) {
        calloutBlocks.push(block as CalloutBlockNode);
      }

      const potentialChildren = (
        block as {
          children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
        }
      ).children;

      if (Array.isArray(potentialChildren)) {
        collectCallouts(potentialChildren);
      }
    }
  }

  collectCallouts(blocks);

  let searchIndex = 0;

  for (const calloutBlock of calloutBlocks) {
    const searchText = extractTextFromCalloutBlock(calloutBlock);
    const match = findMatchingBlockquote(lines, searchText, searchIndex);

    if (!match) {
      continue;
    }

    const calloutChildren = (calloutBlock as CalloutBlockNode).children;
    const childrenMarkdown = calloutChildren
      ? convertBlocksToMarkdown(calloutChildren)
      : undefined;

    const admonitionMarkdown = convertCalloutToAdmonition(
      calloutBlock,
      match.contentLines,
      childrenMarkdown
    );

    if (!admonitionMarkdown) {
      continue;
    }

    // Guard: avoid replacing inside code fences or existing admonitions
    const isWithinFenceOrAdmonition = (() => {
      let fenceDelim: string | null = null;
      let inAdmonition = false;
      for (let i = 0; i <= match.end; i++) {
        // eslint-disable-next-line security/detect-object-injection -- i is bounded by match.end and lines length from matcher
        const ln = lines[i].trim();
        // eslint-disable-next-line security/detect-unsafe-regex -- pattern is linear-time for fixed fence delimiters and short markdown lines
        const fenceMatch = ln.match(/^(```+|~~~+)(.*)?$/);
        if (fenceMatch) {
          const delim = fenceMatch[1];
          if (!fenceDelim) {
            fenceDelim = delim;
          } else if (fenceDelim === delim) {
            fenceDelim = null;
          }
        }
        if (/^:::[a-z]+/i.test(ln)) inAdmonition = true;
        if (/^:::$/.test(ln)) inAdmonition = false;
      }
      // inside if fence is currently open or we're currently inside an admonition
      return fenceDelim !== null || inAdmonition;
    })();
    if (isWithinFenceOrAdmonition) {
      continue;
    }

    const leadingWhitespace = lines[match.start].match(/^\s*/)?.[0] ?? "";
    const admonitionLinesRaw = admonitionMarkdown.trimEnd().split("\n");
    const admonitionLines = admonitionLinesRaw.map((l) =>
      l.length ? `${leadingWhitespace}${l}` : l
    );
    const replaceCount = match.end - match.start + 1;
    lines.splice(match.start, replaceCount, ...admonitionLines);
    searchIndex = match.start + admonitionLines.length;
  }

  return lines.join("\n");
}
