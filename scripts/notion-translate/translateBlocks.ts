import { enhancedNotion } from "../notionClient.js";
import { translateText } from "./translateFrontMatter.js";
import type { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  BlockObjectRequest,
} from "@notionhq/client/build/src/api-endpoints";
import { INVALID_URL_PLACEHOLDER, NOTION_PROPERTIES } from "../constants.js";
import chalk from "chalk";

/** Block fetched from Notion API, extended with recursively-fetched children. */
type FetchedBlock = (PartialBlockObjectResponse | BlockObjectResponse) & {
  children?: FetchedBlock[];
  [key: string]: unknown;
};

/** Mutable rich-text item used during translation (subset of RichTextItemResponse). */
interface MutableRichTextItem {
  type: string;
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  plain_text?: string;
  href?: string | null;
  annotations?: Record<string, unknown>;
}

async function fetchAllBlocks(blockId: string): Promise<FetchedBlock[]> {
  const blocks: FetchedBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await enhancedNotion.blocksChildrenList({
      block_id: blockId,
      start_cursor: cursor,
    });
    for (const block of response.results as FetchedBlock[]) {
      if (block.has_children) {
        block.children = await fetchAllBlocks(block.id);
      }
      blocks.push(block);
    }
    cursor = response.next_cursor ?? undefined;
  } while (cursor);
  return blocks;
}

export async function translateNotionBlocksDirectly(
  pageId: string,
  targetLanguage: string
): Promise<BlockObjectRequest[]> {
  const blocks = await fetchAllBlocks(pageId);
  return await translateBlocksTree(blocks, targetLanguage);
}

function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/")) {
    return `https://notion.so${url}`;
  }
  try {
    new URL(url);
    return url;
  } catch (e) {
    return null;
  }
}

async function translateRichTextArray(
  richTextArr: MutableRichTextItem[],
  targetLanguage: string
): Promise<void> {
  if (!Array.isArray(richTextArr)) return;
  // Translate rich text segments sequentially to avoid OpenAI rate limits
  for (const rt of richTextArr) {
    if (rt.text && rt.text.content) {
      const res = await translateText(rt.text.content, "", targetLanguage);
      let translated = res.markdown.trim();
      if (translated.startsWith("markdown:")) {
        translated = translated.replace("markdown:", "").trim();
      }
      if (translated.startsWith("title:")) {
        translated = translated.split("\n").slice(1).join("\n").trim();
      }
      rt.text.content = translated;
      rt.plain_text = translated;
    }

    // Sanitize rich_text link URLs
    if (rt.text && rt.text.link && rt.text.link.url) {
      const sanitized = sanitizeUrl(rt.text.link.url);
      if (sanitized) {
        rt.text.link.url = sanitized;
      } else {
        rt.text.link = null;
      }
    }
    if (rt.href) {
      const sanitized = sanitizeUrl(rt.href);
      if (sanitized) {
        rt.href = sanitized;
      } else {
        rt.href = null;
      }
    }
  }
}

function extractPlainText(items: unknown): string {
  if (!Array.isArray(items)) {
    return "";
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const richTextItem = item as MutableRichTextItem;
      if (typeof richTextItem.plain_text === "string") {
        return richTextItem.plain_text;
      }

      return richTextItem.text?.content ?? "";
    })
    .join("")
    .trim();
}

async function buildImagePlaceholder(
  imageBlock: Record<string, unknown>,
  targetLanguage: string
): Promise<string> {
  const caption = extractPlainText(
    (imageBlock.image as { caption?: unknown } | undefined)?.caption
  );
  const imageRef =
    (imageBlock.image as { external?: { url?: string } } | undefined)?.external
      ?.url ??
    (imageBlock.image as { file?: { url?: string } } | undefined)?.file?.url ??
    "";

  if (!caption) {
    return `[Image: ${imageRef || "image"}]`;
  }

  const translatedCaption = await translateText(caption, "", targetLanguage);
  const translatedLabel = translatedCaption.markdown.trim() || caption;
  return `[Image: ${translatedLabel}]`;
}

async function translateBlocksTree(
  blocks: FetchedBlock[],
  targetLanguage: string
): Promise<BlockObjectRequest[]> {
  const result: BlockObjectRequest[] = [];
  for (const block of blocks) {
    // Work with a mutable copy; strict typing is impractical here because
    // block types are deleted/reassigned (e.g. image → callout) and accessed
    // dynamically via newBlock[newBlock.type].
    const newBlock: Record<string, unknown> = { ...block };
    delete newBlock.id;
    delete newBlock.created_time;
    delete newBlock.last_edited_time;
    delete newBlock.created_by;
    delete newBlock.last_edited_by;
    delete newBlock.has_children;
    delete newBlock.parent;
    delete newBlock.archived;
    delete newBlock.in_trash;
    delete newBlock.children;
    // Remove read-only/metadata fields that Notion rejects on block creation
    delete newBlock.object;
    delete newBlock.icon;

    if (
      newBlock.type === "child_page" ||
      newBlock.type === "child_database" ||
      newBlock.type === "unsupported"
    ) {
      continue; // Cannot append these blocks
    }

    let skipRichTextTranslation = false;
    if (newBlock.type === "image") {
      const placeholder = await buildImagePlaceholder(newBlock, targetLanguage);
      newBlock.type = "paragraph";
      newBlock.paragraph = {
        rich_text: [
          {
            type: "text",
            text: { content: placeholder },
            plain_text: placeholder,
          },
        ],
      };
      delete newBlock.image;
      skipRichTextTranslation = true;
    }

    if (
      newBlock.type === "synced_block" &&
      newBlock.synced_block &&
      typeof newBlock.synced_block === "object"
    ) {
      (newBlock.synced_block as Record<string, unknown>).synced_from = null;
    }

    const blockType = newBlock.type as string;

    const typeObj = newBlock[blockType] as
      | (Record<string, unknown> & {
          url?: string;
          rich_text?: MutableRichTextItem[];
          caption?: MutableRichTextItem[];
          cells?: MutableRichTextItem[][];
          table_width?: number;
          children?: BlockObjectRequest[];
        })
      | undefined;
    if (typeObj) {
      if (typeObj.url) {
        const sanitized = sanitizeUrl(typeObj.url);
        if (sanitized) {
          typeObj.url = sanitized;
        } else {
          console.warn(
            chalk.yellow(
              `⚠️  Invalid URL in ${blockType} block, using placeholder: ${typeObj.url}`
            )
          );
          typeObj.url = INVALID_URL_PLACEHOLDER;
        }
      }

      if (typeObj.rich_text && !skipRichTextTranslation) {
        await translateRichTextArray(typeObj.rich_text, targetLanguage);
      }
      if (typeObj.caption) {
        await translateRichTextArray(typeObj.caption, targetLanguage);
      }
      if (blockType === "table_row" && typeObj.cells) {
        for (const cell of typeObj.cells) {
          await translateRichTextArray(cell, targetLanguage);
        }
      }

      // Clean up unsupported properties that Notion API rejects on block creation.
      // The Notion API returns these fields when reading but rejects them as null on write.
      if ("icon" in typeObj && typeObj.icon === null) {
        delete typeObj.icon;
      }
    }

    if (block.children) {
      const parentTypeObj = newBlock[blockType] as Record<string, unknown>;
      parentTypeObj.children = await translateBlocksTree(
        block.children,
        targetLanguage
      );
    }

    result.push(newBlock as unknown as BlockObjectRequest);
  }
  return result;
}

export async function createNotionPageWithBlocks(
  notion: Client,
  parentPageId: string,
  databaseId: string,
  title: string,
  blocks: BlockObjectRequest[],
  properties: Record<string, unknown> = {},
  language?: string,
  existingPageId?: string,
  forceCreate?: boolean
): Promise<string> {
  const MAX_RETRIES = 3;
  const NOTION_API_CHUNK_SIZE = 100;
  let retryCount = 0;
  let lastError: Error | null = null;
  let retryPageId: string | null = forceCreate
    ? null
    : (existingPageId ?? null);

  while (retryCount < MAX_RETRIES) {
    try {
      if (language === "en") {
        throw new Error("Cannot modify English pages");
      }

      let pageId = retryPageId;

      const pageRelation = {
        "Parent item": {
          relation: [{ id: parentPageId }],
        },
      };

      // When forceCreate is set, skip the DB search entirely and always create
      if (!forceCreate && !pageId) {
        const filter = language
          ? {
              and: [
                {
                  property: NOTION_PROPERTIES.TITLE,
                  title: { equals: title },
                },
                {
                  property: NOTION_PROPERTIES.LANGUAGE,
                  select: { equals: language },
                },
              ],
            }
          : {
              property: NOTION_PROPERTIES.TITLE,
              title: { equals: title },
            };

        const response = await enhancedNotion.dataSourcesQuery({
          data_source_id: databaseId,
          filter: filter,
        });

        const nonEnglishResults = language
          ? response.results
          : response.results.filter(
              (page: {
                properties?: Record<string, unknown>;
                [k: string]: unknown;
              }) => {
                const langProp = page.properties?.[
                  NOTION_PROPERTIES.LANGUAGE
                ] as { select?: { name?: string } } | undefined;
                const pageLang = langProp?.select?.name || "en";
                return pageLang !== "en";
              }
            );

        if (nonEnglishResults.length > 0) {
          pageId = nonEnglishResults[0].id;
        }
      }

      const pageProperties = {
        [NOTION_PROPERTIES.TITLE]: { title: [{ text: { content: title } }] },
        ...pageRelation,
        ...properties,
      };

      if (pageId) {
        await notion.pages.update({
          page_id: pageId,
          properties: pageProperties,
        });

        // Delete existing blocks
        let hasMore = true;
        let startCursor: string | undefined = undefined;
        const blockIdsToDelete: string[] = [];

        while (hasMore) {
          const existingBlocks = await notion.blocks.children.list({
            block_id: pageId,
            start_cursor: startCursor,
          });
          blockIdsToDelete.push(...existingBlocks.results.map((b) => b.id));
          hasMore = existingBlocks.has_more;
          startCursor = existingBlocks.next_cursor ?? undefined;
        }

        for (const blockId of blockIdsToDelete) {
          try {
            await notion.blocks.delete({ block_id: blockId });
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (deleteError: unknown) {
            const msg =
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError);
            console.warn(`Warning: Failed to delete block ${blockId}: ${msg}`);
          }
        }
      } else {
        const newPage = await notion.pages.create({
          parent: { type: "data_source_id", data_source_id: databaseId },
          properties: pageProperties,
        });
        pageId = newPage.id;
        retryPageId = pageId;
      }

      // Add content blocks in chunks to avoid API limits
      for (let i = 0; i < blocks.length; i += NOTION_API_CHUNK_SIZE) {
        const blockChunk = blocks.slice(i, i + NOTION_API_CHUNK_SIZE);
        await notion.blocks.children.append({
          block_id: pageId,
          children: blockChunk,
        });

        if (i + NOTION_API_CHUNK_SIZE < blocks.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      return pageId;
    } catch (error) {
      const parsedError =
        error instanceof Error ? error : new Error(String(error));
      lastError = parsedError;
      retryCount++;
      if (retryCount >= MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 2000 * retryCount));
    }
  }

  throw new Error(
    `Failed to create/update Notion page after ${MAX_RETRIES} retries: ${lastError?.message}`
  );
}
