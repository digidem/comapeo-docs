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

  process.env.NOTION_API_KEY = "test-notion-api-key-123456789";
  process.env.DATABASE_ID = "12345678-1234-1234-1234-123456789abc";
  process.env.NOTION_DATABASE_ID = "12345678-1234-1234-1234-123456789abc";
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
  } = options;

  return {
    id,
    url: `https://notion.so/${id.replace(/-/g, "")}`,
    last_edited_time: lastEdited,
    created_time: createdTime,
    archived: false,
    properties: {
      "Content elements": {
        title: [{ plain_text: title }],
      },
      Title: {
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
    },
  };
}

/**
 * Create a family of related mock pages (parent with children)
 */
export function createMockPageFamily(
  options: {
    parentTitle?: string;
    parentStatus?: string;
    childCount?: number;
    childStatus?: string;
  } = {}
) {
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

  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();

  return {
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

  const axios = {
    get: mockGet,
  };

  return {
    axios,
    mockImageDownload: (
      url: string,
      data: Buffer,
      contentType = "image/jpeg"
    ) => {
      mockGet.mockImplementation(async (requestUrl: string) => {
        if (requestUrl === url) {
          return {
            data,
            headers: { "content-type": contentType },
            status: 200,
          };
        }
        throw new Error(`No mock for URL: ${requestUrl}`);
      });
    },
    mockError: (url: string, error: Error) => {
      mockGet.mockImplementation(async (requestUrl: string) => {
        if (requestUrl === url) {
          throw error;
        }
        throw new Error(`No mock for URL: ${requestUrl}`);
      });
    },
  };
}

/**
 * Create mock error with proper properties
 */
export function createMockError(message: string, code?: string) {
  const error = new Error(message);
  if (code) {
    (error as any).code = code;
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
