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

function maskFencedCodeBlocks(content: string): {
  maskedContent: string;
  codeBlocks: string[];
} {
  const codeBlocks: string[] = [];
  const lines = content.split("\n");
  const output: string[] = [];

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let fencedBlock: string[] = [];

  for (const line of lines) {
    if (!inFence) {
      const openMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (openMatch) {
        inFence = true;
        fenceChar = openMatch[1][0];
        fenceLength = openMatch[1].length;
        fencedBlock = [line];
        continue;
      }

      output.push(line);
      continue;
    }

    fencedBlock.push(line);

    const closeMatch = /^ {0,3}([`~]{3,})\s*$/.exec(line);
    if (
      closeMatch &&
      closeMatch[1][0] === fenceChar &&
      closeMatch[1].length >= fenceLength
    ) {
      codeBlocks.push(fencedBlock.join("\n"));
      output.push(`__LINK_NORMALIZER_CODEBLOCK_${codeBlocks.length - 1}__`);
      inFence = false;
      fenceChar = "";
      fenceLength = 0;
      fencedBlock = [];
    }
  }

  if (inFence) {
    output.push(fencedBlock.join("\n"));
  }

  return { maskedContent: output.join("\n"), codeBlocks };
}

function maskInlineCode(content: string): {
  maskedContent: string;
  codeSpans: string[];
} {
  const codeSpans: string[] = [];
  const output: string[] = [];

  let index = 0;

  while (index < content.length) {
    const char = content.charAt(index);
    if (char !== "`") {
      output.push(char);
      index++;
      continue;
    }

    let openerLength = 1;
    while (content.charAt(index + openerLength) === "`") {
      openerLength++;
    }

    let cursor = index + openerLength;
    let closingIndex = -1;
    while (cursor < content.length) {
      if (content.charAt(cursor) !== "`") {
        cursor++;
        continue;
      }

      let runLength = 1;
      while (content.charAt(cursor + runLength) === "`") {
        runLength++;
      }

      if (runLength === openerLength) {
        closingIndex = cursor;
        break;
      }

      cursor += runLength;
    }

    if (closingIndex === -1) {
      output.push(content.slice(index));
      break;
    }

    const codeSpan = content.slice(index, closingIndex + openerLength);
    codeSpans.push(codeSpan);
    output.push(`__LINK_NORMALIZER_CODESPAN_${codeSpans.length - 1}__`);
    index = closingIndex + openerLength;
  }

  return { maskedContent: output.join(""), codeSpans };
}

function restoreCode(
  content: string,
  codeBlocks: string[],
  codeSpans: string[]
): string {
  const restoreByIndex = (values: string[], rawIndex: string) => {
    const index = Number(rawIndex);
    return Number.isInteger(index) ? (values.at(index) ?? "") : "";
  };

  return content
    .replace(/__LINK_NORMALIZER_CODESPAN_(\d+)__/g, (_match, index) => {
      return restoreByIndex(codeSpans, index);
    })
    .replace(/__LINK_NORMALIZER_CODEBLOCK_(\d+)__/g, (_match, index) => {
      return restoreByIndex(codeBlocks, index);
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

  const { maskedContent: maskedBlocks, codeBlocks } =
    maskFencedCodeBlocks(content);
  const { maskedContent, codeSpans } = maskInlineCode(maskedBlocks);

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
