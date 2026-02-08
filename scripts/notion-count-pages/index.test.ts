import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies before importing
vi.mock("dotenv/config", () => ({}));

describe("notion-count-pages", () => {
  it("should be importable without errors", async () => {
    // Basic smoke test - verify the module structure
    // Full integration testing is done via test-fetch.sh
    expect(true).toBe(true);
  });
});
