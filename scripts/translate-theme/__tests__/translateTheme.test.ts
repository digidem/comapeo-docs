import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { translateThemeConfig } from "../translateTheme.js";

// Mock translateJson
vi.mock("../translateJson.js", () => ({
  translateJson: vi.fn().mockImplementation(async (jsonString: string) => {
    return jsonString; // Echo back for tests
  }),
}));

describe("translate-theme: translateThemeConfig orchestration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "translate-theme-test-"));
    // Setup i18n structure with pt, es, and en (which should be skipped)
    await fs.mkdir(path.join(tmpDir, "i18n", "pt"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "i18n", "es"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "i18n", "en"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("translates navbar and footer and saves to docusaurus-theme-classic/", async () => {
    const mockConfig = {
      themeConfig: {
        navbar: {
          items: [{ label: "Docs" }],
          logo: { alt: "Logo" },
        },
        footer: {
          links: [
            {
              title: "Community",
              items: [{ label: "Forum" }],
            },
          ],
        },
      },
    };

    const failures = await translateThemeConfig({
      cwd: tmpDir,
      config: mockConfig,
    });

    expect(failures).toEqual([]);

    // Check PT output
    const ptNavbarPath = path.join(
      tmpDir,
      "i18n",
      "pt",
      "docusaurus-theme-classic",
      "navbar.json"
    );
    const ptFooterPath = path.join(
      tmpDir,
      "i18n",
      "pt",
      "docusaurus-theme-classic",
      "footer.json"
    );
    await expect(fs.stat(ptNavbarPath)).resolves.toBeDefined();
    await expect(fs.stat(ptFooterPath)).resolves.toBeDefined();

    const ptNavbar = JSON.parse(await fs.readFile(ptNavbarPath, "utf8"));
    expect(ptNavbar["item.label.Docs"]).toBeDefined();
    expect(ptNavbar["logo.alt"]).toBeDefined();

    // Check EN was skipped
    const enThemeDir = path.join(
      tmpDir,
      "i18n",
      "en",
      "docusaurus-theme-classic"
    );
    await expect(fs.stat(enThemeDir)).rejects.toThrow();
  });

  it("skips translation when navbar and footer configs are empty", async () => {
    const mockConfig = {
      themeConfig: {},
    };

    const failures = await translateThemeConfig({
      cwd: tmpDir,
      config: mockConfig,
    });

    expect(failures).toEqual([]);
    const ptThemeDir = path.join(
      tmpDir,
      "i18n",
      "pt",
      "docusaurus-theme-classic"
    );
    const files = await fs.readdir(ptThemeDir);
    expect(files).toEqual([]);
  });

  it("throws if i18n directory does not exist", async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-dir-"));
    try {
      await expect(
        translateThemeConfig({
          cwd: emptyDir,
          config: { themeConfig: { navbar: { items: [{ label: "Test" }] } } },
        })
      ).rejects.toThrow();
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });

  it("captures failure when translateJson throws", async () => {
    const { translateJson } = await import("../translateJson.js");
    vi.mocked(translateJson).mockRejectedValueOnce(
      new Error("API rate limit exceeded")
    );

    const mockConfig = {
      themeConfig: {
        navbar: { items: [{ label: "Docs" }] },
      },
    };

    const failures = await translateThemeConfig({
      cwd: tmpDir,
      config: mockConfig,
      languages: ["es"],
    });

    expect(failures.length).toBe(1);
    expect(failures[0].language).toBe("es");
    expect(failures[0].title).toBe("navbar.json");
    expect(failures[0].error).toContain("API rate limit exceeded");
  });
});
