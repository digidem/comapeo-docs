/**
 * Shared markdown code-block masking utilities.
 * Both contentSanitizer and linkNormalizer use identical logic for masking
 * code blocks and inline code spans before processing, then restoring them.
 */

/** Placeholder prefix used for fenced code blocks. */
const CODEBLOCK_PREFIX = "__CODEBLOCK_";
/** Placeholder prefix used for inline code spans. */
const CODESPAN_PREFIX = "__CODESPAN_";
const PLACEHOLDER_SUFFIX = "__";

/** Checks whether `line` is a valid closing fence for a block opened with `fenceChar` of length `fenceLength`. */
function isClosingFenceLine(
  line: string,
  fenceChar: string,
  fenceLength: number
): boolean {
  let i = 0;

  while (i < line.length && line.charAt(i) === " ") {
    i++;
  }

  if (i > 3) {
    return false;
  }

  let fenceCount = 0;
  while (i < line.length && line.charAt(i) === fenceChar) {
    fenceCount++;
    i++;
  }

  if (fenceCount < fenceLength) {
    return false;
  }

  while (i < line.length) {
    if (line.charAt(i) !== " " && line.charAt(i) !== "\t") {
      return false;
    }
    i++;
  }

  return true;
}

/**
 * Masks all fenced code blocks in `content`, replacing each with a placeholder token.
 * Returns the masked content, the array of original code blocks, and their placeholder strings.
 */
export function maskFencedCodeBlocks(content: string): {
  content: string;
  codeBlocks: string[];
  placeholders: string[];
} {
  const lines = content.split("\n");
  const codeBlocks: string[] = [];
  const placeholders: string[] = [];
  const maskedLines: string[] = [];

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let blockLines: string[] = [];

  for (const line of lines) {
    if (!inFence) {
      const openingMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

      if (!openingMatch) {
        maskedLines.push(line);
        continue;
      }

      const fence = openingMatch[1];
      fenceChar = fence[0];
      fenceLength = fence.length;
      blockLines = [line];
      inFence = true;
      continue;
    }

    blockLines.push(line);

    if (isClosingFenceLine(line, fenceChar, fenceLength)) {
      codeBlocks.push(blockLines.join("\n"));
      const placeholder = `${CODEBLOCK_PREFIX}${codeBlocks.length - 1}${PLACEHOLDER_SUFFIX}`;
      placeholders.push(placeholder);
      maskedLines.push(placeholder);
      inFence = false;
      blockLines = [];
    }
  }

  if (inFence) {
    codeBlocks.push(blockLines.join("\n"));
    const placeholder = `${CODEBLOCK_PREFIX}${codeBlocks.length - 1}${PLACEHOLDER_SUFFIX}`;
    placeholders.push(placeholder);
    maskedLines.push(placeholder);
  }

  return {
    content: maskedLines.join("\n"),
    codeBlocks,
    placeholders,
  };
}

/**
 * Masks all inline code spans in `content`, replacing each with a placeholder token.
 * Returns the masked content and the array of original code spans.
 */
export function maskInlineCodeSpans(content: string): {
  content: string;
  codeSpans: string[];
} {
  const codeSpans: string[] = [];
  const output: string[] = [];

  let i = 0;
  while (i < content.length) {
    const currentChar = content.charAt(i);
    if (currentChar !== "`") {
      output.push(currentChar);
      i++;
      continue;
    }

    let openingLength = 0;
    while (
      i + openingLength < content.length &&
      content.charAt(i + openingLength) === "`"
    ) {
      openingLength++;
    }

    let scanIndex = i + openingLength;
    let closingIndex = -1;
    while (scanIndex < content.length) {
      const nextBacktick = content.indexOf("`", scanIndex);
      if (nextBacktick === -1) {
        break;
      }

      let closingLength = 0;
      while (
        nextBacktick + closingLength < content.length &&
        content.charAt(nextBacktick + closingLength) === "`"
      ) {
        closingLength++;
      }

      if (closingLength === openingLength) {
        closingIndex = nextBacktick;
        break;
      }

      scanIndex = nextBacktick + closingLength;
    }

    if (closingIndex === -1) {
      output.push(content.slice(i, i + openingLength));
      i += openingLength;
      continue;
    }

    const codeSpan = content.slice(i, closingIndex + openingLength);
    codeSpans.push(codeSpan);
    output.push(
      `${CODESPAN_PREFIX}${codeSpans.length - 1}${PLACEHOLDER_SUFFIX}`
    );
    i = closingIndex + openingLength;
  }

  return {
    content: output.join(""),
    codeSpans,
  };
}

/**
 * Restores previously masked fenced code blocks and inline code spans.
 */
export function restoreCodeMasks(
  content: string,
  codeBlocks: string[],
  codeSpans: string[]
): string {
  const restoreByIndex = (values: string[], rawIndex: string) => {
    const index = Number(rawIndex);
    return Number.isInteger(index) ? (values.at(index) ?? "") : "";
  };

  return content
    .replace(/__CODESPAN_(\d+)__/g, (_match, index) => {
      return restoreByIndex(codeSpans, index);
    })
    .replace(/__CODEBLOCK_(\d+)__/g, (_match, index) => {
      return restoreByIndex(codeBlocks, index);
    });
}
