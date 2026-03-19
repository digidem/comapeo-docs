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
  const normalizedSegments = rawSegments.map((segment) =>
    createSafeSlug(safeDecode(segment))
  );

  const normalizedPath = normalizedSegments.length
    ? `/docs/${normalizedSegments.join("/")}`
    : "/docs";

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

  return content.replace(
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
}
