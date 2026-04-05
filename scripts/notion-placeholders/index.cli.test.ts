import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockFetchNotionData,
  mockAnalyzePages,
  mockGenerateAnalysisSummary,
  mockGenerateCompletePage,
  mockUpdatePages,
  mockGenerateUpdateSummary,
  mockCleanupOldBackups,
  mockGetBackupStats,
  mockLogError,
  mockLogWarning,
} = vi.hoisted(() => ({
  mockFetchNotionData: vi.fn(),
  mockAnalyzePages: vi.fn(),
  mockGenerateAnalysisSummary: vi.fn(),
  mockGenerateCompletePage: vi.fn(),
  mockUpdatePages: vi.fn(),
  mockGenerateUpdateSummary: vi.fn(),
  mockCleanupOldBackups: vi.fn(),
  mockGetBackupStats: vi.fn(),
  mockLogError: vi.fn(),
  mockLogWarning: vi.fn(),
}));

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

vi.mock("chalk", () => ({
  default: {
    bold: {
      cyan: vi.fn((text) => text),
      green: vi.fn((text) => text),
    },
    blue: vi.fn((text) => text),
    green: vi.fn((text) => text),
    gray: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
  },
}));

vi.mock("../fetchNotionData", () => ({
  fetchNotionData: mockFetchNotionData,
}));

vi.mock("./pageAnalyzer", () => ({
  PageAnalyzer: {
    analyzePages: mockAnalyzePages,
    generateAnalysisSummary: mockGenerateAnalysisSummary,
  },
}));

vi.mock("./contentGenerator", () => ({
  ContentGenerator: {
    generateCompletePage: mockGenerateCompletePage,
  },
}));

vi.mock("./notionUpdater", () => ({
  NotionUpdater: {
    updatePages: mockUpdatePages,
    generateUpdateSummary: mockGenerateUpdateSummary,
  },
}));

vi.mock("./utils/rateLimiter", () => ({
  RateLimiter: class MockRateLimiter {
    waitIfNeeded = vi.fn();
    reset = vi.fn();
    getCurrentCount = vi.fn(() => 0);
  },
}));

vi.mock("./utils/backupManager", () => ({
  BackupManager: {
    cleanupOldBackups: mockCleanupOldBackups,
    getBackupStats: mockGetBackupStats,
  },
}));

vi.mock("../shared/errors", () => ({
  ConfigError: class ConfigError extends Error {},
  logError: mockLogError,
  logWarning: mockLogWarning,
}));

describe("notion-placeholders CLI wrapper", () => {
  let originalArgv: string[];
  let originalNodeEnv: string | undefined;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  const scriptPath = fileURLToPath(new URL("./index.ts", import.meta.url));

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalNodeEnv = process.env.NODE_ENV;
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    process.env.NODE_ENV = "production";
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.DATABASE_ID = "test-database-id";
    process.argv = ["bun", scriptPath];

    mockFetchNotionData.mockResolvedValue([]);
    mockAnalyzePages.mockResolvedValue(new Map());
    mockGenerateAnalysisSummary.mockReturnValue({
      totalPages: 0,
      emptyPages: 0,
      pagesNeedingFill: 0,
      pagesNeedingEnhancement: 0,
      averageContentScore: 0,
      recentlyModifiedSkipped: 0,
    });
    mockGenerateCompletePage.mockReturnValue([]);
    mockUpdatePages.mockResolvedValue([]);
    mockGenerateUpdateSummary.mockReturnValue({
      totalPages: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      totalBlocksAdded: 0,
      errors: [],
    });
    mockCleanupOldBackups.mockReturnValue(0);
    mockGetBackupStats.mockReturnValue({
      totalBackups: 0,
      uniquePages: 0,
      totalSizeBytes: 0,
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.NOTION_API_KEY;
    delete process.env.DATABASE_ID;
    processExitSpy.mockRestore();
    vi.resetModules();
  });

  it("exits with code 0 when executed directly and completes successfully", async () => {
    vi.resetModules();
    await import("./index");

    await vi.waitFor(() => {
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });
});
