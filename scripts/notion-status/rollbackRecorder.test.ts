/**
 * Tests for RollbackRecorder
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  RollbackRecorder,
  getRollbackRecorder,
  recordStatusChanges,
  listRollbackSessions,
  showSessionDetails,
  type StatusChangeRecord,
  type RollbackSession,
} from "./rollbackRecorder";

describe("RollbackRecorder", () => {
  let testRecorder: RollbackRecorder;
  let testStorageDir: string;
  let testStoragePath: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testStorageDir = path.join(
      ".rollback-data-test",
      `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    testStoragePath = path.join(testStorageDir, "status-rollback.json");
    testRecorder = new RollbackRecorder({ storageDir: testStorageDir });
  });

  afterEach(async () => {
    // Clean up test storage
    try {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("startSession", () => {
    it("should start a new session and return a session ID", async () => {
      const sessionId = await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
      expect(sessionId).toContain("test-operation");
    });

    it("should create a unique session ID for each session", async () => {
      const sessionId1 = await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );
      const sessionId2 = await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );

      expect(sessionId1).not.toBe(sessionId2);
    });

    it("should set current session when started", async () => {
      await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );

      const currentSession = testRecorder.getCurrentSession();
      expect(currentSession).toBeDefined();
      expect(currentSession?.operation).toBe("test-operation");
      expect(currentSession?.fromStatus).toBe("Old Status");
      expect(currentSession?.toStatus).toBe("New Status");
    });
  });

  describe("recordChange", () => {
    it("should record a status change for a page", async () => {
      await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );

      await testRecorder.recordChange("page-123", "Old Status", true);

      const currentSession = testRecorder.getCurrentSession();
      expect(currentSession?.changes).toHaveLength(1);
      expect(currentSession?.changes[0]).toMatchObject({
        pageId: "page-123",
        originalStatus: "Old Status",
        newStatus: "New Status",
      });
    });

    it("should record multiple changes", async () => {
      await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );

      await testRecorder.recordChange("page-123", "Old Status", true);
      await testRecorder.recordChange("page-456", "Old Status", true);
      await testRecorder.recordChange("page-789", "Old Status", false);

      const currentSession = testRecorder.getCurrentSession();
      expect(currentSession?.changes).toHaveLength(3);
      expect(currentSession?.summary.totalChanges).toBe(3);
      expect(currentSession?.summary.successfulChanges).toBe(2);
      expect(currentSession?.summary.failedChanges).toBe(1);
    });

    it("should include optional page title and language filter", async () => {
      await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );

      await testRecorder.recordChange("page-123", "Old Status", true, {
        pageTitle: "Test Page",
        languageFilter: "English",
      });

      const currentSession = testRecorder.getCurrentSession();
      expect(currentSession?.changes[0]).toMatchObject({
        pageId: "page-123",
        originalStatus: "Old Status",
        newStatus: "New Status",
        pageTitle: "Test Page",
        languageFilter: "English",
      });
    });

    it("should throw error if no active session", async () => {
      await expect(
        testRecorder.recordChange("page-123", "Old Status", true)
      ).rejects.toThrow("No active session");
    });
  });

  describe("endSession", () => {
    it("should persist session and clear current session", async () => {
      await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );
      await testRecorder.recordChange("page-123", "Old Status", true);
      await testRecorder.endSession();

      // Current session should be cleared
      expect(testRecorder.getCurrentSession()).toBeNull();

      // Session should be persisted
      const sessions = await testRecorder.loadSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].changes).toHaveLength(1);
    });

    it("should create storage file if it doesn't exist", async () => {
      await testRecorder.startSession(
        "test-operation",
        "Old Status",
        "New Status"
      );
      await testRecorder.endSession();

      const exists = await fs
        .access(testStoragePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("loadSessions", () => {
    it("should load all persisted sessions", async () => {
      // Create first session
      await testRecorder.startSession("operation-1", "Status A", "Status B");
      await testRecorder.recordChange("page-1", "Status A", true);
      await testRecorder.endSession();

      // Create second session
      await testRecorder.startSession("operation-2", "Status C", "Status D");
      await testRecorder.recordChange("page-2", "Status C", true);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].operation).toBe("operation-1");
      expect(sessions[1].operation).toBe("operation-2");
    });

    it("should return empty array if no sessions exist", async () => {
      const sessions = await testRecorder.loadSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe("getSession", () => {
    it("should retrieve a specific session by ID", async () => {
      await testRecorder.startSession("test-operation", "A", "B");
      await testRecorder.recordChange("page-123", "A", true);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionId = sessions[0].sessionId;

      const session = await testRecorder.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(sessionId);
    });

    it("should return null for non-existent session", async () => {
      const session = await testRecorder.getSession("non-existent");
      expect(session).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("should return summary info for all sessions", async () => {
      await testRecorder.startSession("operation-1", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.recordChange("page-2", "A", true);
      await testRecorder.endSession();

      await testRecorder.startSession("operation-2", "C", "D");
      await testRecorder.recordChange("page-3", "C", true);
      await testRecorder.endSession();

      const sessions = await testRecorder.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({
        operation: "operation-1",
        changeCount: 2,
        fromStatus: "A",
        toStatus: "B",
      });
      expect(sessions[1]).toMatchObject({
        operation: "operation-2",
        changeCount: 1,
        fromStatus: "C",
        toStatus: "D",
      });
    });
  });

  describe("deleteSession", () => {
    it("should delete a specific session", async () => {
      await testRecorder.startSession("operation-1", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.endSession();

      await testRecorder.startSession("operation-2", "C", "D");
      await testRecorder.recordChange("page-2", "C", true);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionIdToDelete = sessions[0].sessionId;

      const deleted = await testRecorder.deleteSession(sessionIdToDelete);
      expect(deleted).toBe(true);

      const remainingSessions = await testRecorder.loadSessions();
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].sessionId).not.toBe(sessionIdToDelete);
    });

    it("should return false for non-existent session", async () => {
      const deleted = await testRecorder.deleteSession("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("clearAllSessions", () => {
    it("should remove all sessions", async () => {
      await testRecorder.startSession("operation-1", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.endSession();

      await testRecorder.startSession("operation-2", "C", "D");
      await testRecorder.recordChange("page-2", "C", true);
      await testRecorder.endSession();

      await testRecorder.clearAllSessions();

      const sessions = await testRecorder.loadSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe("clearOldSessions", () => {
    it("should remove sessions older than specified days", async () => {
      // Create a session and manually age it
      await testRecorder.startSession("old-operation", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.endSession();

      // Manually modify the timestamp to make it old
      const sessions = await testRecorder.loadSessions();
      sessions[0].timestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      await testRecorder.clearAllSessions();
      // Save the modified session
      const data = {
        sessions,
        lastUpdated: new Date(),
      };
      await fs.mkdir(testStorageDir, { recursive: true });
      await fs.writeFile(
        testStoragePath,
        JSON.stringify(data, null, 2),
        "utf-8"
      );

      // Clear sessions older than 1 day
      const removedCount = await testRecorder.clearOldSessions(1);
      expect(removedCount).toBe(1);

      const remainingSessions = await testRecorder.loadSessions();
      expect(remainingSessions).toHaveLength(0);
    });

    it("should keep recent sessions", async () => {
      await testRecorder.startSession("recent-operation", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.endSession();

      const removedCount = await testRecorder.clearOldSessions(30);
      expect(removedCount).toBe(0);

      const sessions = await testRecorder.loadSessions();
      expect(sessions).toHaveLength(1);
    });
  });

  describe("getRollbackPageIds", () => {
    it("should return all page IDs from a session", async () => {
      await testRecorder.startSession("test-operation", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.recordChange("page-2", "A", true);
      await testRecorder.recordChange("page-3", "A", false);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionId = sessions[0].sessionId;

      const pageIds = await testRecorder.getRollbackPageIds(sessionId);
      expect(pageIds).toEqual(["page-1", "page-2", "page-3"]);
    });

    it("should return empty array for non-existent session", async () => {
      const pageIds = await testRecorder.getRollbackPageIds("non-existent");
      expect(pageIds).toEqual([]);
    });
  });

  describe("getOriginalStatus", () => {
    it("should return original status for a specific page", async () => {
      await testRecorder.startSession("test-operation", "Original", "New");
      await testRecorder.recordChange("page-123", "Original", true);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionId = sessions[0].sessionId;

      const originalStatus = await testRecorder.getOriginalStatus(
        sessionId,
        "page-123"
      );
      expect(originalStatus).toBe("Original");
    });

    it("should return null for non-existent page", async () => {
      await testRecorder.startSession("test-operation", "A", "B");
      await testRecorder.recordChange("page-123", "A", true);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionId = sessions[0].sessionId;

      const originalStatus = await testRecorder.getOriginalStatus(
        sessionId,
        "non-existent"
      );
      expect(originalStatus).toBeNull();
    });
  });

  describe("getSessionSummary", () => {
    it("should return session summary with rollback info", async () => {
      await testRecorder.startSession("test-operation", "A", "B");
      await testRecorder.recordChange("page-1", "A", true);
      await testRecorder.recordChange("page-2", "A", false);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionId = sessions[0].sessionId;

      const summary = await testRecorder.getSessionSummary(sessionId);
      expect(summary.session).toBeDefined();
      expect(summary.canRollback).toBe(true);
      expect(summary.rollbackTargetStatus).toBe("A");
    });

    it("should indicate cannot rollback if no successful changes", async () => {
      await testRecorder.startSession("test-operation", "A", "B");
      await testRecorder.recordChange("page-1", "A", false);
      await testRecorder.recordChange("page-2", "A", false);
      await testRecorder.endSession();

      const sessions = await testRecorder.loadSessions();
      const sessionId = sessions[0].sessionId;

      const summary = await testRecorder.getSessionSummary(sessionId);
      expect(summary.canRollback).toBe(false);
    });

    it("should return null session for non-existent ID", async () => {
      const summary = await testRecorder.getSessionSummary("non-existent");
      expect(summary.session).toBeNull();
      expect(summary.canRollback).toBe(false);
      expect(summary.rollbackTargetStatus).toBeNull();
    });
  });
});

describe("getRollbackRecorder", () => {
  it("should return a singleton instance", () => {
    const recorder1 = getRollbackRecorder();
    const recorder2 = getRollbackRecorder();
    expect(recorder1).toBe(recorder2);
  });
});

describe("recordStatusChanges helper", () => {
  let testStorageDir: string;

  beforeEach(async () => {
    testStorageDir = path.join(
      ".rollback-data-test",
      `helper-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should automatically manage session lifecycle", async () => {
    let capturedRecorder: RollbackRecorder | null = null;
    let capturedSessionId: string | null = null;

    const result = await recordStatusChanges(
      "test-operation",
      "Old",
      "New",
      async (recorder, sessionId) => {
        capturedRecorder = recorder;
        capturedSessionId = sessionId;
        await recorder.recordChange("page-123", "Old", true);
        return "test-result";
      },
      { storageDir: testStorageDir }
    );

    expect(result).toBe("test-result");
    expect(capturedSessionId).toBeDefined();
    expect(capturedRecorder).toBeDefined();

    // Session should be persisted
    const recorder = new RollbackRecorder({ storageDir: testStorageDir });
    const sessions = await recorder.loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe(capturedSessionId);
  });

  it("should persist session even on error", async () => {
    await expect(
      recordStatusChanges(
        "test-operation",
        "Old",
        "New",
        async (recorder) => {
          await recorder.recordChange("page-123", "Old", true);
          throw new Error("Test error");
        },
        { storageDir: testStorageDir }
      )
    ).rejects.toThrow("Test error");

    // Session should still be saved
    const recorder = new RollbackRecorder({ storageDir: testStorageDir });
    const sessions = await recorder.loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].changes).toHaveLength(1);
  });
});
