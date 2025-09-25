import type {
  BlockObject,
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
  hasCustomTitle: boolean;
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

/**
 * Generate Docusaurus admonition title from callout properties
 */
function generateTitle(
  icon: string | null,
  content: string,
  admonitionType: DocusaurusAdmonitionType
): { title: string | undefined; hasCustomTitle: boolean } {
  // If we have an icon, use it as the title
  if (icon) {
    return { title: icon, hasCustomTitle: true };
  }

  // For certain types, we might want to extract the first line as title
  const lines = content.split("\n");
  const firstLine = lines[0]?.trim();

  // If the first line looks like a title (short, with formatting indicators)
  if (firstLine && firstLine.length < 100 && lines.length > 1) {
    // Check if first line has bold formatting or ends with colon
    if (firstLine.includes("**") || firstLine.endsWith(":")) {
      return {
        title: firstLine.replace(/\*\*/g, "").replace(/:$/, "").trim(),
        hasCustomTitle: true,
      };
    }
  }

  // Use default Docusaurus admonition titles
  return { title: undefined, hasCustomTitle: false };
}

/**
 * Process a Notion callout block into Docusaurus admonition format
 */
export function processCalloutBlock(
  calloutProperties: CalloutBlockProperties
): ProcessedCallout {
  // Map Notion color to Docusaurus admonition type
  const admonitionType =
    CALLOUT_COLOR_MAPPING[calloutProperties.color] ||
    CALLOUT_COLOR_MAPPING.default;

  // Extract text content
  const content = extractTextFromRichText(calloutProperties.rich_text);

  // Extract icon
  const icon = extractIconText(calloutProperties.icon);

  // Generate title
  const { title, hasCustomTitle } = generateTitle(
    icon,
    content,
    admonitionType
  );

  // Handle content processing for custom titles
  let finalContent = content;
  if (hasCustomTitle && title) {
    // Use simple string matching instead of regex for security
    const lines = content.split("\n");
    const firstLine = lines[0]?.trim() || "";

    // Clean the first line by removing markdown formatting for comparison
    const cleanedFirstLine = firstLine.replace(/\*\*/g, "").replace(/:$/, "").trim().toLowerCase();
    const cleanedTitle = title.toLowerCase();
    
    // Check if first line matches the title (with or without formatting)
    if (cleanedFirstLine === cleanedTitle) {
      // Remove the first line and rejoin
      finalContent = lines.slice(1).join("\n").trim();
    } else if (cleanedFirstLine.startsWith(cleanedTitle)) {
      // Remove the title part from the first line using string operations
      let processedLine = firstLine.replace(/\*\*/g, ""); // Remove bold formatting
      
      // Remove the title text (case-insensitive)
      const titleIndex = processedLine.toLowerCase().indexOf(title.toLowerCase());
      if (titleIndex === 0) {
        processedLine = processedLine.slice(title.length);
      }
      
      // Remove colon and whitespace at the beginning
      processedLine = processedLine.replace(/^:\s*/, "").trim();
      
      if (processedLine) {
        lines[0] = processedLine;
        finalContent = lines.join("\n").trim();
      } else {
        finalContent = lines.slice(1).join("\n").trim();
      }
    }
  }

  return {
    type: admonitionType,
    title,
    content: finalContent,
    hasCustomTitle,
  };
}

/**
 * Convert processed callout to Docusaurus admonition markdown syntax
 */
export function calloutToAdmonition(
  processedCallout: ProcessedCallout
): string {
  const { type, title, content } = processedCallout;

  // Build the admonition opening
  let admonition = `:::${type}`;
  if (title) {
    admonition += ` ${title}`;
  }
  admonition += "\n";

  // Add content (preserve any existing markdown formatting)
  if (content) {
    admonition += content + "\n";
  }

  // Close the admonition
  admonition += ":::\n";

  return admonition;
}

/**
 * Check if a block is a callout block
 */
export function isCalloutBlock(
  block: BlockObject
): block is BlockObject & { type: "callout" } {
  return block.type === "callout";
}

/**
 * Main processing function to convert a callout block to admonition markdown
 */
export function convertCalloutToAdmonition(block: BlockObject): string | null {
  if (!isCalloutBlock(block)) {
    return null;
  }

  // Type assertion since we've confirmed this is a callout block
  const calloutBlock = block as any;
  const calloutProperties: CalloutBlockProperties = calloutBlock.callout;

  if (!calloutProperties) {
    return null;
  }

  const processedCallout = processCalloutBlock(calloutProperties);
  return calloutToAdmonition(processedCallout);
}
