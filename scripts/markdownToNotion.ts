import { Client } from "@notionhq/client";
import { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
// Define Root type for the AST
type Root = { type: 'root'; children: unknown[] };
import { ENGLISH_MODIFICATION_ERROR, MAIN_LANGUAGE, MAX_RETRIES, NOTION_API_CHUNK_SIZE, NOTION_PROPERTIES } from './constants.js';

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
  visit(ast, (node) => {
    // Cast node to our custom type
    const typedNode = node as MarkdownNode;
    switch (typedNode.type) {
      case 'heading': {
        const headingNode = typedNode as HeadingNode;
        const headingLevel = headingNode.depth;
        const headingText = getTextFromNode(headingNode);

        notionBlocks.push(createHeadingBlock(headingText, headingLevel));
        break;
      }

      case 'paragraph': {
        const paragraphNode = typedNode as ParagraphNode;
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
        const listNode = typedNode as ListNode;
        const listItems = listNode.children.map(item => getTextFromNode(item));
        const isOrdered = listNode.ordered;
        for (const item of listItems) {
          const blockType = isOrdered ? 'numbered_list_item' : 'bulleted_list_item';
          notionBlocks.push({
            type: blockType,
            [blockType]: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: item
                  }
                }
              ]
            }
          } as BlockObjectRequest);
        }
        break;
      }

      case 'code': {
        const codeNode = typedNode as CodeNode;
        const codeContent = codeNode.value;
        const language = codeNode.lang || 'plain text';
        const mappedLanguage = mapCodeLanguage(language);

        // Notion API has a limit of 2000 characters per text content
        // Split code blocks that exceed this limit
        const MAX_CODE_BLOCK_LENGTH = 1900; // Using 1900 to be safe

        if (codeContent.length <= MAX_CODE_BLOCK_LENGTH) {
          // If code block is small enough, add it as is
          notionBlocks.push({
            type: 'code',
            code: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: codeContent
                  }
                }
              ],
              language: mappedLanguage
            }
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
              const newlineIndex = remainingCode.lastIndexOf('\n', MAX_CODE_BLOCK_LENGTH);
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

          // Add each chunk as a separate code block without visible part indicators
          for (let i = 0; i < codeChunks.length; i++) {
            // For the first chunk, add a paragraph with the language info
            if (i === 0) {
              notionBlocks.push({
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: `\`\`\`${language}`
                      }
                    }
                  ]
                }
              });
            }

            // Add the code content as a paragraph with code formatting
            notionBlocks.push({
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: codeChunks[i]
                    },
                    annotations: {
                      code: true
                    }
                  }
                ]
              }
            });

            // For the last chunk, add a closing code fence
            if (i === codeChunks.length - 1) {
              notionBlocks.push({
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: '```'
                      }
                    }
                  ]
                }
              });
            }
          }
        }
        break;
      }

      case 'blockquote': {
        const quoteNode = typedNode as BlockquoteNode;
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
          type: 'divider',
          divider: {}
        });
        break;
      }

      case 'image': {
        // For translations, we'll just convert images to text to avoid Notion API issues
        const imageNode = typedNode as ImageNode;
        const imageUrl = imageNode.url;
        const altText = imageNode.alt || '';

        // Always convert images to text for safety
        console.warn(`Converting image to text: ${imageUrl}`);
        notionBlocks.push({
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `[Image: ${altText || imageUrl}]`
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
    type: headingType,
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
  } as BlockObjectRequest;
}

/**
 * Define the valid Notion code block languages
 */
type NotionCodeLanguage =
  'abap' | 'arduino' | 'bash' | 'basic' | 'c' | 'clojure' | 'coffeescript' |
  'c++' | 'c#' | 'css' | 'dart' | 'diff' | 'docker' | 'elixir' | 'elm' | 'erlang' |
  'flow' | 'fortran' | 'f#' | 'gherkin' | 'glsl' | 'go' | 'graphql' | 'groovy' |
  'haskell' | 'html' | 'java' | 'javascript' | 'json' | 'julia' | 'kotlin' | 'latex' |
  'less' | 'lisp' | 'livescript' | 'lua' | 'makefile' | 'markdown' | 'markup' | 'matlab' |
  'mermaid' | 'nix' | 'objective-c' | 'ocaml' | 'pascal' | 'perl' | 'php' | 'plain text' |
  'powershell' | 'prolog' | 'protobuf' | 'python' | 'r' | 'reason' | 'ruby' | 'rust' |
  'sass' | 'scala' | 'scheme' | 'scss' | 'shell' | 'sql' | 'swift' | 'typescript' |
  'vb.net' | 'verilog' | 'vhdl' | 'visual basic' | 'webassembly' | 'xml' | 'yaml' | 'java/c/c++/c#';

/**
 * Removes front-matter from markdown content
 * @param content The markdown content
 * @returns The markdown content without front-matter
 */
export function removeFrontMatter(content: string): string {
  // Check if content starts with front-matter (---)
  const frontMatterRegex = /^---\n[\s\S]*?\n---\n/m;
  return content.replace(frontMatterRegex, '');
}

/**
 * Maps markdown code language to Notion code block language
 */
function mapCodeLanguage(language: string): NotionCodeLanguage {
  const languageMap: Record<string, NotionCodeLanguage> = {
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
 * @param language Optional language of the page, used to filter existing pages
 */
export async function createNotionPageFromMarkdown(
  notion: Client,
  databaseId: string,
  title: string,
  markdownPath: string,
  properties: Record<string, unknown> = {},
  isContent: boolean = false,
  language?: string
): Promise<string> {
  // Maximum number of retries
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < MAX_RETRIES) {
    try {
      // Read the markdown content
      let markdownContent = isContent ? markdownPath : await fs.readFile(markdownPath, 'utf8');

      // Remove front-matter if present
      markdownContent = removeFrontMatter(markdownContent);

      // Convert markdown to Notion blocks
      const blocks = await markdownToNotionBlocks(markdownContent);

      // CRITICAL SAFETY CHECK: Never modify main language pages
      if (language === MAIN_LANGUAGE) {
        throw new Error(ENGLISH_MODIFICATION_ERROR);
      }

      // Check if a page with this title and language already exists
      const filter = language ? {
        and: [
          {
            property: NOTION_PROPERTIES.TITLE,
            title: {
              equals: title
            }
          },
          {
            property: NOTION_PROPERTIES.LANGUAGE,
            select: {
              equals: language
            }
          }
        ]
      } : {
        property: NOTION_PROPERTIES.TITLE,
        title: {
          equals: title
        }
      };

      const response = await notion.databases.query({
        database_id: databaseId,
        filter: filter
      });

      // If we're not filtering by language, make sure we don't modify English pages
      const nonEnglishResults = language ? response.results : response.results.filter(page => {
        // @ts-expect-error - We know the page has properties
        const pageLanguage = page.properties?.[NOTION_PROPERTIES.LANGUAGE]?.select?.name;
        return pageLanguage !== MAIN_LANGUAGE;
      });

      let pageId: string;

      if (nonEnglishResults.length > 0) {
        // Update existing page
        pageId = nonEnglishResults[0].id;

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
          // @ts-expect-error - Notion API types are not fully compatible with our types
          properties: pageProperties
        });

        // Delete existing blocks
        const existingBlocks = await notion.blocks.children.list({
          block_id: pageId
        });

        for (const block of existingBlocks.results) {
          try {
            await notion.blocks.delete({
              block_id: block.id
            });
          } catch (deleteError) {
            console.warn(`Warning: Failed to delete block ${block.id}: ${deleteError.message}`);
            // Continue with other blocks even if one fails
          }
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
          // @ts-expect-error - Notion API types are not fully compatible with our types
          properties: pageProperties
        });

        pageId = newPage.id;
      }

      // Add content blocks in chunks to avoid API limits
      for (let i = 0; i < blocks.length; i += NOTION_API_CHUNK_SIZE) {
        const blockChunk = blocks.slice(i, i + NOTION_API_CHUNK_SIZE);
        await notion.blocks.children.append({
          block_id: pageId,
          children: blockChunk
        });

        // Add a small delay between chunks to avoid rate limiting
        if (i + NOTION_API_CHUNK_SIZE < blocks.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      return pageId;
    } catch (error) {
      lastError = error;
      retryCount++;

      if (retryCount < MAX_RETRIES) {
        console.warn(`Attempt ${retryCount}/${MAX_RETRIES} failed: ${error.message}. Retrying...`);
        // Exponential backoff: wait longer between retries
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      } else {
        console.error('Error creating Notion page from markdown after multiple retries:', error);
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`);
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
      databaseId,
      title,
      translatedContent,
      properties,
      true, // Pass content directly
      targetLanguage // Pass the language to ensure we don't modify English pages
    );

    spinner.succeed(chalk.green(`Translation page created/updated for ${title} in ${targetLanguage}`));
    return pageId;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to create translation page: ${error.message}`));
    throw error;
  }
}
