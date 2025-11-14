import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import ora from "ora";

import { enhancedNotion, DATABASE_ID, DATA_SOURCE_ID } from "../notionClient";
import { fetchNotionBlocks } from "../fetchNotionData";
import { NOTION_PROPERTIES } from "../constants";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LINE_BREAK_REGEX = /(?:\r\n|[\r\n\u2028\u2029])/g;
const HTML_LINE_BREAK = "<br />\n";

// CLI Options Interface
interface ExportOptions {
  verbose: boolean;
  quick: boolean;
  outputPrefix?: string;
  maxPages?: number;
  statusFilter?: string;
  includeRawData: boolean;
}

// Parse command line arguments
function parseCliArgs(): ExportOptions {
  const args = process.argv.slice(2);
  const options: ExportOptions = {
    verbose: false,
    quick: false,
    includeRawData: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--quick":
      case "-q":
        options.quick = true;
        break;
      case "--output-prefix":
      case "-o":
        options.outputPrefix = args[++i];
        break;
      case "--max-pages":
        options.maxPages = parseInt(args[++i]);
        break;
      case "--status-filter":
        options.statusFilter = args[++i];
        break;
      case "--no-raw-data":
        options.includeRawData = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

// Print help message
function printHelp(): void {
  console.log(chalk.bold("CoMapeo Notion Complete Export & Analysis\\n"));
  console.log(
    "Exports complete Notion database with comprehensive block-level content analysis.\\n"
  );
  console.log(chalk.bold("Usage:"));
  console.log("  npm run notion:export [options]\\n");
  console.log(chalk.bold("Options:"));
  console.log("  --verbose, -v           Show detailed progress information");
  console.log(
    "  --quick, -q             Skip detailed content analysis (faster)"
  );
  console.log("  --output-prefix, -o     Custom prefix for output files");
  console.log(
    "  --max-pages <number>    Limit number of pages to process (for testing)"
  );
  console.log(
    "  --status-filter <name>  Only export pages with specific status"
  );
  console.log(
    "  --no-raw-data          Exclude raw page data from export (smaller files)"
  );
  console.log("  --help, -h             Show this help message\\n");
  console.log(chalk.bold("Examples:"));
  console.log("  npm run notion:export --verbose");
  console.log("  npm run notion:export --quick --max-pages 50");
  console.log('  npm run notion:export --status-filter "Ready to publish"');
  console.log('  npm run notion:export --output-prefix "test" --no-raw-data');
}

// Dynamic file paths based on CLI options
function getOutputPaths(options: ExportOptions) {
  const prefix = options.outputPrefix || "notion";
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, "");

  return {
    complete: path.resolve(
      process.cwd(),
      `${prefix}_db_complete_${timestamp}.json`
    ),
    analysis: path.resolve(
      process.cwd(),
      `${prefix}_content_analysis_${timestamp}.json`
    ),
  };
}

interface NotionQueryResponse {
  results: Array<Record<string, unknown>>;
  has_more?: boolean;
  next_cursor?: string | null;
}

interface BlockAnalysis {
  type: string;
  hasContent: boolean;
  contentLength: number;
  textContent: string;
  hasChildren: boolean;
  childrenCount: number;
  properties: Record<string, any>;
  metadata: {
    id: string;
    createdTime?: string;
    lastEditedTime?: string;
    hasChildren: boolean;
    archived: boolean;
  };
}

interface PageAnalysis {
  id: string;
  title: string;
  status: string;
  elementType: string;
  language?: string;
  url: string;
  lastEdited: string;
  totalBlocks: number;
  blockTypes: Map<string, number>;
  totalTextLength: number;
  hasContent: boolean;
  contentScore: number;
  isEmpty: boolean;
  structure: {
    headings: Array<{ level: number; text: string }>;
    paragraphs: number;
    lists: number;
    images: number;
    links: number;
    codeBlocks: number;
    tables: number;
    embeds: number;
    depth: number;
  };
  blocks: BlockAnalysis[];
}

interface ExportResult {
  metadata: {
    generatedAt: string;
    version: string;
    totalPages: number;
    totalBlocks: number;
    averageContentScore: number;
    exportOptions: Record<string, any>;
  };
  statistics: {
    statusBreakdown: Map<string, number>;
    elementTypeBreakdown: Map<string, number>;
    languageBreakdown: Map<string, number>;
    blockTypeBreakdown: Map<string, number>;
    contentStats: {
      emptyPages: number;
      contentfulPages: number;
      averageBlocksPerPage: number;
      totalTextLength: number;
      averageTextLengthPerPage: number;
    };
  };
  pages: PageAnalysis[];
  rawData: {
    pages: Array<{
      page: Record<string, unknown>;
      blocks: Array<Record<string, unknown>>;
    }>;
  };
}

function isReadyToPublish(page: Record<string, any>): boolean {
  const status =
    page?.properties?.[NOTION_PROPERTIES.STATUS]?.select?.name ?? null;
  return status === NOTION_PROPERTIES.READY_TO_PUBLISH;
}

/**
 * Extract text content from a Notion block
 */
function extractTextFromBlock(block: Record<string, any>): string {
  const blockType = block.type;
  if (!blockType || !block[blockType]) return "";

  const blockContent = block[blockType];

  // Handle rich text arrays (most common case)
  // Preserve manual line breaks (including Windows \r\n) by converting them to HTML <br /> tags
  if (blockContent.rich_text && Array.isArray(blockContent.rich_text)) {
    return blockContent.rich_text
      .map((textObj: any) => textObj.plain_text || textObj.text?.content || "")
      .join("")
      .replace(LINE_BREAK_REGEX, HTML_LINE_BREAK);
  }

  // Handle title blocks
  // Preserve manual line breaks (including Windows \r\n) by converting them to HTML <br /> tags
  if (blockContent.title && Array.isArray(blockContent.title)) {
    return blockContent.title
      .map((textObj: any) => textObj.plain_text || textObj.text?.content || "")
      .join("")
      .replace(LINE_BREAK_REGEX, HTML_LINE_BREAK);
  }

  // Handle text property directly
  if (blockContent.text) {
    return blockContent.text;
  }

  // Handle URL or other string properties
  if (typeof blockContent === "string") {
    return blockContent;
  }

  // Handle specific block types
  // Preserve manual line breaks in captions and code blocks
  switch (blockType) {
    case "image":
      return (
        blockContent.caption
          ?.map((c: any) => c.plain_text || "")
          .join("")
          .replace(LINE_BREAK_REGEX, HTML_LINE_BREAK) || "[Image]"
      );
    case "video":
      return (
        blockContent.caption
          ?.map((c: any) => c.plain_text || "")
          .join("")
          .replace(LINE_BREAK_REGEX, HTML_LINE_BREAK) || "[Video]"
      );
    case "file":
      return (
        blockContent.caption
          ?.map((c: any) => c.plain_text || "")
          .join("")
          .replace(LINE_BREAK_REGEX, HTML_LINE_BREAK) || "[File]"
      );
    case "bookmark":
      return blockContent.url || "[Bookmark]";
    case "equation":
      return blockContent.expression || "[Equation]";
    case "code":
      return (
        blockContent.rich_text
          ?.map((t: any) => t.plain_text || "")
          .join("")
          .replace(LINE_BREAK_REGEX, HTML_LINE_BREAK) || "[Code]"
      );
    case "divider":
      return "[Divider]";
    case "table_of_contents":
      return "[Table of Contents]";
    default:
      return "";
  }
}

/**
 * Analyze a single block and its children
 */
function analyzeBlock(block: Record<string, any>): BlockAnalysis {
  const blockType = block.type || "unknown";
  const textContent = extractTextFromBlock(block);
  const hasContent = textContent.length > 0 && textContent.trim() !== "";
  const hasChildren =
    block.has_children || (block.children && block.children.length > 0);
  const childrenCount = hasChildren ? block.children?.length || 0 : 0;

  return {
    type: blockType,
    hasContent,
    contentLength: textContent.length,
    textContent: textContent,
    hasChildren,
    childrenCount,
    properties: block[blockType] || {},
    metadata: {
      id: block.id,
      createdTime: block.created_time,
      lastEditedTime: block.last_edited_time,
      hasChildren,
      archived: block.archived || false,
    },
  };
}

/**
 * Calculate content score based on various factors
 */
function calculateContentScore(blocks: BlockAnalysis[]): number {
  if (blocks.length === 0) return 0;

  let score = 0;
  let totalTextLength = 0;

  blocks.forEach((block) => {
    // Basic content existence
    if (block.hasContent) {
      score += 10;
    }

    // Content length bonus
    if (block.contentLength > 50) {
      score += 15;
    } else if (block.contentLength > 20) {
      score += 10;
    } else if (block.contentLength > 5) {
      score += 5;
    }

    // Block type bonuses
    switch (block.type) {
      case "heading_1":
      case "heading_2":
      case "heading_3":
        score += 20; // Structure is important
        break;
      case "paragraph":
        if (block.contentLength > 100) score += 15;
        else if (block.contentLength > 50) score += 10;
        else if (block.contentLength > 20) score += 5;
        break;
      case "bulleted_list_item":
      case "numbered_list_item":
        score += 8;
        break;
      case "image":
      case "video":
      case "file":
        score += 12; // Media content
        break;
      case "code":
      case "equation":
        score += 15; // Technical content
        break;
      case "table":
        score += 20; // Structured data
        break;
      case "callout":
      case "quote":
        score += 10; // Highlighted content
        break;
    }

    totalTextLength += block.contentLength;
  });

  // Overall length bonus
  if (totalTextLength > 1000) score += 25;
  else if (totalTextLength > 500) score += 15;
  else if (totalTextLength > 200) score += 10;

  // Diversity bonus (different block types)
  const uniqueTypes = new Set(blocks.map((b) => b.type)).size;
  if (uniqueTypes > 3) score += 20;
  else if (uniqueTypes > 2) score += 10;
  else if (uniqueTypes > 1) score += 5;

  return Math.min(score, 100); // Cap at 100
}

/**
 * Analyze page structure
 */
function analyzePageStructure(
  blocks: BlockAnalysis[]
): PageAnalysis["structure"] {
  const structure = {
    headings: [] as Array<{ level: number; text: string }>,
    paragraphs: 0,
    lists: 0,
    images: 0,
    links: 0,
    codeBlocks: 0,
    tables: 0,
    embeds: 0,
    depth: 0,
  };

  let maxDepth = 0;

  function analyzeBlockStructure(block: BlockAnalysis, depth: number = 0) {
    maxDepth = Math.max(maxDepth, depth);

    switch (block.type) {
      case "heading_1":
        structure.headings.push({ level: 1, text: block.textContent });
        break;
      case "heading_2":
        structure.headings.push({ level: 2, text: block.textContent });
        break;
      case "heading_3":
        structure.headings.push({ level: 3, text: block.textContent });
        break;
      case "paragraph":
        structure.paragraphs++;
        // Count links in paragraphs
        if (block.textContent.includes("http")) {
          structure.links++;
        }
        break;
      case "bulleted_list_item":
      case "numbered_list_item":
        structure.lists++;
        break;
      case "image":
        structure.images++;
        break;
      case "code":
        structure.codeBlocks++;
        break;
      case "table":
        structure.tables++;
        break;
      case "bookmark":
      case "embed":
      case "video":
      case "file":
        structure.embeds++;
        break;
    }
  }

  blocks.forEach((block) => analyzeBlockStructure(block, 0));
  structure.depth = maxDepth;

  return structure;
}

/**
 * Analyze a complete page with all its blocks
 */
function analyzePage(
  page: Record<string, any>,
  blocks: Record<string, any>[]
): PageAnalysis {
  // Extract page metadata
  const properties = page.properties || {};

  // Extract title
  let title = "Untitled";
  const titleProperty =
    properties[NOTION_PROPERTIES.TITLE] || properties["Title"];
  if (titleProperty?.title?.[0]?.plain_text) {
    title = titleProperty.title[0].plain_text;
  }

  // Extract status
  let status = "No Status";
  const statusProperty =
    properties[NOTION_PROPERTIES.STATUS] || properties["Status"];
  if (statusProperty?.select?.name) {
    status = statusProperty.select.name;
  } else if (statusProperty?.select === null) {
    status = "No Status";
  }

  // Extract element type
  let elementType = "Unknown";
  const elementTypeProperty =
    properties[NOTION_PROPERTIES.ELEMENT_TYPE] ||
    properties["Section"] ||
    properties["Element Type"];
  if (elementTypeProperty?.select?.name) {
    elementType = elementTypeProperty.select.name;
  } else if (elementTypeProperty?.select === null) {
    elementType = "Unknown";
  }

  // Extract language
  let language: string | undefined;
  const languageProperty = properties["Language"];
  if (languageProperty?.select?.name) {
    language = languageProperty.select.name;
  }

  // Analyze all blocks recursively
  const blockAnalyses: BlockAnalysis[] = [];
  const blockTypes = new Map<string, number>();

  function analyzeBlocksRecursively(blockList: Record<string, any>[]) {
    for (const block of blockList) {
      const analysis = analyzeBlock(block);
      blockAnalyses.push(analysis);

      // Count block types
      const count = blockTypes.get(analysis.type) || 0;
      blockTypes.set(analysis.type, count + 1);

      // Recursively analyze children
      if (block.children && Array.isArray(block.children)) {
        analyzeBlocksRecursively(block.children);
      }
    }
  }

  analyzeBlocksRecursively(blocks);

  // Calculate metrics
  const totalTextLength = blockAnalyses.reduce(
    (sum, block) => sum + block.contentLength,
    0
  );
  const contentScore = calculateContentScore(blockAnalyses);
  const hasContent =
    blockAnalyses.some((block) => block.hasContent) || totalTextLength > 20;
  const isEmpty = !hasContent || blockAnalyses.length === 0;
  const structure = analyzePageStructure(blockAnalyses);

  return {
    id: page.id,
    title,
    status,
    elementType,
    language,
    url: page.url || `https://notion.so/${page.id.replace(/-/g, "")}`,
    lastEdited: page.last_edited_time,
    totalBlocks: blockAnalyses.length,
    blockTypes,
    totalTextLength,
    hasContent,
    contentScore,
    isEmpty,
    structure,
    blocks: blockAnalyses,
  };
}

async function fetchAllPages(): Promise<Array<Record<string, unknown>>> {
  const allResults: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;

  // Use DATA_SOURCE_ID with fallback to DATABASE_ID for v5 API compatibility
  const dataSourceId = DATA_SOURCE_ID || DATABASE_ID;

  do {
    const response = (await enhancedNotion.dataSourcesQuery({
      data_source_id: dataSourceId,
      ...(cursor ? { start_cursor: cursor } : {}),
    })) as NotionQueryResponse;

    allResults.push(...(response.results ?? []));
    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);

  return allResults;
}

export async function exportNotionDatabase(
  cliOptions?: ExportOptions
): Promise<void> {
  const options = cliOptions || parseCliArgs();
  const outputPaths = getOutputPaths(options);

  console.log(
    chalk.bold.cyan("🚀 CoMapeo Notion Complete Export & Analysis\n")
  );

  if (options.verbose) {
    console.log(chalk.gray(`Options: ${JSON.stringify(options, null, 2)}`));
    console.log(
      chalk.gray(`Output files: ${JSON.stringify(outputPaths, null, 2)}\n`)
    );
  }

  const startTime = Date.now();
  let spinner = ora("Fetching all pages from Notion database...").start();

  try {
    // Step 1: Fetch all pages
    let allPages = await fetchAllPages();
    const readyToPublish = allPages.filter(isReadyToPublish);

    // Apply status filter if specified
    if (options.statusFilter) {
      allPages = allPages.filter((page) => {
        const status =
          page?.properties?.[NOTION_PROPERTIES.STATUS]?.select?.name ?? null;
        return status === options.statusFilter;
      });
      if (options.verbose) {
        console.log(
          chalk.blue(
            `Filtered to ${allPages.length} pages with status "${options.statusFilter}"`
          )
        );
      }
    }

    // Apply page limit if specified
    if (options.maxPages && allPages.length > options.maxPages) {
      allPages = allPages.slice(0, options.maxPages);
      if (options.verbose) {
        console.log(chalk.blue(`Limited to first ${options.maxPages} pages`));
      }
    }

    spinner.succeed(
      chalk.green(`✅ Fetched ${allPages.length} pages from Notion`)
    );

    // Step 2: Fetch blocks for all pages with progress tracking
    spinner = ora("Fetching blocks and analyzing content...").start();

    const pagesWithBlocks: Array<{
      page: Record<string, unknown>;
      blocks: Array<Record<string, unknown>>;
    }> = [];

    let processedCount = 0;
    for (const page of allPages) {
      const pageId = page.id as string | undefined;
      if (!pageId) {
        pagesWithBlocks.push({ page, blocks: [] });
        continue;
      }

      try {
        const blocks = await fetchNotionBlocks(pageId);
        pagesWithBlocks.push({ page, blocks });

        processedCount++;
        if (options.verbose && processedCount % 5 === 0) {
          spinner.text = chalk.blue(
            `Fetching blocks: ${processedCount}/${allPages.length} pages processed`
          );
        } else if (!options.verbose && processedCount % 20 === 0) {
          spinner.text = chalk.blue(
            `Fetching blocks: ${processedCount}/${allPages.length} pages processed`
          );
        }
      } catch (error) {
        console.warn(
          chalk.yellow(
            `⚠️  Failed to fetch blocks for page ${pageId}: ${
              (error as Error)?.message ?? error
            }`
          )
        );
        pagesWithBlocks.push({ page, blocks: [] });
      }
    }

    spinner.succeed(
      chalk.green(`✅ Fetched blocks for ${allPages.length} pages`)
    );

    // Step 3: Perform comprehensive analysis
    const analysisMessage = options.quick
      ? "Performing basic content analysis..."
      : "Performing comprehensive content analysis...";
    spinner = ora(analysisMessage).start();

    const pageAnalyses: PageAnalysis[] = [];
    const statusBreakdown = new Map<string, number>();
    const elementTypeBreakdown = new Map<string, number>();
    const languageBreakdown = new Map<string, number>();
    const blockTypeBreakdown = new Map<string, number>();

    let totalBlocks = 0;
    let totalTextLength = 0;
    let emptyPages = 0;
    let contentfulPages = 0;
    let totalContentScore = 0;

    for (const { page, blocks } of pagesWithBlocks) {
      const analysis = analyzePage(page, blocks);
      pageAnalyses.push(analysis);

      // Update statistics
      const statusCount = statusBreakdown.get(analysis.status) || 0;
      statusBreakdown.set(analysis.status, statusCount + 1);

      const elementCount = elementTypeBreakdown.get(analysis.elementType) || 0;
      elementTypeBreakdown.set(analysis.elementType, elementCount + 1);

      if (analysis.language) {
        const langCount = languageBreakdown.get(analysis.language) || 0;
        languageBreakdown.set(analysis.language, langCount + 1);
      }

      // Block type statistics
      for (const [blockType, count] of analysis.blockTypes.entries()) {
        const currentCount = blockTypeBreakdown.get(blockType) || 0;
        blockTypeBreakdown.set(blockType, currentCount + count);
      }

      totalBlocks += analysis.totalBlocks;
      totalTextLength += analysis.totalTextLength;
      totalContentScore += analysis.contentScore;

      if (analysis.isEmpty) {
        emptyPages++;
      } else {
        contentfulPages++;
      }
    }

    const averageContentScore =
      pageAnalyses.length > 0 ? totalContentScore / pageAnalyses.length : 0;
    const averageBlocksPerPage =
      pageAnalyses.length > 0 ? totalBlocks / pageAnalyses.length : 0;
    const averageTextLengthPerPage =
      pageAnalyses.length > 0 ? totalTextLength / pageAnalyses.length : 0;

    spinner.succeed(chalk.green("✅ Content analysis complete"));

    // Step 4: Generate comprehensive export result
    spinner = ora("Generating export files...").start();

    const exportResult: ExportResult = {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: "2.0.0-comprehensive",
        totalPages: allPages.length,
        totalBlocks,
        averageContentScore: Math.round(averageContentScore * 10) / 10,
        exportOptions: {
          includeBlockAnalysis: true,
          includeContentScoring: true,
          includeStructureAnalysis: true,
          recursiveBlockFetch: true,
        },
      },
      statistics: {
        statusBreakdown,
        elementTypeBreakdown,
        languageBreakdown,
        blockTypeBreakdown,
        contentStats: {
          emptyPages,
          contentfulPages,
          averageBlocksPerPage: Math.round(averageBlocksPerPage * 10) / 10,
          totalTextLength,
          averageTextLengthPerPage: Math.round(averageTextLengthPerPage),
        },
      },
      pages: pageAnalyses,
      rawData: {
        pages: pagesWithBlocks,
      },
    };

    // Convert Maps to Objects for JSON serialization
    const serializedResult = {
      ...exportResult,
      statistics: {
        ...exportResult.statistics,
        statusBreakdown: Object.fromEntries(
          exportResult.statistics.statusBreakdown
        ),
        elementTypeBreakdown: Object.fromEntries(
          exportResult.statistics.elementTypeBreakdown
        ),
        languageBreakdown: Object.fromEntries(
          exportResult.statistics.languageBreakdown
        ),
        blockTypeBreakdown: Object.fromEntries(
          exportResult.statistics.blockTypeBreakdown
        ),
      },
      pages: exportResult.pages.map((page) => ({
        ...page,
        blockTypes: Object.fromEntries(page.blockTypes),
      })),
    };

    // Conditionally include raw data
    if (!options.includeRawData) {
      delete serializedResult.rawData;
    }

    // Save comprehensive export
    await writeFile(
      outputPaths.complete,
      JSON.stringify(serializedResult, null, 2),
      "utf8"
    );

    // Save analysis summary
    const analysisSummary = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalPages: allPages.length,
        emptyPages,
        contentfulPages,
        averageContentScore: Math.round(averageContentScore * 10) / 10,
        readyToPublish: readyToPublish.length,
        needsContent: pageAnalyses.filter((p) => p.contentScore < 20).length,
        excellentContent: pageAnalyses.filter((p) => p.contentScore >= 80)
          .length,
      },
      topContentPages: pageAnalyses
        .sort((a, b) => b.contentScore - a.contentScore)
        .slice(0, 10)
        .map((p) => ({
          title: p.title,
          contentScore: p.contentScore,
          status: p.status,
          totalBlocks: p.totalBlocks,
          totalTextLength: p.totalTextLength,
        })),
      emptyPagesList: pageAnalyses
        .filter((p) => p.isEmpty)
        .map((p) => ({
          title: p.title,
          status: p.status,
          elementType: p.elementType,
          url: p.url,
        })),
      statusBreakdown: Object.fromEntries(statusBreakdown),
      blockTypeBreakdown: Object.fromEntries(blockTypeBreakdown),
    };

    await writeFile(
      outputPaths.analysis,
      JSON.stringify(analysisSummary, null, 2),
      "utf8"
    );

    spinner.succeed(chalk.green("✅ Export files generated"));

    // Step 5: Display comprehensive summary
    const executionTime = Math.round((Date.now() - startTime) / 1000);

    console.log(chalk.bold.green("\n✨ Comprehensive Export Complete!"));
    console.log(chalk.gray(`Execution time: ${executionTime}s`));
    console.log(
      chalk.gray(
        `Main export: ${path.relative(process.cwd(), outputPaths.complete)}`
      )
    );
    console.log(
      chalk.gray(
        `Analysis summary: ${path.relative(process.cwd(), outputPaths.analysis)}`
      )
    );

    console.log(chalk.bold("\n📊 Content Analysis Summary:"));
    console.log(`  Total Pages: ${chalk.cyan(allPages.length)}`);
    console.log(
      `  Empty Pages: ${chalk.red(emptyPages)} (${Math.round((emptyPages / allPages.length) * 100)}%)`
    );
    console.log(
      `  Contentful Pages: ${chalk.green(contentfulPages)} (${Math.round((contentfulPages / allPages.length) * 100)}%)`
    );
    console.log(
      `  Average Content Score: ${chalk.yellow(Math.round(averageContentScore * 10) / 10)}/100`
    );
    console.log(
      `  Ready to Publish: ${chalk.green(readyToPublish.length)} pages`
    );
    console.log(`  Total Blocks: ${chalk.cyan(totalBlocks.toLocaleString())}`);
    console.log(
      `  Total Text Length: ${chalk.cyan(totalTextLength.toLocaleString())} characters`
    );

    console.log(chalk.bold("\n📈 Status Breakdown:"));
    Array.from(statusBreakdown.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([status, count]) => {
        const percentage = Math.round((count / allPages.length) * 100);
        console.log(`  ${status}: ${chalk.cyan(count)} pages (${percentage}%)`);
      });

    console.log(chalk.bold("\n🧱 Top Block Types:"));
    Array.from(blockTypeBreakdown.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .forEach(([blockType, count]) => {
        console.log(
          `  ${blockType}: ${chalk.cyan(count.toLocaleString())} blocks`
        );
      });

    if (emptyPages > 0) {
      console.log(
        chalk.bold.yellow(
          `\n💡 Found ${emptyPages} empty pages that could benefit from placeholder content`
        )
      );
      console.log(chalk.gray("  Run: npm run notion:gen-placeholders"));
    }

    console.log(chalk.bold.blue("\n🔍 Use the generated files for:"));
    console.log("  • Content gap analysis");
    console.log("  • Documentation completeness assessment");
    console.log("  • Block-level content examination");
    console.log("  • Structure and hierarchy analysis");
    console.log("  • Translation planning and progress tracking");
  } catch (error) {
    spinner.fail(chalk.red("❌ Export failed"));
    console.error(chalk.red("Error:"), error);

    if (error instanceof Error) {
      console.error(chalk.gray("Stack trace:"), error.stack);
    }

    throw error;
  }
}

if (import.meta.main) {
  exportNotionDatabase().catch((error) => {
    console.error(chalk.red("❌ Failed to export Notion database:"), error);
    process.exit(1);
  });
}
