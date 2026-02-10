/**
 * Rollback Recorder for Notion Page Status Changes
 *
 * Records page IDs and original statuses before status changes to enable rollback.
 * Uses persistent JSON storage for cross-session recovery.
 */

import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { NOTION_PROPERTIES } from "../constants";

/**
 * Individual status change record
 */
export interface StatusChangeRecord {
  /** Page ID in Notion */
  pageId: string;
  /** Original status before the change */
  originalStatus: string;
  /** New status after the change */
  newStatus: string;
  /** When the change was made */
  timestamp: Date;
  /** Optional page title for easier identification */
  pageTitle?: string;
  /** Optional language filter applied during the operation */
  languageFilter?: string;
}

/**
 * Complete rollback data for a session
 */
export interface RollbackSession {
  /** Unique session identifier */
  sessionId: string;
  /** When the session was created */
  timestamp: Date;
  /** Operation that triggered the status changes (e.g., workflow name) */
  operation: string;
  /** From status in the transition */
  fromStatus: string;
  /** To status in the transition */
  toStatus: string;
  /** Individual page changes */
  changes: StatusChangeRecord[];
  /** Summary statistics */
  summary: {
    totalChanges: number;
    successfulChanges: number;
    failedChanges: number;
  };
}

/**
 * Storage format for rollback data
 */
interface RollbackStorage {
  sessions: RollbackSession[];
  lastUpdated: Date;
}

/**
 * Options for recording status changes
 */
export interface RecordOptions {
  /** Directory to store rollback data (default: .rollback-data) */
  storageDir?: string;
  /** Optional page title for easier identification */
  pageTitle?: string;
  /** Optional language filter applied during the operation */
  languageFilter?: string;
}

/**
 * Default storage directory
 */
const DEFAULT_STORAGE_DIR = ".rollback-data";
const STORAGE_FILENAME = "status-rollback.json";

/**
 * Rollback Recorder class
 *
 * Manages recording and rollback of Notion page status changes.
 * Stores data persistently in JSON format for cross-session recovery.
 */
export class RollbackRecorder {
  private storageDir: string;
  private storagePath: string;
  private currentSession: RollbackSession | null = null;

  constructor(options: RecordOptions = {}) {
    this.storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
    this.storagePath = path.join(this.storageDir, STORAGE_FILENAME);
  }

  /**
   * Start a new rollback recording session
   */
  async startSession(
    operation: string,
    fromStatus: string,
    toStatus: string
  ): Promise<string> {
    const sessionId = this.generateSessionId(operation);
    const timestamp = new Date();

    this.currentSession = {
      sessionId,
      timestamp,
      operation,
      fromStatus,
      toStatus,
      changes: [],
      summary: {
        totalChanges: 0,
        successfulChanges: 0,
        failedChanges: 0,
      },
    };

    return sessionId;
  }

  /**
   * Record a status change for a page
   */
  async recordChange(
    pageId: string,
    originalStatus: string,
    success: boolean = true,
    options: RecordOptions = {}
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error("No active session. Call startSession() first.");
    }

    const record: StatusChangeRecord = {
      pageId,
      originalStatus,
      newStatus: this.currentSession.toStatus,
      timestamp: new Date(),
      pageTitle: options.pageTitle,
      languageFilter: options.languageFilter,
    };

    this.currentSession.changes.push(record);
    this.currentSession.summary.totalChanges++;

    if (success) {
      this.currentSession.summary.successfulChanges++;
    } else {
      this.currentSession.summary.failedChanges++;
    }
  }

  /**
   * End the current session and persist to storage
   */
  async endSession(): Promise<void> {
    if (!this.currentSession) {
      console.warn(chalk.yellow("No active session to end."));
      return;
    }

    await this.persistSession(this.currentSession);
    this.currentSession = null;
  }

  /**
   * Get the current session data (without persisting)
   */
  getCurrentSession(): RollbackSession | null {
    return this.currentSession;
  }

  /**
   * Load all stored sessions
   */
  async loadSessions(): Promise<RollbackSession[]> {
    try {
      const data = await this.readStorage();
      return data.sessions;
    } catch (error) {
      console.error(chalk.red("Failed to load sessions:"), error);
      return [];
    }
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<RollbackSession | null> {
    const sessions = await this.loadSessions();
    return sessions.find((s) => s.sessionId === sessionId) || null;
  }

  /**
   * List all available sessions with summary info
   */
  async listSessions(): Promise<
    Array<{
      sessionId: string;
      timestamp: Date;
      operation: string;
      changeCount: number;
      fromStatus: string;
      toStatus: string;
    }>
  > {
    const sessions = await this.loadSessions();
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      timestamp: s.timestamp,
      operation: s.operation,
      changeCount: s.changes.length,
      fromStatus: s.fromStatus,
      toStatus: s.toStatus,
    }));
  }

  /**
   * Delete a specific session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const data = await this.readStorage();
    const originalLength = data.sessions.length;
    data.sessions = data.sessions.filter((s) => s.sessionId !== sessionId);

    if (data.sessions.length < originalLength) {
      await this.writeStorage(data);
      return true;
    }

    return false;
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    const emptyData: RollbackStorage = {
      sessions: [],
      lastUpdated: new Date(),
    };
    await this.writeStorage(emptyData);
  }

  /**
   * Remove sessions older than specified days
   */
  async clearOldSessions(maxAgeDays: number = 30): Promise<number> {
    const data = await this.readStorage();
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const originalLength = data.sessions.length;

    data.sessions = data.sessions.filter((s) => s.timestamp >= cutoff);

    const removedCount = originalLength - data.sessions.length;
    if (removedCount > 0) {
      await this.writeStorage(data);
      console.log(
        chalk.green(
          `Cleared ${removedCount} old session(s) older than ${maxAgeDays} days`
        )
      );
    }

    return removedCount;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(operation: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedOp = operation.replace(/[^a-zA-Z0-9]/g, "-");
    return `${sanitizedOp}-${timestamp}-${random}`;
  }

  /**
   * Persist a session to storage
   */
  private async persistSession(session: RollbackSession): Promise<void> {
    try {
      const data = await this.readStorage();
      data.sessions.push(session);
      data.lastUpdated = new Date();
      await this.writeStorage(data);

      console.log(
        chalk.green(
          `✓ Recorded ${session.changes.length} status changes for rollback (session: ${session.sessionId})`
        )
      );
    } catch (error) {
      console.error(chalk.red("Failed to persist session:"), error);
      throw error;
    }
  }

  /**
   * Date reviver for JSON parsing to convert ISO strings back to Date objects
   */
  private dateReviver(key: string, value: unknown): unknown {
    // Check if value is a string that looks like an ISO date
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
    ) {
      return new Date(value);
    }
    return value;
  }

  /**
   * Read storage from disk
   */
  private async readStorage(): Promise<RollbackStorage> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const content = await fs.readFile(this.storagePath, "utf-8");
      return JSON.parse(content, this.dateReviver.bind(this));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist yet, return empty storage
        return {
          sessions: [],
          lastUpdated: new Date(),
        };
      }
      throw error;
    }
  }

  /**
   * Write storage to disk
   */
  private async writeStorage(data: RollbackStorage): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.writeFile(
      this.storagePath,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  }

  /**
   * Get page IDs that can be rolled back from a session
   */
  async getRollbackPageIds(sessionId: string): Promise<string[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }
    return session.changes.map((c) => c.pageId);
  }

  /**
   * Get original status for a specific page from a session
   */
  async getOriginalStatus(
    sessionId: string,
    pageId: string
  ): Promise<string | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }
    const change = session.changes.find((c) => c.pageId === pageId);
    return change?.originalStatus || null;
  }

  /**
   * Generate a summary of a session
   */
  async getSessionSummary(sessionId: string): Promise<{
    session: RollbackSession | null;
    canRollback: boolean;
    rollbackTargetStatus: string | null;
  }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return {
        session: null,
        canRollback: false,
        rollbackTargetStatus: null,
      };
    }

    // Determine if rollback is possible (has at least one successful change)
    const canRollback = session.summary.successfulChanges > 0;
    const rollbackTargetStatus = session.fromStatus;

    return {
      session,
      canRollback,
      rollbackTargetStatus,
    };
  }
}

/**
 * Create a singleton instance for convenience
 */
let defaultRecorder: RollbackRecorder | null = null;

/**
 * Get the default rollback recorder instance
 */
export function getRollbackRecorder(options?: RecordOptions): RollbackRecorder {
  if (!defaultRecorder) {
    defaultRecorder = new RollbackRecorder(options);
  }
  return defaultRecorder;
}

/**
 * Helper function to record status changes during a workflow
 * Automatically handles session lifecycle
 */
export async function recordStatusChanges<T>(
  operation: string,
  fromStatus: string,
  toStatus: string,
  fn: (recorder: RollbackRecorder, sessionId: string) => Promise<T>,
  options?: RecordOptions
): Promise<T> {
  const recorder = new RollbackRecorder(options);
  const sessionId = await recorder.startSession(
    operation,
    fromStatus,
    toStatus
  );

  try {
    const result = await fn(recorder, sessionId);
    await recorder.endSession();
    return result;
  } catch (error) {
    // Still save partial progress on error
    await recorder.endSession();
    throw error;
  }
}

/**
 * CLI helper to list rollback sessions
 */
export async function listRollbackSessions(): Promise<void> {
  const recorder = getRollbackRecorder();
  const sessions = await recorder.listSessions();

  if (sessions.length === 0) {
    console.log(chalk.yellow("No rollback sessions found."));
    return;
  }

  console.log(chalk.bold("\n📋 Available Rollback Sessions:\n"));

  for (const session of sessions) {
    const dateStr = session.timestamp.toLocaleString();
    const timeAgo = getTimeAgo(session.timestamp);

    console.log(chalk.cyan(`Session: ${session.sessionId}`));
    console.log(`  Operation: ${chalk.green(session.operation)}`);
    console.log(`  Time: ${dateStr} (${timeAgo})`);
    console.log(
      `  Transition: ${chalk.yellow(session.fromStatus)} → ${chalk.yellow(session.toStatus)}`
    );
    console.log(`  Changes: ${session.changeCount} page(s)\n`);
  }
}

/**
 * CLI helper to show session details
 */
export async function showSessionDetails(sessionId: string): Promise<void> {
  const recorder = getRollbackRecorder();
  const summary = await recorder.getSessionSummary(sessionId);

  if (!summary.session) {
    console.error(chalk.red(`Session not found: ${sessionId}`));
    return;
  }

  const session = summary.session;
  const dateStr = session.timestamp.toLocaleString();
  const timeAgo = getTimeAgo(session.timestamp);

  console.log(chalk.bold("\n📋 Session Details:\n"));
  console.log(chalk.cyan(`Session ID: ${session.sessionId}`));
  console.log(`Operation: ${chalk.green(session.operation)}`);
  console.log(`Time: ${dateStr} (${timeAgo})`);
  console.log(
    `Transition: ${chalk.yellow(session.fromStatus)} → ${chalk.yellow(session.toStatus)}`
  );
  console.log(`\nSummary:`);
  console.log(`  Total Changes: ${session.summary.totalChanges}`);
  console.log(
    `  Successful: ${chalk.green(session.summary.successfulChanges)}`
  );
  console.log(`  Failed: ${chalk.red(session.summary.failedChanges)}`);

  if (summary.canRollback) {
    console.log(
      `\n✓ Can rollback to status: ${chalk.green(summary.rollbackTargetStatus || "N/A")}`
    );
  } else {
    console.log(`\n✗ Cannot rollback (no successful changes)`);
  }

  console.log(`\nPage Changes (${session.changes.length}):`);
  for (const change of session.changes) {
    const title = change.pageTitle
      ? `"${change.pageTitle}"`
      : change.pageId.slice(0, 8) + "...";
    const statusIcon = change.newStatus ? "✓" : "✗";
    console.log(
      `  ${statusIcon} ${title}: ${change.originalStatus} → ${change.newStatus}`
    );
  }
}

/**
 * Calculate human-readable time ago
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
