import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { fetchNotionData } from "./fetchNotionData";
import { runContentGeneration } from "./notion-fetch/runFetch";
import {
  gracefulShutdown,
  initializeGracefulShutdownHandlers,
} from "./notion-fetch/runtime";
import { NOTION_PROPERTIES } from "./constants";
import {
  loadPageMetadataCache,
  normalizePath,
} from "./notion-fetch/pageMetadataCache";

dotenv.config();

const TARGET_STATUS = "Auto translation generated";
const LANGUAGE_EN = "English";

type NotionPage = Record<string, any>;
type CliOptions = {
  pageId?: string;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- index access is bounded by argv length from runtime
    const arg = args[i];
    if (arg === "--page-id") {
      options.pageId = args[i + 1];
      i++;
    }
  }

  return options;
}

function normalizePageId(pageId: string): string {
  return pageId.replace(/-/g, "").toLowerCase();
}

function resolveDataSourceId(): string | undefined {
  const dataSourceId =
    process.env.DATA_SOURCE_ID ||
    process.env.DATABASE_ID ||
    process.env.NOTION_DATABASE_ID;

  if (dataSourceId) {
    process.env.DATABASE_ID = dataSourceId;
  }

  return dataSourceId;
}

function getSelectName(page: NotionPage, property: string): string | undefined {
  // eslint-disable-next-line security/detect-object-injection -- property is selected from known Notion schema constants
  return page?.properties?.[property]?.select?.name;
}

function getTitle(page: NotionPage): string {
  const titleProp = page?.properties?.[NOTION_PROPERTIES.TITLE]?.title;
  if (Array.isArray(titleProp) && titleProp.length > 0) {
    return (
      titleProp.map((entry: any) => entry?.plain_text || "").join("") ||
      "Untitled"
    );
  }
  return "Untitled";
}

function getRelationIds(page: NotionPage, property: string): string[] {
  // eslint-disable-next-line security/detect-object-injection -- property is selected from known Notion schema constants
  const relation = page?.properties?.[property]?.relation;
  if (!Array.isArray(relation)) {
    return [];
  }

  return relation
    .map((entry: any) => entry?.id)
    .filter((id: string | undefined): id is string => Boolean(id));
}

function isEnglishPage(page: NotionPage): boolean {
  return getSelectName(page, NOTION_PROPERTIES.LANGUAGE) === LANGUAGE_EN;
}

function isChildPage(page: NotionPage): boolean {
  return getRelationIds(page, "Parent item").length > 0;
}

function isPageElement(page: NotionPage): boolean {
  return getSelectName(page, NOTION_PROPERTIES.ELEMENT_TYPE) === "Page";
}

function buildPageIndex(pages: NotionPage[]): Map<string, NotionPage> {
  const index = new Map<string, NotionPage>();
  for (const page of pages) {
    if (typeof page?.id === "string") {
      index.set(page.id, page);
    }
  }
  return index;
}

function collectDescendantIds(
  rootId: string,
  pageIndex: Map<string, NotionPage>
): Set<string> {
  const descendants = new Set<string>();
  const queue = [...getRelationIds(pageIndex.get(rootId), "Sub-item")];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || descendants.has(currentId)) {
      continue;
    }

    descendants.add(currentId);

    const currentPage = pageIndex.get(currentId);
    if (!currentPage) {
      continue;
    }

    const childIds = getRelationIds(currentPage, "Sub-item");
    for (const childId of childIds) {
      if (!descendants.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return descendants;
}

function toRelativeOutputPath(outputPath: string): string {
  const absolutePath = normalizePath(outputPath);
  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath || outputPath;
}

function getTargetLanguage(locale: "pt" | "es"): string {
  return locale === "pt" ? "Portuguese" : "Spanish";
}

function getFirstOutputPath(
  cache: ReturnType<typeof loadPageMetadataCache>,
  pageId: string
): string | undefined {
  // eslint-disable-next-line security/detect-object-injection -- page IDs come from Notion API results already loaded in memory
  return cache?.pages?.[pageId]?.outputPaths?.[0];
}

function findSiblingByLanguage(
  page: NotionPage,
  allPagesById: Map<string, NotionPage>,
  targetLanguage: string
): NotionPage | undefined {
  const parentId = getRelationIds(page, "Parent item")[0];
  if (!parentId) {
    return undefined;
  }
  const candidates = Array.from(allPagesById.values());
  return candidates.find((candidate) => {
    if (!candidate || candidate.id === page.id) {
      return false;
    }
    const candidateParentId = getRelationIds(candidate, "Parent item")[0];
    if (candidateParentId !== parentId) {
      return false;
    }
    return (
      getSelectName(candidate, NOTION_PROPERTIES.LANGUAGE) === targetLanguage
    );
  });
}

async function writeComparisonReport(
  selectedPages: NotionPage[],
  roots: NotionPage[]
): Promise<string> {
  const cache = loadPageMetadataCache();
  const pageIndex = buildPageIndex(selectedPages);

  const englishChildPages = selectedPages.filter(
    (page) => isEnglishPage(page) && isChildPage(page) && isPageElement(page)
  );

  const rows: string[] = [];
  let missingPt = 0;
  let missingEs = 0;

  for (const enPage of englishChildPages) {
    const title = getTitle(enPage).replace(/\|/g, "\\|");
    const enId = enPage.id;
    const getLocalePath = (locale: "pt" | "es"): string => {
      const targetLanguage = getTargetLanguage(locale);
      const sibling = findSiblingByLanguage(enPage, pageIndex, targetLanguage);
      const localePageId = sibling?.id;

      if (!localePageId) {
        return "missing";
      }

      const output = getFirstOutputPath(cache, localePageId);
      return output ? toRelativeOutputPath(output) : "missing";
    };

    const enPath = getFirstOutputPath(cache, enId);
    const enValue = enPath ? toRelativeOutputPath(enPath) : "missing";

    const ptValue = getLocalePath("pt");
    const esValue = getLocalePath("es");

    if (ptValue === "missing") {
      missingPt++;
    }
    if (esValue === "missing") {
      missingEs++;
    }

    rows.push(`| ${title} | ${enValue} | ${ptValue} | ${esValue} |`);
  }

  const rootsList = roots
    .map((page) => `- ${getTitle(page)} (${page.id})`)
    .join("\n");

  const report = [
    "# Auto Translation Child Pages Comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Parent pages in status \`${TARGET_STATUS}\`: ${roots.length}`,
    `English child pages fetched: ${englishChildPages.length}`,
    "",
    "## Parent pages",
    rootsList || "- none",
    "",
    "## English to translation file map",
    "",
    "| English page title | EN file | PT file | ES file |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "## Missing translations",
    `- Missing Portuguese files: ${missingPt}`,
    `- Missing Spanish files: ${missingEs}`,
    "",
  ].join("\n");

  const reportPath = path.join(
    process.cwd(),
    ".cache",
    "auto-translation-children-comparison.md"
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report, "utf8");

  return reportPath;
}

async function main(): Promise<number> {
  const options = parseArgs();
  console.log(
    chalk.bold.cyan("🚀 Fetching child pages for auto-translated parents\n")
  );

  const dataSourceId = resolveDataSourceId();
  if (!process.env.NOTION_API_KEY) {
    console.error(
      chalk.red("Error: NOTION_API_KEY not found in environment variables")
    );
    await gracefulShutdown(1);
    return 1;
  }

  if (!dataSourceId) {
    console.error(
      chalk.red(
        "Error: DATA_SOURCE_ID (or DATABASE_ID / NOTION_DATABASE_ID) not found"
      )
    );
    await gracefulShutdown(1);
    return 1;
  }

  const allPages = (await fetchNotionData(undefined)) as NotionPage[];
  const pageIndex = buildPageIndex(allPages);

  const roots = allPages.filter((page) => {
    const status = getSelectName(page, NOTION_PROPERTIES.STATUS);
    const statusMatches = status === TARGET_STATUS;
    if (!statusMatches) {
      return false;
    }

    if (!options.pageId) {
      return true;
    }

    return normalizePageId(page.id) === normalizePageId(options.pageId);
  });

  if (roots.length === 0) {
    console.log(
      chalk.yellow(`No English pages found with status \"${TARGET_STATUS}\".`)
    );
    await gracefulShutdown(0);
    return 0;
  }

  const selectedIds = new Set<string>();

  for (const root of roots) {
    const descendants = collectDescendantIds(root.id, pageIndex);
    for (const id of descendants) {
      selectedIds.add(id);

      const page = pageIndex.get(id);
      if (!page || !isEnglishPage(page)) {
        continue;
      }

      const translationIds = getRelationIds(page, "Sub-item");
      for (const translationId of translationIds) {
        selectedIds.add(translationId);
      }
    }
  }

  const selectedPages = Array.from(selectedIds)
    .map((id) => pageIndex.get(id))
    .filter((page): page is NotionPage => Boolean(page));

  if (selectedPages.length === 0) {
    console.log(
      chalk.yellow("No child pages found under matching parent pages.")
    );
    await gracefulShutdown(0);
    return 0;
  }

  console.log(
    chalk.green(
      `Found ${roots.length} parent page(s) in \"${TARGET_STATUS}\" and ${selectedPages.length} child page(s) to fetch.`
    )
  );

  await runContentGeneration({
    pages: selectedPages,
    generateSpinnerText: "Generating markdown for child translation pages",
  });

  const reportPath = await writeComparisonReport(selectedPages, roots);

  console.log(chalk.green("\n✅ Child page fetch complete."));
  console.log(
    chalk.blue(`Comparison report: ${path.relative(process.cwd(), reportPath)}`)
  );

  await gracefulShutdown(0);
  return 0;
}

initializeGracefulShutdownHandlers();

await main().catch(async (error) => {
  console.error(chalk.red("❌ Script failed:"), error);
  await gracefulShutdown(1);
});
