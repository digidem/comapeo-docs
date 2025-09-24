import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { n2m } from "../notionClient";
import { NOTION_PROPERTIES } from "../constants";
import axios from "axios";
import chalk from "chalk";
import { processImage } from "../notion-fetch/imageProcessor";
import {
  sanitizeMarkdownContent,
  compressImageToFileWithFallback,
  detectFormatFromBuffer,
  formatFromContentType,
  chooseFormat,
  extForFormat,
  isResizableFormat,
} from "../notion-fetch/utils";
import config from "../../docusaurus.config";
import SpinnerManager from "../notion-fetch/spinnerManager";
import { PageWithStatus } from "./fetchAll";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global failed images tracker for final summary
const failedImages: Array<{
  pageId: string;
  pageTitle: string;
  imageUrl: string;
  reason: string;
}> = [];

const CONTENT_PATH = path.join(__dirname, "../../docs");
const IMAGES_PATH = path.join(__dirname, "../../static/images/");
const I18N_PATH = path.join(__dirname, "../../i18n/");
const getI18NPath = (locale: string) =>
  path.join(I18N_PATH, locale, "docusaurus-plugin-content-docs", "current");
const locales = config.i18n.locales;
const DEFAULT_LOCALE = config.i18n.defaultLocale;

// Language mapping from Notion to locale codes
const langMap = {
  English: "en",
  Spanish: "es",
  Portuguese: "pt",
};

// Ensure directories exist
fs.mkdirSync(CONTENT_PATH, { recursive: true });
fs.mkdirSync(IMAGES_PATH, { recursive: true });
for (const locale of locales.filter((l) => l !== DEFAULT_LOCALE)) {
  fs.mkdirSync(getI18NPath(locale), { recursive: true });
}

/**
 * Enhanced language detection algorithm for individual pages
 */
function detectPageLanguage(
  page: PageWithStatus,
  allPages: PageWithStatus[]
): string {
  // 1. Check explicit Language property (most reliable when present)
  if (page.language && langMap[page.language]) {
    return langMap[page.language];
  }

  // 2. Analyze title patterns for Spanish
  const title = page.title.toLowerCase();
  const spanishPatterns = [
    "nueva página",
    "instalación",
    "desinstalación",
    "solución",
    "preguntas frecuentes",
    "glosario",
    "gestión",
    "recopilación",
    "compartir observaciones",
    "gestión de datos",
    "revisión de observaciones",
    "finalizar un proyecto",
    "misceláneas",
    "preparación para el uso",
  ];

  if (spanishPatterns.some((pattern) => title.includes(pattern))) {
    return "es";
  }

  // 3. Analyze title patterns for Portuguese
  const portuguesePatterns = [
    "nova página",
    "instalando",
    "desinstalando",
    "solução",
    "perguntas frequentes",
    "glossário",
    "gerenciamento",
    "coletando",
    "compartilhando observações",
    "gerenciamento de dados",
    "revisando observações",
    "encerrando um projeto",
    "variado",
    "preparando para usar",
  ];

  if (portuguesePatterns.some((pattern) => title.includes(pattern))) {
    return "pt";
  }

  // 4. Check parent language if this is a sub-item
  if (page.parentItem) {
    const parent = allPages.find((p) => p.id === page.parentItem);
    if (parent) {
      return detectPageLanguage(parent, allPages);
    }
  }

  // 5. Default to English
  return "en";
}

/**
 * Generate clean filename from page title
 */
function generateFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing dashes
}

/**
 * Check if page should be skipped based on content quality
 */
function shouldSkipPage(page: PageWithStatus): boolean {
  const title = page.title.toLowerCase().trim();

  // Skip obvious placeholder pages
  const placeholderTitles = [
    "nueva página",
    "nova página",
    "new page [en title] [add content here]",
    "untitled",
  ];

  if (placeholderTitles.some((placeholder) => title === placeholder)) {
    return true;
  }

  // Skip if title is just whitespace or very short
  if (title.length < 3) {
    return true;
  }

  return false;
}

/**
 * Enhanced image processing with comprehensive fallback strategies and noise alerts
 */
async function downloadImageWithFallbacks(
  imageUrl: string,
  pageFilename: string,
  index: number,
  pageId: string,
  pageTitle: string
): Promise<{ newPath: string; savedBytes: number }> {
  // 🚨 NOISE ALERT: Starting image processing attempt
  console.log(
    chalk.cyan(
      `📥 🎯 TRYING HARD: Processing image ${index + 1} from ${pageTitle}`
    )
  );
  console.log(chalk.blue(`🔗 Image URL: ${imageUrl.substring(0, 100)}...`));

  // Fallback strategy 1: Direct download with retries
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(chalk.blue(`🔄 Attempt ${attempt}/3 for image ${index + 1}`));

      const result = await downloadAndProcessImage(
        imageUrl,
        pageFilename,
        index
      );

      // Success! 🎉
      console.log(
        chalk.green(
          `✅ SUCCESS: Image ${index + 1} processed successfully on attempt ${attempt}`
        )
      );
      return result;
    } catch (error: any) {
      // 🚨 NOISE ALERT for each failed attempt
      console.warn(
        chalk.yellow(`⚠️  ATTEMPT ${attempt} FAILED: ${error.message}`)
      );

      if (attempt < 3) {
        console.log(chalk.blue(`⏳ Retrying in ${attempt} seconds...`));
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  // All attempts failed - add to failed images tracker
  const failureReason = `Failed after 3 download attempts`;
  failedImages.push({
    pageId,
    pageTitle,
    imageUrl: imageUrl.substring(0, 200),
    reason: failureReason,
  });

  // 🚨 CRITICAL NOISE ALERT
  console.error(
    chalk.red.bold(
      `🚨 CRITICAL: Image ${index + 1} FAILED completely after all attempts!`
    )
  );
  console.error(chalk.red(`📄 Page: ${pageTitle}`));
  console.error(chalk.red(`🔗 URL: ${imageUrl.substring(0, 100)}...`));

  throw new Error(failureReason);
}

/**
 * Process base64 image by saving it as a file
 */
async function processBase64Image(
  base64Data: string,
  blockName: string,
  index: number
): Promise<{ newPath: string; savedBytes: number }> {
  const spinner = SpinnerManager.create(
    `Processing base64 image ${index + 1}`,
    30000
  );

  try {
    // Extract MIME type and base64 data
    const matches = base64Data.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid base64 image format");
    }

    const [, mimeType, encodedData] = matches;
    const buffer = Buffer.from(encodedData, "base64");

    // Determine file extension from MIME type
    const mimeToExt: Record<string, string> = {
      png: ".png",
      jpeg: ".jpg",
      jpg: ".jpg",
      gif: ".gif",
      webp: ".webp",
      "svg+xml": ".svg",
    };
    const extension = mimeToExt[mimeType] || ".jpg";

    // Create a short, sanitized filename
    const sanitizedName = blockName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .substring(0, 20);
    const filename = `${sanitizedName}_${index}${extension}`;
    const filePath = path.join(__dirname, "../../static/images", filename);

    // Ensure static/images directory exists
    const imagesDir = path.dirname(filePath);
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    spinner.text = `Processing base64 image ${index + 1}: Saving to file`;

    // Check if we can compress the image (only for certain formats)
    const rawFormat = mimeType as "png" | "jpeg" | "jpg" | "gif" | "webp";
    // Normalize jpg to jpeg for the isResizableFormat function
    const format = rawFormat === "jpg" ? "jpeg" : rawFormat;
    if (isResizableFormat(format) && buffer.length > 50000) {
      // Only compress if > 50KB
      spinner.text = `Processing base64 image ${index + 1}: Compressing`;
      const { finalSize } = await compressImageToFileWithFallback(
        buffer,
        buffer, // use same buffer as optimized candidate
        filePath,
        `base64:${mimeType}`
      );

      spinner.succeed(
        `✅ Base64 image ${index + 1} saved and compressed: ${filename} (${Math.round(finalSize / 1024)}KB)`
      );
      return {
        newPath: `/images/${filename}`,
        savedBytes: finalSize,
      };
    } else {
      // Save without compression
      fs.writeFileSync(filePath, buffer);

      spinner.succeed(
        `✅ Base64 image ${index + 1} saved: ${filename} (${Math.round(buffer.length / 1024)}KB)`
      );
      return {
        newPath: `/images/${filename}`,
        savedBytes: buffer.length,
      };
    }
  } catch (error: any) {
    spinner.fail(
      `❌ Failed to process base64 image ${index + 1}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Download and process image (complete implementation from generateBlocks.ts)
 */
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

/**
 * Set translation string (reused from generateBlocks.ts)
 */
function setTranslationString(
  lang: string,
  original: string,
  translated: string
) {
  const lPath = path.join(I18N_PATH, lang, "code.json");

  // Ensure the file exists
  if (!fs.existsSync(lPath)) {
    fs.writeFileSync(lPath, "{}", "utf8");
  }

  const file = JSON.parse(fs.readFileSync(lPath, "utf8"));
  const translationObj = { message: translated };
  file[original] = translationObj;
  fs.writeFileSync(lPath, JSON.stringify(file, null, 4));
}

/**
 * Export individual page to markdown
 */
async function exportPageToMarkdown(
  page: PageWithStatus,
  language: string,
  index: number,
  totalPages: number,
  sectionFolders: Map<string, string>
): Promise<number> {
  const pageTitle = page.title;
  const filename = generateFilename(pageTitle);

  // Skip if filename is empty after processing
  if (!filename) {
    console.warn(
      chalk.yellow(`⚠️  Skipping page with invalid filename: "${pageTitle}"`)
    );
    return 0;
  }

  const PATH = language === "en" ? CONTENT_PATH : getI18NPath(language);

  console.log(
    chalk.blue(`Processing page: ${page.id}, ${pageTitle} (${language})`)
  );
  const pageSpinner = SpinnerManager.create(
    `Processing page ${index + 1}/${totalPages}`,
    120000 // 2 minute timeout per page
  );

  let totalSaved = 0;

  try {
    // Set translation string for non-English content
    if (language !== "en") {
      setTranslationString(language, pageTitle, pageTitle);
    }

    // Handle different element types
    if (page.elementType === "Toggle") {
      // Create section folder for Toggle elements
      const sectionFolder = filename;
      const sectionFolderPath = path.join(PATH, sectionFolder);
      fs.mkdirSync(sectionFolderPath, { recursive: true });
      sectionFolders.set(language, sectionFolder);

      // Create _category_.json file for English only
      if (language === "en") {
        const categoryContent = {
          label: pageTitle,
          position: page.order || index + 1,
          collapsible: true,
          collapsed: true,
          link: {
            type: "generated-index",
          },
        };

        const categoryFilePath = path.join(
          sectionFolderPath,
          "_category_.json"
        );
        fs.writeFileSync(
          categoryFilePath,
          JSON.stringify(categoryContent, null, 2),
          "utf8"
        );
      }

      pageSpinner.succeed(
        chalk.green(`Section folder created: ${sectionFolder}`)
      );
      return totalSaved;
    } else if (page.elementType === "Title" || page.elementType === "Heading") {
      // Skip title/heading elements for now (they could be used for organization)
      pageSpinner.succeed(chalk.green(`Title section: ${pageTitle}`));
      return totalSaved;
    } else if (page.elementType === "Page" || page.elementType === "Unknown") {
      // Process actual content pages
      try {
        const markdown = await n2m.pageToMarkdown(page.id);
        const markdownString = n2m.toMarkdownString(markdown);

        if (markdownString?.parent) {
          // Process images
          const imgRegex = /!\[.*?\]\((.*?)\)/g;
          const imgPromises = [];
          let match;
          let imgIndex = 0;

          while ((match = imgRegex.exec(markdownString.parent)) !== null) {
            const imgUrl = match[1];
            const fullMatch = match[0];

            // Skip empty URLs, non-image URLs and handle base64 images
            if (!imgUrl || imgUrl.trim() === "") {
              // 🚨 NOISE ALERT for empty image URLs
              console.warn(
                chalk.yellow.bold(
                  `🚨 EMPTY IMAGE URL: Found empty image URL in page "${page.title || page.id}", removing it`
                )
              );
              failedImages.push({
                pageId: page.id,
                pageTitle: page.title || "Unknown",
                imageUrl: "EMPTY_URL",
                reason: "Empty image URL found",
              });
              markdownString.parent = markdownString.parent.replace(
                fullMatch,
                ""
              );
              continue;
            }

            if (
              !imgUrl.startsWith("http") &&
              !imgUrl.startsWith("data:image")
            ) {
              // Skip relative URLs or other formats
              continue;
            }

            // For base64 images, we need to handle them differently
            if (imgUrl.startsWith("data:image")) {
              // 🚨 NOISE ALERT for base64 images
              console.log(
                chalk.blue.bold(
                  `📷 BASE64 IMAGE DETECTED: Converting base64 image to file in page "${page.title || page.id}"`
                )
              );

              // Process base64 image - save it as a file
              imgPromises.push(
                processBase64Image(imgUrl, filename, imgIndex)
                  .then(({ newPath, savedBytes }) => {
                    const newImageMarkdown = fullMatch.replace(imgUrl, newPath);
                    markdownString.parent = markdownString.parent.replace(
                      fullMatch,
                      newImageMarkdown
                    );
                    return savedBytes;
                  })
                  .catch((error: any) => {
                    // If base64 processing fails, add to failed images and remove from markdown
                    console.error(
                      chalk.red(
                        `❌ Failed to process base64 image in "${page.title || page.id}": ${error.message}`
                      )
                    );
                    failedImages.push({
                      pageId: page.id,
                      pageTitle: page.title || "Unknown",
                      imageUrl: imgUrl.substring(0, 50) + "...[BASE64]",
                      reason: `Base64 processing failed: ${error.message}`,
                    });
                    markdownString.parent = markdownString.parent.replace(
                      fullMatch,
                      ""
                    );
                    return 0;
                  })
              );
              imgIndex++;
              continue;
            }

            // Use enhanced image processing with fallbacks and noise alerts
            imgPromises.push(
              downloadImageWithFallbacks(
                imgUrl,
                filename,
                imgIndex,
                page.id,
                page.title || "Unknown"
              )
                .then(({ newPath, savedBytes }) => {
                  const newImageMarkdown = fullMatch.replace(imgUrl, newPath);
                  markdownString.parent = markdownString.parent.replace(
                    fullMatch,
                    newImageMarkdown
                  );
                  totalSaved += savedBytes;

                  // 🎉 SUCCESS NOISE ALERT
                  console.log(
                    chalk.green.bold(
                      `🎉 IMAGE SUCCESS: Successfully processed and linked image ${imgIndex + 1}`
                    )
                  );
                  return { success: true, savedBytes };
                })
                .catch((error) => {
                  // 🚨 CRITICAL FAILURE NOISE ALERT
                  console.error(
                    chalk.red.bold(
                      `🚨 CRITICAL IMAGE FAILURE: Image ${imgIndex + 1} in page "${page.title || page.id}" failed completely!`
                    )
                  );
                  console.error(
                    chalk.red(`💥 Error details: ${error.message}`)
                  );

                  // Last resort: Remove the failed image from markdown to ensure valid MDX
                  console.warn(
                    chalk.yellow.bold(
                      `🛡️  PROTECTING MDX: Removing failed image reference to prevent compilation errors`
                    )
                  );
                  markdownString.parent = markdownString.parent.replace(
                    fullMatch,
                    ""
                  );

                  // Already added to failedImages in downloadImageWithFallbacks
                  return { success: false, error: error.message };
                })
            );
            imgIndex++;
          }

          // Wait for all images to process
          const imgResults = await Promise.allSettled(imgPromises);
          const successfulImages = imgResults.filter(
            (result) => result.status === "fulfilled" && result.value.success
          ).length;

          // Enhanced image processing summary with noise alerts
          const failedCount = imgPromises.length - successfulImages;
          if (failedCount > 0) {
            // 🚨 PAGE-LEVEL NOISE ALERT for failed images
            console.warn(
              chalk.red.bold(
                `🚨 PAGE IMAGE FAILURES: ${failedCount}/${imgPromises.length} images failed for page "${page.title || page.id}"`
              )
            );
            console.warn(
              chalk.yellow(
                `📊 Success rate: ${successfulImages}/${imgPromises.length} (${Math.round((successfulImages / imgPromises.length) * 100)}%)`
              )
            );
          } else if (imgPromises.length > 0) {
            console.log(
              chalk.green.bold(
                `🎉 PERFECT PAGE: All ${successfulImages} images processed successfully for "${page.title || page.id}"`
              )
            );
          }

          // Sanitize content and perform final cleanup
          markdownString.parent = sanitizeMarkdownContent(
            markdownString.parent
          );

          // 🛡️ FINAL MDX SAFETY CHECK: Remove any remaining malformed image references
          const malformedImagePatterns = [
            /!\[.*?\]\(\s*\)/g, // Empty image URLs: ![text]()
            /!\[.*?\]\(data:image[^)]*\)/g, // Any remaining base64 images
            /!\[.*?\]\(\s*undefined\s*\)/g, // Undefined URLs
            /!\[.*?\]\(\s*null\s*\)/g, // Null URLs
          ];

          let cleanedAny = false;
          malformedImagePatterns.forEach((pattern, index) => {
            const matches = markdownString.parent.match(pattern);
            if (matches && matches.length > 0) {
              console.warn(
                chalk.yellow.bold(
                  `🛡️  SAFETY CLEANUP: Removing ${matches.length} malformed image reference(s) of type ${index + 1} from "${page.title || page.id}"`
                )
              );
              markdownString.parent = markdownString.parent.replace(
                pattern,
                ""
              );
              cleanedAny = true;

              // Track these in failed images
              matches.forEach((match) => {
                failedImages.push({
                  pageId: page.id,
                  pageTitle: page.title || "Unknown",
                  imageUrl: match.substring(0, 50) + "...",
                  reason: `Malformed image reference (pattern ${index + 1})`,
                });
              });
            }
          });

          if (cleanedAny) {
            console.log(
              chalk.green(`✅ MDX SAFETY: Page content cleaned and protected`)
            );
          }

          // Determine file path
          const fileName = `${filename}.md`;
          let filePath;

          const currentSectionFolder = sectionFolders.get(language);
          if (currentSectionFolder) {
            filePath = path.join(PATH, currentSectionFolder, fileName);
          } else {
            filePath = path.join(PATH, fileName);
          }

          // Generate frontmatter
          let keywords = ["docs", "comapeo"];
          let tags = ["comapeo"];
          let sidebarPosition = page.order || index + 1;
          const customProps: Record<string, unknown> = {};

          // Extract tags if available
          if (page.properties?.Tags?.multi_select) {
            tags = page.properties.Tags.multi_select.map(
              (tag: any) => tag.name
            );
          }

          // Extract keywords if available
          if (
            page.properties?.Keywords?.multi_select &&
            page.properties.Keywords.multi_select.length > 0
          ) {
            keywords = page.properties.Keywords.multi_select.map(
              (keyword: any) => keyword.name
            );
          }

          // Ensure keywords is always an array
          if (!Array.isArray(keywords) || keywords.length === 0) {
            keywords = ["docs", "comapeo"];
          }

          // Add status information to custom props
          if (page.status && page.status !== "No Status") {
            customProps.status = page.status;
          }

          // Determine relative path for edit URL
          const relativePath = currentSectionFolder
            ? `${currentSectionFolder}/${fileName}`
            : fileName;

          // Generate frontmatter
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

          // Add custom props if they exist
          if (Object.keys(customProps).length > 0) {
            frontmatter += `\nsidebar_custom_props:`;
            for (const [key, value] of Object.entries(customProps)) {
              if (
                typeof value === "string" &&
                (value.includes('"') ||
                  value.includes("'") ||
                  /[^\x20-\x7E]/.test(value))
              ) {
                const quoteChar = value.includes('"') ? "'" : '"';
                frontmatter += `\n  ${key}: ${quoteChar}${value}${quoteChar}`;
              } else {
                frontmatter += `\n  ${key}: ${value}`;
              }
            }
          }

          frontmatter += `\n---\n`;

          // Remove duplicate title heading
          let contentBody = markdownString.parent;
          const firstH1Regex = /^\s*# (.+?)(?:\n|$)/;
          const firstH1Match = contentBody.match(firstH1Regex);

          if (firstH1Match) {
            const firstH1Text = firstH1Match[1].trim();
            if (
              firstH1Text === pageTitle ||
              pageTitle.includes(firstH1Text) ||
              firstH1Text.includes(pageTitle)
            ) {
              contentBody = contentBody.replace(firstH1Match[0], "");
              contentBody = contentBody.replace(/^\s+/, "");
            }
          }

          // Write file
          const contentWithFrontmatter = frontmatter + contentBody;
          fs.writeFileSync(filePath, contentWithFrontmatter, "utf8");

          pageSpinner.succeed(
            chalk.green(
              `Page ${index + 1}/${totalPages} processed: ${filePath}`
            )
          );
        } else {
          // No content, create minimal file
          const fileName = `${filename}.md`;
          const filePath = path.join(PATH, fileName);

          const minimalContent = `---
id: doc-${filename}
title: ${pageTitle}
sidebar_label: ${pageTitle}
sidebar_position: ${page.order || index + 1}
tags: [comapeo, placeholder]
---

# ${pageTitle}

*This page is currently empty. Content will be added soon.*
`;

          fs.writeFileSync(filePath, minimalContent, "utf8");
          pageSpinner.succeed(chalk.yellow(`Empty page created: ${filePath}`));
        }
      } catch (error) {
        pageSpinner.fail(
          chalk.red(`Failed to process page content: ${error.message}`)
        );
        console.error(chalk.red(`Error details for page ${page.id}:`), error);
      }
    } else {
      pageSpinner.succeed(
        chalk.gray(`Skipped element type: ${page.elementType}`)
      );
    }
  } catch (error) {
    pageSpinner.fail(chalk.red(`Failed to process page: ${error.message}`));
    console.error(chalk.red(`Error details for page ${page.id}:`), error);
  }

  return totalSaved;
}

/**
 * Main export function for all pages
 */
export async function generateBlocksForAll(
  pages: PageWithStatus[],
  progressCallback?: (progress: { current: number; total: number }) => void
): Promise<{
  totalSaved: number;
  sectionCount: number;
  titleSectionCount: number;
}> {
  console.log(chalk.cyan(`🚀 Starting export of ${pages.length} pages...`));

  let totalSaved = 0;
  let sectionCount = 0;
  let titleSectionCount = 0;
  let processedPages = 0;

  // Group pages by language
  const pagesByLanguage = new Map<string, PageWithStatus[]>();

  for (const page of pages) {
    // Skip pages marked for removal or obvious placeholders
    if (page.status === "Remove" || shouldSkipPage(page)) {
      console.log(chalk.gray(`Skipping page: ${page.title}`));
      continue;
    }

    const language = detectPageLanguage(page, pages);
    if (!pagesByLanguage.has(language)) {
      pagesByLanguage.set(language, []);
    }
    pagesByLanguage.get(language)!.push(page);
  }

  console.log(chalk.cyan(`📊 Language distribution:`));
  for (const [lang, langPages] of pagesByLanguage) {
    console.log(chalk.cyan(`  ${lang}: ${langPages.length} pages`));
  }

  // Track section folders per language
  const sectionFolders = new Map<string, string>();

  // Process each language group
  for (const [language, languagePages] of pagesByLanguage) {
    console.log(
      chalk.cyan(
        `\n🌐 Processing ${language} pages (${languagePages.length} pages)...`
      )
    );

    // Sort pages by order
    languagePages.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Process each page in the language
    for (let i = 0; i < languagePages.length; i++) {
      const page = languagePages[i];
      processedPages++;

      if (progressCallback) {
        progressCallback({ current: processedPages, total: pages.length });
      }

      const savedBytes = await exportPageToMarkdown(
        page,
        language,
        i,
        languagePages.length,
        sectionFolders
      );

      totalSaved += savedBytes;

      // Count sections and titles
      if (page.elementType === "Toggle") {
        sectionCount++;
      } else if (
        page.elementType === "Title" ||
        page.elementType === "Heading"
      ) {
        titleSectionCount++;
      }
    }
  }

  // 🚨 FINAL COMPREHENSIVE IMAGE PROCESSING REPORT
  console.log(chalk.blue.bold(`\n🚨 ================================`));
  console.log(chalk.blue.bold(`🚨 FINAL IMAGE PROCESSING REPORT`));
  console.log(chalk.blue.bold(`🚨 ================================`));

  if (failedImages.length > 0) {
    console.log(
      chalk.red.bold(
        `\n💥 CRITICAL: ${failedImages.length} images failed to process!`
      )
    );
    console.log(chalk.red(`📋 Failed images summary:`));

    // Group failures by reason
    const failuresByReason = failedImages.reduce(
      (acc, failure) => {
        if (!acc[failure.reason]) acc[failure.reason] = [];
        acc[failure.reason].push(failure);
        return acc;
      },
      {} as Record<string, typeof failedImages>
    );

    for (const [reason, failures] of Object.entries(failuresByReason)) {
      console.log(chalk.red.bold(`\n🚨 ${reason}: ${failures.length} images`));
      failures.forEach((failure, index) => {
        console.log(chalk.red(`   ${index + 1}. Page: "${failure.pageTitle}"`));
        console.log(chalk.red(`      ID: ${failure.pageId}`));
        console.log(chalk.red(`      URL: ${failure.imageUrl}`));
      });
    }

    console.log(chalk.yellow.bold(`\n⚠️  ACTION REQUIRED:`));
    console.log(chalk.yellow(`   - Check Notion for broken image links`));
    console.log(chalk.yellow(`   - Verify image URLs are accessible`));
    console.log(chalk.yellow(`   - Replace base64 images with proper URLs`));
    console.log(
      chalk.yellow(
        `   - All failed images have been removed to ensure valid MDX`
      )
    );
  } else {
    console.log(
      chalk.green.bold(`\n🎉 PERFECT: All images processed successfully!`)
    );
    console.log(chalk.green(`✨ No image processing failures detected`));
  }

  console.log(chalk.blue.bold(`\n📊 IMAGE PROCESSING STATISTICS:`));
  console.log(chalk.blue(`   Total failed images: ${failedImages.length}`));
  console.log(
    chalk.blue(
      `   Success rate: ${failedImages.length === 0 ? "100%" : "See details above"}`
    )
  );
  console.log(
    chalk.blue(
      `   MDX safety: ${failedImages.length > 0 ? "Protected (failed images removed)" : "Perfect"}`
    )
  );

  console.log(chalk.green(`\n✅ Export completed!`));
  console.log(chalk.green(`📊 Processing Summary:`));
  console.log(chalk.green(`  Total pages processed: ${processedPages}`));
  console.log(chalk.green(`  Languages: ${pagesByLanguage.size}`));
  console.log(chalk.green(`  Sections created: ${sectionCount}`));
  console.log(chalk.green(`  Title sections: ${titleSectionCount}`));
  console.log(
    chalk.green(
      `  Image compression saved: ${(totalSaved / 1024).toFixed(2)} KB`
    )
  );

  return { totalSaved, sectionCount, titleSectionCount };
}
