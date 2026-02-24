import fs from "node:fs";
import path from "node:path";
import { enhancedNotion } from "../notionClient.js";
import { translateText } from "./translateFrontMatter.js";
import type { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  BlockObjectRequest,
} from "@notionhq/client/build/src/api-endpoints";
import { INVALID_URL_PLACEHOLDER, NOTION_PROPERTIES } from "../constants.js";
import { extractImageMatches } from "../notion-fetch/imageReplacer.js";
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

/**
 * @param orderedImagePaths - Array of image paths to consume in order (read-only).
 *                           A shallow copy is made internally; the caller's array is never mutated.
 */
export async function translateNotionBlocksDirectly(
  pageId: string,
  targetLanguage: string,
  sanitizedPageName?: string,
  orderedImagePaths: string[] = []
): Promise<BlockObjectRequest[]> {
  const blocks = await fetchAllBlocks(pageId);
  const state = { imageIndex: 0, orderedImagePaths: [...orderedImagePaths] };
  return await translateBlocksTree(
    blocks,
    targetLanguage,
    sanitizedPageName,
    state
  );
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

async function translateBlocksTree(
  blocks: FetchedBlock[],
  targetLanguage: string,
  sanitizedPageName?: string,
  state: { imageIndex: number; orderedImagePaths?: string[] } = {
    imageIndex: 0,
  }
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

    if (
      newBlock.type === "child_page" ||
      newBlock.type === "child_database" ||
      newBlock.type === "unsupported"
    ) {
      continue; // Cannot append these blocks
    }

    let wasImageBlock = false;
    if (newBlock.type === "image") {
      wasImageBlock = true;
      newBlock.type = "callout";

      const imageIndex = state.imageIndex++;
      let finalImageName = "";

      const expectedPathFromList = state.orderedImagePaths?.shift();
      const imagesDir = path.join(process.cwd(), "static/images");

      if (expectedPathFromList) {
        // e.g. "/images/filename.ext" -> "filename.ext"
        const filename = expectedPathFromList.replace(/^\/?images\//, "");
        if (fs.existsSync(path.join(imagesDir, filename))) {
          finalImageName = filename;
        }
      }

      if (!finalImageName && sanitizedPageName) {
        const sanitizedBlockName = sanitizedPageName
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase()
          .slice(0, 20);

        const prefix = `${sanitizedBlockName}_${imageIndex}`;
        const extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

        for (const ext of extensions) {
          if (fs.existsSync(path.join(imagesDir, prefix + ext))) {
            finalImageName = prefix + ext;
            break;
          }
        }
      }

      if (!finalImageName) {
        if (!sanitizedPageName) {
          finalImageName = `image_${imageIndex}.png`;
        } else {
          const sanitizedBlockName = sanitizedPageName
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase()
            .slice(0, 20);
          finalImageName = `${sanitizedBlockName}_${imageIndex}.png`;
        }
        console.warn(
          chalk.yellow(
            `⚠️  Could not find matched image file for image #${imageIndex} in ${sanitizedPageName || "unknown"}. Defaulting to ${finalImageName}. Note: fallback index (Notion image-block counter) may not match fetch-time index (all-images counter including inline), causing wrong file lookup on pages with mixed inline+block images.`
          )
        );
      }

      const relativePath = `static/images/${finalImageName}`;

      newBlock.callout = {
        rich_text: [{ type: "text", text: { content: relativePath } }],
        icon: { type: "emoji", emoji: "🖼️" },
      };
      delete newBlock.image;
    }

    if (
      newBlock.type === "synced_block" &&
      newBlock.synced_block &&
      typeof newBlock.synced_block === "object"
    ) {
      (newBlock.synced_block as Record<string, unknown>).synced_from = null;
    }

    const blockType = newBlock.type as string;
    // eslint-disable-next-line security/detect-object-injection -- blockType comes from Notion API block.type, not user input
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

      if (typeObj.rich_text && !wasImageBlock) {
        // Consume paths for inline markdown images to prevent index drift
        if (state.orderedImagePaths && state.orderedImagePaths.length > 0) {
          for (const rt of typeObj.rich_text) {
            if (rt.text && rt.text.content) {
              const matches = extractImageMatches(rt.text.content);
              const remainingBefore = state.orderedImagePaths.length;
              for (let i = 0; i < matches.length; i++) {
                if (state.orderedImagePaths.length === 0) {
                  console.warn(
                    chalk.yellow(
                      `Warning: More inline images found (${matches.length - i}) than available paths in orderedImagePaths`
                    )
                  );
                  break;
                }
                state.orderedImagePaths.shift();
              }
              const consumed = remainingBefore - state.orderedImagePaths.length;
              if (consumed > 0) {
                console.log(
                  chalk.dim(
                    `Consumed ${consumed} image path(s) from orderedImagePaths (found ${matches.length} in rich_text)`
                  )
                );
              }
            }
          }
        }
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

      // Clean up unsupported properties that Notion API rejects on creation
      if (blockType === "table" && typeObj.table_width !== undefined) {
        // sometimes table_width is read-only? No, table_width is required.
      }
    }

    if (block.children) {
      // eslint-disable-next-line security/detect-object-injection -- blockType comes from Notion API block.type, not user input
      const parentTypeObj = newBlock[blockType] as Record<string, unknown>;
      parentTypeObj.children = await translateBlocksTree(
        block.children,
        targetLanguage,
        sanitizedPageName,
        state
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
  existingPageId?: string
): Promise<string> {
  const MAX_RETRIES = 3;
  const NOTION_API_CHUNK_SIZE = 100;
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < MAX_RETRIES) {
    try {
      if (language === "en") {
        throw new Error("Cannot modify English pages");
      }

      let pageId: string | null = existingPageId ?? null;
      const pageRelation = {
        "Parent item": {
          relation: [{ id: parentPageId }],
        },
      };

      if (!existingPageId) {
        const filter = language
          ? {
              and: [
                { property: NOTION_PROPERTIES.TITLE, title: { equals: title } },
                {
                  property: NOTION_PROPERTIES.LANGUAGE,
                  select: { equals: language },
                },
              ],
            }
          : { property: NOTION_PROPERTIES.TITLE, title: { equals: title } };

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
