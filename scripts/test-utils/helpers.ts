/**
 * Test helper utilities for common testing operations
 */
import { promises as fs } from "fs";
import path from "path";

/**
 * Wait for a specified number of milliseconds
 */
export const waitFor = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Create a temporary file with specified content
 */
export const createTempFile = async (
  content: string,
  extension: string = ".txt"
): Promise<string> => {
  const tempPath = path.join(
    process.cwd(),
    `temp-test-${Date.now()}${extension}`
  );
  await fs.writeFile(tempPath, content, "utf8");
  return tempPath;
};

/**
 * Clean up temporary files created during tests
 */
export const cleanupTempFile = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore errors if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

/**
 * Create a temporary directory for testing
 */
export const createTempDir = async (): Promise<string> => {
  const tempDir = path.join(process.cwd(), `temp-test-dir-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
};

/**
 * Clean up temporary directory and all its contents
 */
export const cleanupTempDir = async (dirPath: string): Promise<void> => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

/**
 * Generate a random string for testing purposes
 */
export const generateRandomString = (length: number = 10): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate a mock UUID for testing
 */
export const generateMockUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Create a mock error with specific properties
 */
export const createMockError = (
  message: string,
  status?: number,
  code?: string
): Error => {
  const error = new Error(message) as any;
  if (status) error.status = status;
  if (code) error.code = code;
  return error;
};

/**
 * Assert that a function throws an error with specific message
 */
export const expectToThrow = async (
  fn: () => Promise<any> | any,
  expectedMessage?: string
): Promise<Error> => {
  try {
    await fn();
    throw new Error("Expected function to throw, but it did not");
  } catch (error) {
    if (
      expectedMessage &&
      !(error as Error).message.includes(expectedMessage)
    ) {
      throw new Error(
        `Expected error message to contain "${expectedMessage}", but got "${(error as Error).message}"`
      );
    }
    return error as Error;
  }
};

/**
 * Deep clone an object for test isolation
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Check if two objects are deeply equal
 */
export const deepEqual = (obj1: any, obj2: any): boolean => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

/**
 * Create a promise that resolves after a specified delay
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Create a promise that rejects after a specified delay
 */
export const delayedReject = (ms: number, error: Error): Promise<never> => {
  return new Promise((_resolve, reject) => setTimeout(() => reject(error), ms));
};

/**
 * Ensure Notion environment variables exist for tests and return a restore function.
 */
export const installTestNotionEnv = (): (() => void) => {
  const previousApiKey = process.env.NOTION_API_KEY;
  const previousDatabaseId = process.env.DATABASE_ID;

  process.env.NOTION_API_KEY = "test-api-key";
  process.env.DATABASE_ID = "test-database-id";

  return () => {
    if (previousApiKey === undefined) {
      delete process.env.NOTION_API_KEY;
    } else {
      process.env.NOTION_API_KEY = previousApiKey;
    }

    if (previousDatabaseId === undefined) {
      delete process.env.DATABASE_ID;
    } else {
      process.env.DATABASE_ID = previousDatabaseId;
    }
  };
};

/**
 * Retry a function with exponential backoff
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await waitFor(delay);
    }
  }

  throw lastError!;
};

/**
 * Create a mock filesystem in memory for testing
 */
export const createMockFileSystem = () => {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  return {
    files,
    directories,
    writeFile: (path: string, content: string) => {
      files.set(path, content);
      // Ensure parent directories exist
      const parentDir = path.substring(0, path.lastIndexOf("/"));
      if (parentDir) {
        directories.add(parentDir);
      }
    },
    readFile: (path: string) => {
      if (!files.has(path)) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return files.get(path);
    },
    mkdir: (path: string) => {
      directories.add(path);
    },
    exists: (path: string) => {
      return files.has(path) || directories.has(path);
    },
    clear: () => {
      files.clear();
      directories.clear();
    },
    getFileList: () => Array.from(files.keys()),
    getDirectoryList: () => Array.from(directories),
  };
};

/**
 * Capture console output during test execution
 */
export const captureConsoleOutput = () => {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  console.warn = (...args) => warns.push(args.join(" "));

  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
};
