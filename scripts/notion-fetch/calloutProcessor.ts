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

/**
 * Interface for callout block properties
 */
export interface CalloutBlockProperties {
  rich_text: RichTextItemResponse[];
  icon?: {
    type: "emoji" | "external" | "file";
    emoji?: string;
    external?: { url: string };
    file?: { url: string };
  } | null;
  color: NotionCalloutColor;
}

/**
 * Interface for processed callout data
 */
export interface ProcessedCallout {
  type: DocusaurusAdmonitionType;
  title?: string;
  content: string;
}

interface ProcessCalloutOptions {
  markdownLines?: string[];
}

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
  return richText
    .map((textObj) => {
      if (textObj.type === "text") {
        return textObj.text.content;
      } else if (textObj.type === "mention") {
        return textObj.plain_text || "";
      } else if (textObj.type === "equation") {
        return textObj.equation.expression || "";
      }
      return textObj.plain_text || "";
    })
    .join("");
}

function normalizeLines(
  markdownLines?: string[],
  fallbackText?: string
): string[] {
  if (markdownLines && markdownLines.length > 0) {
    return markdownLines.map((line) => line.replace(/\s+$/u, ""));
  }

  if (!fallbackText) {
    return [];
  }

  return fallbackText.split("\n").map((line) => line.trim());
}

function stripIconFromLines(lines: string[], icon: string): string[] {
  if (lines.length === 0) {
    return lines;
  }

  const [firstLine, ...rest] = lines;
  const trimmed = firstLine.trimStart();

  if (!trimmed.startsWith(icon)) {
    return lines;
  }

  const remainder = trimmed.slice(icon.length).trimStart();
  if (remainder) {
    return [remainder, ...rest];
  }

  return rest;
}

function extractTitleFromLines(lines: string[]): {
  title?: string;
  contentLines: string[];
} {
  if (lines.length === 0) {
    return { contentLines: [] };
  }

  const [firstLine, ...restLines] = lines;
  const trimmed = firstLine.trim();

  const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*:?(.*)$/u);
  if (boldMatch) {
    const title = boldMatch[1].trim().replace(/:$/u, "");
    if (title) {
      const remainder = boldMatch[2].trimStart();
      const contentLines = remainder ? [remainder, ...restLines] : restLines;
      return { title, contentLines };
    }
  }

  const colonMatch = trimmed.match(/^([^:]{1,100})\s*:(.*)$/u);
  if (colonMatch) {
    const titleCandidate = colonMatch[1].trim().replace(/:$/u, "");
    const remainder = colonMatch[2].trimStart();
    const hasContent = remainder.length > 0 || restLines.length > 0;

    if (titleCandidate && hasContent) {
      const contentLines = remainder ? [remainder, ...restLines] : restLines;
      return { title: titleCandidate, contentLines };
    }
  }

  return { contentLines: lines };
}

/**
 * Process a Notion callout block into Docusaurus admonition format
 */
export function processCalloutBlock(
  calloutProperties: CalloutBlockProperties,
  options: ProcessCalloutOptions = {}
): ProcessedCallout {
  // Map Notion color to Docusaurus admonition type
  const admonitionType =
    CALLOUT_COLOR_MAPPING[calloutProperties.color] ||
    CALLOUT_COLOR_MAPPING.default;

  const fallbackContent = extractTextFromRichText(calloutProperties.rich_text);
  let contentLines = normalizeLines(options.markdownLines, fallbackContent);

  const icon = extractIconText(calloutProperties.icon);

  if (icon) {
    contentLines = stripIconFromLines(contentLines, icon);
  }

  const { title, contentLines: linesWithoutTitle } = icon
    ? { title: icon, contentLines }
    : extractTitleFromLines(contentLines);

  const joinedContent = linesWithoutTitle.join("\n");
  const finalContent = joinedContent
    .replace(/^[\s\t]*\n+/u, "")
    .replace(/\n+[\s\t]*$/u, "");

  return {
    type: admonitionType,
    title,
    content: finalContent,
  };
}

/**
 * Convert processed callout to Docusaurus admonition markdown syntax
 */
export function calloutToAdmonition(
  processedCallout: ProcessedCallout
): string {
  const { type, title, content } = processedCallout;
  const lines = [`:::${type}${title ? ` ${title}` : ""}`];

  if (content) {
    lines.push(content);
  }

  lines.push(":::");
  return `${lines.join("\n")}\n`;
}

/**
 * Check if a block is a callout block
 */
export function isCalloutBlock(
  block: PartialBlockObjectResponse | BlockObjectResponse
): block is CalloutBlockObjectResponse {
  return block.type === "callout";
}

/**
 * Main processing function to convert a callout block to admonition markdown
 */
export function convertCalloutToAdmonition(
  block: PartialBlockObjectResponse | BlockObjectResponse,
  markdownLines?: string[]
): string | null {
  if (!isCalloutBlock(block)) {
    return null;
  }

  // Type assertion since we've confirmed this is a callout block
  const calloutBlock = block as CalloutBlockObjectResponse;
  const calloutProperties: CalloutBlockProperties = calloutBlock.callout;

  if (!calloutProperties) {
    return null;
  }

  const processedCallout = processCalloutBlock(calloutProperties, {
    markdownLines,
  });
  return calloutToAdmonition(processedCallout);
}
