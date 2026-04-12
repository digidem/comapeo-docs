/**
 * Tests for push-new-translation-to-notion.ts — property handling
 *
 * Verifies that the push CLI correctly reads sourceProperties from the
 * .notion.json sidecar and passes them through to createNotionPageWithBlocks.
 *
 * Strategy: Since the push CLI auto-executes on import, we use vi.resetModules()
 * with vi.doMock() to re-import the module for each test case with fresh state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that trigger module resolution
// ---------------------------------------------------------------------------

const mockCreateNotionPageWithBlocks = vi.fn();

vi.mock("./notion-translate/translateBlocks.js", () => ({
  createNotionPageWithBlocks: mockCreateNotionPageWithBlocks,
}));

vi.mock("./notionClient.js", () => ({
  notion: {},
}));

vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTempDir(): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `push-translation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Run the push CLI with the given sidecar data and language.
 * Creates temp .md + .notion.json files, sets up argv, imports the module.
 */
async function runPushCli(
  sidecarData: Record<string, unknown>,
  language: string,
  mdContent = "---\ntitle: Test Page\n---\n\nSome content"
): Promise<Record<string, unknown>> {
  const tempDir = await createTempDir();
  const mdPath = path.join(tempDir, "test-page.md");
  const sidecarPath = path.join(tempDir, "test-page.notion.json");
  await fs.writeFile(mdPath, mdContent, "utf8");
  await fs.writeFile(sidecarPath, JSON.stringify(sidecarData, null, 2), "utf8");

  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  process.argv = [
    "bun",
    "scripts/push-new-translation-to-notion.ts",
    "--file",
    mdPath,
    "--language",
    language,
  ];
  process.env.DATA_SOURCE_ID = "test-ds-id";
  process.env.DATABASE_ID = "test-db-id";

  // Invalidate module cache to get a fresh import
  vi.resetModules();
  // Re-mock after resetModules
  vi.doMock("./notion-translate/translateBlocks.js", () => ({
    createNotionPageWithBlocks: mockCreateNotionPageWithBlocks,
  }));
  vi.doMock("./notionClient.js", () => ({
    notion: {},
  }));
  vi.doMock("dotenv", () => ({
    default: { config: vi.fn() },
  }));

  mockCreateNotionPageWithBlocks.mockResolvedValue("new-page-id");

  await import("./push-new-translation-to-notion");

  process.argv = originalArgv;
  process.env = originalEnv;

  expect(mockCreateNotionPageWithBlocks).toHaveBeenCalledTimes(1);
  const properties = mockCreateNotionPageWithBlocks.mock.calls[0][5] as Record<
    string,
    unknown
  >;

  // Clean up temp dir (after assertions so the CLI's catch handler doesn't fire)
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  return properties;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("push-new-translation-to-notion property handling", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCreateNotionPageWithBlocks.mockReset();
    // Suppress process.exit calls from the CLI's catch handler
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("passes sourceProperties through to createNotionPageWithBlocks", async () => {
    const properties = await runPushCli(
      {
        parentId: "parent-123",
        blocks: [{ type: "paragraph", paragraph: { rich_text: [] } }],
        sourceProperties: {
          "Element Type": { select: { name: "Page" } },
          Order: { number: 7 },
          Tags: { multi_select: [{ name: "guide" }] },
        },
      },
      "PT - automated"
    );

    expect(properties["Element Type"]).toEqual({ select: { name: "Page" } });
    expect(properties["Order"]).toEqual({ number: 7 });
    expect(properties["Tags"]).toEqual({
      multi_select: [{ name: "guide" }],
    });
    expect(properties["Language"]).toEqual({
      select: { name: "PT - automated" },
    });
  });

  it("works with legacy sidecar without sourceProperties (backward compat)", async () => {
    const properties = await runPushCli(
      {
        parentId: "parent-legacy",
        blocks: [{ type: "paragraph", paragraph: { rich_text: [] } }],
      },
      "ES - automated"
    );

    expect(Object.keys(properties)).toEqual(["Language"]);
    expect(properties["Language"]).toEqual({
      select: { name: "ES - automated" },
    });
  });

  it("Language from --language arg always wins over sourceProperties", async () => {
    const properties = await runPushCli(
      {
        parentId: "parent-conflict",
        blocks: [],
        sourceProperties: {
          // Stale Language that should be overridden
          Language: { select: { name: "PT - automated" } },
          "Element Type": { select: { name: "Heading" } },
        },
      },
      "ES - automated"
    );

    // CLI --language must win
    expect(properties["Language"]).toEqual({
      select: { name: "ES - automated" },
    });
    // sourceProperties still passed through
    expect(properties["Element Type"]).toEqual({ select: { name: "Heading" } });
  });

  it("includes only present sourceProperties fields when some are missing", async () => {
    const properties = await runPushCli(
      {
        parentId: "parent-partial",
        blocks: [],
        sourceProperties: {
          "Element Type": { select: { name: "Toggle" } },
          // No Order, no Tags
        },
      },
      "PT - automated"
    );

    expect(properties["Element Type"]).toEqual({ select: { name: "Toggle" } });
    expect(properties["Order"]).toBeUndefined();
    expect(properties["Tags"]).toBeUndefined();
    expect(properties["Language"]).toEqual({
      select: { name: "PT - automated" },
    });
  });
});
