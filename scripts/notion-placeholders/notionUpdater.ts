import { enhancedNotion } from "../notionClient";
import { NotionBlock } from "./contentGenerator";
import {
  PageObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Type guard to check if a page response is complete
function isFullPage(
  page: PageObjectResponse | PartialPageObjectResponse
): page is PageObjectResponse {
  return "properties" in page;
}

export interface UpdateResult {
  pageId: string;
  success: boolean;
  blocksAdded: number;
  error?: string;
  originalBlockCount: number;
  newBlockCount: number;
}

export interface UpdateOptions {
  dryRun?: boolean;
  preserveExisting?: boolean;
  backupOriginal?: boolean;
  maxRetries?: number;
}

export interface BackupData {
  pageId: string;
  timestamp: Date;
  originalBlocks: any[];
  pageProperties: any;
}

/**
 * Handles updating Notion pages with generated content
 */
export class NotionUpdater {
  private static readonly DEFAULT_OPTIONS: Required<UpdateOptions> = {
    dryRun: false,
    preserveExisting: true,
    backupOriginal: true,
    maxRetries: 3,
  };

  private static backups = new Map<string, BackupData>();

  /**
   * Update a single page with generated content blocks
   */
  static async updatePageContent(
    pageId: string,
    newBlocks: NotionBlock[],
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Get current page state
      const currentBlocks = await this.getCurrentBlocks(pageId);
      const originalBlockCount = currentBlocks.length;

      // Create backup if requested
      if (opts.backupOriginal && !opts.dryRun) {
        await this.createBackup(pageId, currentBlocks);
      }

      // Determine blocks to add
      let blocksToAdd = newBlocks;
      if (opts.preserveExisting && currentBlocks.length > 0) {
        // Only add content if page is truly empty
        return {
          pageId,
          success: true,
          blocksAdded: 0,
          originalBlockCount,
          newBlockCount: originalBlockCount,
        };
      }

      if (opts.dryRun) {
        console.log(
          `[DRY RUN] Would add ${blocksToAdd.length} blocks to page ${pageId}`
        );
        return {
          pageId,
          success: true,
          blocksAdded: blocksToAdd.length,
          originalBlockCount,
          newBlockCount: originalBlockCount + blocksToAdd.length,
        };
      }

      // Add content to page with retry logic
      const blocksAdded = await this.addBlocksWithRetry(
        pageId,
        blocksToAdd,
        opts.maxRetries
      );

      return {
        pageId,
        success: true,
        blocksAdded,
        originalBlockCount,
        newBlockCount: originalBlockCount + blocksAdded,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to update page ${pageId}:`, errorMessage);

      return {
        pageId,
        success: false,
        blocksAdded: 0,
        originalBlockCount: 0,
        newBlockCount: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Update multiple pages in batch with rate limiting
   */
  static async updatePages(
    updates: Array<{ pageId: string; blocks: NotionBlock[]; title?: string }>,
    options: UpdateOptions = {}
  ): Promise<UpdateResult[]> {
    const results: UpdateResult[] = [];

    // Process in batches to respect API rate limits
    const batchSize = 3;
    const delayBetweenBatches = 2000; // 2 seconds
    const delayBetweenRequests = 500; // 0.5 seconds

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(updates.length / batchSize)}`
      );

      for (const update of batch) {
        try {
          const title = update.title || `Page ${update.pageId.slice(0, 8)}...`;
          console.log(`  📄 Updating: "${title}"`);

          const result = await this.updatePageContent(
            update.pageId,
            update.blocks,
            options
          );
          results.push(result);

          if (result.success) {
            console.log(
              `  ✅ Added ${result.blocksAdded} blocks to "${title}"`
            );
          } else {
            console.log(`  ❌ Failed to update "${title}": ${result.error}`);
          }

          // Small delay between requests in the same batch
          if (batch.indexOf(update) < batch.length - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenRequests)
            );
          }
        } catch (error) {
          const title = update.title || `Page ${update.pageId.slice(0, 8)}...`;
          console.error(`  ❌ Failed to process "${title}":`, error);
          results.push({
            pageId: update.pageId,
            success: false,
            blocksAdded: 0,
            originalBlockCount: 0,
            newBlockCount: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      // Delay between batches
      if (i + batchSize < updates.length) {
        console.log(`Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    return results;
  }

  /**
   * Get current blocks from a page
   */
  private static async getCurrentBlocks(pageId: string): Promise<any[]> {
    try {
      const response = await enhancedNotion.blocksChildrenList({
        block_id: pageId,
        page_size: 100,
      });
      return response.results;
    } catch (error) {
      console.error(`Error fetching blocks for page ${pageId}:`, error);
      return [];
    }
  }

  /**
   * Add blocks to a page with retry logic
   */
  private static async addBlocksWithRetry(
    pageId: string,
    blocks: NotionBlock[],
    maxRetries: number
  ): Promise<number> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        // Notion API has a limit on blocks per request, so batch them
        const batchSize = 100;
        let totalAdded = 0;

        for (let i = 0; i < blocks.length; i += batchSize) {
          const batch = blocks.slice(i, i + batchSize);

          await enhancedNotion.blocksChildrenAppend({
            block_id: pageId,
            children: batch,
          });

          totalAdded += batch.length;

          // Small delay between batches
          if (i + batchSize < blocks.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }

        return totalAdded;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        attempt++;

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Create a backup of the page's current state
   */
  private static async createBackup(
    pageId: string,
    currentBlocks: any[]
  ): Promise<void> {
    try {
      // Get page properties
      const page = await enhancedNotion.pagesRetrieve({ page_id: pageId });

      const backup: BackupData = {
        pageId,
        timestamp: new Date(),
        originalBlocks: currentBlocks,
        pageProperties: isFullPage(page) ? page.properties : {},
      };

      this.backups.set(pageId, backup);
      // Only log backups in verbose mode - the main process will show page titles
    } catch (error) {
      console.error(`Failed to create backup for page ${pageId}:`, error);
      // Don't throw - backup failure shouldn't stop the update
    }
  }

  /**
   * Restore a page from backup
   */
  static async restoreFromBackup(pageId: string): Promise<boolean> {
    const backup = this.backups.get(pageId);
    if (!backup) {
      console.error(`No backup found for page ${pageId}`);
      return false;
    }

    try {
      // First, clear all current blocks
      const currentBlocks = await this.getCurrentBlocks(pageId);
      for (const block of currentBlocks) {
        await enhancedNotion.blocksDelete({ block_id: block.id });
      }

      // Restore original blocks
      if (backup.originalBlocks.length > 0) {
        await this.addBlocksWithRetry(pageId, backup.originalBlocks, 3);
      }

      console.log(`Successfully restored page ${pageId} from backup`);
      return true;
    } catch (error) {
      console.error(`Failed to restore page ${pageId}:`, error);
      return false;
    }
  }

  /**
   * Get all available backups
   */
  static getAvailableBackups(): Array<{
    pageId: string;
    timestamp: Date;
    blockCount: number;
  }> {
    return Array.from(this.backups.entries()).map(([pageId, backup]) => ({
      pageId,
      timestamp: backup.timestamp,
      blockCount: backup.originalBlocks.length,
    }));
  }

  /**
   * Clear old backups to free memory
   */
  static clearOldBackups(maxAgeHours: number = 24): void {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    for (const [pageId, backup] of this.backups.entries()) {
      if (backup.timestamp < cutoff) {
        this.backups.delete(pageId);
        console.log(`Cleared old backup for page ${pageId}`);
      }
    }
  }

  /**
   * Validate that blocks can be added to Notion
   */
  static validateBlocks(blocks: NotionBlock[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // Check required fields
      if (!block.type) {
        errors.push(`Block ${i}: Missing required 'type' field`);
        continue;
      }

      // Check block-specific structure
      switch (block.type) {
        case "paragraph":
        case "heading_1":
        case "heading_2":
        case "heading_3":
        case "bulleted_list_item":
        case "numbered_list_item":
          if (!block[block.type]?.rich_text) {
            errors.push(`Block ${i}: Missing rich_text for ${block.type}`);
          }
          break;

        case "image":
          if (!block.image?.external?.url && !block.image?.file?.url) {
            errors.push(`Block ${i}: Image missing URL`);
          }
          break;

        case "code":
          if (!block.code?.rich_text) {
            errors.push(`Block ${i}: Code block missing content`);
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate summary statistics for batch update results
   */
  static generateUpdateSummary(results: UpdateResult[]): {
    totalPages: number;
    successfulUpdates: number;
    failedUpdates: number;
    totalBlocksAdded: number;
    errors: string[];
  } {
    return {
      totalPages: results.length,
      successfulUpdates: results.filter((r) => r.success).length,
      failedUpdates: results.filter((r) => !r.success).length,
      totalBlocksAdded: results.reduce((sum, r) => sum + r.blocksAdded, 0),
      errors: results
        .filter((r) => r.error)
        .map((r) => `${r.pageId}: ${r.error}`),
    };
  }
}
