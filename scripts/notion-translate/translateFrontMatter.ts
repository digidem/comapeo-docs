import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_TEMPERATURE,
} from "../constants.js";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
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
  const textWithTitle = `title: ${title}\n\n markdown: ${text}`;
  try {
    // Validate input
    if (!text || typeof text !== "string") {
      console.warn(
        "Invalid text provided for translation. Using fallback text."
      );
      text = "# Empty Content\n\nThis page has no content to translate.";
    }

    // Create the prompt with the target language
    const prompt = TRANSLATION_PROMPT.replace(
      "{targetLanguage}",
      targetLanguage
    );

    // Call OpenAI API

    const TranslationResult = z.object({
      markdown: z.string(),
      title: z.string(),
    });

    const response = await openai.responses.parse({
      model,
      input: [
        { role: "system", content: prompt },
        { role: "user", content: textWithTitle },
      ],
      text: {
        format: zodTextFormat(TranslationResult, "translation"),
      },
      temperature: DEFAULT_OPENAI_TEMPERATURE,
    });
    // Extract the translated text from the response
    const translatedText = response.output_parsed;

    if (!translatedText) {
      throw new Error("No translation received from OpenAI");
    }

    return translatedText;
  } catch (error) {
    console.error("Error translating text:", error);
    // Return a fallback translation message instead of throwing
    return {
      markdown: `# Translation Error\n\nUnable to translate content to ${targetLanguage}. Please try again later.\n\nOriginal content:\n\n${text}`,
      title: title,
    };
  }
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
