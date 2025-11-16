import type {
  BlockObjectResponse,
  CalloutBlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { convertCalloutToAdmonition, isCalloutBlock } from "./calloutProcessor";

type CalloutBlockNode = CalloutBlockObjectResponse & {
  children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
};

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

  let stripped = nfkc;
  const graphemes = Array.from(stripped);
  if (graphemes.length > 0 && /\p{Extended_Pictographic}/u.test(graphemes[0])) {
    // Remove first grapheme safely
    stripped = graphemes.slice(1).join("");
    stripped = stripped.replace(/^[\s:;\-–—]+/u, "");
  }

  return stripped.replace(/\s+/g, " ").trim();
}

/**
 * Extract text content from a callout block for matching
 */
export function extractTextFromCalloutBlock(block: any): string {
  const rich = block?.callout?.rich_text;
  if (!Array.isArray(rich)) return "";

  const parts = rich.map((t: any) => {
    if (typeof t?.plain_text === "string") return t.plain_text;
    if (t?.type === "text" && t?.text?.content != null) return t.text.content;
    return "";
  });

  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
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
    if (!lines[i].trimStart().startsWith(">")) continue;

    const blockLines: string[] = [];
    let end = i;
    while (end < lines.length) {
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

    const admonitionMarkdown = convertCalloutToAdmonition(
      calloutBlock,
      match.contentLines
    );

    if (!admonitionMarkdown) {
      continue;
    }

    // Guard: avoid replacing inside code fences or existing admonitions
    const isWithinFenceOrAdmonition = (() => {
      let fenceDelim: string | null = null;
      let inAdmonition = false;
      for (let i = 0; i <= match.end; i++) {
        const ln = lines[i].trim();
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
