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
  setCustomTransformer: vi.fn(),
  blockToMarkdown: vi.fn(),
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
  const routes = new Map<
    string,
    | { type: "success"; buffer: Buffer; contentType: string }
    | { type: "error"; error: any }
  >();

  const mockAxios = {
    get: vi.fn(async (requestUrl: string) => {
      const route = routes.get(requestUrl);
      if (!route) {
        throw new Error(`Mock URL not found: ${requestUrl}`);
      }
      if (route.type === "success") {
        return {
          data: route.buffer,
          headers: { "content-type": route.contentType },
        };
      }
      throw route.error;
    }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };

  return {
    axios: mockAxios,
    mockImageDownload: (
      url: string,
      imageBuffer: Buffer,
      contentType = "image/jpeg"
    ) => {
      routes.set(url, { type: "success", buffer: imageBuffer, contentType });
    },
    mockImageDownloadFailure: (url: string, error: any) => {
      routes.set(url, { type: "error", error });
    },
    mockMultipleImageDownloads: (
      urlMappings: Array<{ url: string; buffer: Buffer; contentType?: string }>
    ) => {
      urlMappings.forEach(({ url, buffer, contentType }) => {
        routes.set(url, {
          type: "success",
          buffer,
          contentType: contentType || "image/jpeg",
        });
      });
    },
    mockTimeoutError: (url: string) => {
      const timeoutError = new Error("timeout of 30000ms exceeded");
      (timeoutError as any).code = "ECONNABORTED";
      routes.set(url, { type: "error", error: timeoutError });
    },
    mockNetworkError: (url: string) => {
      const networkError = new Error("getaddrinfo ENOTFOUND example.com");
      (networkError as any).code = "ENOTFOUND";
      routes.set(url, { type: "error", error: networkError });
    },
    mockHttpError: (url: string, status: number, statusText: string) => {
      const httpError = new Error(`Request failed with status ${status}`);
      (httpError as any).response = { status, statusText };
      routes.set(url, { type: "error", error: httpError });
    },
    restore: () => {
      routes.clear();
      vi.restoreAllMocks();
    },
  };
};
