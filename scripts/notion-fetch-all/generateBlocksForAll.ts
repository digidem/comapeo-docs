import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { n2m } from "../notionClient.js";
import { NOTION_PROPERTIES } from "../constants.js";
import axios from "axios";
import chalk from "chalk";
import { processImage } from "../notion-fetch/imageProcessor.js";
import {
  sanitizeMarkdownContent,
  compressImageToFileWithFallback,
  detectFormatFromBuffer,
  formatFromContentType,
  chooseFormat,
  extForFormat,
  isResizableFormat,
} from "../notion-fetch/utils.js";
import config from "../../docusaurus.config.js";
import SpinnerManager from "../notion-fetch/spinnerManager.js";
import { PageWithStatus } from "./fetchAll.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
              console.warn(
                chalk.yellow(
                  `⚠️  Found empty image URL in page ${page.id}, removing it`
                )
              );
              markdownString.parent = markdownString.parent.replace(fullMatch, "");
              continue;
            }
            
            if (!imgUrl.startsWith("http") && !imgUrl.startsWith("data:image")) {
              continue;
            }
            
            // For base64 images, we need to handle them differently
            if (imgUrl.startsWith("data:image")) {
              console.warn(
                chalk.yellow(
                  `⚠️  Found base64 image in page ${page.id}, removing it (base64 images not supported in markdown)`
                )
              );
              // Remove the base64 image entirely from the markdown
              markdownString.parent = markdownString.parent.replace(fullMatch, "");
              continue;
            }

            imgPromises.push(
              downloadAndProcessImage(imgUrl, filename, imgIndex)
                .then(({ newPath, savedBytes }) => {
                  const newImageMarkdown = fullMatch.replace(imgUrl, newPath);
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
                  
                  // Remove the failed image from markdown to prevent empty image tags
                  console.warn(
                    chalk.yellow(
                      `⚠️  Removing failed image from page ${page.id} to prevent MDX compilation errors`
                    )
                  );
                  markdownString.parent = markdownString.parent.replace(fullMatch, "");
                  
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

          if (successfulImages < imgPromises.length) {
            console.warn(
              chalk.yellow(
                `⚠️  ${imgPromises.length - successfulImages} images failed to process for page ${page.id}`
              )
            );
          }

          // Sanitize content
          markdownString.parent = sanitizeMarkdownContent(
            markdownString.parent
          );

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

  console.log(chalk.green(`\n✅ Export completed!`));
  console.log(chalk.green(`📊 Summary:`));
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
