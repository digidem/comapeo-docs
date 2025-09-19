import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const globSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock("glob", () => ({
  default: {
    sync: globSyncMock,
  },
  sync: globSyncMock,
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: readFileSyncMock,
    existsSync: existsSyncMock,
  },
  readFileSync: readFileSyncMock,
  existsSync: existsSyncMock,
}));

describe("verifyExportCoverage", () => {
  const payload = {
    results: [
      {
        id: "page-a",
        properties: {
          Status: { select: { name: "Ready to publish" } },
          "Content elements": {
            title: [{ plain_text: "Sample One" }],
          },
        },
      },
      {
        id: "page-b",
        properties: {
          Status: { select: { name: "Ready to publish" } },
          "Content elements": {
            title: [{ plain_text: "Sample Two" }],
          },
        },
      },
      {
        id: "page-c",
        properties: {
          Status: { select: { name: "Draft" } },
        },
      },
    ],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(payload));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns missing entries when markdown not found", async () => {
    globSyncMock.mockReturnValue([]);

    const { verifyExportCoverage } = await import("./verifyExportCoverage");

    const result = verifyExportCoverage("/tmp/notion_db.json");

    expect(result.totalReady).toBe(2);
    expect(result.missing).toHaveLength(2);
    expect(result.missing.map((m) => m.slug)).toEqual([
      "sample-one",
      "sample-two",
    ]);
  });

  it("ignores ready pages that have matching markdown", async () => {
    globSyncMock.mockImplementation((pattern: string) =>
      pattern.includes("sample-one") ? ["docs/sample-one.md"] : []
    );

    const { verifyExportCoverage } = await import("./verifyExportCoverage");

    const result = verifyExportCoverage("/tmp/notion_db.json");

    expect(result.totalReady).toBe(2);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].slug).toBe("sample-two");
  });

  it("throws when export file is missing", async () => {
    existsSyncMock.mockReturnValue(false);

    const { verifyExportCoverage } = await import("./verifyExportCoverage");

    expect(() => verifyExportCoverage("/tmp/notion_db.json")).toThrow(
      /notion export file not found/i
    );
  });
});
