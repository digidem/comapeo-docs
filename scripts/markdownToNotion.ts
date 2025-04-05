import { Client } from "@notionhq/client";
import { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import fs from 'fs/promises';
import { Root } from 'remark-parse/lib';

// Define types for markdown nodes
interface HeadingNode {
  type: 'heading';
  depth: 1 | 2 | 3;
  children: (TextNode | MarkdownNode)[];
}

interface ParagraphNode {
  type: 'paragraph';
  children: (TextNode | MarkdownNode)[];
}

interface ListNode {
  type: 'list';
  ordered: boolean;
  children: ListItemNode[];
}

interface ListItemNode {
  type: 'listItem';
  children: (TextNode | MarkdownNode)[];
}

interface CodeNode {
  type: 'code';
  value: string;
  lang?: string;
}

interface BlockquoteNode {
  type: 'blockquote';
  children: (TextNode | MarkdownNode)[];
}

interface ThematicBreakNode {
  type: 'thematicBreak';
}

interface ImageNode {
  type: 'image';
  url: string;
  alt?: string;
}

type MarkdownNode =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | ListItemNode
  | CodeNode
  | BlockquoteNode
  | ThematicBreakNode
  | ImageNode;

/**
 * Parses markdown content and converts it to Notion blocks
 * @param markdownContent The markdown content to parse
 * @returns An array of Notion block objects
 */
export async function markdownToNotionBlocks(markdownContent: string): Promise<BlockObjectRequest[]> {
  // Parse the markdown content
  const processor = unified().use(remarkParse);
  const ast = processor.parse(markdownContent) as Root;

  // Array to store the Notion blocks
  const notionBlocks: BlockObjectRequest[] = [];

  // Process the markdown AST
  visit(ast, (node: MarkdownNode) => {
    switch (node.type) {
      case 'heading': {
        const headingNode = node as HeadingNode;
        const headingLevel = headingNode.depth;
        const headingText = getTextFromNode(headingNode);

        notionBlocks.push(createHeadingBlock(headingText, headingLevel));
        break;
      }

      case 'paragraph': {
        const paragraphNode = node as ParagraphNode;
        const paragraphText = getTextFromNode(paragraphNode);

        notionBlocks.push({
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: paragraphText
                }
              }
            ]
          }
        });
        break;
      }

      case 'list': {
        const listNode = node as ListNode;
        const listItems = listNode.children.map(item => getTextFromNode(item));
        const isOrdered = listNode.ordered;
        for (const item of listItems) {
          notionBlocks.push({
            type: isOrdered ? 'numbered_list_item' : 'bulleted_list_item',
            [isOrdered ? 'numbered_list_item' : 'bulleted_list_item']: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: item
                  }
                }
              ]
            }
          });
        }
        break;
      }

      case 'code': {
        const codeNode = node as CodeNode;
        const codeContent = codeNode.value;
        const language = codeNode.lang || 'plain text';

        notionBlocks.push({
          code: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: codeContent
                }
              }
            ],
            language: mapCodeLanguage(language)
          }
        });
        break;
      }

      case 'blockquote': {
        const quoteNode = node as BlockquoteNode;
        const quoteText = getTextFromNode(quoteNode);

        notionBlocks.push({
          quote: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: quoteText
                }
              }
            ]
          }
        });
        break;
      }

      case 'thematicBreak': {
        notionBlocks.push({
          divider: {}
        });
        break;
      }

      case 'image': {
        const imageNode = node as ImageNode;
        const imageUrl = imageNode.url;
        const altText = imageNode.alt || '';

        notionBlocks.push({
          image: {
            external: {
              url: imageUrl
            },
            caption: [
              {
                type: 'text',
                text: {
                  content: altText
                }
              }
            ]
          }
        });
        break;
      }
    }
  });

  return notionBlocks;
}

// Define a TextNode type for text elements
interface TextNode {
  type: 'text';
  value: string;
}


/**
 * Helper function to extract text from a node
 */
function getTextFromNode(node: MarkdownNode | TextNode | unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typedNode = node as Record<string, unknown>;

  if (typedNode.value && typeof typedNode.value === 'string') {
    return typedNode.value;
  }

  if (typedNode.children && Array.isArray(typedNode.children)) {
    let text = '';
    typedNode.children.forEach((child: unknown) => {
      const childNode = child as Record<string, unknown>;
      if (childNode.type === 'text' && childNode.value && typeof childNode.value === 'string') {
        text += childNode.value;
      } else {
        text += getTextFromNode(child);
      }
    });
    return text;
  }

  return '';
}

/**
 * Creates a heading block with the specified level
 */
function createHeadingBlock(text: string, level: 1 | 2 | 3): BlockObjectRequest {
  const headingType = `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3';

  return {
    [headingType]: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: text
          }
        }
      ]
    }
  };
}

/**
 * Maps markdown code language to Notion code block language
 */
function mapCodeLanguage(language: string): string {
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'java': 'java',
    'php': 'php',
    'c': 'c',
    'cpp': 'c++',
    'cs': 'c#',
    'html': 'html',
    'css': 'css',
    'shell': 'shell',
    'bash': 'bash',
    'json': 'json',
    'yaml': 'yaml',
    'md': 'markdown'
  };

  return languageMap[language] || 'plain text';
}

interface NotionPageProperties {
  Title: {
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
 */
export async function createNotionPageFromMarkdown(
  notion: Client,
  databaseId: string,
  title: string,
  markdownPath: string,
  properties: Record<string, unknown> = {},
  isContent: boolean = false
): Promise<string> {
  try {
    // Read the markdown content
    const markdownContent = isContent ? markdownPath : await fs.readFile(markdownPath, 'utf8');

    // Convert markdown to Notion blocks
    const blocks = await markdownToNotionBlocks(markdownContent);

    // Check if a page with this title already exists
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Title",
        title: {
          equals: title
        }
      }
    });

    let pageId: string;

    if (response.results.length > 0) {
      // Update existing page
      pageId = response.results[0].id;

      // Create properties object with proper typing
      const pageProperties: NotionPageProperties = {
        Title: {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        },
        ...properties as Record<string, unknown>
      };

      // Update page properties
      await notion.pages.update({
        page_id: pageId,
        properties: pageProperties
      });

      // Delete existing blocks
      const existingBlocks = await notion.blocks.children.list({
        block_id: pageId
      });

      for (const block of existingBlocks.results) {
        await notion.blocks.delete({
          block_id: block.id
        });
      }
    } else {
      // Create properties object with proper typing
      const pageProperties: NotionPageProperties = {
        Title: {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        },
        ...properties as Record<string, unknown>
      };

      // Create a new page
      const newPage = await notion.pages.create({
        parent: {
          database_id: databaseId,
        },
        properties: pageProperties
      });

      pageId = newPage.id;
    }

    // Add content blocks
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks
    });

    return pageId;
  } catch (error) {
    console.error('Error creating Notion page from markdown:', error);
    throw error;
  }
}
