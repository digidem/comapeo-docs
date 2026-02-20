import { enhancedNotion } from "../notionClient.js";
import { translateText } from "./translateFrontMatter.js";
import { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";
import { NOTION_PROPERTIES } from "../constants.js";

async function fetchAllBlocks(blockId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await enhancedNotion.blocksChildrenList({
      block_id: blockId,
      start_cursor: cursor,
    });
    for (const block of response.results as any[]) {
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

async function translateRichTextArray(richTextArr, targetLanguage) {
  if (!Array.isArray(richTextArr)) return;
  // Concurrently translate rich text segments to avoid timeouts
  await Promise.all(
    richTextArr.map(async (rt) => {
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
    })
  );
}

async function translateBlocksTree(blocks, targetLanguage) {
  const result = [];
  for (const block of blocks) {
    const newBlock = { ...block };
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

    if (newBlock.type === "image") {
      newBlock.type = "callout";
      newBlock.callout = {
        rich_text: [{ type: "text", text: { content: "[Image Placeholder]" } }],
        icon: { type: "emoji", emoji: "🖼️" },
      };
      delete newBlock.image;
    }

    if (newBlock.type === "synced_block" && newBlock.synced_block) {
      newBlock.synced_block.synced_from = null;
    }

    const typeObj = newBlock[newBlock.type];
    if (typeObj) {
      if (typeObj.url) {
        const sanitized = sanitizeUrl(typeObj.url);
        if (sanitized) {
          typeObj.url = sanitized;
        } else {
          // If a required URL is invalid, we might need to convert it or fallback.
          // For now, let's set it to a valid fallback URL or remove it if possible.
          // Notion API requires URL for bookmark/embed, we can't just delete it.
          typeObj.url = "https://example.com/invalid-url-removed";
        }
      }

      if (typeObj.rich_text) {
        await translateRichTextArray(typeObj.rich_text, targetLanguage);
      }
      if (typeObj.caption) {
        await translateRichTextArray(typeObj.caption, targetLanguage);
      }
      if (newBlock.type === "table_row" && typeObj.cells) {
        for (const cell of typeObj.cells) {
          await translateRichTextArray(cell, targetLanguage);
        }
      }

      // Clean up unsupported properties that Notion API rejects on creation
      if (newBlock.type === "table" && typeObj.table_width !== undefined) {
        // sometimes table_width is read-only? No, table_width is required.
      }
    }

    if (block.children) {
      newBlock[newBlock.type].children = await translateBlocksTree(
        block.children,
        targetLanguage
      );
    }

    result.push(newBlock);
  }
  return result;
}
export async function createNotionPageWithBlocks(
  notion: any, // Client
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

        const response = await notion.dataSources.query({
          data_source_id: databaseId,
          filter: filter,
        });

        const nonEnglishResults = language
          ? response.results
          : response.results.filter((page: any) => {
              const pageLang =
                page.properties?.[NOTION_PROPERTIES.LANGUAGE]?.select?.name ||
                "en";
              return pageLang !== "en";
            });

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
          blockIdsToDelete.push(
            ...existingBlocks.results.map((b: any) => b.id)
          );
          hasMore = existingBlocks.has_more;
          startCursor = existingBlocks.next_cursor ?? undefined;
        }

        for (const blockId of blockIdsToDelete) {
          try {
            await notion.blocks.delete({ block_id: blockId });
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (deleteError: any) {
            console.warn(
              `Warning: Failed to delete block ${blockId}: ${deleteError.message}`
            );
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
