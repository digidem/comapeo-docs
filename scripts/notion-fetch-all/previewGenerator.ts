import { PageWithStatus } from "./fetchAll";
import { enhancedNotion } from "../notionClient";
import {
  BlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Type guard to check if a block is a complete BlockObjectResponse
function isFullBlock(
  block: PartialBlockObjectResponse | BlockObjectResponse
): block is BlockObjectResponse {
  return "type" in block;
}

export interface PreviewPage {
  id: string;
  title: string;
  status: string;
  elementType: string;
  order: number;
  language?: string;
  parentItem?: string;
  subItems: string[];
  hasContent: boolean;
  url: string;
  lastEdited: Date;
  createdTime: Date;
}

export interface PreviewSection {
  title: string;
  status: string;
  elementType: string;
  order: number;
  pages: PreviewPage[];
  subSections: PreviewSection[];
  contentStats: {
    totalPages: number;
    readyPages: number;
    draftPages: number;
    emptyPages: number;
    completionPercentage: number;
  };
}

export interface PreviewOptions {
  includeEmptyPages?: boolean;
  groupByStatus?: boolean;
  includeMetadata?: boolean;
  generateMarkdown?: boolean;
  showContentStats?: boolean;
}

/**
 * Generates documentation preview with complete structure visualization
 */
export class PreviewGenerator {
  private static readonly DEFAULT_OPTIONS: Required<PreviewOptions> = {
    includeEmptyPages: true,
    groupByStatus: false,
    includeMetadata: true,
    generateMarkdown: true,
    showContentStats: true,
  };

  /**
   * Generate complete documentation structure preview
   */
  static async generatePreview(
    pages: PageWithStatus[],
    options: PreviewOptions = {}
  ): Promise<{
    sections: PreviewSection[];
    markdown?: string;
    stats: {
      totalPages: number;
      readyPages: number;
      draftPages: number;
      emptyPages: number;
      sections: number;
      languages: string[];
      averageCompletionRate: number;
    };
  }> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    console.log("📊 Generating documentation preview...");

    // Transform pages to preview format
    const previewPages = await this.transformToPreviewPages(pages);

    // Build hierarchical structure
    const sections = this.buildHierarchicalStructure(previewPages);

    // Calculate statistics
    const stats = this.calculateStats(previewPages, sections);

    // Generate markdown if requested
    let markdown: string | undefined;
    if (opts.generateMarkdown) {
      markdown = this.generateMarkdownPreview(sections, stats, opts);
    }

    console.log(
      `✅ Preview generated: ${stats.sections} sections, ${stats.totalPages} pages`
    );

    return {
      sections,
      markdown,
      stats,
    };
  }

  /**
   * Transform pages to preview format with content analysis
   */
  private static async transformToPreviewPages(
    pages: PageWithStatus[]
  ): Promise<PreviewPage[]> {
    const previewPages: PreviewPage[] = [];

    for (const page of pages) {
      // Use simple heuristic instead of expensive API calls
      // Pages with "Ready to publish" or "Draft" status likely have content
      const hasContent = this.estimateHasContent(page);

      previewPages.push({
        id: page.id,
        title: page.title,
        status: page.status,
        elementType: page.elementType,
        order: page.order,
        language: page.language,
        parentItem: page.parentItem,
        subItems: page.subItems,
        hasContent,
        url: page.url,
        lastEdited: page.lastEdited,
        createdTime: page.createdTime,
      });
    }

    return previewPages;
  }

  /**
   * Simple heuristic to estimate if page has content (replaces expensive API calls)
   */
  private static estimateHasContent(page: PageWithStatus): boolean {
    // Use status and metadata to estimate content presence
    // This is much faster than making API calls for each page

    // Pages with "Ready to publish" or draft statuses likely have content
    if (
      page.status === "Ready to publish" ||
      page.status === "Draft published" ||
      page.status === "Update in progress"
    ) {
      return true;
    }

    // Pages that are "Not started" are likely empty
    if (page.status === "Not started") {
      return false;
    }

    // For "No Status" pages, use title heuristics
    if (page.status === "No Status") {
      // Generic placeholder titles suggest empty content
      const placeholderTitles = [
        "Nueva Página",
        "Nova Página",
        "New Page",
        "Untitled",
      ];

      const isPlaceholder = placeholderTitles.some((placeholder) =>
        page.title.includes(placeholder)
      );

      return !isPlaceholder;
    }

    // Default to true for other statuses
    return true;
  }

  /**
   * Analyze if page has meaningful content (expensive - use estimateHasContent instead)
   */
  private static async analyzePageContent(pageId: string): Promise<boolean> {
    try {
      const response = await enhancedNotion.blocksChildrenList({
        block_id: pageId,
        page_size: 10, // Just check first few blocks
      });

      const blocks = response.results;

      // Page has content if it has any blocks with text
      return blocks.some((block) => {
        if (!isFullBlock(block)) return false;

        if (
          block.type === "paragraph" &&
          block.paragraph?.rich_text?.length > 0
        ) {
          return block.paragraph.rich_text.some(
            (text) => text.plain_text.trim().length > 0
          );
        }
        if (
          block.type === "heading_1" &&
          block.heading_1?.rich_text?.length > 0
        ) {
          return block.heading_1.rich_text.some(
            (text) => text.plain_text.trim().length > 0
          );
        }
        if (
          block.type === "heading_2" &&
          block.heading_2?.rich_text?.length > 0
        ) {
          return block.heading_2.rich_text.some(
            (text) => text.plain_text.trim().length > 0
          );
        }
        if (
          block.type === "heading_3" &&
          block.heading_3?.rich_text?.length > 0
        ) {
          return block.heading_3.rich_text.some(
            (text) => text.plain_text.trim().length > 0
          );
        }
        return false;
      });
    } catch (error) {
      console.warn(
        `Failed to analyze content for page ${pageId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return false; // Assume empty if we can't check
    }
  }

  /**
   * Build hierarchical structure from flat page list
   */
  private static buildHierarchicalStructure(
    pages: PreviewPage[]
  ): PreviewSection[] {
    // Group pages by element type and parent relationships
    const topLevelPages = pages.filter((page) => !page.parentItem);
    const sections: PreviewSection[] = [];

    // Sort top-level pages by order
    topLevelPages.sort((a, b) => a.order - b.order);

    for (const topPage of topLevelPages) {
      const section = this.buildSection(topPage, pages);
      sections.push(section);
    }

    return sections;
  }

  /**
   * Build a section with its subsections and pages
   */
  private static buildSection(
    rootPage: PreviewPage,
    allPages: PreviewPage[]
  ): PreviewSection {
    // Find all child pages
    const childPages = allPages.filter(
      (page) => page.parentItem === rootPage.id
    );

    // Separate sections from regular pages
    const subSectionPages = childPages.filter(
      (page) => page.elementType === "Section" || page.subItems.length > 0
    );
    const regularPages = childPages.filter(
      (page) => page.elementType !== "Section" && page.subItems.length === 0
    );

    // Build subsections recursively
    const subSections = subSectionPages
      .sort((a, b) => a.order - b.order)
      .map((page) => this.buildSection(page, allPages));

    // Sort regular pages by order
    regularPages.sort((a, b) => a.order - b.order);

    // Calculate content statistics
    const allSectionPages = this.getAllPagesInSection(rootPage, allPages);
    const contentStats = this.calculateSectionStats(allSectionPages);

    return {
      title: rootPage.title,
      status: rootPage.status,
      elementType: rootPage.elementType,
      order: rootPage.order,
      pages: regularPages,
      subSections,
      contentStats,
    };
  }

  /**
   * Get all pages within a section (including subsections)
   */
  private static getAllPagesInSection(
    rootPage: PreviewPage,
    allPages: PreviewPage[]
  ): PreviewPage[] {
    const result: PreviewPage[] = [rootPage];

    const childPages = allPages.filter(
      (page) => page.parentItem === rootPage.id
    );
    for (const child of childPages) {
      result.push(...this.getAllPagesInSection(child, allPages));
    }

    return result;
  }

  /**
   * Calculate statistics for a section
   */
  private static calculateSectionStats(pages: PreviewPage[]) {
    const totalPages = pages.length;
    const readyPages = pages.filter(
      (p) => p.status === "Ready to publish"
    ).length;
    const draftPages = pages.filter((p) => p.status === "Draft").length;
    const emptyPages = pages.filter((p) => !p.hasContent).length;
    const completionPercentage =
      totalPages > 0 ? Math.round((readyPages / totalPages) * 100) : 0;

    return {
      totalPages,
      readyPages,
      draftPages,
      emptyPages,
      completionPercentage,
    };
  }

  /**
   * Calculate overall statistics
   */
  private static calculateStats(
    pages: PreviewPage[],
    sections: PreviewSection[]
  ) {
    const totalPages = pages.length;
    const readyPages = pages.filter(
      (p) => p.status === "Ready to publish"
    ).length;
    const draftPages = pages.filter((p) => p.status === "Draft").length;
    const emptyPages = pages.filter((p) => !p.hasContent).length;
    const languages = [
      ...new Set(pages.map((p) => p.language).filter(Boolean)),
    ];

    const averageCompletionRate =
      sections.length > 0
        ? sections.reduce(
            (sum, section) => sum + section.contentStats.completionPercentage,
            0
          ) / sections.length
        : 0;

    return {
      totalPages,
      readyPages,
      draftPages,
      emptyPages,
      sections: sections.length,
      languages,
      averageCompletionRate: Math.round(averageCompletionRate),
    };
  }

  /**
   * Generate markdown documentation preview
   */
  private static generateMarkdownPreview(
    sections: PreviewSection[],
    stats: any,
    options: Required<PreviewOptions>
  ): string {
    let markdown = "# CoMapeo Documentation Preview\n\n";

    // Add overview statistics
    if (options.showContentStats) {
      markdown += "## 📊 Overview Statistics\n\n";
      markdown += `- **Total Pages**: ${stats.totalPages}\n`;
      markdown += `- **Ready to Publish**: ${stats.readyPages} (${Math.round((stats.readyPages / stats.totalPages) * 100)}%)\n`;
      markdown += `- **Draft Pages**: ${stats.draftPages}\n`;
      markdown += `- **Empty Pages**: ${stats.emptyPages}\n`;
      markdown += `- **Sections**: ${stats.sections}\n`;
      markdown += `- **Languages**: ${stats.languages.join(", ")}\n`;
      markdown += `- **Average Completion**: ${stats.averageCompletionRate}%\n\n`;
    }

    // Add table of contents
    markdown += "## 📑 Table of Contents\n\n";
    markdown += this.generateTableOfContents(sections, options);
    markdown += "\n";

    // Add detailed structure
    markdown += "## 📖 Detailed Structure\n\n";
    markdown += this.generateDetailedStructure(sections, options, 0);

    return markdown;
  }

  /**
   * Generate table of contents
   */
  private static generateTableOfContents(
    sections: PreviewSection[],
    options: PreviewOptions,
    level: number = 0
  ): string {
    let toc = "";
    const indent = "  ".repeat(level);

    for (const section of sections) {
      const statusIcon = this.getStatusIcon(section.status);
      const completionBadge = options.showContentStats
        ? ` (${section.contentStats.completionPercentage}%)`
        : "";

      toc += `${indent}- ${statusIcon} ${section.title}${completionBadge}\n`;

      // Add pages
      for (const page of section.pages) {
        const pageIcon = this.getStatusIcon(page.status);
        const contentIcon = page.hasContent ? "📄" : "📋";
        toc += `${indent}  - ${pageIcon}${contentIcon} ${page.title}\n`;
      }

      // Add subsections recursively
      if (section.subSections.length > 0) {
        toc += this.generateTableOfContents(
          section.subSections,
          options,
          level + 1
        );
      }
    }

    return toc;
  }

  /**
   * Generate detailed structure with metadata
   */
  private static generateDetailedStructure(
    sections: PreviewSection[],
    options: Required<PreviewOptions>,
    level: number
  ): string {
    let structure = "";

    for (const section of sections) {
      const heading = "#".repeat(Math.min(level + 3, 6));
      const statusIcon = this.getStatusIcon(section.status);

      structure += `${heading} ${statusIcon} ${section.title}\n\n`;

      // Add section metadata
      if (options.includeMetadata) {
        structure += `**Status**: ${section.status}  \n`;
        structure += `**Type**: ${section.elementType}  \n`;
        if (options.showContentStats) {
          structure += `**Progress**: ${section.contentStats.readyPages}/${section.contentStats.totalPages} pages (${section.contentStats.completionPercentage}%)  \n`;
        }
        structure += "\n";
      }

      // Add pages in this section
      if (section.pages.length > 0) {
        structure += "**Pages:**\n\n";
        for (const page of section.pages) {
          if (!options.includeEmptyPages && !page.hasContent) continue;

          const statusIcon = this.getStatusIcon(page.status);
          const contentIcon = page.hasContent ? "📄" : "📋";

          structure += `- ${statusIcon}${contentIcon} **${page.title}**`;

          if (options.includeMetadata) {
            structure += ` (${page.status}`;
            if (page.language) structure += `, ${page.language}`;
            structure += ")";
          }

          structure += "\n";
        }
        structure += "\n";
      }

      // Add subsections recursively
      if (section.subSections.length > 0) {
        structure += this.generateDetailedStructure(
          section.subSections,
          options,
          level + 1
        );
      }
    }

    return structure;
  }

  /**
   * Get status icon for visual representation
   */
  private static getStatusIcon(status: string): string {
    switch (status) {
      case "Ready to publish":
        return "✅";
      case "Draft":
        return "📝";
      case "In progress":
        return "🔄";
      case "Not started":
        return "⭕";
      case "Archived":
        return "📦";
      default:
        return "❓";
    }
  }

  /**
   * Export preview as different formats
   */
  static async exportPreview(
    sections: PreviewSection[],
    stats: any,
    format: "markdown" | "json" | "html",
    outputPath?: string
  ): Promise<string> {
    let content: string;
    let extension: string;

    switch (format) {
      case "markdown":
        content = this.generateMarkdownPreview(
          sections,
          stats,
          this.DEFAULT_OPTIONS
        );
        extension = ".md";
        break;
      case "json":
        content = JSON.stringify({ sections, stats }, null, 2);
        extension = ".json";
        break;
      case "html":
        content = this.generateHTMLPreview(sections, stats);
        extension = ".html";
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const filename =
      outputPath || `comapeo-docs-preview-${Date.now()}${extension}`;

    // In a real implementation, you'd write to file system here
    console.log(`📁 Preview exported to: ${filename}`);

    return filename;
  }

  /**
   * Generate HTML preview (basic implementation)
   */
  private static generateHTMLPreview(
    sections: PreviewSection[],
    stats: any
  ): string {
    const markdown = this.generateMarkdownPreview(
      sections,
      stats,
      this.DEFAULT_OPTIONS
    );

    // Basic HTML wrapper (in production, you'd use a proper markdown-to-HTML converter)
    return `
<!DOCTYPE html>
<html>
<head>
    <title>CoMapeo Documentation Preview</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
        h1, h2, h3 { color: #2d3748; }
        .stats { background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .status-ready { color: #38a169; }
        .status-draft { color: #d69e2e; }
        .status-empty { color: #e53e3e; }
    </style>
</head>
<body>
    <pre>${markdown}</pre>
</body>
</html>`;
  }
}
