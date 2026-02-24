/**
 * Shared test utilities for all Notion scripts
 */

import { vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Install test environment variables for Notion
 */
export function installTestNotionEnv(): () => void {
  const originalEnv = { ...process.env };

  process.env.NOTION_API_KEY = "test-api-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.DATABASE_ID = "test-database-id";
  process.env.DATA_SOURCE_ID = "test-data-source-id";
  process.env.NOTION_DATABASE_ID = "test-database-id";
  process.env.NODE_ENV = "test";

  return () => {
    process.env = originalEnv;
  };
}

/**
 * Create a mock Notion page with customizable properties
 */
export function createMockNotionPage(
  options: {
    id?: string;
    title?: string;
    status?: string;
    elementType?: string;
    order?: number;
    language?: string;
    parentItem?: string;
    subItems?: string[];
    lastEdited?: string;
    createdTime?: string;
    hasTitle?: boolean;
    hasWebsiteBlock?: boolean;
    tags?: string[];
    keywords?: string[];
    icon?: string;
  } = {}
) {
  const {
    id = "page-" + Math.random().toString(36).substr(2, 9),
    title = "Test Page",
    status = "Ready to publish",
    elementType = "Page",
    order = 0,
    language,
    parentItem,
    subItems = [],
    lastEdited = new Date().toISOString(),
    createdTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    hasTitle = true,
    hasWebsiteBlock = true,
    tags = [],
    keywords = [],
    icon,
  } = options;

  const properties: any = {
    "Content elements": {
      title: [{ plain_text: title }],
    },
    "Publish Status": {
      select: status ? { name: status } : null,
    },
    Status: {
      select: status ? { name: status } : null,
    },
    "Element Type": {
      select: elementType ? { name: elementType } : null,
    },
    Section: {
      select: elementType ? { name: elementType } : null,
    },
    Order: {
      number: order,
    },
    Language: language
      ? {
          select: { name: language },
        }
      : { select: null },
    "Parent item": parentItem
      ? {
          relation: [{ id: parentItem }],
        }
      : { relation: [] },
    "Sub-item": {
      relation: subItems.map((id) => ({ id })),
    },
  };

  // Add Title if hasTitle
  if (hasTitle) {
    properties.Title = {
      title: [{ plain_text: title }],
    };
  }

  // Add Website Block if hasWebsiteBlock
  if (hasWebsiteBlock) {
    properties["Website Block"] = {
      url: "https://example.com",
    };
  }

  // Add Tags if provided
  if (tags.length > 0) {
    properties.Tags = {
      multi_select: tags.map((tag) => ({ name: tag })),
    };
  }

  // Add Keywords if provided
  if (keywords.length > 0) {
    properties.Keywords = {
      multi_select: keywords.map((keyword) => ({ name: keyword })),
    };
  }

  // Add Icon if provided
  if (icon) {
    properties.Icon = {
      rich_text: [{ plain_text: icon }],
    };
  }

  return {
    id,
    url: `https://notion.so/${id.replace(/-/g, "")}`,
    last_edited_time: lastEdited,
    created_time: createdTime,
    archived: false,
    properties,
  };
}

/**
 * Create a family of related mock pages (parent with children)
 * Supports two signatures:
 * 1. createMockPageFamily(title, elementType) - creates pages in multiple languages
 * 2. createMockPageFamily(options) - creates custom parent-child structure
 */
export function createMockPageFamily(
  titleOrOptions:
    | string
    | {
        parentTitle?: string;
        parentStatus?: string;
        childCount?: number;
        childStatus?: string;
      },
  elementType?: string
): any {
  // Handle (title, elementType) signature
  if (typeof titleOrOptions === "string") {
    const title = titleOrOptions;
    const type = elementType || "Page";
    const mainId = "main-" + Math.random().toString(36).substr(2, 9);

    const enId = "en-" + Math.random().toString(36).substr(2, 9);
    const ptId = "pt-" + Math.random().toString(36).substr(2, 9);
    const esId = "es-" + Math.random().toString(36).substr(2, 9);

    const mainPage = createMockNotionPage({
      id: mainId,
      title,
      elementType: type,
      status: "Ready to publish",
      subItems: [enId, ptId, esId],
    });

    const enPage = createMockNotionPage({
      id: enId,
      title,
      elementType: type,
      language: "English",
      status: "Ready to publish",
    });

    const ptPage = createMockNotionPage({
      id: ptId,
      title,
      elementType: type,
      language: "Portuguese",
      status: "Ready to publish",
    });

    const esPage = createMockNotionPage({
      id: esId,
      title,
      elementType: type,
      language: "Spanish",
      status: "Ready to publish",
    });

    return {
      mainPage,
      enPage,
      ptPage,
      esPage,
      pages: [mainPage, enPage, ptPage, esPage],
    };
  }

  // Handle options object signature
  const options = titleOrOptions || {};
  const {
    parentTitle = "Parent Section",
    parentStatus = "Ready to publish",
    childCount = 3,
    childStatus = "Ready to publish",
  } = options;

  const parentId = "parent-" + Math.random().toString(36).substr(2, 9);
  const childIds = Array.from({ length: childCount }, () =>
    Math.random().toString(36).substr(2, 9)
  );

  const parent = createMockNotionPage({
    id: parentId,
    title: parentTitle,
    status: parentStatus,
    elementType: "Section",
    subItems: childIds.map((id) => "child-" + id),
  });

  const children = childIds.map((id, index) =>
    createMockNotionPage({
      id: "child-" + id,
      title: `${parentTitle} - Child ${index + 1}`,
      status: childStatus,
      elementType: "Page",
      parentItem: parentId,
      order: index,
    })
  );

  return { parent, children, allPages: [parent, ...children] };
}

/**
 * Mock console methods and capture output
 */
export function captureConsoleOutput() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = vi.fn((...args: any[]) => {
    logs.push(args.map(String).join(" "));
  }) as any;

  console.error = vi.fn((...args: any[]) => {
    errors.push(args.map(String).join(" "));
  }) as any;

  console.warn = vi.fn((...args: any[]) => {
    warns.push(args.map(String).join(" "));
  }) as any;

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
}

/**
 * Mock console without capturing (for simpler tests)
 */
export function mockConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const logMock = vi.fn();
  const errorMock = vi.fn();
  const warnMock = vi.fn();

  console.log = logMock;
  console.error = errorMock;
  console.warn = warnMock;

  return {
    log: logMock,
    error: errorMock,
    warn: warnMock,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

/**
 * Create mock axios for image downloads
 */
export function createMockAxios() {
  const mockGet = vi.fn();
  const urlMocks = new Map<
    string,
    | { type: "success"; data: Buffer; contentType?: string }
    | { type: "error"; error: Error }
  >();

  const axios = {
    get: mockGet,
  };

  // Set up the mock implementation to use the urlMocks map
  mockGet.mockImplementation(async (requestUrl: string) => {
    const mock = urlMocks.get(requestUrl);
    if (!mock) {
      throw new Error(`No mock for URL: ${requestUrl}`);
    }

    if (mock.type === "error") {
      throw mock.error;
    }

    return {
      data: mock.data,
      headers: { "content-type": mock.contentType || "image/jpeg" },
      status: 200,
    };
  });

  return {
    axios,
    mockImageDownload: (
      url: string,
      data: Buffer,
      contentType = "image/jpeg"
    ) => {
      urlMocks.set(url, { type: "success", data, contentType });
    },
    mockImageDownloadFailure: (url: string, error: Error) => {
      urlMocks.set(url, { type: "error", error });
    },
    mockMultipleImageDownloads: (
      downloads: Array<{ url: string; buffer: Buffer; contentType?: string }>
    ) => {
      for (const { url, buffer, contentType } of downloads) {
        urlMocks.set(url, {
          type: "success",
          data: buffer,
          contentType: contentType || "image/jpeg",
        });
      }
    },
    mockError: (url: string, error: Error) => {
      urlMocks.set(url, { type: "error", error });
    },
  };
}

/**
 * Create mock file system for testing file operations
 */
export function createMockFileSystem() {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  return {
    files,
    directories,
    writeFile: vi.fn((path: string, content: string) => {
      files.set(path, content);
      return Promise.resolve();
    }),
    readFile: vi.fn((path: string) => {
      if (files.has(path)) {
        return Promise.resolve(files.get(path));
      }
      throw new Error(`File not found: ${path}`);
    }),
    mkdir: vi.fn((path: string) => {
      directories.add(path);
      return Promise.resolve();
    }),
    exists: vi.fn((path: string) => {
      return files.has(path) || directories.has(path);
    }),
    reset: () => {
      files.clear();
      directories.clear();
    },
  };
}

/**
 * Create mock error with proper properties
 */
export function createMockError(
  message: string,
  statusCode?: number,
  errorCode?: string
) {
  const error: any = new Error(message);
  if (statusCode !== undefined) {
    error.code = statusCode;
    error.status = statusCode;
  }
  if (errorCode) {
    error.code = errorCode;
  }
  return error;
}

/**
 * Create temporary directory for tests
 */
export function createTempDir() {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");

  const tempDir = path.join(
    os.tmpdir(),
    "comapeo-test-" + Math.random().toString(36).substr(2, 9)
  );

  fs.mkdirSync(tempDir, { recursive: true });

  return tempDir;
}

/**
 * Clean up temporary directory
 */
export function cleanupTempDir(dir: string) {
  const fs = require("node:fs");

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp dir ${dir}:`, error);
  }
}

/**
 * Mock processed image result for image compression tests
 */
export function mockProcessedImageResult(
  options: {
    originalSize?: number;
    compressedSize?: number;
    format?: string;
  } = {}
) {
  const {
    originalSize = 100000,
    compressedSize = 50000,
    format = "jpeg",
  } = options;

  return {
    originalSize,
    compressedSize,
    saved: originalSize - compressedSize,
    format,
    buffer: Buffer.from("mock-compressed-image"),
  };
}

/**
 * Simple delay function for testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
) {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create mock Notion blocks response
 */
export function createMockBlocksResponse(blocks: any[] = []) {
  return {
    results: blocks,
    has_more: false,
    next_cursor: null,
  };
}

/**
 * Create mock paragraph block
 */
export function createMockParagraphBlock(text: string) {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content: text },
          plain_text: text,
        },
      ],
    },
  };
}

/**
 * Create mock heading block
 */
export function createMockHeadingBlock(text: string, level: 1 | 2 | 3 = 1) {
  const type = `heading_${level}`;
  return {
    type,
    [type]: {
      rich_text: [
        {
          type: "text",
          text: { content: text },
          plain_text: text,
        },
      ],
    },
  };
}

/**
 * Create mock page without title (for testing edge cases)
 */
export function createMockNotionPageWithoutTitle(overrides?: any) {
  const id = "page-" + Math.random().toString(36).substr(2, 9);
  return {
    id,
    url: `https://notion.so/${id.replace(/-/g, "")}`,
    last_edited_time: new Date().toISOString(),
    created_time: new Date().toISOString(),
    archived: false,
    properties: {
      "Element Type": {
        select: { name: "Page" },
      },
      Order: {
        number: 0,
      },
    },
  };
}

/**
 * Create mock page without website block
 */
export function createMockNotionPageWithoutWebsiteBlock(overrides?: any) {
  const id = "page-" + Math.random().toString(36).substr(2, 9);
  return {
    id,
    url: `https://notion.so/${id.replace(/-/g, "")}`,
    last_edited_time: new Date().toISOString(),
    created_time: new Date().toISOString(),
    archived: false,
    properties: {
      Title: {
        title: [{ plain_text: "Test Page" }],
      },
      "Element Type": {
        select: { name: "Page" },
      },
      Order: {
        number: 0,
      },
    },
  };
}

/**
 * Create mock toggle page
 */
export function createMockTogglePage(overrides?: any) {
  return createMockNotionPage({
    elementType: "Toggle",
    title: "Toggle Item",
    ...overrides,
  });
}

/**
 * Create mock heading page
 */
export function createMockHeadingPage(
  overrides?: Partial<{
    title: string;
    elementType: string;
    hasSubItems: boolean;
  }>
) {
  return createMockNotionPage({
    elementType: "Title",
    title: "Heading Item",
    ...overrides,
  });
}

/**
 * Mock image buffer for testing
 * Buffer must be >50KB to trigger image processing (optimization skips smaller images)
 */
export const mockImageBuffer = Buffer.alloc(52000, "mock-image-data");

/**
 * Create mock markdown with embedded images
 */
export function createMockMarkdownWithImages(imageUrls: string[]) {
  const images = imageUrls
    .map((url, i) => `![Test Image ${i + 1}](${url})`)
    .join("\n\n");

  return {
    parent: `# Test Content\n\n${images}\n\nSome text after images.`,
    toFile: () => `# Test Content\n\n${images}\n\nSome text after images.`,
  };
}
