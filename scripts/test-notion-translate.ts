import { enhancedNotion, notion, getActiveDataSourceId } from "./notionClient";
import {
  main as runTranslation,
  findTranslationPage,
  fetchPageBlockCount,
} from "./notion-translate/index";
import { NOTION_PROPERTIES, MAIN_LANGUAGE, NotionPage } from "./constants";
import assert from "node:assert";

async function main() {
  console.log("Setting up test page...");
  // Use a hardcoded existing english test page ID for fast testing if possible
  // Let's use notion API to fetch an English page with title "[TEST] Installation Guide"

  const response = await enhancedNotion.dataSourcesQuery({
    data_source_id: getActiveDataSourceId(),
    filter: {
      and: [
        {
          property: NOTION_PROPERTIES.TITLE,
          title: { starts_with: "[TEST] Installation Guide" },
        },
        {
          property: NOTION_PROPERTIES.LANGUAGE,
          select: { equals: MAIN_LANGUAGE },
        },
      ],
    },
    page_size: 1,
  });

  const englishPage = response.results[0] as NotionPage;
  if (!englishPage) {
    console.error("No test page found");
    process.exit(1);
  }

  console.log(`Test page found: ${englishPage.id}`);

  console.log("Setting workflow status to 'Ready for translation'...");
  await notion.pages.update({
    page_id: englishPage.id,
    properties: {
      [NOTION_PROPERTIES.STATUS]: {
        select: { name: NOTION_PROPERTIES.READY_FOR_TRANSLATION },
      },
    },
  });

  console.log("Running translation...");
  await runTranslation({ pageId: englishPage.id });
  console.log("Translation finished");

  // Verification
  console.log("Verifying...");

  const ptPage = await findTranslationPage(englishPage, "pt-BR");
  assert(ptPage, "PT-BR translation page not found");

  const esPage = await findTranslationPage(englishPage, "es");
  assert(esPage, "ES translation page not found");

  const enBlockCount = await fetchPageBlockCount(englishPage.id);
  const ptBlockCount = await fetchPageBlockCount(ptPage.id);
  const esBlockCount = await fetchPageBlockCount(esPage.id);

  console.log(
    `Block counts - EN: ${enBlockCount}, PT: ${ptBlockCount}, ES: ${esBlockCount}`
  );
  assert.strictEqual(
    ptBlockCount,
    enBlockCount,
    "PT-BR block count does not match EN block count"
  );
  assert.strictEqual(
    esBlockCount,
    enBlockCount,
    "ES block count does not match EN block count"
  );

  console.log("Fetching blocks to verify styling and emojis...");
  // Assuming the English page has specific styling and emojis to verify
  // Let's fetch the first few blocks and check their properties.

  const enBlocks = await enhancedNotion.blocksChildrenList({
    block_id: englishPage.id,
  });
  const ptBlocks = await enhancedNotion.blocksChildrenList({
    block_id: ptPage.id,
  });

  // Basic check for image placeholders
  const enImages = enBlocks.results.filter((b: any) => b.type === "image");
  const ptImages = ptBlocks.results.filter((b: any) => b.type === "image");

  // Verify images were replaced with callout or other placeholders, keeping exact count of rich_text elements or annotations if needed
  // Now we just verify if block types other than images and exact rich_text annotations are preserved.
  const countAnnotations = (blocks: any) => {
    let count = 0;
    blocks.results.forEach((b) => {
      const type = b.type;
      if (b[type] && b[type].rich_text) {
        b[type].rich_text.forEach((rt) => {
          if (
            rt.annotations.bold ||
            rt.annotations.italic ||
            rt.annotations.color !== "default"
          )
            count++;
        });
      }
    });
    return count;
  };
  assert.strictEqual(
    countAnnotations(ptBlocks),
    countAnnotations(enBlocks),
    "Mismatch in rich text annotations count"
  );

  console.log("All assertions passed!");
}
main();
