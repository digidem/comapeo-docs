import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import glob from "glob";

import { NOTION_PROPERTIES } from "../constants.js";

type NotionPage = Record<string, any>;

const EXPORT_FILENAME = "notion_db.json";

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .trim();

const getTitle = (page: NotionPage): string | undefined =>
  page?.properties?.[NOTION_PROPERTIES.TITLE]?.title?.[0]?.plain_text;

const isReadyToPublish = (page: NotionPage): boolean =>
  page?.properties?.[NOTION_PROPERTIES.STATUS]?.select?.name ===
  NOTION_PROPERTIES.READY_TO_PUBLISH;

function findMarkdownForSlug(slug: string): string[] {
  const docsPattern = path.join(process.cwd(), "docs", "**", `${slug}.md`);
  const i18nPattern = path.join(
    process.cwd(),
    "i18n",
    "*",
    "docusaurus-plugin-content-docs",
    "current",
    "**",
    `${slug}.md`
  );

  return [docsPattern, i18nPattern].flatMap((pattern) => glob.sync(pattern));
}

export interface VerificationResult {
  missing: Array<{
    id: string | null;
    slug: string;
    title: string | undefined;
  }>;
  totalReady: number;
}

export function verifyExportCoverage(
  exportPath: string = path.resolve(process.cwd(), EXPORT_FILENAME)
): VerificationResult {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(exportPath)) {
    throw new Error(
      `Notion export file not found at ${exportPath}. Run bun notion:export first.`
    );
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const payload = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  const results: NotionPage[] = payload.results ?? [];
  const readyPages = results.filter(isReadyToPublish);

  const missing = readyPages
    .map((page) => {
      const title = getTitle(page);
      const slug = title ? slugify(title) : (page.id ?? "");
      const matches = slug ? findMarkdownForSlug(slug) : [];
      if (!matches.length) {
        return {
          id: (page.id as string | undefined) ?? null,
          slug,
          title,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    missing,
    totalReady: readyPages.length,
  };
}

if (import.meta.main) {
  try {
    const { missing, totalReady } = verifyExportCoverage();
    if (missing.length === 0) {
      console.log(
        chalk.green(
          `✅ All ${totalReady} \"$[NOTION_PROPERTIES.READY_TO_PUBLISH}\" pages have generated markdown.`
        )
      );
    } else {
      console.error(
        chalk.red(
          `❌ ${missing.length} of ${totalReady} \"$[NOTION_PROPERTIES.READY_TO_PUBLISH}\" pages are missing generated markdown:`
        )
      );
      missing.forEach(({ id, slug, title }) => {
        console.error(
          chalk.yellow(
            `  - ${title ?? "(no title)"} [id: ${id ?? "?"}] slug: ${slug}`
          )
        );
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("❌ Verification failed:"), error);
    process.exit(1);
  }
}
