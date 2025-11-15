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

vi.mock("notion-to-md", () => ({
  NotionToMarkdown: vi.fn(),
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
  let notionToMarkdownInstances: any[];
  let originalEnv: NodeJS.ProcessEnv;
  let consoleMocks: ReturnType<typeof mockConsole>;

  beforeAll(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up test environment variables
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.DATABASE_ID = "test-database-id";
    process.env.DATA_SOURCE_ID = "test-data-source-id";
    delete process.env.NOTION_DATABASE_ID;

    // Mock console methods
    consoleMocks = mockConsole();

    // Create mock client with all required methods
    mockClient = {
      dataSources: { query: vi.fn() },
      pages: { retrieve: vi.fn() },
      blocks: { children: { list: vi.fn() }, append: vi.fn(), delete: vi.fn() },
    };

    // Set up constructor mocks - create a proper constructor function
    const MockClientClass = vi.fn().mockImplementation(function (
      this: any,
      config: any
    ) {
      return mockClient;
    });

    notionToMarkdownInstances = [];

    const MockNotionToMarkdownClass = vi.fn().mockImplementation(function (
      this: any,
      config: any
    ) {
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
    });

    // Replace the Client and NotionToMarkdown with our mocks
    (Client as any).mockImplementation(MockClientClass);
    (NotionToMarkdown as any).mockImplementation(MockNotionToMarkdownClass);
  });

  afterEach(() => {
    consoleMocks.restore();
    // Clear module cache to ensure fresh imports
  });

  describe("module initialization", () => {
    it("should throw error when NOTION_API_KEY is not defined", async () => {
      // Arrange
      delete process.env.NOTION_API_KEY;

      // Act & Assert
      await expect(async () => {
        await import("./notionClient");
      }).rejects.toThrow(
        "NOTION_API_KEY is not defined in the environment variables."
      );
    });

    it("should throw error when DATABASE_ID is not defined", async () => {
      // Arrange
      delete process.env.DATABASE_ID;
      delete process.env.NOTION_DATABASE_ID;

      // Act & Assert
      await expect(async () => {
        await import("./notionClient");
      }).rejects.toThrow(
        "DATABASE_ID is not defined in the environment variables."
      );
    });

    it("should initialize successfully with valid environment variables", async () => {
      // Arrange
      process.env.NOTION_API_KEY = "valid-api-key";
      process.env.DATABASE_ID = "valid-database-id";

      // Act & Assert
      await expect(async () => {
        await import("./notionClient");
      }).not.toThrow();
    });

    it("should fall back to NOTION_DATABASE_ID when DATABASE_ID is not set", async () => {
      // Arrange
      delete process.env.DATABASE_ID;
      process.env.NOTION_DATABASE_ID = "fallback-database-id";

      const module = await import("./notionClient");

      expect(module.DATABASE_ID).toBe("fallback-database-id");
      expect(process.env.DATABASE_ID).toBe("fallback-database-id");
    });

    it("should create Client with correct configuration", async () => {
      // Arrange
      process.env.NOTION_API_KEY = "test-key";

      // Act
      await import("./notionClient");

      // Assert
      expect(Client).toHaveBeenCalledWith({
        auth: "test-key",
        timeoutMs: 5000,
        notionVersion: "2025-09-03",
      });
    });

    it("should export DATABASE_ID from environment", async () => {
      // Arrange
      process.env.DATABASE_ID = "exported-database-id";

      // Act
      const { DATABASE_ID } = await import("./notionClient");

      // Assert
      expect(DATABASE_ID).toBe("exported-database-id");
    });

    it("should register a spacer transformer for empty paragraph blocks", async () => {
      await import("./notionClient");

      expect(notionToMarkdownInstances.length).toBe(1);

      const [primaryN2M] = notionToMarkdownInstances;

      expect(primaryN2M.setCustomTransformer).toHaveBeenCalledWith(
        "paragraph",
        expect.any(Function)
      );

      const transformer = primaryN2M.setCustomTransformer.mock.calls.find(
        (call: any[]) => call[0] === "paragraph"
      )?.[1];

      expect(typeof transformer).toBe("function");

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
      expect(primaryN2M.blockToMarkdown).not.toHaveBeenCalled();

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

      primaryN2M.blockToMarkdown.mockClear();

      const markdownResult = await transformer(populatedParagraph);
      expect(primaryN2M.blockToMarkdown).toHaveBeenCalledWith(
        populatedParagraph
      );
      expect(markdownResult).toBe(`default:${populatedParagraph.id}`);
      expect(primaryN2M.customTransformers.paragraph).toBe(transformer);
    });
  });

  describe("enhancedNotion.databasesQuery", () => {
    it("should return data on successful request", async () => {
      // Arrange
      const mockData = { results: [], has_more: false };
      const queryParams = { database_id: "test-db" };
      mockClient.dataSources.query.mockResolvedValue(mockData);

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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
      const rateLimitError = createMockError("Rate limited", 429);
      const queryParams = { database_id: "test-db" };
      mockClient.dataSources.query.mockRejectedValue(rateLimitError);

      process.env.NOTION_RATE_LIMIT_THRESHOLD = "3";
      process.env.NOTION_RATE_LIMIT_WINDOW_MS = "10000";

      const { enhancedNotion, RateLimitCircuitOpenError } = await import(
        "./notionClient"
      );

      await expect(
        enhancedNotion.databasesQuery(queryParams)
      ).rejects.toBeInstanceOf(RateLimitCircuitOpenError);

      delete process.env.NOTION_RATE_LIMIT_THRESHOLD;
      delete process.env.NOTION_RATE_LIMIT_WINDOW_MS;
    });
  });

  describe("enhancedNotion.pagesRetrieve", () => {
    it("should return page data on successful request", async () => {
      // Arrange
      const pageData = { id: "page-123", properties: {} };
      const pageParams = { page_id: "page-123" };
      mockClient.pages.retrieve.mockResolvedValue(pageData);

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

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

      const { enhancedNotion } = await import("./notionClient");

      // Act
      const result = await enhancedNotion.blocksChildrenList(blocksParams);

      // Assert
      expect(result).toBe(blocksData);
      expect(mockClient.blocks.children.list).toHaveBeenCalledTimes(2);
    });
  });

  describe("retry logic utilities", () => {
    it("should back off and retry the configured number of times", async () => {
      const rateLimitError = createMockError("Rate limited", 429);
      const queryParams = { database_id: "test-db" };

      mockClient.dataSources.query.mockRejectedValue(rateLimitError);

      const { enhancedNotion } = await import("./notionClient");

      const start = Date.now();

      await expect(enhancedNotion.databasesQuery(queryParams)).rejects.toThrow(
        rateLimitError
      );

      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(200);
      expect(mockClient.dataSources.query).toHaveBeenCalledTimes(5);
    });
  });

  describe("module exports", () => {
    it("should export all required objects", async () => {
      // Act
      const exports = await import("./notionClient");

      // Assert
      expect(exports.notion).toBeDefined();
      expect(exports.n2m).toBeDefined();
      expect(exports.enhancedNotion).toBeDefined();
      expect(exports.DATABASE_ID).toBeDefined();
      expect(exports.DATA_SOURCE_ID).toBeDefined();
    });

    it("should export enhancedNotion with all required methods", async () => {
      // Act
      const { enhancedNotion } = await import("./notionClient");

      // Assert
      expect(typeof enhancedNotion.databasesQuery).toBe("function");
      expect(typeof enhancedNotion.pagesRetrieve).toBe("function");
      expect(typeof enhancedNotion.blocksChildrenList).toBe("function");
    });
  });
});
