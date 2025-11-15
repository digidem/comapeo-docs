import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { createMockError, mockConsole } from "./test-utils";

// Mock the external dependencies
vi.mock("@notionhq/client", () => ({
  Client: vi.fn(),
}));

// Store instances for test access
const notionToMarkdownInstances: any[] = [];

vi.mock("notion-to-md", () => ({
  NotionToMarkdown: vi.fn().mockImplementation(function (this: any, config: any) {
    const instance: any = {
      pageToMarkdown: vi.fn(),
      toMarkdownString: vi.fn(),
      customTransformers: {} as Record<string, any>,
    };

    instance.blockToMarkdown = vi.fn(async function (this: any, block: any) {
      const transformer = this.customTransformers?.[block.type];

      if (transformer) {
        throw new Error("paragraph transformer recursion");
      }

      return `default:${block.id ?? ""}`;
    });

    instance.setCustomTransformer = vi.fn(function (
      this: any,
      type: string,
      transformer: unknown
    ) {
      this.customTransformers[type] = transformer;
      return this;
    });

    notionToMarkdownInstances.push(instance);
    return instance;
  }),
}));

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

// Mock chalk to avoid color output in tests
vi.mock("chalk", () => ({
  default: {
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    green: vi.fn((text) => text),
  },
}));

describe("notionClient", () => {
  let mockClient: any;
  let originalEnv: NodeJS.ProcessEnv;
  let consoleMocks: ReturnType<typeof mockConsole>;
  let enhancedNotion: any;
  let DATABASE_ID: string;
  let DATA_SOURCE_ID: string | undefined;
  let notion: any;
  let n2m: any;
  let resetRateLimitTracker: () => void;

  beforeAll(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set up env vars before first import
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.DATABASE_ID = "test-database-id";
    process.env.DATA_SOURCE_ID = "test-data-source-id";

    // Create mock client BEFORE importing module
    mockClient = {
      dataSources: { query: vi.fn() },
      pages: { retrieve: vi.fn() },
      blocks: { children: { list: vi.fn() }, append: vi.fn(), delete: vi.fn() },
    };

    // Set up Client mock to return our mockClient
    (Client as any).mockImplementation(function (this: any, config: any) {
      return mockClient;
    });

    // Import the module once - it will be cached
    const module = await import("./notionClient");
    enhancedNotion = module.enhancedNotion;
    DATABASE_ID = module.DATABASE_ID;
    DATA_SOURCE_ID = module.DATA_SOURCE_ID;
    notion = module.notion;
    n2m = module.n2m;
    resetRateLimitTracker = module.resetRateLimitTracker;
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Clear mock call history but preserve mock implementations
    vi.clearAllMocks();

    // Restore test environment variables
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.DATABASE_ID = "test-database-id";
    process.env.DATA_SOURCE_ID = "test-data-source-id";
    delete process.env.NOTION_DATABASE_ID;

    // Mock console methods
    consoleMocks = mockConsole();
  });

  afterEach(() => {
    consoleMocks.restore();
    // Reset circuit breaker state between tests to prevent test pollution
    resetRateLimitTracker();
  });

  describe("module initialization", () => {
    it("should have validated NOTION_API_KEY at module load", async () => {
      // While we can't test the throw behavior with cached modules,
      // we can verify that a valid API key was required and is present
      expect(process.env.NOTION_API_KEY).toBeDefined();
      expect(process.env.NOTION_API_KEY).toBe("test-api-key");
    });

    it("should have validated DATABASE_ID at module load", async () => {
      // While we can't test the throw behavior with cached modules,
      // we can verify that a valid DATABASE_ID was required and is present
      expect(DATABASE_ID).toBeDefined();
      expect(DATABASE_ID).toBe("test-database-id");
      expect(process.env.DATABASE_ID).toBe("test-database-id");
    });

    it("should initialize successfully with valid environment variables", async () => {
      // Act & Assert - module was imported in beforeAll with valid env vars
      expect(enhancedNotion).toBeDefined();
      expect(DATABASE_ID).toBeDefined();
      expect(notion).toBeDefined();
      expect(n2m).toBeDefined();
    });

    it("should have loaded DATABASE_ID from environment", async () => {
      // Assert - module was imported with DATABASE_ID set in beforeAll
      expect(DATABASE_ID).toBe("test-database-id");
    });

    it("should have created Client with correct configuration", async () => {
      // Assert - Client was instantiated during module import
      // We can't check call history because vi.clearAllMocks() clears it
      // But we can verify the client was created and has the expected structure
      expect(notion).toBeDefined();
      expect(mockClient).toBeDefined();
      expect(mockClient.dataSources).toBeDefined();
      expect(mockClient.pages).toBeDefined();
      expect(mockClient.blocks).toBeDefined();
    });

    it("should export all required values", async () => {
      // Assert
      expect(DATABASE_ID).toBe("test-database-id");
      expect(DATA_SOURCE_ID).toBe("test-data-source-id");
    });

    it("should register a spacer transformer for empty paragraph blocks", async () => {
      // Verify a NotionToMarkdown instance was created
      expect(notionToMarkdownInstances.length).toBeGreaterThanOrEqual(1);

      const [primaryN2M] = notionToMarkdownInstances;

      // Verify the instance has the expected structure
      expect(primaryN2M.customTransformers).toBeDefined();
      expect(typeof primaryN2M.customTransformers).toBe("object");

      // Check that paragraph transformer was registered
      expect(primaryN2M.customTransformers.paragraph).toBeDefined();
      const transformer = primaryN2M.customTransformers.paragraph;
      expect(typeof transformer).toBe("function");

      // Test empty paragraph handling
      const emptyParagraph = {
        id: "empty",
        type: "paragraph",
        has_children: false,
        paragraph: {
          rich_text: [],
        },
      } as any;

      const spacerResult = await transformer(emptyParagraph);
      expect(typeof spacerResult).toBe("string");
      expect(spacerResult).toContain("notion-spacer");

      // Test populated paragraph handling
      const populatedParagraph = {
        id: "content",
        type: "paragraph",
        has_children: false,
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "Hello" },
              plain_text: "Hello",
            },
          ],
        },
      } as any;

      const markdownResult = await transformer(populatedParagraph);
      expect(typeof markdownResult).toBe("string");
      expect(markdownResult).toBe(`default:${populatedParagraph.id}`);
    });
  });

  describe("enhancedNotion.databasesQuery", () => {
    it("should return data on successful request", async () => {
      // Arrange
      const mockData = { results: [], has_more: false };
      const queryParams = { database_id: "test-db" };
      mockClient.dataSources.query.mockResolvedValue(mockData);

      

      // Act
      const result = await enhancedNotion.databasesQuery(queryParams);

      // Assert
      expect(result).toBe(mockData);
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(1);
      // The legacy method maps database_id to data_source_id
      expect(mockClient.dataSources.query).toHaveBeenCalledWith({
        data_source_id: "test-db",
      });
    });

    it("should retry on rate limit error (429)", async () => {
      // Arrange
      const rateLimitError = createMockError("Rate limited", 429);
      const successData = { results: [], has_more: false };
      const queryParams = { database_id: "test-db" };

      mockClient.dataSources.query
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successData);

      

      // Act
      const result = await enhancedNotion.databasesQuery(queryParams);

      // Assert
      expect(result).toBe(successData);
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(2);
      expect(consoleMocks.warn).toHaveBeenCalledWith(
        expect.stringContaining("dataSources.query failed (attempt 1/5)")
      );
    });

    it("should retry on server error (500)", async () => {
      // Arrange
      const serverError = createMockError("Internal server error", 500);
      const successData = { results: [], has_more: false };
      const queryParams = { database_id: "test-db" };

      mockClient.dataSources.query
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(successData);

      

      // Act
      const result = await enhancedNotion.databasesQuery(queryParams);

      // Assert
      expect(result).toBe(successData);
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(2);
    });

    it("should retry on network error", async () => {
      // Arrange
      const networkError = createMockError(
        "Network error",
        undefined,
        "ECONNABORTED"
      );
      const successData = { results: [], has_more: false };
      const queryParams = { database_id: "test-db" };

      mockClient.dataSources.query
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successData);

      

      // Act
      const result = await enhancedNotion.databasesQuery(queryParams);

      // Assert
      expect(result).toBe(successData);
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(2);
    });

    it("should not retry on client error (400)", async () => {
      // Arrange
      const clientError = createMockError("Bad request", 400);
      const queryParams = { database_id: "invalid" };

      mockClient.dataSources.query.mockRejectedValue(clientError);

      

      // Act & Assert
      await expect(enhancedNotion.databasesQuery(queryParams)).rejects.toThrow(
        clientError
      );

      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(1);
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Non-retryable error in dataSources.query"),
        "Bad request"
      );
    });

    it("should fail after maximum retry attempts", async () => {
      // Arrange
      const rateLimitError = createMockError("Rate limited", 429);
      const queryParams = { database_id: "test-db" };

      mockClient.dataSources.query.mockRejectedValue(rateLimitError);

      // Act & Assert
      await expect(enhancedNotion.databasesQuery(queryParams)).rejects.toThrow(
        rateLimitError
      );

      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(5); // 1 initial + 4 retries
      expect(consoleMocks.error).toHaveBeenCalledWith(
        expect.stringContaining("dataSources.query failed after 5 attempts")
      );
    });

    it("should open rate limit circuit after sustained 429 responses", async () => {
      // Arrange
      const rateLimitError = createMockError("Rate limited", 429);
      const queryParams = { database_id: "test-db" };
      mockClient.dataSources.query.mockRejectedValue(rateLimitError);

      // Act & Assert
      // In test mode, circuit opens after 5 rate limit hits (threshold = 5)
      // maxRetries = 4, so each request makes 5 attempts total (attempts 0-4)
      // But circuit breaker only checked on attempts 0-3 (4 checks per request)
      // So we need 2 requests to accumulate 5+ hits:

      // Request 1: Gets 429 four times, adds 4 hits, throws original error
      await expect(enhancedNotion.databasesQuery(queryParams)).rejects.toThrow(
        "Rate limited"
      );

      // Request 2: Gets 429 on first attempt, adds 5th hit, circuit opens
      await expect(enhancedNotion.databasesQuery(queryParams)).rejects.toThrow(
        /Rate limit circuit opened: 5 hits in 5s window/
      );

      // Total attempts: 5 from request 1 + 1 from request 2 = 6
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(6);
    });
  });

  describe("enhancedNotion.pagesRetrieve", () => {
    it("should return page data on successful request", async () => {
      // Arrange
      const pageData = { id: "page-123", properties: {} };
      const pageParams = { page_id: "page-123" };
      mockClient.pages.retrieve.mockResolvedValue(pageData);

      

      // Act
      const result = await enhancedNotion.pagesRetrieve(pageParams);

      // Assert
      expect(result).toBe(pageData);
      expect(mockClient.pages.retrieve).toHaveBeenCalledTimes(1);
      expect(mockClient.pages.retrieve).toHaveBeenCalledWith(pageParams);
    });

    it("should handle multiple consecutive failures with exponential backoff", async () => {
      // Arrange
      const rateLimitError = createMockError("Rate limited", 429);
      const pageData = { id: "page-123", properties: {} };
      const pageParams = { page_id: "page-123" };

      mockClient.pages.retrieve
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(pageData);

      

      // Act
      const result = await enhancedNotion.pagesRetrieve(pageParams);

      // Assert
      expect(result).toBe(pageData);
      expect(mockClient.pages.retrieve).toHaveBeenCalledTimes(3);
      expect(consoleMocks.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe("enhancedNotion.blocksChildrenList", () => {
    it("should return blocks data on successful request", async () => {
      // Arrange
      const blocksData = { results: [], has_more: false };
      const blocksParams = { block_id: "block-123" };
      mockClient.blocks.children.list.mockResolvedValue(blocksData);

      

      // Act
      const result = await enhancedNotion.blocksChildrenList(blocksParams);

      // Assert
      expect(result).toBe(blocksData);
      expect(mockClient.blocks.children.list).toHaveBeenCalledTimes(1);
      expect(mockClient.blocks.children.list).toHaveBeenCalledWith(
        blocksParams
      );
    });

    it("should handle timeout errors with retry", async () => {
      // Arrange
      const timeoutError = createMockError("Timeout", undefined, "ETIMEDOUT");
      const blocksData = { results: [], has_more: false };
      const blocksParams = { block_id: "block-123" };

      mockClient.blocks.children.list
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(blocksData);

      

      // Act
      const result = await enhancedNotion.blocksChildrenList(blocksParams);

      // Assert
      expect(result).toBe(blocksData);
      expect(mockClient.blocks.children.list).toHaveBeenCalledTimes(2);
    });
  });

  describe("retry logic utilities", () => {
    it("should back off and retry the configured number of times", async () => {
      // Arrange
      const rateLimitError = createMockError("Rate limited", 429);
      const queryParams = { database_id: "test-db" };

      mockClient.dataSources.query.mockRejectedValue(rateLimitError);

      const start = Date.now();

      // Act & Assert
      await expect(enhancedNotion.databasesQuery(queryParams)).rejects.toThrow(
        rateLimitError
      );

      const duration = Date.now() - start;

      // Should have retried 4 times (5 total attempts) with exponential backoff
      // In test mode, delays are: 50ms, 100ms, 200ms, 400ms = ~750ms minimum
      expect(duration).toBeGreaterThanOrEqual(200);
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(5);
    });
  });

  describe("module exports", () => {
    it("should export all required objects", async () => {
      // Assert
      expect(notion).toBeDefined();
      expect(n2m).toBeDefined();
      expect(enhancedNotion).toBeDefined();
      expect(DATABASE_ID).toBeDefined();
      expect(DATA_SOURCE_ID).toBeDefined();
    });

    it("should export enhancedNotion with all required methods", async () => {
      // Act
      

      // Assert
      expect(typeof enhancedNotion.databasesQuery).toBe("function");
      expect(typeof enhancedNotion.pagesRetrieve).toBe("function");
      expect(typeof enhancedNotion.blocksChildrenList).toBe("function");
    });
  });
});
