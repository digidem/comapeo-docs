import { enhancedNotion } from "../notionClient";
import { ContentType, ContentLength } from "./contentGenerator";
import {
  PageObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Type guard to check if a page response is complete
function isFullPage(
  page: PageObjectResponse | PartialPageObjectResponse
): page is PageObjectResponse {
  return "last_edited_time" in page;
}

export interface ContentAnalysis {
  isEmpty: boolean;
  hasOnlyEmptyBlocks: boolean;
  contentScore: number; // 0-100 based on content richness
  blockCount: number;
  recommendedAction: "fill" | "skip" | "enhance";
  recommendedContentType: ContentType;
  recommendedContentLength: ContentLength;
  lastModified?: Date;
  hasRecentActivity: boolean;
}

export interface PageAnalysisOptions {
  skipRecentlyModified?: boolean;
  recentThresholdHours?: number;
  minContentScore?: number;
}

/**
 * Analyzes Notion pages to determine content status and recommendations
 */
export class PageAnalyzer {
  private static readonly DEFAULT_OPTIONS: Required<PageAnalysisOptions> = {
    skipRecentlyModified: true,
    recentThresholdHours: 24,
    minContentScore: 10,
  };

  /**
   * Analyze a single page's content and provide recommendations
   */
  static async analyzePage(
    pageId: string,
    pageTitle: string,
    options: PageAnalysisOptions = {}
  ): Promise<ContentAnalysis> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Fetch page metadata
      const page = await enhancedNotion.pagesRetrieve({ page_id: pageId });
      const lastModified = isFullPage(page)
        ? new Date(page.last_edited_time)
        : new Date();
      const hoursAgo = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60);
      const hasRecentActivity = hoursAgo < opts.recentThresholdHours;

      // Fetch page blocks
      const blocks = await enhancedNotion.blocksChildrenList({
        block_id: pageId,
        page_size: 100,
      });

      const analysis = this.analyzeBlocks(blocks.results);
      const contentScore = this.calculateContentScore(
        blocks.results,
        pageTitle
      );
      const recommendedContentType =
        this.detectRecommendedContentType(pageTitle);
      const recommendedContentLength = this.recommendContentLength(
        contentScore,
        analysis.blockCount
      );

      let recommendedAction: "fill" | "skip" | "enhance" = "skip";

      if (analysis.isEmpty || analysis.hasOnlyEmptyBlocks) {
        if (hasRecentActivity && opts.skipRecentlyModified) {
          recommendedAction = "skip";
        } else {
          recommendedAction = "fill";
        }
      } else if (contentScore < opts.minContentScore) {
        recommendedAction = "enhance";
      }

      return {
        isEmpty: analysis.isEmpty,
        hasOnlyEmptyBlocks: analysis.hasOnlyEmptyBlocks,
        contentScore,
        blockCount: analysis.blockCount,
        recommendedAction,
        recommendedContentType,
        recommendedContentLength,
        lastModified,
        hasRecentActivity,
      };
    } catch (error) {
      console.error(`Error analyzing page ${pageId}:`, error);

      // Return safe defaults for error cases
      return {
        isEmpty: true,
        hasOnlyEmptyBlocks: true,
        contentScore: 0,
        blockCount: 0,
        recommendedAction: "skip",
        recommendedContentType: "general",
        recommendedContentLength: "medium",
        hasRecentActivity: false,
      };
    }
  }

  /**
   * Analyze multiple pages in batch
   */
  static async analyzePages(
    pages: Array<{ id: string; title: string }>,
    options: PageAnalysisOptions = {}
  ): Promise<Map<string, ContentAnalysis>> {
    const results = new Map<string, ContentAnalysis>();

    // Process pages in batches to respect API rate limits
    const batchSize = 5;
    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);

      const batchPromises = batch.map(async (page) => {
        const analysis = await this.analyzePage(page.id, page.title, options);
        return { pageId: page.id, analysis };
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          results.set(result.value.pageId, result.value.analysis);
        } else {
          console.error("Failed to analyze page:", result.reason);
        }
      });

      // Rate limiting delay between batches
      if (i + batchSize < pages.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Analyze block structure and content
   */
  private static analyzeBlocks(blocks: any[]): {
    isEmpty: boolean;
    hasOnlyEmptyBlocks: boolean;
    blockCount: number;
  } {
    if (blocks.length === 0) {
      return {
        isEmpty: true,
        hasOnlyEmptyBlocks: true,
        blockCount: 0,
      };
    }

    const contentBlocks = blocks.filter((block) => this.isContentBlock(block));
    const nonEmptyBlocks = contentBlocks.filter((block) =>
      this.hasContent(block)
    );

    return {
      isEmpty: contentBlocks.length === 0,
      hasOnlyEmptyBlocks: nonEmptyBlocks.length === 0,
      blockCount: blocks.length,
    };
  }

  /**
   * Calculate a content richness score (0-100)
   */
  private static calculateContentScore(blocks: any[], title: string): number {
    if (blocks.length === 0) return 0;

    let score = 0;
    let contentBlocks = 0;

    for (const block of blocks) {
      if (!this.isContentBlock(block)) continue;

      contentBlocks++;

      // Score based on block type and content
      switch (block.type) {
        case "paragraph":
          const text = this.extractText(block);
          if (text.length > 10) score += Math.min(10, text.length / 10);
          break;
        case "heading_1":
        case "heading_2":
        case "heading_3":
          score += 5;
          break;
        case "bulleted_list_item":
        case "numbered_list_item":
          score += 3;
          break;
        case "image":
          score += 8;
          break;
        case "code":
          score += 6;
          break;
        case "callout":
          score += 4;
          break;
        default:
          score += 2;
      }
    }

    // Bonus for having a meaningful title
    if (
      title &&
      title.length > 5 &&
      !title.toLowerCase().includes("untitled")
    ) {
      score += 10;
    }

    // Bonus for block diversity
    const blockTypes = new Set(blocks.map((b) => b.type));
    if (blockTypes.size > 3) score += 5;

    // Cap at 100 and normalize
    return Math.min(100, score);
  }

  /**
   * Recommend content type based on page title and context
   */
  private static detectRecommendedContentType(title: string): ContentType {
    const titleLower = title.toLowerCase();

    // Check for specific patterns in titles
    if (
      titleLower.includes("introduction") ||
      titleLower.includes("overview") ||
      titleLower.includes("about") ||
      titleLower.includes("getting started") ||
      titleLower.includes("introdução") ||
      titleLower.includes("introducción")
    ) {
      return "intro";
    }

    if (
      titleLower.includes("tutorial") ||
      titleLower.includes("step") ||
      titleLower.includes("guide") ||
      titleLower.includes("how to") ||
      titleLower.includes("walkthrough") ||
      titleLower.includes("guía") ||
      titleLower.includes("como") ||
      titleLower.includes("passo")
    ) {
      return "tutorial";
    }

    if (
      titleLower.includes("reference") ||
      titleLower.includes("api") ||
      titleLower.includes("documentation") ||
      titleLower.includes("spec") ||
      titleLower.includes("referência") ||
      titleLower.includes("referencia")
    ) {
      return "reference";
    }

    if (
      titleLower.includes("troubleshoot") ||
      titleLower.includes("problem") ||
      titleLower.includes("error") ||
      titleLower.includes("issue") ||
      titleLower.includes("fix") ||
      titleLower.includes("debug") ||
      titleLower.includes("solución") ||
      titleLower.includes("problema") ||
      titleLower.includes("erro") ||
      titleLower.includes("solução")
    ) {
      return "troubleshooting";
    }

    return "general";
  }

  /**
   * Recommend content length based on analysis
   */
  private static recommendContentLength(
    contentScore: number,
    blockCount: number
  ): ContentLength {
    // Consider both existing content and typical expectations
    if (contentScore > 50 || blockCount > 10) {
      return "long";
    } else if (contentScore > 20 || blockCount > 3) {
      return "medium";
    } else {
      return "short";
    }
  }

  /**
   * Check if a block contains meaningful content
   */
  private static isContentBlock(block: any): boolean {
    const contentTypes = [
      "paragraph",
      "heading_1",
      "heading_2",
      "heading_3",
      "bulleted_list_item",
      "numbered_list_item",
      "to_do",
      "code",
      "quote",
      "callout",
      "image",
      "video",
      "file",
      "table",
      "column_list",
      "synced_block",
    ];

    return contentTypes.includes(block.type);
  }

  /**
   * Check if a block has actual content (not just empty structure)
   */
  private static hasContent(block: any): boolean {
    switch (block.type) {
      case "paragraph":
      case "heading_1":
      case "heading_2":
      case "heading_3":
      case "bulleted_list_item":
      case "numbered_list_item":
      case "to_do":
      case "quote":
      case "callout":
        const text = this.extractText(block);
        return text.trim().length > 0;

      case "image":
      case "video":
      case "file":
        return true; // Media blocks always count as content

      case "code":
        return (
          block.code?.rich_text?.some(
            (text: any) => text.plain_text && text.plain_text.trim().length > 0
          ) || false
        );

      default:
        return true; // Other block types assumed to have content
    }
  }

  /**
   * Extract plain text from a rich text block
   */
  private static extractText(block: any): string {
    const richText = block[block.type]?.rich_text;
    if (!richText || !Array.isArray(richText)) return "";

    return richText
      .map((text: any) => text.plain_text || "")
      .join("")
      .trim();
  }

  /**
   * Generate summary statistics for a batch analysis
   */
  static generateAnalysisSummary(analyses: Map<string, ContentAnalysis>): {
    totalPages: number;
    emptyPages: number;
    pagesNeedingFill: number;
    pagesNeedingEnhancement: number;
    averageContentScore: number;
    recentlyModifiedSkipped: number;
  } {
    const values = Array.from(analyses.values());

    return {
      totalPages: values.length,
      emptyPages: values.filter((a) => a.isEmpty).length,
      pagesNeedingFill: values.filter((a) => a.recommendedAction === "fill")
        .length,
      pagesNeedingEnhancement: values.filter(
        (a) => a.recommendedAction === "enhance"
      ).length,
      averageContentScore:
        values.reduce((sum, a) => sum + a.contentScore, 0) / values.length,
      recentlyModifiedSkipped: values.filter(
        (a) => a.hasRecentActivity && a.recommendedAction === "skip"
      ).length,
    };
  }
}
