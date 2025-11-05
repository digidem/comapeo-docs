import { describe, it, expect } from "vitest";
import { ensureBlankLineAfterStandaloneBold } from "../generateBlocks";

describe("Notion introduction markdown inspection", () => {
  it("prints the generated markdown for the Introduction page", async () => {
    const hasCredentials =
      Boolean(process.env.NOTION_API_KEY) && Boolean(process.env.DATABASE_ID);

    if (!hasCredentials) {
      console.warn(
        "Skipping markdown inspection: Notion credentials are not configured."
      );
      return;
    }

    const INTRODUCTION_PAGE_ID = "21f1b081-62d5-8008-9ca5-fad63c1a30ac";

    const { n2m } = await import("../../notionClient");

    const markdownBlocks = await n2m.pageToMarkdown(INTRODUCTION_PAGE_ID);
    const rawMarkdown = n2m.toMarkdownString(markdownBlocks).parent ?? "";
    const markdown = ensureBlankLineAfterStandaloneBold(rawMarkdown);

    // Output to the console so we can compare against the published site
    // when running the test manually.
    console.log("\n--- Intro Markdown Snapshot ---\n");
    console.log(markdown);
    console.log("\n--- End Snapshot ---\n");

    expect(markdown).toContain(
      "**Collected Data**\n\nThis section provides overviews and walkthroughs  all features related to gathering reviewing the GIS data and media that can be collected with CoMapeo."
    );
  }, 60_000);
});
