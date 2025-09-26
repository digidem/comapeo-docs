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

/**
 * Create a mock axios instance with configurable responses
 */
export const createMockAxios = () => {
  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };

  return {
    axios: mockAxios,
    mockImageDownload: (url: string, imageBuffer: Buffer, contentType = "image/jpeg") => {
      mockAxios.get.mockImplementation((requestUrl) => {
        if (requestUrl === url) {
          return Promise.resolve({
            data: imageBuffer,
            headers: { "content-type": contentType },
          });
        }
        return Promise.reject(new Error("Mock URL not found"));
      });
    },
    mockImageDownloadFailure: (url: string, error: any) => {
      mockAxios.get.mockImplementation((requestUrl) => {
        if (requestUrl === url) {
          return Promise.reject(error);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });
    },
    mockMultipleImageDownloads: (
      urlMappings: Array<{ url: string; buffer: Buffer; contentType?: string }>
    ) => {
      mockAxios.get.mockImplementation((requestUrl) => {
        const mapping = urlMappings.find(m => m.url === requestUrl);
        if (mapping) {
          return Promise.resolve({
            data: mapping.buffer,
            headers: { "content-type": mapping.contentType || "image/jpeg" },
          });
        }
        return Promise.reject(new Error(`Mock URL not found: ${requestUrl}`));
      });
    },
    mockTimeoutError: (url: string) => {
      const timeoutError = new Error("timeout of 30000ms exceeded");
      (timeoutError as any).code = "ECONNABORTED";
      mockAxios.get.mockImplementation((requestUrl) => {
        if (requestUrl === url) {
          return Promise.reject(timeoutError);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });
    },
    mockNetworkError: (url: string) => {
      const networkError = new Error("getaddrinfo ENOTFOUND example.com");
      (networkError as any).code = "ENOTFOUND";
      mockAxios.get.mockImplementation((requestUrl) => {
        if (requestUrl === url) {
          return Promise.reject(networkError);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });
    },
    mockHttpError: (url: string, status: number, statusText: string) => {
      const httpError = new Error(`Request failed with status ${status}`);
      (httpError as any).response = { status, statusText };
      mockAxios.get.mockImplementation((requestUrl) => {
        if (requestUrl === url) {
          return Promise.reject(httpError);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });
    },
    restore: () => {
      vi.restoreAllMocks();
    },
  };
};
