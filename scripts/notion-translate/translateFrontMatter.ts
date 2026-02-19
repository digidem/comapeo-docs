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
} from "../constants.js";

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
const MAX_RETRIES = TRANSLATION_MAX_RETRIES;
const RETRY_BASE_DELAY_MS = TRANSLATION_RETRY_BASE_DELAY_MS;
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
  // Add "title: {title}" to the first line of the text
  const safeText =
    typeof text === "string" && text.length > 0
      ? text
      : "# Empty Content\n\nThis page has no content to translate.";
  const textWithTitle = `title: ${title}\n\nmarkdown: ${safeText}`;

  // Create the prompt with the target language
  const prompt = TRANSLATION_PROMPT.replace("{targetLanguage}", targetLanguage);

  // Get model-specific parameters (handles GPT-5 temperature constraints)
  // For GPT-5.2, use reasoning_effort="none" to allow custom temperature
  const modelParams = getModelParams(model, { useReasoningNone: true });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: textWithTitle },
        ],
        response_format: {
          type: "json_schema",
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
        },
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

      return parseTranslationPayload(content);
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
