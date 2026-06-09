/**
 * Live Notion API integration test for the no-overwrite translation strategy (Issue #171).
 *
 * Purpose: Verify that createNotionPageWithBlocks() with forceCreate=true always
 * creates a new page and never deduplicates or overwrites existing translations.
 *
 * These tests make real Notion API calls. They are skipped unless ALL of the
 * following are true:
 *   - RUN_LIVE_NOTION_TESTS=1
 *   - NOTION_API_KEY is set
 *   - DATA_SOURCE_ID or DATABASE_ID is set
 *
 * Run manually with:
 *   RUN_LIVE_NOTION_TESTS=1 bunx vitest run scripts/notion-translate/__tests__/no-overwrite.live.test.ts
 *
 * Created pages are archived after each test unless NO_OVERWRITE_KEEP_PAGE=1.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Client } from "@notionhq/client";

// ---------------------------------------------------------------------------
// Env loading — MUST come before any imports that transitively load notionClient
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env");

try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    // Always overwrite these keys from .env so that the global Vitest setup
    // (vitest.setup.ts), which pre-populates fake values, does not shadow the
    // real credentials we need for live API calls.
    if (key === "NOTION_API_KEY") {
      process.env.NOTION_API_KEY = val;
    }
    if (key === "DATABASE_ID") {
      process.env.DATABASE_ID = val;
    }
    if (key === "DATA_SOURCE_ID") {
      process.env.DATA_SOURCE_ID = val;
    }
  }
} catch {
  // .env not present — rely on environment variables already set
}

// ---------------------------------------------------------------------------
// Guard — skip entire suite unless live credentials are present and opted-in
// ---------------------------------------------------------------------------

const shouldRun =
  process.env.RUN_LIVE_NOTION_TESTS === "1" &&
  !!process.env.NOTION_API_KEY &&
  !!(process.env.DATA_SOURCE_ID || process.env.DATABASE_ID);

// ---------------------------------------------------------------------------
// Types (inline to avoid importing from production modules at the top level)
// ---------------------------------------------------------------------------

type NotionPage = {
  id: string;
  archived: boolean;
  properties: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!shouldRun)(
  "no-overwrite live Notion API — forceCreate=true always creates new pages",
  { timeout: 60_000 },
  () => {
    // Lazily-imported production modules (populated in beforeAll)
    type TranslateBlocksModule = typeof import("../translateBlocks.js");
    type NotionClientModule = typeof import("../../notionClient.js");

    // A fresh Notion client with a 30s timeout so live API calls don't hit
    // the 5s test-environment timeout baked into the shared notionClient export.
    let liveNotion: Client;
    let DATA_SOURCE_ID: string;
    let DATABASE_ID: string;
    let createNotionPageWithBlocks: TranslateBlocksModule["createNotionPageWithBlocks"];

    let parentPageId: string;
    let createdPageId: string | null = null;
    let secondCreatedPageId: string | null = null;

    const keepPage = process.env.NO_OVERWRITE_KEEP_PAGE === "1";

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------

    beforeAll(async () => {
      // Create a fresh Notion client with a 30s timeout. We do NOT reuse the
      // shared `notion` export from notionClient.ts because under Vitest that
      // client is built with IS_TEST_ENV=true and a 5s timeout, which is too
      // short for live API calls.
      liveNotion = new Client({
        auth: process.env.NOTION_API_KEY!,
        timeoutMs: 30_000,
        notionVersion: "2025-09-03",
      });

      // Also import DATA_SOURCE_ID / DATABASE_ID from the shared module so we
      // target the correct database — dynamic import ensures env vars are read.
      const notionClientModule = (await import(
        "../../notionClient.js"
      )) as NotionClientModule;
      DATA_SOURCE_ID = notionClientModule.DATA_SOURCE_ID;
      DATABASE_ID = notionClientModule.DATABASE_ID;

      const translateBlocksModule = await import("../translateBlocks.js");
      createNotionPageWithBlocks =
        translateBlocksModule.createNotionPageWithBlocks;

      // Retrieve a known stable English page to use as parent reference.
      const fallbackId = "2331b08162d58090ab6ad6c1c5f60dda";
      const englishPage = (await liveNotion.pages.retrieve({
        page_id: fallbackId,
      })) as NotionPage;

      // Extract parent page ID from the "Parent item" relation, falling back to
      // the page's own ID so the test page is at least linked somewhere valid.
      const parentItemProp = englishPage.properties["Parent item"] as
        | { relation?: { id: string }[] }
        | undefined;
      parentPageId = parentItemProp?.relation?.[0]?.id ?? englishPage.id;

      const titleProp = englishPage.properties["Content elements"] as
        | { title?: { plain_text?: string }[] }
        | undefined;
      const pageTitle = titleProp?.title?.[0]?.plain_text ?? "(unknown title)";

      console.log(
        `[live-test] Using English page id=${englishPage.id} title="${pageTitle}" as parent reference`
      );
    }, 60_000);

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    afterEach(async () => {
      const idsToArchive: (string | null)[] = [
        createdPageId,
        secondCreatedPageId,
      ];

      for (const pageId of idsToArchive) {
        if (!pageId) continue;

        if (keepPage) {
          const url = `https://notion.so/${pageId.replace(/-/g, "")}`;
          console.log(`[live-test] Keeping page for inspection: ${url}`);
        } else {
          try {
            await liveNotion.pages.update({ page_id: pageId, archived: true });
          } catch (err) {
            console.warn(
              `[live-test] Failed to archive page ${pageId}:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      }

      createdPageId = null;
      secondCreatedPageId = null;
    }, 30_000);

    // -----------------------------------------------------------------------
    // Test 1 — forceCreate=true creates a new page with Language = "PT - automated"
    // -----------------------------------------------------------------------

    it('creates a new automated page with Language = "PT - automated" via forceCreate=true', async () => {
      const databaseId = DATA_SOURCE_ID || DATABASE_ID;
      const title = `[LIVE-TEST] No-Overwrite ${new Date().toISOString().slice(0, 19)}`;

      const blocks = [
        {
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [
              {
                type: "text" as const,
                text: { content: "[LIVE-TEST] automated content" },
              },
            ],
          },
        },
      ];

      const properties = {
        Language: { select: { name: "PT - automated" } },
      };

      createdPageId = await createNotionPageWithBlocks(
        liveNotion,
        parentPageId,
        databaseId,
        title,
        blocks,
        properties,
        "PT - automated",
        undefined, // existingPageId — always create new
        true // forceCreate
      );

      expect(createdPageId).toBeTruthy();
      expect(typeof createdPageId).toBe("string");

      const notionUrl = `https://notion.so/${createdPageId.replace(/-/g, "")}`;
      console.log(`[live-test] Created page: ${notionUrl}`);

      // Retrieve the page and assert its properties
      const page = (await liveNotion.pages.retrieve({
        page_id: createdPageId,
      })) as NotionPage;

      expect(page.archived).toBe(false);

      const langProp = page.properties["Language"] as
        | { select?: { name?: string } }
        | undefined;
      expect(langProp?.select?.name).toBe("PT - automated");

      const titleProp = page.properties["Content elements"] as
        | { title?: { plain_text?: string }[] }
        | undefined;
      const retrievedTitle =
        titleProp?.title?.map((t) => t.plain_text ?? "").join("") ?? "";
      expect(retrievedTitle).toBe(title);
    });

    // -----------------------------------------------------------------------
    // Test 2 — two calls with forceCreate=true produce two distinct page IDs
    // -----------------------------------------------------------------------

    it("two calls with forceCreate=true produce two distinct pages (no dedup)", async () => {
      const databaseId = DATA_SOURCE_ID || DATABASE_ID;
      const sharedTitle = `[LIVE-TEST] Dedup-check ${new Date().toISOString().slice(0, 19)}`;

      const blocks = [
        {
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [
              {
                type: "text" as const,
                text: { content: "[LIVE-TEST] automated content" },
              },
            ],
          },
        },
      ];

      const properties = {
        Language: { select: { name: "PT - automated" } },
      };

      createdPageId = await createNotionPageWithBlocks(
        liveNotion,
        parentPageId,
        databaseId,
        sharedTitle,
        blocks,
        properties,
        "PT - automated",
        undefined,
        true
      );

      secondCreatedPageId = await createNotionPageWithBlocks(
        liveNotion,
        parentPageId,
        databaseId,
        sharedTitle,
        blocks,
        properties,
        "PT - automated",
        undefined,
        true
      );

      expect(createdPageId).toBeTruthy();
      expect(secondCreatedPageId).toBeTruthy();
      expect(createdPageId).not.toBe(secondCreatedPageId);

      console.log(
        `[live-test] First page:  https://notion.so/${createdPageId!.replace(/-/g, "")}`
      );
      console.log(
        `[live-test] Second page: https://notion.so/${secondCreatedPageId!.replace(/-/g, "")}`
      );
    });
  }
);
