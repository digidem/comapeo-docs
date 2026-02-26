import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import {
  DEFAULT_OPENAI_MODEL,
  getModelParams,
  TRANSLATION_MAX_RETRIES,
  TRANSLATION_RETRY_BASE_DELAY_MS,
  OPENAI_BASE_URL,
  IS_CUSTOM_OPENAI_API,
  getMaxChunkChars,
} from "../constants.js";

// Load environment variables
dotenv.config({ override: true });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
});

const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
const MAX_RETRIES = TRANSLATION_MAX_RETRIES;
const RETRY_BASE_DELAY_MS = TRANSLATION_RETRY_BASE_DELAY_MS;
const DATA_URL_PLACEHOLDER_REGEX =
  /\/images\/__data_url_placeholder_\d+__\.png/g;
const MAX_PLACEHOLDER_INTEGRITY_RETRIES = 2;
// Translation prompt template
const TRANSLATION_PROMPT = `
# Role: Translation Assistant

You are a translation assistant, responsible for translating the text provided by users into the specified language. Please maintain the original format, including any front-matter blocks.

## Profile

- Source Language: English
- Translation Language: {targetLanguage}
- Translation Format: Maintain the original format and structure

## Goal

- Translate the text provided by the user into the specified language while preserving the original formatting.
- Ensure that front-matter (e.g., YAML metadata enclosed in ---) is correctly recognized. Do not translate metadata keys; only translate the values if appropriate.
- Avoid translation errors and ensure accuracy in the translated text.
- Preserve the original format, including code blocks, lists, tables, etc.
- If the original text includes code, translate only the text and comments within the code into the specified language.
- **Any image URL (e.g., in markdown image syntax "![alt](url)") must be maintained exactly as in the original markdown. Do not alter or translate image URLs.**

## Constraints

- Do not translate variable names, function names, class names, or module names within code.
- Do not translate tags within code blocks.
- For front-matter, preserve metadata keys and structure. Translate only the corresponding values if needed.
- Do not translate URLs, paths, or any technical identifiers.
- **Do not translate or modify any image URLs.**
- **Do not modify any paths starting with /images/ - these are canonical asset references that must remain unchanged.**
- **Do not modify placeholder image paths matching /images/__data_url_placeholder_<number>__.png.**
- Preserve all markdown formatting, including headings, lists, code blocks, etc.

## Workflow

- Follow these steps for translation:
  1. Read the text provided by the user.
  2. Identify and separate any front-matter from the main content.
  3. Translate the main content into the specified language.
  4. Reintegrate the original front-matter, preserving its format.
  5. Ensure the final output maintains the overall structure and formatting of the original document.
  6. **Ensure all image URLs remain exactly as in the original markdown.**

## Instructions

As a translation assistant, you are ready to translate the text provided by the user while maintaining all original formatting and front-matter details.

**Return your result as a JSON object with two string fields:**
- "markdown": the translated markdown content (excluding the "title: {title}" line)
- "title": the translated title string
`;

type TranslationPayload = {
  markdown: string;
  title: string;
};

export class TranslationError extends Error {
  code:
    | "quota_exceeded"
    | "authentication_failed"
    | "schema_invalid"
    | "token_overflow"
    | "transient_api_error"
    | "unexpected_error";
  isCritical: boolean;
  status?: number;

  constructor(
    message: string,
    code: TranslationError["code"],
    isCritical: boolean,
    status?: number
  ) {
    super(message);
    this.name = "TranslationError";
    this.code = code;
    this.isCritical = isCritical;
    this.status = status;
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
};

const classifyOpenAIError = (error: unknown): TranslationError => {
  const message = getErrorMessage(error);
  const status = getErrorStatus(error);

  if (
    status === 429 &&
    /quota|billing|insufficient_quota|exceeded/i.test(message)
  ) {
    return new TranslationError(
      `OpenAI quota exceeded: ${message}`,
      "quota_exceeded",
      true,
      status
    );
  }

  if (status === 401 || status === 403) {
    return new TranslationError(
      `OpenAI authentication failed: ${message}`,
      "authentication_failed",
      true,
      status
    );
  }

  // Token overflow: 400 with token limit message (must check before schema check)
  if (
    status === 400 &&
    /tokens?\s+exceed|input.*tokens.*limit|configured\s+limit\s+of\s+\d+\s+tokens|maximum\s+context\s+length|you\s+requested\s+\d+\s+tokens|context\s+length\s+is/i.test(
      message
    )
  ) {
    return new TranslationError(
      `Token overflow: ${message}`,
      "token_overflow",
      false, // Not critical — caller can retry with chunking
      status
    );
  }

  if (
    status === 400 &&
    /schema|response_format|json_schema|invalid schema/i.test(message)
  ) {
    return new TranslationError(
      `OpenAI schema error: ${message}`,
      "schema_invalid",
      true,
      status
    );
  }

  if (status === 429 || (status !== undefined && status >= 500)) {
    return new TranslationError(
      `Transient OpenAI API error: ${message}`,
      "transient_api_error",
      false,
      status
    );
  }

  return new TranslationError(
    `Unexpected translation error: ${message}`,
    "unexpected_error",
    true,
    status
  );
};

const parseTranslationPayload = (content: string): TranslationPayload => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TranslationError(
      "OpenAI returned invalid JSON translation payload",
      "schema_invalid",
      true
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { markdown?: unknown }).markdown !== "string" ||
    typeof (parsed as { title?: unknown }).title !== "string"
  ) {
    throw new TranslationError(
      "OpenAI translation payload is missing required string fields",
      "schema_invalid",
      true
    );
  }

  return {
    markdown: (parsed as { markdown: string }).markdown,
    title: (parsed as { title: string }).title,
  };
};

/**
 * Splits markdown into chunks that each fit within `maxChars`.
 * Uses fence-aware heading boundaries, then paragraph boundaries, then line boundaries.
 * @internal exported for testing
 */
export function splitMarkdownIntoChunks(
  markdown: string,
  maxChars: number
): string[] {
  if (markdown.length <= maxChars) {
    return [markdown];
  }
  const sections = splitBySections(markdown);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of sections) {
    if (currentChunk.length + section.length > maxChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      // Section itself exceeds limit — split further
      if (section.length > maxChars) {
        const subChunks = splitByParagraphs(section, maxChars);
        chunks.push(...subChunks.slice(0, -1));
        currentChunk = subChunks[subChunks.length - 1];
      } else {
        currentChunk = section;
      }
    } else {
      currentChunk += section;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/** Split markdown at heading boundaries, skipping headings inside fenced code blocks. */
function splitBySections(markdown: string): string[] {
  const parts: string[] = [];
  const lines = markdown.split("\n");
  const lastIdx = lines.length - 1;
  let current = "";
  let inFence = false;

  for (const [idx, line] of lines.entries()) {
    // Reconstruct original text: all lines except the last trailing empty get "\n" appended
    const lineWithNewline =
      idx < lastIdx ? line + "\n" : line.length > 0 ? line : "";

    // Toggle fence state on ``` or ~~~ lines
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
    }
    // Start a new section before any ATX heading (outside fences)
    if (!inFence && /^#{1,6}\s/.test(line) && current.length > 0) {
      parts.push(current);
      current = "";
    }
    current += lineWithNewline;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/** Split text at double-newline paragraph boundaries. */
function splitByParagraphs(text: string, maxChars: number): string[] {
  // Split keeping separators so reassembly via join("") is lossless.
  // Tokens alternate: content, "\n\n+" separator, content, ...
  const tokens = text.split(/(\n\n+)/);
  const chunks: string[] = [];
  let current = "";

  for (const token of tokens) {
    const isSeparator = /^\n+$/.test(token);
    const candidate = current + token;

    if (candidate.length > maxChars) {
      if (current.length > 0) {
        if (isSeparator) {
          // Separator tips us over — flush current + separator together
          chunks.push(current + token);
          current = "";
        } else {
          // Content token doesn't fit — flush current, start new chunk with token
          chunks.push(current);
          if (token.length > maxChars) {
            // Single content token exceeds limit — split by lines
            const lineChunks = splitByLines(token, maxChars);
            chunks.push(...lineChunks.slice(0, -1));
            current = lineChunks[lineChunks.length - 1];
          } else {
            current = token;
          }
        }
      } else if (!isSeparator && token.length > maxChars) {
        // Leading oversized token (current is empty) — split by lines immediately
        const lineChunks = splitByLines(token, maxChars);
        chunks.push(...lineChunks.slice(0, -1));
        current = lineChunks[lineChunks.length - 1];
      } else {
        current = candidate;
      }
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/** Last-resort split at individual line boundaries. */
function splitByLines(text: string, maxChars: number): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current.length === 0 ? line : current + "\n" + line;

    if (candidate.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current);
        // If the line itself exceeds the limit, force-split by character
        if (line.length > maxChars) {
          for (let i = 0; i < line.length; i += maxChars) {
            const segment = line.slice(i, i + maxChars);
            if (i + maxChars < line.length) {
              chunks.push(segment);
            } else {
              current = segment;
            }
          }
        } else {
          current = line;
        }
      } else {
        // Leading oversized line (current is empty) — force-split by character
        for (let i = 0; i < line.length; i += maxChars) {
          const segment = line.slice(i, i + maxChars);
          if (i + maxChars < line.length) {
            chunks.push(segment);
          } else {
            current = segment;
          }
        }
      }
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

type DataUrlPlaceholderMap = Map<string, string>;

function maskDataUrlImages(text: string): {
  maskedText: string;
  placeholders: DataUrlPlaceholderMap;
} {
  const dataUrlRegex = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi;
  const placeholders: DataUrlPlaceholderMap = new Map();
  let index = 0;

  const maskedText = text.replace(dataUrlRegex, (match) => {
    const placeholder = `/images/__data_url_placeholder_${index}__.png`;
    index++;
    placeholders.set(placeholder, match);
    return placeholder;
  });

  return { maskedText, placeholders };
}

function restoreDataUrlPlaceholders(
  text: string,
  placeholders: DataUrlPlaceholderMap
): string {
  if (placeholders.size === 0) {
    return text;
  }

  let restored = text;
  for (const [placeholder, dataUrl] of placeholders) {
    restored = restored.split(placeholder).join(dataUrl);
  }

  return restored;
}

function extractDataUrlPlaceholders(text: string): string[] {
  const matches = text.match(DATA_URL_PLACEHOLDER_REGEX) ?? [];
  return Array.from(new Set(matches));
}

function getMissingPlaceholders(
  text: string,
  requiredPlaceholders: string[]
): string[] {
  return requiredPlaceholders.filter(
    (placeholder) => !text.includes(placeholder)
  );
}

function isPlaceholderIntegrityError(
  error: unknown
): error is TranslationError {
  return (
    error instanceof TranslationError &&
    error.code === "schema_invalid" &&
    /Data URL placeholder integrity check failed/.test(error.message)
  );
}

/**
 * Translates a markdown file using OpenAI
 * @param filePath Path to the markdown file to translate
 * @param targetLanguage Target language for translation
 * @param outputPath Path to save the translated file
 * @returns Path to the translated file
 */
export async function translateMarkdownFile(
  filePath: string,
  targetLanguage: string,
  outputPath: string
): Promise<string> {
  const spinner = ora(
    `Translating ${path.basename(filePath)} to ${targetLanguage}`
  ).start();

  try {
    // Read the markdown file
    const content = await fs.readFile(filePath, "utf8");
    const fileName = path.basename(filePath, path.extname(filePath));

    // Translate the content
    const translated = await translateText(content, fileName, targetLanguage);

    // Ensure the output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write the translated content to the output file
    await fs.writeFile(outputPath, translated.markdown, "utf8");

    spinner.succeed(
      chalk.green(`Translated ${path.basename(filePath)} to ${targetLanguage}`)
    );
    return outputPath;
  } catch (error) {
    spinner.fail(
      chalk.red(
        `Failed to translate ${path.basename(filePath)}: ${error.message}`
      )
    );
    throw error;
  }
}

/** Single-call implementation that sends one request to the OpenAI API. */
async function translateTextSingleCall(
  text: string,
  title: string,
  targetLanguage: string,
  requiredPlaceholders: string[] = [],
  strictPlaceholderGuard = false
): Promise<{ markdown: string; title: string }> {
  const placeholderGuard =
    requiredPlaceholders.length > 0
      ? `\n\n${strictPlaceholderGuard ? "CRITICAL REQUIREMENT" : "Placeholder paths to preserve exactly"}:\n${requiredPlaceholders.map((placeholder) => `- ${placeholder}`).join("\n")}\n`
      : "";
  const textWithTitle = `title: ${title}\n${placeholderGuard}\nmarkdown: ${text}`;

  // Create the prompt with the target language
  const prompt = TRANSLATION_PROMPT.replace("{targetLanguage}", targetLanguage);

  // Get model-specific parameters (handles GPT-5 temperature constraints)
  // For GPT-5.2, use reasoning_effort="none" to allow custom temperature
  const modelParams = getModelParams(model, { useReasoningNone: true });

  // Use json_schema for OpenAI (strict), json_object for custom APIs (like DeepSeek)
  const responseFormat = IS_CUSTOM_OPENAI_API
    ? { type: "json_object" as const }
    : {
        type: "json_schema" as const,
        json_schema: {
          name: "translation",
          schema: {
            type: "object",
            properties: {
              markdown: { type: "string" },
              title: { type: "string" },
            },
            required: ["markdown", "title"],
            additionalProperties: false,
          },
          strict: true,
        },
      };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: textWithTitle },
        ],
        response_format: responseFormat,
        ...modelParams,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new TranslationError(
          "OpenAI returned an empty translation response",
          "schema_invalid",
          true
        );
      }

      const parsed = parseTranslationPayload(content);

      if (requiredPlaceholders.length > 0) {
        const missingPlaceholders = getMissingPlaceholders(
          parsed.markdown,
          requiredPlaceholders
        );
        if (missingPlaceholders.length > 0) {
          throw new TranslationError(
            `Data URL placeholder integrity check failed: missing ${missingPlaceholders.length} placeholder(s): ${missingPlaceholders.slice(0, 3).join(", ")}`,
            "schema_invalid",
            true
          );
        }
      }

      return parsed;
    } catch (error) {
      const classifiedError =
        error instanceof TranslationError ? error : classifyOpenAIError(error);

      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (classifiedError.code !== "transient_api_error" || isLastAttempt) {
        throw classifiedError;
      }

      const backoffMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
      const jitterMs = Math.floor(Math.random() * 250);
      await sleep(backoffMs + jitterMs);
    }
  }

  throw new TranslationError(
    "Exhausted translation retries",
    "transient_api_error",
    false
  );
}

async function translateChunkWithOverflowFallback(
  text: string,
  title: string,
  targetLanguage: string,
  placeholderGuardAttempt = 0
): Promise<{ markdown: string; title: string }> {
  const requiredPlaceholders = extractDataUrlPlaceholders(text);

  try {
    return await translateTextSingleCall(
      text,
      title,
      targetLanguage,
      requiredPlaceholders,
      placeholderGuardAttempt > 0
    );
  } catch (err) {
    if (
      isPlaceholderIntegrityError(err) &&
      placeholderGuardAttempt < MAX_PLACEHOLDER_INTEGRITY_RETRIES
    ) {
      return translateChunkWithOverflowFallback(
        text,
        title,
        targetLanguage,
        placeholderGuardAttempt + 1
      );
    }

    if (!(err instanceof TranslationError) || err.code !== "token_overflow") {
      throw err;
    }

    if (text.length < 2) {
      throw err;
    }

    const splitTarget = Math.max(Math.floor(text.length / 2), 1);
    let subChunks = splitMarkdownIntoChunks(text, splitTarget);
    if (subChunks.length <= 1) {
      const midpoint = Math.floor(text.length / 2);
      if (midpoint < 1 || midpoint >= text.length) {
        throw err;
      }
      subChunks = [text.slice(0, midpoint), text.slice(midpoint)];
    }

    let translatedTitle = title;
    let translatedMarkdown = "";
    for (const [index, chunk] of subChunks.entries()) {
      const chunkTitle = index === 0 ? title : "";
      const translated = await translateChunkWithOverflowFallback(
        chunk,
        chunkTitle,
        targetLanguage,
        0
      );
      if (index === 0) {
        translatedTitle = translated.title;
      }
      translatedMarkdown += translated.markdown;
    }

    return {
      markdown: translatedMarkdown,
      title: translatedTitle,
    };
  }
}

/**
 * Translates text using OpenAI
 * @param text Text to translate
 * @param title Title of the text
 * @param targetLanguage Target language for translation
 * @returns {markdown: string, title: string}
 */
export async function translateText(
  text: string,
  title: string,
  targetLanguage: string
): Promise<{ markdown: string; title: string }> {
  const safeText =
    typeof text === "string" && text.length > 0
      ? text
      : "# Empty Content\n\nThis page has no content to translate.";
  const { maskedText, placeholders } = maskDataUrlImages(safeText);

  // Get model-specific chunk size
  const maxChunkChars = getMaxChunkChars(model);

  // Include system prompt overhead (~1800 chars) + title prefix + "markdown: " prefix
  const estimatedTotalChars =
    TRANSLATION_PROMPT.length + title.length + 20 + maskedText.length;

  if (estimatedTotalChars <= maxChunkChars) {
    // Fast path: content fits in a single call
    const translated = await translateChunkWithOverflowFallback(
      maskedText,
      title,
      targetLanguage
    );
    return {
      markdown: restoreDataUrlPlaceholders(translated.markdown, placeholders),
      title: restoreDataUrlPlaceholders(translated.title, placeholders),
    };
  }

  // Slow path: content too large — split into chunks
  const contentBudget =
    maxChunkChars - TRANSLATION_PROMPT.length - title.length - 20;
  const chunks = splitMarkdownIntoChunks(
    maskedText,
    Math.max(contentBudget, 50_000)
  );

  let translatedTitle = title;
  const translatedChunks: string[] = [];

  for (const [i, chunk] of chunks.entries()) {
    const chunkTitle = i === 0 ? title : "";
    const result = await translateChunkWithOverflowFallback(
      chunk,
      chunkTitle,
      targetLanguage
    );

    if (i === 0) {
      translatedTitle = result.title;
    }
    translatedChunks.push(result.markdown);
  }

  // Sections already end with "\n"; join with "" to avoid extra blank lines
  return {
    markdown: restoreDataUrlPlaceholders(
      translatedChunks.join(""),
      placeholders
    ),
    title: restoreDataUrlPlaceholders(translatedTitle, placeholders),
  };
}

/**
 * Translates a string directly
 * @param text Text to translate
 * @param targetLanguage Target language for translation
 * @returns Translated text
 */
export async function translateString(
  text: string,
  targetLanguage: string
): Promise<string> {
  const spinner = ora(`Translating text to ${targetLanguage}`).start();

  try {
    const translatedText = await translateText(text, "", targetLanguage);
    spinner.succeed(chalk.green(`Text translated to ${targetLanguage}`));
    return translatedText.markdown;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to translate text: ${error.message}`));
    throw error;
  }
}
