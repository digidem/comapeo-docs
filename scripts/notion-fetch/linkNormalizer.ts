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

  // Mask code fences and inline code so links inside literal examples are not
  // rewritten. Uses the same placeholder strategy as sanitizeMarkdownContent.
  const codeBlocks: string[] = [];
  const codeSpans: string[] = [];
  let masked = content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, (m) => {
    codeBlocks.push(m);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });
  masked = masked.replace(/`[^`\n]*`/g, (m) => {
    codeSpans.push(m);
    return `__CODESPAN_${codeSpans.length - 1}__`;
  });

  const result = masked.replace(
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

  return result
    .replace(/__CODESPAN_(\d+)__/g, (_, i) => codeSpans[parseInt(i, 10)])
    .replace(/__CODEBLOCK_(\d+)__/g, (_, i) => codeBlocks[parseInt(i, 10)]);
}
