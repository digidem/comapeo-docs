import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BlockObjectResponse,
  CalloutBlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { n2m } from "../notionClient";
import { NOTION_PROPERTIES } from "../constants";
import axios from "axios";
import chalk from "chalk";
import { processImage } from "./imageProcessor";
import {
  sanitizeMarkdownContent,
  compressImageToFileWithFallback,
  detectFormatFromBuffer,
  formatFromContentType,
  chooseFormat,
  extForFormat,
  isResizableFormat,
} from "./utils";
import config from "../../docusaurus.config";
import SpinnerManager from "./spinnerManager";
import { convertCalloutToAdmonition, isCalloutBlock } from "./calloutProcessor";
import { fetchNotionBlocks } from "../fetchNotionData";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CalloutBlockNode = CalloutBlockObjectResponse & {
  children?: Array<PartialBlockObjectResponse | BlockObjectResponse>;
};

const CONTENT_PATH = path.join(__dirname, "../../docs");
const IMAGES_PATH = path.join(__dirname, "../../static/images/");
const I18N_PATH = path.join(__dirname, "../../i18n/");
const getI18NPath = (locale: string) =>
  path.join(I18N_PATH, locale, "docusaurus-plugin-content-docs", "current");
const locales = config.i18n.locales;
const DEFAULT_LOCALE = config.i18n.defaultLocale;

// Ensure directories exist (preserve existing content)
fs.mkdirSync(CONTENT_PATH, { recursive: true });
fs.mkdirSync(IMAGES_PATH, { recursive: true });
// fs.mkdirSync(I18N_PATH, { recursive: true });
for (const locale of locales.filter((l) => l !== DEFAULT_LOCALE)) {
  fs.mkdirSync(getI18NPath(locale), { recursive: true });
}

// (moved to utils) Format detection helpers

/**
 * Process callout blocks in the markdown string to convert them to Docusaurus admonitions
 */
function processCalloutsInMarkdown(
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

/**
 * Extract text content from a callout block for matching
 */
function extractTextFromCalloutBlock(block: any): string {
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

function normalizeForMatch(text: string): string {
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

function findMatchingBlockquote(
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

async function downloadAndProcessImage(
  url: string,
  blockName: string,
  index: number
) {
  const spinner = SpinnerManager.create(`Processing image ${index + 1}`, 60000); // 60 second timeout for images

  try {
    // 1) Download with timeout
    spinner.text = `Processing image ${index + 1}: Downloading`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
      headers: {
        "User-Agent": "notion-fetch-script/1.0",
      },
    });

    const originalBuffer = Buffer.from(response.data, "binary");

    // Remove query parameters from the URL
    const cleanUrl = url.split("?")[0];

    // Detect true format from buffer and Content-Type, and save with the right extension
    const headerCT = (response.headers as Record<string, string | string[]>)?.[
      "content-type"
    ] as string | undefined;
    const headerFmt = formatFromContentType(headerCT);
    const bufferFmt = detectFormatFromBuffer(originalBuffer);
    const chosenFmt = chooseFormat(bufferFmt, headerFmt);

    // Compute extension. If unknown, fall back to URL extension or .jpg
    const urlExt = (path.extname(cleanUrl) || "").toLowerCase();
    let extension = extForFormat(chosenFmt);
    if (!extension) {
      extension = urlExt || ".jpg";
    }

    // Create a short, sanitized filename using the chosen extension
    const sanitizedBlockName = blockName
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(0, 20);
    const filename = `${sanitizedBlockName}_${index}${extension}`;

    const filepath = path.join(IMAGES_PATH, filename);

    let resizedBuffer = originalBuffer;
    let originalSize = originalBuffer.length;

    // 2) Resize only for formats sharp supports without conversion (jpeg/png/webp)
    if (isResizableFormat(chosenFmt)) {
      spinner.text = `Processing image ${index + 1}: Resizing`;
      // processImage uses the outputPath extension to choose encoder; since we computed
      // "extension" from detected format, sharp will keep that format.
      const processed = await processImage(originalBuffer, filepath);
      resizedBuffer = processed.outputBuffer;
      originalSize = processed.originalSize;
    } else {
      spinner.text = `Processing image ${index + 1}: Skipping resize for ${chosenFmt || "unknown"} format`;
      // Keep original buffer as candidate for optimization
      resizedBuffer = originalBuffer;
      originalSize = originalBuffer.length;
    }

    // 3) Compression/Optimization with fail-open. On any optimizer error, keep original unmodified.
    spinner.text = `Processing image ${index + 1}: Compressing`;
    // Streaming-like safe write: only replace final file on success; else keep original
    const { finalSize, usedFallback } = await compressImageToFileWithFallback(
      originalBuffer,
      resizedBuffer,
      filepath,
      url
    );

    spinner.succeed(
      usedFallback
        ? chalk.green(
            `Image ${index + 1} saved with fallback (original, unmodified): ${filepath}`
          )
        : chalk.green(`Image ${index + 1} processed and saved: ${filepath}`)
    );

    const savedBytes = usedFallback ? 0 : Math.max(0, originalSize - finalSize);
    // Use absolute path so Docusaurus resolves from /static
    const imagePath = `/images/${filename.replace(/\\/g, "/")}`;
    return { newPath: imagePath, savedBytes };
  } catch (error) {
    // Enhanced error handling with specific error types
    let errorMessage = `Error processing image ${index + 1} from ${url}`;

    if (error.code === "ECONNABORTED") {
      errorMessage = `Timeout downloading image ${index + 1} from ${url}`;
    } else if (error.response) {
      errorMessage = `HTTP ${error.response.status} error for image ${index + 1}: ${url}`;
    } else if (error.code === "ENOTFOUND") {
      errorMessage = `DNS resolution failed for image ${index + 1}: ${url}`;
    }

    spinner.fail(chalk.red(errorMessage));
    console.error(chalk.red("Image processing error details:"), error);

    // Per requirement: network failures should propagate; resizing failures should propagate.
    // We rethrow to abort the page/process. No partial file was written unless optimizer succeeded.
    throw error;
  } finally {
    // Ensure spinner is always cleaned up
    SpinnerManager.remove(spinner);
  }
}

const LEGACY_SECTION_PROPERTY = "Section";

const getElementTypeProperty = (page: Record<string, any>) =>
  page?.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE] ??
  page?.properties?.[LEGACY_SECTION_PROPERTY];

const groupPagesByLang = (pages, page) => {
  const langMap = {
    English: "en",
    Spanish: "es",
    Portuguese: "pt",
  };
  const elementType = getElementTypeProperty(page);
  const sectionName =
    elementType?.select?.name ?? elementType?.name ?? elementType ?? "";

  const obj = {
    mainTitle: page.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text,
    section: sectionName,
    content: {},
  };
  const subpagesId = page.properties["Sub-item"].relation.map((obj) => obj.id);
  for (const subpageId of subpagesId) {
    const subpage = pages.find((page) => page.id == subpageId);
    if (subpage) {
      const lang = langMap[subpage.properties["Language"].select?.name];
      obj.content[lang] = subpage;
    }
  }
  return obj;
};

function setTranslationString(
  lang: string,
  original: string,
  translated: string
) {
  const lPath = path.join(I18N_PATH, lang, "code.json");
  const file = JSON.parse(fs.readFileSync(lPath, "utf8"));
  const translationObj = { message: translated };
  file[original] = translationObj;
  // console.log('adding translation to: ' + lPath)
  // console.log('with: ', translationObj)
  fs.writeFileSync(lPath, JSON.stringify(file, null, 4));
}

export async function generateBlocks(pages, progressCallback) {
  // pages are already sorted by Order property in fetchNotion.ts
  const totalPages = pages.length;
  let totalSaved = 0;
  let processedPages = 0;

  // Variables to track section folders and title metadata
  let currentSectionFolder = {};
  const currentHeading = new Map<string, string>();

  // Stats for reporting
  let sectionCount = 0;
  let titleSectionCount = 0;

  const pagesByLang = [];

  try {
    /*
     * group pages by language likeso:
     * {
     * mainTitle,
     * section: "Heading" | "Toggle" | "Page"
     * content: { lang: page}
     * }
     */
    for (const page of pages) {
      if (page.properties["Sub-item"].relation.length !== 0) {
        pagesByLang.push(groupPagesByLang(pages, page));
      }
    }

    for (let i = 0; i < pagesByLang.length; i++) {
      const pageByLang = pagesByLang[i];
      // pages share section type and filename
      const title = pageByLang.mainTitle;
      const sectionType = pageByLang.section;
      const filename = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      for (const lang of Object.keys(pageByLang.content)) {
        const PATH = lang == "en" ? CONTENT_PATH : getI18NPath(lang);
        const page = pageByLang.content[lang];
        const pageTitle =
          page.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;

        console.log(chalk.blue(`Processing page: ${page.id}, ${pageTitle}`));
        const pageSpinner = SpinnerManager.create(
          `Processing page ${processedPages + 1}/${totalPages}`,
          120000
        ); // 2 minute timeout per page

        try {
          if (lang !== "en")
            setTranslationString(lang, pageByLang.mainTitle, pageTitle);

          // TOGGLE
          if (sectionType === "Toggle") {
            const sectionName = page.properties["Title"].title[0].plain_text;
            const sectionFolder = filename;
            const sectionFolderPath = path.join(PATH, sectionFolder);
            fs.mkdirSync(sectionFolderPath, { recursive: true });
            currentSectionFolder[lang] = sectionFolder;
            pageSpinner.succeed(
              chalk.green(`Section folder created: ${sectionFolder}`)
            );
            sectionCount++;
            const categoryContent = {
              label: sectionName,
              position: i + 1,
              collapsible: true,
              collapsed: true,
              link: {
                type: "generated-index",
              },
              customProps: { title: null },
            };
            if (currentHeading.get(lang)) {
              categoryContent.customProps.title = currentHeading.get(lang);
              currentHeading.set(lang, null);
            }
            if (lang === "en") {
              const categoryFilePath = path.join(
                sectionFolderPath,
                "_category_.json"
              );
              fs.writeFileSync(
                categoryFilePath,
                JSON.stringify(categoryContent, null, 2),
                "utf8"
              );
              pageSpinner.succeed(
                chalk.green(`added _category_.json to ${sectionFolder}`)
              );
            }
            // HEADING
          } else if (sectionType === "Heading") {
            currentHeading.set(lang, pageTitle);
            titleSectionCount++; // Increment title section counter
            currentSectionFolder = {};
            pageSpinner.succeed(
              chalk.green(
                `Title section detected: ${currentHeading.get(lang)}, will be applied to next item`
              )
            );

            // PAGE
          } else if (sectionType === "Page") {
            const markdown = await n2m.pageToMarkdown(page.id);
            const markdownString = n2m.toMarkdownString(markdown);

            if (markdownString?.parent) {
              // Fetch raw block data for callout processing
              let rawBlocks: any[] = [];
              try {
                rawBlocks = await fetchNotionBlocks(page.id);
                console.log(
                  chalk.blue(
                    `  ↳ Fetched ${rawBlocks.length} raw blocks for callout processing`
                  )
                );
              } catch (error) {
                const msg =
                  error && typeof error === "object" && "message" in error
                    ? (error as any).message
                    : String(error);
                console.warn(
                  chalk.yellow(
                    `  ⚠️  Failed to fetch raw blocks for callout processing: ${msg}`
                  )
                );
              }

              // Process callouts in the markdown to convert them to Docusaurus admonitions
              if (rawBlocks.length > 0) {
                markdownString.parent = processCalloutsInMarkdown(
                  markdownString.parent,
                  rawBlocks
                );
                console.log(
                  chalk.blue(`  ↳ Processed callouts in markdown content`)
                );
              }
              // Process images with Promise.allSettled for better error handling
              const imgRegex = /!\[.*?\]\((.*?)\)/g;
              const imgPromises = [];
              let match;
              let imgIndex = 0;

              while ((match = imgRegex.exec(markdownString.parent)) !== null) {
                const imgUrl = match[1];
                if (!imgUrl.startsWith("http")) continue; // Skip local images
                const fullMatch = match[0];

                imgPromises.push(
                  downloadAndProcessImage(imgUrl, filename, imgIndex)
                    .then(({ newPath, savedBytes }) => {
                      const newImageMarkdown = fullMatch.replace(
                        imgUrl,
                        newPath
                      );
                      markdownString.parent = markdownString.parent.replace(
                        fullMatch,
                        newImageMarkdown
                      );
                      totalSaved += savedBytes;
                      return { success: true, savedBytes };
                    })
                    .catch((error) => {
                      console.error(
                        chalk.red(
                          `Failed to process image ${imgIndex} for page ${page.id}:`
                        ),
                        error.message
                      );
                      return { success: false, error: error.message };
                    })
                );
                imgIndex++;
              }

              // Use Promise.allSettled to handle partial failures gracefully
              const imgResults = await Promise.allSettled(imgPromises);
              const successfulImages = imgResults.filter(
                (result) =>
                  result.status === "fulfilled" && result.value.success
              ).length;

              if (successfulImages < imgPromises.length) {
                console.warn(
                  chalk.yellow(
                    `⚠️  ${imgPromises.length - successfulImages} images failed to process for page ${page.id}`
                  )
                );
              }

              // Sanitize content to fix malformed HTML/JSX tags
              markdownString.parent = sanitizeMarkdownContent(
                markdownString.parent
              );

              // Determine file path based on section folder context
              const fileName = `${filename}.md`;
              let filePath;

              if (currentSectionFolder[lang]) {
                filePath = path.join(
                  PATH,
                  currentSectionFolder[lang],
                  fileName
                );
              } else {
                filePath = path.join(PATH, fileName);
              }

              // Generate frontmatter
              // Extract additional properties if available
              let keywords = ["docs", "comapeo"];
              let tags = ["comapeo"];
              let sidebarPosition = i + 1;
              const customProps: Record<string, unknown> = {};

              // Check for Tags property
              if (
                page.properties["Tags"] &&
                page.properties["Tags"].multi_select
              ) {
                tags = page.properties["Tags"].multi_select.map(
                  (tag) => tag.name
                );
              }

              // Check for Keywords property
              if (
                page.properties.Keywords?.multi_select &&
                page.properties.Keywords.multi_select.length > 0
              ) {
                keywords = page.properties.Keywords.multi_select.map(
                  (keyword) => keyword.name
                );
              }

              // Check for Position property
              if (page.properties["Order"] && page.properties["Order"].number) {
                sidebarPosition = page.properties["Order"].number;
              }

              // Check for Icon property
              if (
                page.properties["Icon"] &&
                page.properties["Icon"].rich_text &&
                page.properties["Icon"].rich_text.length > 0
              ) {
                customProps.icon =
                  page.properties["Icon"].rich_text[0].plain_text;
              }

              // Apply title from a previous title section if available
              if (currentHeading.get(lang)) {
                customProps.title = currentHeading.get(lang);
                currentHeading.set(lang, null); // Reset after using it
              }

              // Determine the relative path for the custom_edit_url
              const relativePath = currentSectionFolder[lang]
                ? `${currentSectionFolder[lang]}/${fileName}`
                : fileName;

              // Generate frontmatter with custom properties
              let frontmatter = `---
id: doc-${filename}
title: ${pageTitle}
sidebar_label: ${pageTitle}
sidebar_position: ${sidebarPosition}
pagination_label: ${pageTitle}
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/${relativePath}
keywords:
${keywords.map((k) => `  - ${k}`).join("\n")}
tags: [${tags.join(", ")}]
slug: /${filename}
last_update:
  date: ${new Date().toLocaleDateString("en-US")}
  author: Awana Digital`;

              // Add customProps to frontmatter if they exist
              if (Object.keys(customProps).length > 0) {
                frontmatter += `\nsidebar_custom_props:`;
                for (const [key, value] of Object.entries(customProps)) {
                  // For emoji icons or titles with special characters, wrap in quotes
                  if (
                    typeof value === "string" &&
                    (value.includes('"') ||
                      value.includes("'") ||
                      /[^\x20-\x7E]/.test(value))
                  ) {
                    // If the value contains double quotes, use single quotes; otherwise use double quotes
                    const quoteChar = value.includes('"') ? "'" : '"';
                    frontmatter += `\n  ${key}: ${quoteChar}${value}${quoteChar}`;
                  } else {
                    frontmatter += `\n  ${key}: ${value}`;
                  }
                }
              }

              frontmatter += `\n---\n`;

              // Remove duplicate title heading if it exists
              // The first H1 heading often duplicates the title in Notion exports
              let contentBody = markdownString.parent;

              // Find the first H1 heading pattern at the beginning of the content
              const firstH1Regex = /^\s*# (.+?)(?:\n|$)/;
              const firstH1Match = contentBody.match(firstH1Regex);

              if (firstH1Match) {
                const firstH1Text = firstH1Match[1].trim();
                // Check if this heading is similar to the page title (exact match or contains)
                if (
                  firstH1Text === pageTitle ||
                  pageTitle.includes(firstH1Text) ||
                  firstH1Text.includes(pageTitle)
                ) {
                  // Remove the duplicate heading
                  contentBody = contentBody.replace(firstH1Match[0], "");

                  // Also remove any empty lines at the beginning
                  contentBody = contentBody.replace(/^\s+/, "");
                }
              }

              // Add frontmatter to markdown content
              const contentWithFrontmatter = frontmatter + contentBody;
              fs.writeFileSync(filePath, contentWithFrontmatter, "utf8");

              pageSpinner.succeed(
                chalk.green(
                  `Page ${processedPages + 1}/${totalPages} processed: ${filePath}`
                )
              );
              console.log(
                chalk.blue(
                  `  ↳ Added frontmatter with id: doc-${filename}, title: ${pageTitle}`
                )
              );

              // Log information about custom properties
              if (Object.keys(customProps).length > 0) {
                console.log(
                  chalk.yellow(
                    `  ↳ Added custom properties: ${JSON.stringify(customProps)}`
                  )
                );
              }

              // Log information about section folder placement
              if (currentSectionFolder[lang]) {
                console.log(
                  chalk.cyan(
                    `  ↳ Placed in section folder: ${currentSectionFolder[lang]}`
                  )
                );
              }
            } else {
              pageSpinner.fail(
                chalk.yellow(
                  `No 'Website Block' property found for page ${processedPages + 1}/${totalPages}: ${page.id}`
                )
              );
            }
          }

          processedPages++;
          progressCallback({ current: processedPages, total: totalPages });
        } catch (pageError) {
          console.error(
            chalk.red(
              `Failed to process page ${processedPages + 1}: ${page.id}`
            ),
            pageError
          );
          pageSpinner.fail(
            chalk.red(
              `Failed to process page ${processedPages + 1}/${totalPages}: ${page.id}`
            )
          );
          processedPages++; // Still increment to maintain progress tracking
          progressCallback({ current: processedPages, total: totalPages });
          // Continue with next page instead of failing completely
        } finally {
          SpinnerManager.remove(pageSpinner);
        }
      }
    }

    return { totalSaved, sectionCount, titleSectionCount };
  } catch (error) {
    console.error(chalk.red("Critical error in generateBlocks:"), error);
    throw error;
  } finally {
    // Ensure all spinners are cleaned up
    SpinnerManager.stopAll();
  }
}
