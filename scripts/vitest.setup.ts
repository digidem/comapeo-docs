/**
 * Global Vitest setup file
 * Sets up environment variables and mocks for all tests
 */

import { vi } from "vitest";

// Set up environment variables before any imports
process.env.NOTION_API_KEY = "test-api-key";
process.env.DATABASE_ID = "test-database-id";
process.env.NOTION_DATABASE_ID = "test-database-id";
process.env.NODE_ENV = "test";

// Mock sharp module globally to avoid installation issues
vi.mock("sharp", () => {
  const createPipeline = () => {
    const pipeline: any = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      png: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from("")),
      toFile: vi.fn(async () => ({ size: 1000 })),
      metadata: vi.fn(async () => ({
        width: 100,
        height: 100,
        format: "jpeg",
      })),
    };
    return pipeline;
  };

  const sharpMock = vi.fn(() => createPipeline());

  return {
    default: sharpMock,
  };
});
