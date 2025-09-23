import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BackupEntry {
  pageId: string;
  timestamp: Date;
  originalBlocks: any[];
  pageProperties: any;
  operation: "placeholder-generation" | "content-update" | "manual";
}

/**
 * Manages persistent backups of Notion page states
 */
export class BackupManager {
  private static readonly BACKUP_DIR = path.join(
    __dirname,
    "../../../.backups/notion-placeholders"
  );

  static {
    // Ensure backup directory exists
    fs.mkdirSync(this.BACKUP_DIR, { recursive: true });
  }

  /**
   * Create a persistent backup of a page
   */
  static async createBackup(
    pageId: string,
    originalBlocks: any[],
    pageProperties: any,
    operation: BackupEntry["operation"] = "placeholder-generation"
  ): Promise<string> {
    const backup: BackupEntry = {
      pageId,
      timestamp: new Date(),
      originalBlocks,
      pageProperties,
      operation,
    };

    const filename = `${pageId}_${Date.now()}.json`;
    const filepath = path.join(this.BACKUP_DIR, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf8");
      console.log(`Created backup: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(`Failed to create backup for ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Load a backup from file
   */
  static loadBackup(filepath: string): BackupEntry | null {
    try {
      const content = fs.readFileSync(filepath, "utf8");
      const backup = JSON.parse(content);
      backup.timestamp = new Date(backup.timestamp); // Parse date
      return backup;
    } catch (error) {
      console.error(`Failed to load backup from ${filepath}:`, error);
      return null;
    }
  }

  /**
   * Get all backups for a specific page
   */
  static getPageBackups(
    pageId: string
  ): Array<{ filepath: string; backup: BackupEntry }> {
    try {
      const files = fs.readdirSync(this.BACKUP_DIR);
      const pageBackups: Array<{ filepath: string; backup: BackupEntry }> = [];

      for (const file of files) {
        if (file.startsWith(pageId) && file.endsWith(".json")) {
          const filepath = path.join(this.BACKUP_DIR, file);
          const backup = this.loadBackup(filepath);
          if (backup) {
            pageBackups.push({ filepath, backup });
          }
        }
      }

      // Sort by timestamp (newest first)
      return pageBackups.sort(
        (a, b) => b.backup.timestamp.getTime() - a.backup.timestamp.getTime()
      );
    } catch (error) {
      console.error(`Failed to get backups for page ${pageId}:`, error);
      return [];
    }
  }

  /**
   * Get all available backups
   */
  static getAllBackups(): Array<{ filepath: string; backup: BackupEntry }> {
    try {
      const files = fs.readdirSync(this.BACKUP_DIR);
      const allBackups: Array<{ filepath: string; backup: BackupEntry }> = [];

      for (const file of files) {
        if (file.endsWith(".json")) {
          const filepath = path.join(this.BACKUP_DIR, file);
          const backup = this.loadBackup(filepath);
          if (backup) {
            allBackups.push({ filepath, backup });
          }
        }
      }

      // Sort by timestamp (newest first)
      return allBackups.sort(
        (a, b) => b.backup.timestamp.getTime() - a.backup.timestamp.getTime()
      );
    } catch (error) {
      console.error("Failed to get all backups:", error);
      return [];
    }
  }

  /**
   * Clean up old backups
   */
  static cleanupOldBackups(maxAgeHours: number = 24 * 7): number {
    // Default: 1 week
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(this.BACKUP_DIR);

      for (const file of files) {
        if (file.endsWith(".json")) {
          const filepath = path.join(this.BACKUP_DIR, file);
          const backup = this.loadBackup(filepath);

          if (backup && backup.timestamp < cutoff) {
            fs.unlinkSync(filepath);
            deletedCount++;
            console.log(`Deleted old backup: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error("Failed to cleanup old backups:", error);
    }

    return deletedCount;
  }

  /**
   * Get backup statistics
   */
  static getBackupStats(): {
    totalBackups: number;
    totalSizeBytes: number;
    oldestBackup?: Date;
    newestBackup?: Date;
    uniquePages: number;
  } {
    try {
      const files = fs.readdirSync(this.BACKUP_DIR);
      let totalSizeBytes = 0;
      const timestamps: Date[] = [];
      const uniquePages = new Set<string>();

      for (const file of files) {
        if (file.endsWith(".json")) {
          const filepath = path.join(this.BACKUP_DIR, file);
          const stats = fs.statSync(filepath);
          totalSizeBytes += stats.size;

          const backup = this.loadBackup(filepath);
          if (backup) {
            timestamps.push(backup.timestamp);
            uniquePages.add(backup.pageId);
          }
        }
      }

      return {
        totalBackups: timestamps.length,
        totalSizeBytes,
        oldestBackup:
          timestamps.length > 0
            ? new Date(Math.min(...timestamps.map((d) => d.getTime())))
            : undefined,
        newestBackup:
          timestamps.length > 0
            ? new Date(Math.max(...timestamps.map((d) => d.getTime())))
            : undefined,
        uniquePages: uniquePages.size,
      };
    } catch (error) {
      console.error("Failed to get backup stats:", error);
      return {
        totalBackups: 0,
        totalSizeBytes: 0,
        uniquePages: 0,
      };
    }
  }

  /**
   * Export backups to a single archive file
   */
  static exportBackups(outputPath?: string): string {
    const exportData = {
      exportDate: new Date(),
      backups: this.getAllBackups().map(({ backup }) => backup),
    };

    const defaultPath = path.join(
      this.BACKUP_DIR,
      `backup-export-${Date.now()}.json`
    );
    const filepath = outputPath || defaultPath;

    try {
      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), "utf8");
      console.log(
        `Exported ${exportData.backups.length} backups to: ${filepath}`
      );
      return filepath;
    } catch (error) {
      console.error(`Failed to export backups to ${filepath}:`, error);
      throw error;
    }
  }

  /**
   * Import backups from an archive file
   */
  static importBackups(archivePath: string): number {
    try {
      const content = fs.readFileSync(archivePath, "utf8");
      const exportData = JSON.parse(content);
      let importedCount = 0;

      for (const backup of exportData.backups) {
        const filename = `${backup.pageId}_${new Date(backup.timestamp).getTime()}.json`;
        const filepath = path.join(this.BACKUP_DIR, filename);

        if (!fs.existsSync(filepath)) {
          fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf8");
          importedCount++;
        }
      }

      console.log(`Imported ${importedCount} new backups from: ${archivePath}`);
      return importedCount;
    } catch (error) {
      console.error(`Failed to import backups from ${archivePath}:`, error);
      throw error;
    }
  }
}
