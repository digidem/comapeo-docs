import type {
  BlockObjectResponse,
  CalloutBlockObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

/**
 * Notion callout colors mapped to Docusaurus admonition types
 */
export const CALLOUT_COLOR_MAPPING = {
  blue_background: "info",
  yellow_background: "warning",
  red_background: "danger",
  green_background: "tip",
  gray_background: "note",
  orange_background: "caution",
  purple_background: "note",
  pink_background: "note",
  brown_background: "note",
  default: "note",
} as const;

export type NotionCalloutColor = keyof typeof CALLOUT_COLOR_MAPPING;
export type DocusaurusAdmonitionType =
  (typeof CALLOUT_COLOR_MAPPING)[NotionCalloutColor];

type NotionCalloutIcon =
  | { type: "emoji"; emoji?: string }
  | { type: "external"; external?: { url: string } }
  | { type: "file"; file?: { url: string } }
  | {
      type: "custom_emoji";
      custom_emoji?: { id?: string; name?: string; url?: string };
    };

/**
 * Interface for callout block properties
 */
export interface CalloutBlockProperties {
  rich_text: RichTextItemResponse[];
  icon?: NotionCalloutIcon | null;
  color: string;
}

/**
 * Interface for processed callout data
 */
export interface ProcessedCallout {
  type: DocusaurusAdmonitionType;
  title?: string;
  content: string;
  children?: string;
}

interface ProcessCalloutOptions {
  markdownLines?: string[];
  children?: string;
}

const LOCALE_SPACE_CLASS = "[\\s\\u00A0\\u2007\\u202F]";
const ICON_SEPARATOR_CLASS =
  "[:;!?¡¿\-\u2013\u2014\u2212\u2011\u2012\uFF1A\uFE55\uA789\uFF1B\uFF0C\u3001\u3002\uFF0E\u00B7\u2022\u30FB\.]";
const TITLE_SEPARATOR_CLASS =
  "[:!?¡¿\-\u2013\u2014\u2212\u2011\u2012\uFF1A\uFE55\uA789]";
const PLAIN_TITLE_SEPARATOR_CLASS = "[:¡¿\uFF1A\uFE55\uA789]";

/**
 * Extract emoji or icon from Notion callout icon property
 */
function extractIconText(icon?: CalloutBlockProperties["icon"]): string | null {
  if (!icon) return null;

  if (icon.type === "emoji" && icon.emoji) {
    return icon.emoji;
  }

  // For external/file icons, we could potentially download and process them,
  // but for now, we'll skip them to keep things simple
  return null;
}

/**
 * Extract plain text content from Notion rich text array
 */
function extractTextFromRichText(richText: RichTextItemResponse[]): string {
  const parts = richText.map((textObj) => {
    if (typeof textObj.plain_text === "string") {
      return textObj.plain_text;
    }
    if (textObj.type === "equation") {
      return textObj.equation.expression || "";
    }
    if (textObj.type === "text") {
      return textObj.text.content;
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

function normalizeLines(
  markdownLines?: string[],
  fallbackText?: string
): string[] {
  if (markdownLines && markdownLines.length > 0) {
    // Preserve leading indentation; only strip trailing whitespace
    return markdownLines.map((line) => line.replace(/\s+$/u, ""));
  }

  if (!fallbackText) {
    return [];
  }

  // Preserve leading indentation on fallback-derived lines as well
  return fallbackText.split("\n").map((line) => line.replace(/\s+$/u, ""));
}

function stripIconFromLines(lines: string[], icon: string): string[] {
  if (lines.length === 0) return lines;

  const [firstLine, ...rest] = lines;
  const leading = firstLine.match(/^\s*/)?.[0] ?? "";
  const trimmed = firstLine.slice(leading.length);

  // Do not strip when the first non-space char starts a code fence, inline code, blockquote, or admonition fence
  if (
    /^`{1,3}/.test(trimmed) ||
    trimmed.startsWith(">") ||
    trimmed.startsWith(":::")
  ) {
    return lines;
  }

  if (!trimmed.startsWith(icon)) {
    return lines;
  }

  let remainder = trimmed.slice(icon.length);
  if (remainder.length === 0) {
    return rest;
  }

  const whitespaceAfterIconPattern = new RegExp(`^${LOCALE_SPACE_CLASS}+`, "u");
  const separatorAfterIconPattern = new RegExp(
    `^${LOCALE_SPACE_CLASS}*${ICON_SEPARATOR_CLASS}${LOCALE_SPACE_CLASS}+`,
    "u"
  );
  const localeColonNoSpacePattern = new RegExp(
    `^${LOCALE_SPACE_CLASS}*[\\uFF1A\\uFE55\\uA789]`,
    "u"
  );

  const whitespaceMatch = remainder.match(whitespaceAfterIconPattern);
  if (whitespaceMatch) {
    remainder = remainder.slice(whitespaceMatch[0].length);
    return remainder ? [`${leading}${remainder}`, ...rest] : rest;
  }

  const separatorMatch = remainder.match(separatorAfterIconPattern);
  if (separatorMatch) {
    remainder = remainder.slice(separatorMatch[0].length);
    return remainder ? [`${leading}${remainder}`, ...rest] : rest;
  }

  const localeColonNoSpaceMatch = remainder.match(localeColonNoSpacePattern);
  if (localeColonNoSpaceMatch) {
    remainder = remainder.slice(localeColonNoSpaceMatch[0].length);
    return remainder ? [`${leading}${remainder}`, ...rest] : rest;
  }

  // Conservative fallback: only strip icon without explicit separator when the
  // following grapheme is punctuation/symbol, not alphanumeric content.
  if (/^[\p{P}\p{S}]/u.test(remainder)) {
    return remainder ? [`${leading}${remainder}`, ...rest] : rest;
  }

  return lines;
}

function extractTitleFromLines(lines: string[]): {
  title?: string;
  contentLines: string[];
} {
  if (lines.length === 0) return { contentLines: [] };

  const [firstLine, ...restLines] = lines;
  const leading = firstLine.match(/^\s*/)?.[0] ?? "";
  const trimmed = firstLine.trim();

  // Match **Title** with optional locale separator and optional same-line content
  const boldTitlePattern = new RegExp(
    `^\\*\\*(.+?)\\*\\*(?:${LOCALE_SPACE_CLASS}*(${TITLE_SEPARATOR_CLASS})${LOCALE_SPACE_CLASS}*)?(.*)$`,
    "u"
  );
  const boldMatch = trimmed.match(boldTitlePattern);
  if (boldMatch) {
    const rawTitle = boldMatch[1].trim();
    const separator = boldMatch[2];
    const sameLineRemainder = boldMatch[3]?.trimStart() ?? "";
    const rawTitleEndsWithSeparator =
      /[:\-\u2013\u2014\u2212\u2011\u2012\uFF1A\uFE55\uA789]+$/u.test(rawTitle);
    const hasWhitespaceGapAfterBold = /^\*\*.+?\*\*\s+/u.test(trimmed);

    // Conservative: avoid parsing patterns like "**Title**text" as a title.
    if (
      !separator &&
      sameLineRemainder.length > 0 &&
      !rawTitleEndsWithSeparator &&
      !hasWhitespaceGapAfterBold
    ) {
      return { contentLines: lines };
    }

    // Remove trailing punctuation commonly used in headings
    const title = rawTitle.replace(
      /[:\.!?;\uFF1A\uFE55\uA789\u3002\uFF01\uFF1F\uFF1B]+$/u,
      ""
    );
    const hasContent = sameLineRemainder.length > 0 || restLines.length > 0;
    if (title && hasContent) {
      const contentLines = sameLineRemainder
        ? [`${leading}${sameLineRemainder}`, ...restLines]
        : restLines;
      return { title, contentLines };
    }
  }

  // Conservative plain "Title: content" case (short, single-phrase title)
  // Allow any leading Unicode letter and mixed case, short single-phrase title before a locale colon.
  const plainTitlePattern = new RegExp(
    `^([\\p{L}][^:\\uFF1A\\uFE55\\uA789\\n]{0,49}?)${LOCALE_SPACE_CLASS}*${PLAIN_TITLE_SEPARATOR_CLASS}${LOCALE_SPACE_CLASS}*(.*)$`,
    "u"
  );
  const colonMatch = trimmed.match(plainTitlePattern);
  if (colonMatch) {
    const titleCandidate = colonMatch[1].trim();
    const sameLineRemainder = colonMatch[2]?.trimStart() ?? "";
    const hasContent = sameLineRemainder.length > 0 || restLines.length > 0;
    if (titleCandidate && hasContent) {
      const contentLines = sameLineRemainder
        ? [`${leading}${sameLineRemainder}`, ...restLines]
        : restLines;
      return { title: titleCandidate, contentLines };
    }
  }

  return { contentLines: lines };
}

const toAdmonitionType = (color: string): DocusaurusAdmonitionType => {
  if (color in CALLOUT_COLOR_MAPPING) {
    return CALLOUT_COLOR_MAPPING[color as NotionCalloutColor];
  }

  return CALLOUT_COLOR_MAPPING.default;
};

/**
 * Process a Notion callout block into Docusaurus admonition format
 */
export function processCalloutBlock(
  calloutProperties: CalloutBlockProperties,
  options: ProcessCalloutOptions = {}
): ProcessedCallout {
  // Map Notion color to Docusaurus admonition type
  const admonitionType = toAdmonitionType(calloutProperties.color);

  const fallbackContent = extractTextFromRichText(calloutProperties.rich_text);
  let contentLines = normalizeLines(options.markdownLines, fallbackContent);

  const icon = extractIconText(calloutProperties.icon);

  if (icon) {
    contentLines = stripIconFromLines(contentLines, icon);
  }

  // Try to extract a textual title even when an icon exists; fall back to icon if none found
  let derivedTitle: string | undefined = undefined;
  let linesWithoutTitle: string[] = contentLines;
  if (icon) {
    const extracted = extractTitleFromLines(contentLines);
    if (extracted.title) {
      derivedTitle = `${icon} ${extracted.title}`;
      linesWithoutTitle = extracted.contentLines;
    } else {
      derivedTitle = icon;
    }
  } else {
    const extracted = extractTitleFromLines(contentLines);
    derivedTitle = extracted.title;
    linesWithoutTitle = extracted.contentLines;
  }

  const joinedContent = linesWithoutTitle.join("\n");
  const finalContent = joinedContent
    .replace(/^[\s\t]*\n+/u, "")
    .replace(/\n+[\s\t]*$/u, "");

  return {
    type: admonitionType,
    title: derivedTitle,
    content: finalContent,
    children: options.children,
  };
}

/**
 * Convert processed callout to Docusaurus admonition markdown syntax
 */
export function calloutToAdmonition(
  processedCallout: ProcessedCallout
): string {
  const { type, title, content, children } = processedCallout;
  const lines = [`:::${type}${title ? ` ${title}` : ""}`];

  if (content) {
    lines.push(content);
  }

  if (children) {
    lines.push(children);
  }

  lines.push(":::");
  return lines.join("\n");
}

/**
 * Check if a block is a callout block
 */
export function isCalloutBlock(
  block: PartialBlockObjectResponse | BlockObjectResponse
): block is CalloutBlockObjectResponse {
  return "type" in block && block.type === "callout";
}

/**
 * Main processing function to convert a callout block to admonition markdown
 */
export function convertCalloutToAdmonition(
  block: PartialBlockObjectResponse | BlockObjectResponse,
  markdownLines?: string[],
  children?: string
): string | null {
  if (!isCalloutBlock(block)) {
    return null;
  }

  // Type assertion since we've confirmed this is a callout block
  const calloutBlock = block as CalloutBlockObjectResponse;
  if (!calloutBlock.callout) {
    return null;
  }

  const calloutProperties: CalloutBlockProperties = calloutBlock.callout;

  if (!calloutProperties) {
    return null;
  }

  const processedCallout = processCalloutBlock(calloutProperties, {
    markdownLines,
    children,
  });
  return calloutToAdmonition(processedCallout);
}
