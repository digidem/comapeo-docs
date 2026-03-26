import config from "../../docusaurus.config";
import { createSafeSlug } from "./slugUtils";
import {
  maskFencedCodeBlocks,
  maskInlineCodeSpans,
  restoreCodeMasks,
} from "./markdownUtils";

const DEFAULT_LOCALE = config.i18n.defaultLocale;
const MARKDOWN_LINK_REGEX = /(?<![!])\[([^\]]+)\]\(([^)\n]+)\)/gm;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalizeDocPathname(pathname: string): string {
  const hasTrailingSlash = pathname.endsWith("/") && pathname !== "/docs/";
  const rawSegments = pathname
    .slice("/docs/".length)
    .split("/")
    .filter(Boolean);

  // buildFrontmatter() always writes slug: /${safeSlug} (single level), so
  // parent folder segments do not appear in the public URL. Only the last
  // segment is the actual page slug; preserving parent segments produces a
  // path that does not exist and results in a 404.
  const lastSegment = rawSegments[rawSegments.length - 1];
  if (!lastSegment) {
    return "/docs";
  }

  const normalizedPath = `/docs/${createSafeSlug(safeDecode(lastSegment))}`;
  return hasTrailingSlash ? `${normalizedPath}/` : normalizedPath;
}

function normalizeDocTarget(target: string, lang: string): string {
  const [pathname, rawFragment] = target.split("#", 2);
  const localePrefix = lang === DEFAULT_LOCALE ? "" : `/${lang}`;
  const normalizedPath = normalizeDocPathname(pathname);
  const normalizedFragment = rawFragment
    ? `#${createSafeSlug(safeDecode(rawFragment))}`
    : "";

  return `${localePrefix}${normalizedPath}${normalizedFragment}`;
}

export function normalizeInternalDocLinks(
  content: string,
  lang: string
): string {
  if (!content) {
    return content;
  }

  const { content: maskedBlocks, codeBlocks } = maskFencedCodeBlocks(content);
  const { content: maskedContent, codeSpans } =
    maskInlineCodeSpans(maskedBlocks);

  const normalizedContent = maskedContent.replace(
    MARKDOWN_LINK_REGEX,
    (match, text: string, rawTarget: string) => {
      const trimmedTarget = rawTarget.trim();
      const titleMatch = trimmedTarget.match(/^(\/docs\/[^\n]*?)(\s+"[^"]*")$/);
      const target = titleMatch ? titleMatch[1] : trimmedTarget;
      const titleSuffix = titleMatch?.[2] ?? "";

      if (
        target !== "/docs" &&
        !target.startsWith("/docs/") &&
        !target.startsWith("/docs#")
      ) {
        return match;
      }

      return `[${text}](${normalizeDocTarget(target, lang)}${titleSuffix})`;
    }
  );

  return restoreCodeMasks(normalizedContent, codeBlocks, codeSpans);
}
