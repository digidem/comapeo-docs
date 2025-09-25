import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { fetchAllNotionData, FetchAllOptions } from "./fetchAll";
import { PreviewGenerator, PreviewOptions } from "./previewGenerator";
import { StatusAnalyzer } from "./statusAnalyzer";
import { ComparisonEngine } from "./comparisonEngine";
import { generateBlocksForAll } from "./generateBlocksForAll";

// Load environment variables
dotenv.config();

const resolvedDatabaseId =
  process.env.DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

if (resolvedDatabaseId) {
  process.env.DATABASE_ID = resolvedDatabaseId;
}

// Command line argument parsing
interface CliOptions {
  verbose: boolean;
  outputFormat: "markdown" | "json" | "html";
  outputFile?: string;
  includeRemoved: boolean;
  sortBy: "order" | "created" | "modified" | "title";
  sortDirection: "asc" | "desc";
  analysis: boolean;
  comparison: boolean;
  previewOnly: boolean;
  exportFiles: boolean;
  statusFilter?: string;
  maxPages?: number;
}

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    verbose: false,
    outputFormat: "markdown",
    includeRemoved: false,
    sortBy: "order",
    sortDirection: "asc",
    analysis: true,
    comparison: false,
    previewOnly: false,
    exportFiles: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--output-format":
      case "-f":
        const format = args[++i];
        if (["markdown", "json", "html"].includes(format)) {
          options.outputFormat = format as "markdown" | "json" | "html";
        }
        break;
      case "--output":
      case "-o":
        options.outputFile = args[++i];
        break;
      case "--include-removed":
        options.includeRemoved = true;
        break;
      case "--sort-by":
        const sortBy = args[++i];
        if (["order", "created", "modified", "title"].includes(sortBy)) {
          options.sortBy = sortBy as "order" | "created" | "modified" | "title";
        }
        break;
      case "--sort-desc":
        options.sortDirection = "desc";
        break;
      case "--no-analysis":
        options.analysis = false;
        break;
      case "--comparison":
      case "-c":
        options.comparison = true;
        break;
      case "--preview-only":
        options.previewOnly = true;
        options.exportFiles = false;
        options.analysis = false;
        options.comparison = false;
        break;
      case "--status-filter":
        options.statusFilter = args[++i];
        break;
      case "--max-pages":
        options.maxPages = parseInt(args[++i]);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
};

const printHelp = () => {
  console.log(
    chalk.bold("CoMapeo Notion Fetch All - Export All Pages to Markdown\\n")
  );
  console.log(
    "Fetches ALL pages from Notion (regardless of status) and exports to markdown files. Use --preview-only for analysis reports.\\n"
  );
  console.log(chalk.bold("Usage:"));
  console.log("  npm run notion:fetch-all [options]\\n");
  console.log(chalk.bold("Options:"));
  console.log("  --verbose, -v              Show detailed output");
  console.log(
    "  --output-format, -f        Output format: markdown, json, html (default: markdown)"
  );
  console.log("  --output, -o <file>        Output file path");
  console.log(
    '  --include-removed          Include pages with "Remove" status'
  );
  console.log(
    "  --sort-by <field>          Sort by: order, created, modified, title (default: order)"
  );
  console.log("  --sort-desc                Sort in descending order");
  console.log("  --no-analysis              Skip status analysis");
  console.log(
    "  --comparison, -c           Compare with published documentation"
  );
  console.log(
    "  --preview-only             Generate preview only, no file export"
  );
  console.log("  --status-filter <status>   Filter by specific status");
  console.log("  --max-pages <number>       Limit number of pages to process");
  console.log("  --help, -h                 Show this help message\\n");
  console.log(chalk.bold("Examples:"));
  console.log("  npm run notion:fetch-all");
  console.log("  npm run notion:fetch-all --comparison --verbose");
  console.log("  npm run notion:fetch-all --preview-only --output preview.md");
  console.log("  npm run notion:fetch-all --verbose");
  console.log(
    '  npm run notion:fetch-all --status-filter "Draft" --max-pages 50'
  );
};

// Main execution function
async function main() {
  const options = parseArgs();

  console.log(
    chalk.bold.cyan(
      "🌍 CoMapeo Notion Fetch All - Export All Pages to Markdown\\n"
    )
  );

  // Validate environment
  if (!process.env.NOTION_API_KEY) {
    console.error(
      chalk.red("Error: NOTION_API_KEY not found in environment variables")
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_ID) {
    console.error(
      chalk.red("Error: DATABASE_ID not found in environment variables")
    );
    process.exit(1);
  }

  const startTime = Date.now();
  let spinner = ora("Fetching ALL pages from Notion...").start();

  try {
    // Step 1: Fetch all pages from Notion
    const fetchOptions: FetchAllOptions = {
      includeRemoved: options.includeRemoved,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
      includeSubPages: true,
    };

    const pages = await fetchAllNotionData(fetchOptions);
    spinner.succeed(
      chalk.green(`✅ Fetched ${pages.length} pages from Notion`)
    );

    // Apply filters if specified
    let filteredPages = pages;
    if (options.statusFilter) {
      filteredPages = pages.filter(
        (page) => page.status === options.statusFilter
      );
      console.log(
        chalk.blue(
          `🔍 Filtered to ${filteredPages.length} pages with status "${options.statusFilter}"`
        )
      );
    }

    if (options.maxPages && filteredPages.length > options.maxPages) {
      filteredPages = filteredPages.slice(0, options.maxPages);
      console.log(chalk.blue(`📏 Limited to first ${options.maxPages} pages`));
    }

    // Export files if requested
    if (options.exportFiles) {
      spinner = ora("Exporting pages to markdown files...").start();

      try {
        let progressCount = 0;
        const progressCallback = options.verbose
          ? (progress: { current: number; total: number }) => {
              if (
                progress.current % 10 === 0 ||
                progress.current === progress.total
              ) {
                console.log(
                  chalk.gray(
                    `  Progress: ${progress.current}/${progress.total} pages`
                  )
                );
              }
            }
          : undefined;

        const exportResults = await generateBlocksForAll(
          filteredPages,
          progressCallback
        );

        spinner.succeed(
          chalk.green(
            `✅ Exported ${filteredPages.length} pages to markdown files (image compression saved ${(exportResults.totalSaved / 1024).toFixed(2)} KB)`
          )
        );

        if (options.verbose) {
          console.log(
            chalk.blue(`📄 Total saved: ${exportResults.totalSaved}`)
          );
          console.log(chalk.blue(`📂 Sections: ${exportResults.sectionCount}`));
          console.log(
            chalk.blue(`📝 Title sections: ${exportResults.titleSectionCount}`)
          );
        }
      } catch (error) {
        spinner.fail(chalk.red("❌ Failed to export pages to markdown files"));
        console.error(chalk.red("Export Error:"), error);

        if (options.verbose) {
          console.error(chalk.gray("Stack trace:"), error.stack);
        }

        // Continue with preview generation even if export fails
      }
    }

    // Step 2: Generate documentation preview
    spinner = ora("Generating documentation preview...").start();

    const previewOptions: PreviewOptions = {
      includeEmptyPages: true,
      groupByStatus: false,
      includeMetadata: true,
      generateMarkdown: options.outputFormat === "markdown",
      showContentStats: true,
    };

    const preview = await PreviewGenerator.generatePreview(
      filteredPages,
      previewOptions
    );
    spinner.succeed(chalk.green("✅ Documentation preview generated"));

    // Step 3: Perform status analysis (if requested)
    let analysisResults;
    if (options.analysis) {
      spinner = ora("Analyzing publication status...").start();
      analysisResults = StatusAnalyzer.analyzePublicationStatus(filteredPages);

      const readinessReport =
        StatusAnalyzer.generateReadinessReport(filteredPages);
      const contentGaps = StatusAnalyzer.identifyContentGaps(filteredPages);

      spinner.succeed(chalk.green("✅ Status analysis complete"));

      // Display analysis summary
      console.log(chalk.bold("\\n📊 Publication Status Analysis:"));
      console.log(
        `  Ready to Publish: ${chalk.green(analysisResults.readiness.readyToPublish)} pages (${analysisResults.readiness.readinessPercentage}%)`
      );
      console.log(
        `  Needs Work: ${chalk.yellow(analysisResults.readiness.needsWork)} pages`
      );
      console.log(
        `  Main Blockers: ${chalk.red(analysisResults.readiness.blockers.length)} categories`
      );
      console.log(
        `  Content Gaps: ${chalk.yellow(contentGaps.missingPages.length)} missing pages`
      );

      if (options.verbose) {
        console.log("\\n📈 Status Breakdown:");
        for (const breakdown of analysisResults.breakdown) {
          console.log(
            `  ${breakdown.status}: ${breakdown.count} pages (${breakdown.percentage}%)`
          );
        }

        console.log("\\n🌐 Language Progress:");
        for (const lang of analysisResults.languages) {
          console.log(
            `  ${lang.language}: ${lang.completionPercentage}% complete (${lang.readyPages}/${lang.totalPages} pages)`
          );
        }
      }
    }

    // Step 4: Compare with published documentation (if requested)
    let comparisonResults;
    if (options.comparison) {
      spinner = ora("Comparing with published documentation...").start();
      comparisonResults = await ComparisonEngine.compareWithPublished(
        preview.sections,
        filteredPages
      );
      spinner.succeed(
        chalk.green("✅ Comparison with published version complete")
      );

      // Display comparison summary
      console.log(chalk.bold("\\n🔍 Comparison Results:"));
      console.log(
        `  New Pages: ${chalk.green(comparisonResults.differences.newPages.length)}`
      );
      console.log(
        `  Updated Pages: ${chalk.yellow(comparisonResults.differences.updatedPages.length)}`
      );
      console.log(
        `  Removed Pages: ${chalk.red(comparisonResults.differences.removedPages.length)}`
      );
      console.log(
        `  Content Volume Change: ${comparisonResults.impact.contentVolume.increase > 0 ? "+" : ""}${comparisonResults.impact.contentVolume.increase} pages (${comparisonResults.impact.contentVolume.percentageChange}%)`
      );
      console.log(
        `  Structural Changes: ${comparisonResults.impact.structuralChanges}`
      );
    }

    // Step 5: Generate and save output
    spinner = ora("Generating output files...").start();

    let outputContent: string;
    let defaultFilename: string;

    switch (options.outputFormat) {
      case "markdown":
        outputContent = await generateMarkdownOutput(
          preview,
          analysisResults,
          comparisonResults,
          options,
          filteredPages
        );
        defaultFilename = `comapeo-docs-preview-${Date.now()}.md`;
        break;
      case "json":
        outputContent = await generateJSONOutput(
          preview,
          analysisResults,
          comparisonResults,
          filteredPages
        );
        defaultFilename = `comapeo-docs-preview-${Date.now()}.json`;
        break;
      case "html":
        outputContent = await generateHTMLOutput(
          preview,
          analysisResults,
          comparisonResults,
          options,
          filteredPages
        );
        defaultFilename = `comapeo-docs-preview-${Date.now()}.html`;
        break;
    }

    // Save to file
    const outputFile = options.outputFile || defaultFilename;
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, outputContent, "utf8");

    spinner.succeed(chalk.green(`✅ Output saved to: ${outputPath}`));

    // Step 6: Display summary
    const executionTime = Math.round((Date.now() - startTime) / 1000);

    console.log(chalk.bold.green("\\n✨ Fetch All Complete!"));
    console.log(chalk.gray(`Execution time: ${executionTime}s`));
    console.log(chalk.gray(`Pages processed: ${filteredPages.length}`));

    if (options.exportFiles) {
      console.log(chalk.gray(`Mode: Export to markdown files + preview`));
    } else {
      console.log(chalk.gray(`Mode: Preview only`));
      console.log(chalk.gray(`Output format: ${options.outputFormat}`));
      console.log(chalk.gray(`Output file: ${outputPath}`));
    }

    if (!options.previewOnly) {
      console.log(chalk.blue("\\n💡 Next Steps:"));

      if (options.exportFiles) {
        console.log(
          "  1. Review the exported markdown files in ./docs and ./i18n folders"
        );
        console.log("  2. Check language separation is working correctly");
        console.log("  3. Test the Docusaurus build with the new files");
        console.log("  4. Address any identified content gaps");
      } else {
        console.log("  1. Review the generated preview for completeness");
        console.log("  2. Address any identified content gaps");
        console.log("  3. Use notion:gen-placeholders for empty pages");
        console.log(
          "  4. Run without --preview-only to export actual markdown files"
        );
      }

      if (options.comparison) {
        console.log("  5. Review migration checklist for deployment");
      }
    }

    // Exit successfully
    process.exit(0);
  } catch (error) {
    spinner.fail(chalk.red("❌ Failed to generate documentation preview"));
    console.error(chalk.red("Error:"), error);

    if (options.verbose) {
      console.error(chalk.gray("Stack trace:"), error.stack);
    }

    process.exit(1);
  }
}

// Output generation functions
async function generateMarkdownOutput(
  preview: any,
  analysis: any,
  comparison: any,
  options: CliOptions,
  pages: any[] = []
): Promise<string> {
  let output = preview.markdown || "";

  if (analysis && !options.previewOnly && pages.length > 0) {
    output += "\\n\\n---\\n\\n";
    output += StatusAnalyzer.generateReadinessReport(pages).summary;
  }

  if (comparison && !options.previewOnly) {
    output += "\\n\\n---\\n\\n";
    output += ComparisonEngine.generateComparisonReport(comparison);
  }

  return output;
}

async function generateJSONOutput(
  preview: any,
  analysis: any,
  comparison: any,
  pages: any[]
): Promise<string> {
  const data = {
    metadata: {
      generated: new Date().toISOString(),
      totalPages: pages.length,
      format: "notion-fetch-all-complete",
    },
    preview,
    analysis,
    comparison,
    pages: pages.map((page) => ({
      id: page.id,
      title: page.title,
      status: page.status,
      elementType: page.elementType,
      language: page.language,
      lastEdited: page.lastEdited,
      url: page.url,
    })),
  };

  return JSON.stringify(data, null, 2);
}

async function generateHTMLOutput(
  preview: any,
  analysis: any,
  comparison: any,
  options: CliOptions,
  pages: any[] = []
): Promise<string> {
  const markdownContent = await generateMarkdownOutput(
    preview,
    analysis,
    comparison,
    options,
    pages
  );

  // Basic HTML wrapper (in production, you'd use a proper markdown-to-HTML converter)
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CoMapeo Documentation Preview</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            margin: 0;
            padding: 40px;
            line-height: 1.6;
            color: #2d3748;
            background-color: #f7fafc;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1, h2, h3 { 
            color: #1a202c; 
            margin-top: 2em;
            margin-bottom: 0.5em;
        }
        h1 { 
            font-size: 2.25rem; 
            border-bottom: 3px solid #4299e1; 
            padding-bottom: 0.5rem;
        }
        h2 { 
            font-size: 1.875rem; 
            color: #2b6cb0;
        }
        h3 { 
            font-size: 1.5rem; 
            color: #3182ce;
        }
        .stats { 
            background: #edf2f7; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0;
            border-left: 4px solid #4299e1;
        }
        .status-ready { color: #38a169; font-weight: 600; }
        .status-draft { color: #d69e2e; font-weight: 600; }
        .status-empty { color: #e53e3e; font-weight: 600; }
        pre { 
            background: #1a202c; 
            color: #e2e8f0; 
            padding: 20px; 
            border-radius: 8px; 
            overflow-x: auto;
        }
        ul { padding-left: 1.5rem; }
        li { margin: 0.5rem 0; }
        .timestamp {
            color: #718096;
            font-size: 0.875rem;
            margin-top: 2rem;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            padding-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <pre>${markdownContent.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        <div class="timestamp">
            Generated on ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(chalk.yellow("\\n🛑 Interrupted by user"));
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error(chalk.red("❌ Uncaught exception:"), error);
  process.exit(1);
});

// Export for testing
export { main, parseArgs };

// Run if executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectExec =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExec && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(chalk.red("❌ Fatal error:"), error);
    process.exit(1);
  });
}
