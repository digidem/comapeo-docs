import config from "../../docusaurus.config";
import { createSafeSlug } from "./slugUtils";

const DEFAULT_LOCALE = config.i18n.defaultLocale;
const MARKDOWN_LINK_REGEX = /(^|[^!])\[([^\]]+)\]\(([^)\n]+)\)/gm;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function maskCode(content: string): {
  maskedContent: string;
  codeBlocks: string[];
  codeSpans: string[];
} {
  const codeBlocks: string[] = [];
  const codeSpans: string[] = [];

  const maskedBlocks = content.replace(
    /^ {0,3}```[^\n]*\n[\s\S]*?^ {0,3}```/gm,
    (match) => {
      codeBlocks.push(match);
      return `__LINK_NORMALIZER_CODEBLOCK_${codeBlocks.length - 1}__`;
    }
  );

  const maskedContent = maskedBlocks.replace(/`[^`\n]*`/g, (match) => {
    codeSpans.push(match);
    return `__LINK_NORMALIZER_CODESPAN_${codeSpans.length - 1}__`;
  });

  return { maskedContent, codeBlocks, codeSpans };
}

function restoreCode(
  content: string,
  codeBlocks: string[],
  codeSpans: string[]
): string {
  return content
    .replace(/__LINK_NORMALIZER_CODESPAN_(\d+)__/g, (_match, index) => {
      return codeSpans[Number(index)];
    })
    .replace(/__LINK_NORMALIZER_CODEBLOCK_(\d+)__/g, (_match, index) => {
      return codeBlocks[Number(index)];
    });
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

  const { maskedContent, codeBlocks, codeSpans } = maskCode(content);

  const normalizedContent = maskedContent.replace(
    MARKDOWN_LINK_REGEX,
    (match, prefix: string, text: string, rawTarget: string) => {
      const trimmedTarget = rawTarget.trim();
      const titleMatch = trimmedTarget.match(/^(\/docs\/[^\n]*?)(\s+"[^"]*")$/);
      const target = titleMatch ? titleMatch[1] : trimmedTarget;
      const titleSuffix = titleMatch?.[2] ?? "";

      if (!target.startsWith("/docs/")) {
        return match;
      }

      return `${prefix}[${text}](${normalizeDocTarget(target, lang)}${titleSuffix})`;
    }
  );

  return restoreCode(normalizedContent, codeBlocks, codeSpans);
}
