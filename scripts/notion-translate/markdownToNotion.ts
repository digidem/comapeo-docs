import { Client } from "@notionhq/client";
import { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import fs from "fs/promises";
import ora from "ora";
import chalk from "chalk";
// Define Root type for the AST
type Root = { type: "root"; children: unknown[] };
import {
  ENGLISH_MODIFICATION_ERROR,
  MAIN_LANGUAGE,
  MAX_RETRIES,
  NOTION_API_CHUNK_SIZE,
  NOTION_PROPERTIES,
} from "../constants.js";

const EMPTY_TRANSLATED_CONTENT_PREFIX = "Translated content is empty";
const TOO_MANY_BLOCKS_ERROR_PREFIX =
  "Translated content exceeds Notion block safety limit";
const MAX_NOTION_BLOCKS_PER_PAGE_SAFETY_LIMIT = 1000;
const MAX_RICH_TEXT_LENGTH = 1900; // Notion API limit is 2000; use 1900 to be safe

// Type definition for page results from dataSources.query
interface NotionPageResult {
  id: string;
  properties?: {
    [key: string]: {
      select?: { name: string } | null;
      [key: string]: unknown;
    };
  };
}

/**
 * Safely extracts the language property from a Notion page result
 */
function getLanguageFromPage(page: unknown): string | undefined {
  if (!page || typeof page !== "object") return undefined;
  const p = page as NotionPageResult;
  const langProp = p.properties?.[NOTION_PROPERTIES.LANGUAGE];
  if (!langProp || typeof langProp !== "object") return undefined;
  return langProp.select?.name;
}

// Define types for markdown nodes
interface HeadingNode {
  type: "heading";
  depth: 1 | 2 | 3;
  children: (TextNode | MarkdownNode)[];
}

interface ParagraphNode {
  type: "paragraph";
  children: (TextNode | MarkdownNode)[];
}

interface ListNode {
  type: "list";
  ordered: boolean;
  children: ListItemNode[];
}

interface ListItemNode {
  type: "listItem";
  children: (TextNode | MarkdownNode)[];
}

interface CodeNode {
  type: "code";
  value: string;
  lang?: string;
}

interface BlockquoteNode {
  type: "blockquote";
  children: (TextNode | MarkdownNode)[];
}

interface ThematicBreakNode {
  type: "thematicBreak";
}

interface ImageNode {
  type: "image";
  url: string;
  alt?: string;
}

interface TableCellNode {
  type: "tableCell";
  children: (TextNode | MarkdownNode)[];
}

interface TableRowNode {
  type: "tableRow";
  children: TableCellNode[];
}

interface TableNode {
  type: "table";
  align?: (string | null)[];
  children: TableRowNode[];
}

interface TextNode {
  type: "text";
  value: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

interface InlineCodeNode {
  type: "inlineCode";
  value: string;
}

type MarkdownNode =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | ListItemNode
  | CodeNode
  | BlockquoteNode
  | ThematicBreakNode
  | ImageNode
  | TableNode;

interface UnknownMarkdownNode {
  type?: unknown;
  value?: unknown;
  children?: unknown;
  [key: string]: unknown;
}

interface MarkdownConversionDiagnostics {
  frontMatterRemoved: boolean;
  trimmedContentLength: number;
  topLevelNodeTypes: string[];
  unsupportedTopLevelNodeTypes: string[];
  fallbackBlocksCreated: number;
}

interface MarkdownConversionResult {
  blocks: BlockObjectRequest[];
  diagnostics: MarkdownConversionDiagnostics;
}

/**
 * Parses markdown content and converts it to Notion blocks
 * @param markdownContent The markdown content to parse
 * @returns An array of Notion block objects
 */
export async function markdownToNotionBlocks(
  markdownContent: string
): Promise<BlockObjectRequest[]> {
  return convertMarkdownToNotionBlocks(markdownContent).blocks;
}

function convertMarkdownToNotionBlocks(
  markdownContent: string
): MarkdownConversionResult {
  const contentWithoutFrontMatter = removeFrontMatter(markdownContent);
  const trimmedContentLength = contentWithoutFrontMatter.trim().length;

  // Parse the markdown content (remarkGfm enables table, strikethrough, etc.)
  const processor = unified().use(remarkParse).use(remarkGfm);
  const ast = processor.parse(contentWithoutFrontMatter) as Root;

  // Array to store the Notion blocks
  const notionBlocks: BlockObjectRequest[] = [];
  const topLevelNodeTypes: string[] = [];
  const unsupportedTopLevelNodeTypes: string[] = [];
  let fallbackBlocksCreated = 0;

  for (const node of ast.children) {
    const nodeType = getNodeType(node);
    topLevelNodeTypes.push(nodeType);

    // Cast node to our custom type
    const typedNode = node as unknown as MarkdownNode;
    switch (typedNode.type) {
      case "heading": {
        const headingNode = typedNode as HeadingNode;
        const headingLevel = headingNode.depth;
        const headingRichText = getRichTextFromNode(headingNode);

        notionBlocks.push(createHeadingBlock(headingRichText, headingLevel));
        break;
      }

      case "paragraph": {
        const paragraphNode = typedNode as ParagraphNode;
        const paragraphRichText = getRichTextFromNode(paragraphNode);

        notionBlocks.push({
          paragraph: {
            rich_text: splitRichTextIntoItems(paragraphRichText),
          },
        });
        break;
      }

      case "list": {
        const listNode = typedNode as ListNode;
        const isOrdered = listNode.ordered;
        processListNode(listNode, notionBlocks, isOrdered);
        break;
      }

      case "code": {
        const codeNode = typedNode as CodeNode;
        const codeContent = codeNode.value;
        const language = codeNode.lang || "plain text";
        const mappedLanguage = mapCodeLanguage(language);

        // Notion API has a limit of 2000 characters per text content
        // Split code blocks that exceed this limit
        const MAX_CODE_BLOCK_LENGTH = 1900; // Using 1900 to be safe

        if (codeContent.length <= MAX_CODE_BLOCK_LENGTH) {
          // If code block is small enough, add it as is
          notionBlocks.push({
            type: "code",
            code: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: codeContent,
                  },
                },
              ],
              language: mappedLanguage,
            },
          });
        } else {
          // Split code into multiple blocks
          const codeChunks = [];
          let remainingCode = codeContent;

          while (remainingCode.length > 0) {
            // Find a good place to split (preferably at a newline)
            let splitIndex = MAX_CODE_BLOCK_LENGTH;
            if (remainingCode.length > MAX_CODE_BLOCK_LENGTH) {
              // Try to find a newline to split at
              const newlineIndex = remainingCode.lastIndexOf(
                "\n",
                MAX_CODE_BLOCK_LENGTH
              );
              if (newlineIndex > 0) {
                splitIndex = newlineIndex + 1; // Include the newline in the first chunk
              }
            } else {
              splitIndex = remainingCode.length;
            }

            // Add the chunk
            const chunk = remainingCode.substring(0, splitIndex);
            codeChunks.push(chunk);

            // Update remaining code
            remainingCode = remainingCode.substring(splitIndex);
          }

          // Add each chunk as a separate code block
          for (const codeChunk of codeChunks) {
            notionBlocks.push({
              type: "code",
              code: {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: codeChunk,
                    },
                  },
                ],
                language: mappedLanguage,
              },
            });
          }
        }
        break;
      }

      case "blockquote": {
        const quoteNode = typedNode as BlockquoteNode;
        const quoteRichText = getRichTextFromNode(quoteNode);

        notionBlocks.push({
          quote: {
            rich_text: splitRichTextIntoItems(quoteRichText),
          },
        });
        break;
      }

      case "thematicBreak": {
        notionBlocks.push({
          type: "divider",
          divider: {},
        });
        break;
      }

      case "table": {
        const tableNode = typedNode as unknown as TableNode;
        const rows = tableNode.children;
        if (rows.length === 0) break;

        const tableWidth = rows[0]?.children?.length ?? 0;
        if (tableWidth === 0) break;

        const tableRows = rows.map((row) => ({
          type: "table_row" as const,
          table_row: {
            cells: row.children.map((cell) => {
              const cellRichText = getRichTextFromNode(cell);
              return splitRichTextIntoItems(cellRichText);
            }),
          },
        }));

        notionBlocks.push({
          type: "table",
          table: {
            table_width: tableWidth,
            has_column_header: rows.length > 1,
            has_row_header: false,
            children: tableRows,
          },
        } as unknown as BlockObjectRequest);
        break;
      }

      case "image": {
        // For translations, we'll just convert images to text to avoid Notion API issues
        const imageNode = typedNode as ImageNode;
        const imageUrl = imageNode.url;
        const altText = imageNode.alt || "";

        // Always convert images to text for safety
        console.warn(`Converting image to text: ${imageUrl}`);
        notionBlocks.push({
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: `[Image: ${altText || imageUrl}]`,
                },
              },
            ],
          },
        });
        break;
      }
      default: {
        unsupportedTopLevelNodeTypes.push(nodeType);
        const fallbackText = getFallbackTextFromUnsupportedNode(node);
        if (fallbackText.length > 0) {
          notionBlocks.push({
            paragraph: {
              rich_text: splitIntoRichTextItems(fallbackText),
            },
          });
          fallbackBlocksCreated++;
        }
      }
    }
  }

  return {
    blocks: notionBlocks,
    diagnostics: {
      frontMatterRemoved: contentWithoutFrontMatter !== markdownContent,
      trimmedContentLength,
      topLevelNodeTypes: [...new Set(topLevelNodeTypes)],
      unsupportedTopLevelNodeTypes: [...new Set(unsupportedTopLevelNodeTypes)],
      fallbackBlocksCreated,
    },
  };
}

function getNodeType(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "unknown";
  }
  const typedNode = node as UnknownMarkdownNode;
  return typeof typedNode.type === "string" ? typedNode.type : "unknown";
}

function getFallbackTextFromUnsupportedNode(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const typedNode = node as UnknownMarkdownNode;

  if (
    typedNode.type === "definition" &&
    typeof typedNode.url === "string" &&
    typedNode.url.trim().length > 0
  ) {
    const identifier =
      typeof typedNode.identifier === "string" ? typedNode.identifier : "ref";
    return `[${identifier}]: ${typedNode.url.trim()}`;
  }

  const textContent = getTextFromNode(node).trim();
  if (textContent.length > 0) {
    return textContent;
  }

  return "";
}

// Define a TextNode type for text elements
interface NotionRichText {
  type: "text";
  text: {
    content: string;
    link?: { url: string };
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

interface NotionAnnotations {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
}

function getRichTextFromNode(node: unknown): NotionRichText[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const typedNode = node as Record<string, unknown>;

  if (typedNode.type === "image") {
    const altText =
      typeof typedNode.alt === "string" ? typedNode.alt.trim() : "";
    const imageUrl =
      typeof typedNode.url === "string" ? typedNode.url.trim() : "";
    if (altText.length > 0 || imageUrl.length > 0) {
      return [
        { type: "text", text: { content: `[Image: ${altText || imageUrl}]` } },
      ];
    }
    return [];
  }

  if (typedNode.type === "link") {
    const linkUrl = typeof typedNode.url === "string" ? typedNode.url : "";
    const children = typedNode.children;
    if (Array.isArray(children)) {
      const childRichTexts: NotionRichText[] = [];
      for (const child of children) {
        const childTexts = getRichTextFromNode(child);
        for (const ct of childTexts) {
          if (linkUrl && !ct.text.link) {
            ct.text.link = { url: linkUrl };
          }
          childRichTexts.push(ct);
        }
      }
      return childRichTexts;
    }
    return linkUrl
      ? [{ type: "text", text: { content: linkUrl, link: { url: linkUrl } } }]
      : [];
  }

  if (typedNode.type === "inlineCode") {
    const value = typeof typedNode.value === "string" ? typedNode.value : "";
    return [
      {
        type: "text",
        text: { content: value },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: true,
        },
      },
    ];
  }

  if (typedNode.type === "text" && typeof typedNode.value === "string") {
    const annotations: NotionAnnotations = {
      bold: typedNode.bold === true,
      italic: typedNode.italic === true,
      strikethrough: typedNode.strikethrough === true,
      underline: typedNode.underline === true,
      code: false,
    };
    const hasAnnotations =
      annotations.bold ||
      annotations.italic ||
      annotations.strikethrough ||
      annotations.underline;
    return [
      {
        type: "text",
        text: { content: typedNode.value },
        ...(hasAnnotations ? { annotations } : {}),
      },
    ];
  }

  if (typedNode.type === "strong" || typedNode.type === "bold") {
    const children = typedNode.children;
    if (Array.isArray(children)) {
      const childRichTexts: NotionRichText[] = [];
      for (const child of children) {
        const childTexts = getRichTextFromNode(child);
        for (const ct of childTexts) {
          if (!ct.annotations) {
            ct.annotations = {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
            };
          }
          ct.annotations.bold = true;
          childRichTexts.push(ct);
        }
      }
      return childRichTexts;
    }
    return [];
  }

  if (typedNode.type === "emphasis" || typedNode.type === "italic") {
    const children = typedNode.children;
    if (Array.isArray(children)) {
      const childRichTexts: NotionRichText[] = [];
      for (const child of children) {
        const childTexts = getRichTextFromNode(child);
        for (const ct of childTexts) {
          if (!ct.annotations) {
            ct.annotations = {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
            };
          }
          ct.annotations.italic = true;
          childRichTexts.push(ct);
        }
      }
      return childRichTexts;
    }
    return [];
  }

  if (typedNode.type === "delete" || typedNode.type === "strikethrough") {
    const children = typedNode.children;
    if (Array.isArray(children)) {
      const childRichTexts: NotionRichText[] = [];
      for (const child of children) {
        const childTexts = getRichTextFromNode(child);
        for (const ct of childTexts) {
          if (!ct.annotations) {
            ct.annotations = {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
            };
          }
          ct.annotations.strikethrough = true;
          childRichTexts.push(ct);
        }
      }
      return childRichTexts;
    }
    return [];
  }

  if (typedNode.type === "underline") {
    const children = typedNode.children;
    if (Array.isArray(children)) {
      const childRichTexts: NotionRichText[] = [];
      for (const child of children) {
        const childTexts = getRichTextFromNode(child);
        for (const ct of childTexts) {
          if (!ct.annotations) {
            ct.annotations = {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
            };
          }
          ct.annotations.underline = true;
          childRichTexts.push(ct);
        }
      }
      return childRichTexts;
    }
    return [];
  }

  if (typedNode.children && Array.isArray(typedNode.children)) {
    const results: NotionRichText[] = [];
    for (const child of typedNode.children) {
      results.push(...getRichTextFromNode(child));
    }
    return results;
  }

  return [];
}

function flattenRichText(richTexts: NotionRichText[]): string {
  return richTexts.map((rt) => rt.text.content).join("");
}

function processListNode(
  listNode: ListNode | ListItemNode,
  notionBlocks: BlockObjectRequest[],
  isOrdered: boolean
): void {
  const children = listNode.children;
  if (!Array.isArray(children)) return;

  for (const child of children) {
    const childNode = child as unknown as Record<string, unknown>;

    if (childNode.type === "listItem") {
      const itemChildren = childNode.children;
      const blockType = isOrdered ? "numbered_list_item" : "bulleted_list_item";
      let createdListItemBlock = false;

      if (Array.isArray(itemChildren)) {
        for (const itemChild of itemChildren) {
          const itemChildNode = itemChild as unknown as Record<string, unknown>;

          if (itemChildNode.type === "paragraph") {
            const paragraphRichText = getRichTextFromNode(itemChildNode);
            const text = flattenRichText(paragraphRichText);
            const richTextItems =
              text.trim().length > 0
                ? splitRichTextIntoItems(paragraphRichText)
                : [
                    {
                      type: "text",
                      text: {
                        content: " ",
                      },
                    },
                  ];

            notionBlocks.push({
              type: blockType,
              [blockType]: {
                rich_text: richTextItems,
              },
            } as unknown as BlockObjectRequest);
            createdListItemBlock = true;
          } else if (itemChildNode.type === "list") {
            if (!createdListItemBlock) {
              notionBlocks.push({
                type: blockType,
                [blockType]: {
                  rich_text: [
                    {
                      type: "text",
                      text: {
                        content: " ",
                      },
                    },
                  ],
                },
              } as unknown as BlockObjectRequest);
              createdListItemBlock = true;
            }

            processListNode(
              itemChildNode as unknown as ListNode,
              notionBlocks,
              (itemChildNode as { ordered?: boolean }).ordered || false
            );
          }
        }
      }

      if (!createdListItemBlock) {
        notionBlocks.push({
          type: blockType,
          [blockType]: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: " ",
                },
              },
            ],
          },
        } as unknown as BlockObjectRequest);
      }
    }
  }
}

/**
 * Helper function to extract text from a node
 */
function getTextFromNode(node: MarkdownNode | TextNode | unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const typedNode = node as Record<string, unknown>;

  if (typedNode.type === "image") {
    const altText =
      typeof typedNode.alt === "string" ? typedNode.alt.trim() : "";
    const imageUrl =
      typeof typedNode.url === "string" ? typedNode.url.trim() : "";
    if (altText.length > 0 || imageUrl.length > 0) {
      return `[Image: ${altText || imageUrl}]`;
    }
    return "";
  }

  if (typedNode.type === "link") {
    const linkText = Array.isArray(typedNode.children)
      ? typedNode.children.map((child) => getTextFromNode(child)).join("")
      : "";
    if (linkText.trim().length > 0) {
      return linkText;
    }
    return typeof typedNode.url === "string" ? typedNode.url : "";
  }

  if (typedNode.value && typeof typedNode.value === "string") {
    return typedNode.value;
  }

  if (typedNode.children && Array.isArray(typedNode.children)) {
    let text = "";
    typedNode.children.forEach((child: unknown) => {
      const childNode = child as Record<string, unknown>;
      if (
        childNode.type === "text" &&
        childNode.value &&
        typeof childNode.value === "string"
      ) {
        text += childNode.value;
      } else {
        text += getTextFromNode(child);
      }
    });
    return text;
  }

  return "";
}

/**
 * Splits a rich_text array into items that respect Notion's 2000-char limit per item,
 * while preserving formatting (annotations and links) across splits.
 */
function splitRichTextIntoItems(richTexts: NotionRichText[]): NotionRichText[] {
  if (!richTexts || richTexts.length === 0) {
    return [];
  }

  const result: NotionRichText[] = [];

  for (const rt of richTexts) {
    const content = rt.text.content;

    if (content.length <= MAX_RICH_TEXT_LENGTH) {
      result.push(rt);
      continue;
    }

    let remaining = content;
    let currentItem: NotionRichText = { ...rt, text: { ...rt.text } };

    while (remaining.length > 0) {
      let splitIndex = Math.min(remaining.length, MAX_RICH_TEXT_LENGTH);
      if (remaining.length > MAX_RICH_TEXT_LENGTH) {
        const spaceIndex = remaining.lastIndexOf(" ", MAX_RICH_TEXT_LENGTH);
        if (spaceIndex > 0) {
          splitIndex = spaceIndex + 1;
        }
      }

      const chunk = remaining.substring(0, splitIndex);
      result.push({
        type: "text",
        text: { content: chunk, link: currentItem.text.link },
        annotations: currentItem.annotations
          ? { ...currentItem.annotations }
          : undefined,
      });

      remaining = remaining.substring(splitIndex);
    }
  }

  return result;
}

/**
 * Splits a long string into an array of rich_text items, each within Notion's
 * 2000-character limit. Splits at word boundaries when possible.
 */
function splitIntoRichTextItems(
  text: string
): Array<{ type: "text"; text: { content: string } }> {
  if (text.length <= MAX_RICH_TEXT_LENGTH) {
    return [{ type: "text", text: { content: text } }];
  }

  const items: Array<{ type: "text"; text: { content: string } }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    let splitIndex = Math.min(remaining.length, MAX_RICH_TEXT_LENGTH);
    if (remaining.length > MAX_RICH_TEXT_LENGTH) {
      // Prefer splitting at a word boundary
      const spaceIndex = remaining.lastIndexOf(" ", MAX_RICH_TEXT_LENGTH);
      if (spaceIndex > 0) {
        splitIndex = spaceIndex + 1;
      }
    }
    items.push({
      type: "text",
      text: { content: remaining.substring(0, splitIndex) },
    });
    remaining = remaining.substring(splitIndex);
  }

  return items;
}

/**
 * Creates a heading block with the specified level
 */
function createHeadingBlock(
  richText: NotionRichText[],
  level: 1 | 2 | 3
): BlockObjectRequest {
  const headingType = `heading_${level}` as
    | "heading_1"
    | "heading_2"
    | "heading_3";

  return {
    type: headingType,
    [headingType]: {
      rich_text: splitRichTextIntoItems(richText),
    },
  } as unknown as BlockObjectRequest;
}

/**
 * Define the valid Notion code block languages
 */
type NotionCodeLanguage =
  | "abap"
  | "arduino"
  | "bash"
  | "basic"
  | "c"
  | "clojure"
  | "coffeescript"
  | "c++"
  | "c#"
  | "css"
  | "dart"
  | "diff"
  | "docker"
  | "elixir"
  | "elm"
  | "erlang"
  | "flow"
  | "fortran"
  | "f#"
  | "gherkin"
  | "glsl"
  | "go"
  | "graphql"
  | "groovy"
  | "haskell"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "julia"
  | "kotlin"
  | "latex"
  | "less"
  | "lisp"
  | "livescript"
  | "lua"
  | "makefile"
  | "markdown"
  | "markup"
  | "matlab"
  | "mermaid"
  | "nix"
  | "objective-c"
  | "ocaml"
  | "pascal"
  | "perl"
  | "php"
  | "plain text"
  | "powershell"
  | "prolog"
  | "protobuf"
  | "python"
  | "r"
  | "reason"
  | "ruby"
  | "rust"
  | "sass"
  | "scala"
  | "scheme"
  | "scss"
  | "shell"
  | "sql"
  | "swift"
  | "typescript"
  | "vb.net"
  | "verilog"
  | "vhdl"
  | "visual basic"
  | "webassembly"
  | "xml"
  | "yaml"
  | "java/c/c++/c#";

/**
 * Removes front-matter from markdown content
 * @param content The markdown content
 * @returns The markdown content without front-matter
 */
export function removeFrontMatter(content: string): string {
  if (typeof content !== "string") return "";
  // Remove only leading YAML front-matter.
  const frontMatterRegex =
    /^\uFEFF?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/;
  return content.replace(frontMatterRegex, "");
}

/**
 * Maps markdown code language to Notion code block language
 */
function mapCodeLanguage(language: string): NotionCodeLanguage {
  const normalizedLanguage = language.trim().toLowerCase();

  const languageMap = new Map<string, NotionCodeLanguage>([
    ["js", "javascript"],
    ["javascript", "javascript"],
    ["node", "javascript"],
    ["mjs", "javascript"],
    ["cjs", "javascript"],
    ["ts", "typescript"],
    ["tsx", "typescript"],
    ["typescript", "typescript"],
    ["py", "python"],
    ["python", "python"],
    ["rb", "ruby"],
    ["ruby", "ruby"],
    ["go", "go"],
    ["golang", "go"],
    ["java", "java"],
    ["kt", "kotlin"],
    ["kts", "kotlin"],
    ["kotlin", "kotlin"],
    ["php", "php"],
    ["c", "c"],
    ["h", "c"],
    ["cpp", "c++"],
    ["cc", "c++"],
    ["cxx", "c++"],
    ["hpp", "c++"],
    ["cs", "c#"],
    ["csharp", "c#"],
    ["fs", "f#"],
    ["fsharp", "f#"],
    ["rs", "rust"],
    ["rust", "rust"],
    ["swift", "swift"],
    ["scala", "scala"],
    ["r", "r"],
    ["rscript", "r"],
    ["sh", "shell"],
    ["shell", "shell"],
    ["zsh", "shell"],
    ["fish", "shell"],
    ["bash", "bash"],
    ["powershell", "powershell"],
    ["ps1", "powershell"],
    ["sql", "sql"],
    ["graphql", "graphql"],
    ["gql", "graphql"],
    ["json", "json"],
    ["json5", "json"],
    ["jsonc", "json"],
    ["yaml", "yaml"],
    ["yml", "yaml"],
    ["toml", "plain text"],
    ["ini", "java/c/c++/c#"],
    ["xml", "xml"],
    ["html", "html"],
    ["xhtml", "html"],
    ["svg", "html"],
    ["css", "css"],
    ["scss", "scss"],
    ["sass", "sass"],
    ["less", "less"],
    ["md", "markdown"],
    ["markdown", "markdown"],
    ["mdx", "markdown"],
    ["docker", "docker"],
    ["dockerfile", "docker"],
    ["make", "makefile"],
    ["makefile", "makefile"],
    ["proto", "protobuf"],
    ["protobuf", "protobuf"],
    ["lua", "lua"],
    ["perl", "perl"],
    ["objective-c", "objective-c"],
    ["objc", "objective-c"],
    ["matlab", "matlab"],
    ["mermaid", "mermaid"],
    ["plain", "plain text"],
    ["plaintext", "plain text"],
    ["text", "plain text"],
    ["txt", "plain text"],
  ]);

  return languageMap.get(normalizedLanguage) || "plain text";
}

interface NotionPageProperties {
  [NOTION_PROPERTIES.TITLE]: {
    title: {
      text: {
        content: string;
      };
    }[];
  };
  [key: string]: unknown;
}

/**
 * Creates or updates a Notion page with markdown content
 * @param notion The Notion client
 * @param databaseId The ID of the Notion database
 * @param title The title of the page
 * @param markdownPath Path to the markdown file or markdown content directly
 * @param properties Additional properties for the page
 * @param isContent If true, markdownPath is treated as the content itself rather than a file path
 * @param language Optional language of the page, used to filter existing pages
 */
export async function createNotionPageFromMarkdown(
  notion: Client,
  parentPageId: string,
  databaseId: string,
  title: string,
  markdownPath: string,
  properties: Record<string, unknown> = {},
  isContent: boolean = false,
  language?: string,
  existingPageId?: string
): Promise<string> {
  // Maximum number of retries
  let retryCount = 0;
  let lastError: Error | null = null;
  while (retryCount < MAX_RETRIES) {
    try {
      // Read the markdown content
      let markdownContent = isContent
        ? markdownPath
        : await fs.readFile(markdownPath, "utf8");

      if (typeof markdownContent !== "string") {
        throw new Error(
          `Invalid content for page "${title}": expected string, got ${typeof markdownContent}`
        );
      }

      const { blocks, diagnostics } =
        convertMarkdownToNotionBlocks(markdownContent);

      if (diagnostics.trimmedContentLength === 0) {
        throw new Error(
          `${EMPTY_TRANSLATED_CONTENT_PREFIX}: page "${title}" has no non-frontmatter content.`
        );
      }

      if (blocks.length === 0) {
        console.warn(
          `Markdown conversion produced no Notion blocks for "${title}" (top-level nodes: ${
            diagnostics.topLevelNodeTypes.join(", ") || "none"
          }; unsupported top-level nodes: ${
            diagnostics.unsupportedTopLevelNodeTypes.join(", ") || "none"
          }; frontmatter removed: ${diagnostics.frontMatterRemoved}; fallback blocks: ${
            diagnostics.fallbackBlocksCreated
          }).`
        );
        throw new Error(
          `${EMPTY_TRANSLATED_CONTENT_PREFIX}: page "${title}" produced no supported Notion blocks.`
        );
      }

      if (blocks.length > MAX_NOTION_BLOCKS_PER_PAGE_SAFETY_LIMIT) {
        throw new Error(
          `${TOO_MANY_BLOCKS_ERROR_PREFIX}: page "${title}" generated ${blocks.length} blocks (limit ${MAX_NOTION_BLOCKS_PER_PAGE_SAFETY_LIMIT}).`
        );
      }

      // CRITICAL SAFETY CHECK: Never modify main language pages
      if (language === MAIN_LANGUAGE) {
        throw new Error(ENGLISH_MODIFICATION_ERROR);
      }

      let pageId: string | null = existingPageId ?? null;
      // Always include Parent item relation in properties for both update and create
      const pageRelation = {
        "Parent item": {
          relation: [{ id: parentPageId }],
        },
      };

      if (!existingPageId) {
        // Check if a page with this title and language already exists
        const filter = language
          ? {
              and: [
                {
                  property: NOTION_PROPERTIES.TITLE,
                  title: {
                    equals: title,
                  },
                },
                {
                  property: NOTION_PROPERTIES.LANGUAGE,
                  select: {
                    equals: language,
                  },
                },
              ],
            }
          : {
              property: NOTION_PROPERTIES.TITLE,
              title: {
                equals: title,
              },
            };

        const response = await notion.dataSources.query({
          // v5 API: use data_source_id instead of database_id
          data_source_id: databaseId,
          filter: filter,
        });

        // If we're not filtering by language, make sure we don't modify English pages
        const nonEnglishResults = language
          ? response.results
          : response.results.filter((page) => {
              const pageLanguage = getLanguageFromPage(page);
              return pageLanguage !== MAIN_LANGUAGE;
            });

        if (nonEnglishResults.length > 0) {
          pageId = nonEnglishResults[0].id;
        }
      }

      if (pageId) {
        // Update existing page
        // TODO: should check existing content and compare to maintain fixes from previous revisions
        // Create properties object with proper typing, always include Parent item
        const pageProperties: NotionPageProperties = {
          [NOTION_PROPERTIES.TITLE]: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
          ...pageRelation,
          ...(properties as Record<string, unknown>),
        };

        // Update page properties
        await notion.pages.update({
          page_id: pageId,
          // @ts-expect-error - Notion API types are not fully compatible with our types
          properties: pageProperties,
        });

        // Delete existing blocks
        const existingBlocks = await notion.blocks.children.list({
          block_id: pageId,
        });

        for (const block of existingBlocks.results) {
          try {
            await notion.blocks.delete({
              block_id: block.id,
            });
            // Small delay between deletions to avoid hitting Notion rate limits
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (deleteError) {
            console.warn(
              `Warning: Failed to delete block ${block.id}: ${deleteError.message}`
            );
            // Continue with other blocks even if one fails
          }
        }
      } else {
        // Create properties object with proper typing, always include Parent item
        const pageProperties: NotionPageProperties = {
          [NOTION_PROPERTIES.TITLE]: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
          ...pageRelation,
          ...(properties as Record<string, unknown>),
        };

        // Create a new page with correct parent and Parent item relation
        const newPage = await notion.pages.create({
          // v5 API: use data_source_id in parent instead of database_id
          parent: {
            type: "data_source_id",
            data_source_id: databaseId,
          },
          // @ts-expect-error - Notion API types are not fully compatible with our types
          properties: pageProperties,
        });

        pageId = newPage.id;
      }

      // Add content blocks in chunks to avoid API limits
      for (let i = 0; i < blocks.length; i += NOTION_API_CHUNK_SIZE) {
        const blockChunk = blocks.slice(i, i + NOTION_API_CHUNK_SIZE);
        await notion.blocks.children.append({
          block_id: pageId,
          children: blockChunk,
        });

        // Add a small delay between chunks to avoid rate limiting
        if (i + NOTION_API_CHUNK_SIZE < blocks.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      return pageId;
    } catch (error) {
      const parsedError =
        error instanceof Error ? error : new Error(String(error));
      lastError = parsedError;

      if (
        parsedError.message.startsWith(EMPTY_TRANSLATED_CONTENT_PREFIX) ||
        parsedError.message.startsWith(TOO_MANY_BLOCKS_ERROR_PREFIX)
      ) {
        throw parsedError;
      }

      retryCount++;

      if (retryCount < MAX_RETRIES) {
        console.warn(
          `Attempt ${retryCount}/${MAX_RETRIES} failed: ${parsedError.message}. Retrying...`
        );
        // Exponential backoff: wait longer between retries
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, retryCount))
        );
      } else {
        console.error(
          "Error creating Notion page from markdown after multiple retries:",
          parsedError
        );
        throw new Error(
          `Failed after ${MAX_RETRIES} attempts: ${parsedError.message}`
        );
      }
    }
  }

  // This should never be reached due to the throw in the catch block above
  throw lastError;
}

/**
 * Creates a new translation page in Notion without modifying any existing pages
 * This is a wrapper around createNotionPageFromMarkdown with additional safety checks
 * @param notion The Notion client
 * @param databaseId The ID of the Notion database
 * @param title The title of the page
 * @param translatedContent The translated content
 * @param properties Additional properties for the page
 * @param targetLanguage The target language
 * @returns The ID of the created page
 */
export async function createTranslationPage(
  notion: Client,
  parentPageId: string,
  databaseId: string,
  title: string,
  translatedContent: string,
  properties: Record<string, unknown>,
  targetLanguage: string
): Promise<string> {
  const spinner = ora(`Creating translation page in ${targetLanguage}`).start();

  try {
    // CRITICAL SAFETY CHECK: Never translate to main language
    if (targetLanguage === MAIN_LANGUAGE) {
      spinner.fail(chalk.red(ENGLISH_MODIFICATION_ERROR));
      throw new Error(ENGLISH_MODIFICATION_ERROR);
    }

    // Create or update the translation page using the more generic function
    const pageId = await createNotionPageFromMarkdown(
      notion,
      parentPageId,
      databaseId,
      title,
      translatedContent,
      properties,
      true, // Pass content directly
      targetLanguage // Pass the language to ensure we don't modify English pages
    );

    spinner.succeed(
      chalk.green(
        `Translation page created/updated for ${title} in ${targetLanguage}`
      )
    );
    return pageId;
  } catch (error) {
    spinner.fail(
      chalk.red(`Failed to create translation page: ${error.message}`)
    );
    throw error;
  }
}
