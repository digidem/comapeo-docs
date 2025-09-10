/**
 * Reusable mock factories for testing
 */
import { vi } from "vitest";

/**
 * Create a mock Notion client with all necessary methods
 */
export const createMockNotionClient = () => ({
  databases: {
    query: vi.fn(),
  },
  pages: {
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  blocks: {
    children: {
      list: vi.fn(),
    },
  },
});

/**
 * Create a mock NotionToMarkdown instance
 */
export const createMockNotionToMarkdown = () => ({
  pageToMarkdown: vi.fn(),
  toMarkdownString: vi.fn(),
});

/**
 * Create a mock Sharp instance for image processing
 */
export const createMockSharp = () => ({
  resize: vi.fn().mockReturnThis(),
  jpeg: vi.fn().mockReturnThis(),
  png: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toBuffer: vi.fn(),
});

/**
 * Create a mock Ora spinner instance
 */
export const createMockSpinner = () => ({
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
  stop: vi.fn().mockReturnThis(),
  text: "",
  isSpinning: false,
});

/**
 * Create a mock file system promises object
 */
export const createMockFs = () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  rmdir: vi.fn(),
});

/**
 * Create a mock OpenAI client
 */
export const createMockOpenAI = () => ({
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
});

/**
 * Mock console methods while preserving original functionality
 */
export const mockConsole = () => {
  const originalConsole = { ...console };

  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    restore: () => {
      Object.assign(console, originalConsole);
    },
  };
};

/**
 * Mock process.env with test values
 */
export const mockProcessEnv = (envVars: Record<string, string>) => {
  const originalEnv = { ...process.env };

  Object.assign(process.env, envVars);

  return {
    restore: () => {
      process.env = originalEnv;
    },
  };
};

/**
 * Create a mock for setTimeout/setInterval functions
 */
export const mockTimers = () => {
  vi.useFakeTimers();

  return {
    advanceTimersByTime: vi.advanceTimersByTime,
    runAllTimers: vi.runAllTimers,
    restore: () => vi.useRealTimers(),
  };
};

/**
 * Mock network requests using fetch
 */
export const mockFetch = () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  return {
    mockResolvedValue: (value: any) => mockFetch.mockResolvedValue(value),
    mockRejectedValue: (error: any) => mockFetch.mockRejectedValue(error),
    mockImplementation: (fn: any) => mockFetch.mockImplementation(fn),
    restore: () => {
      vi.restoreAllMocks();
    },
  };
};
