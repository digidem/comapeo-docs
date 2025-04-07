import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_TEMPERATURE, DEFAULT_OPENAI_MAX_TOKENS } from './constants.js';

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

## Constraints

- Do not translate variable names, function names, class names, or module names within code.
- Do not translate tags within code blocks.
- For front-matter, preserve metadata keys and structure. Translate only the corresponding values if needed.
- Do not translate URLs, paths, or any technical identifiers.
- Preserve all markdown formatting, including headings, lists, code blocks, etc.

## Workflow

- Follow these steps for translation:
  1. Read the text provided by the user.
  2. Identify and separate any front-matter from the main content.
  3. Translate the main content into the specified language.
  4. Reintegrate the original front-matter, preserving its format.
  5. Ensure the final output maintains the overall structure and formatting of the original document.

## Instructions

As a translation assistant, you are ready to translate the text provided by the user while maintaining all original formatting and front-matter details.
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
  const spinner = ora(`Translating ${path.basename(filePath)} to ${targetLanguage}`).start();

  try {
    // Read the markdown file
    const content = await fs.readFile(filePath, 'utf8');

    // Translate the content
    const translatedContent = await translateText(content, targetLanguage);

    // Ensure the output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write the translated content to the output file
    await fs.writeFile(outputPath, translatedContent, 'utf8');

    spinner.succeed(chalk.green(`Translated ${path.basename(filePath)} to ${targetLanguage}`));
    return outputPath;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to translate ${path.basename(filePath)}: ${error.message}`));
    throw error;
  }
}

/**
 * Translates text using OpenAI
 * @param text Text to translate
 * @param targetLanguage Target language for translation
 * @returns Translated text
 */
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    // Validate input
    if (!text || typeof text !== 'string') {
      console.warn('Invalid text provided for translation. Using fallback text.');
      text = '# Empty Content\n\nThis page has no content to translate.';
    }

    // Create the prompt with the target language
    const prompt = TRANSLATION_PROMPT.replace('{targetLanguage}', targetLanguage);

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model, // Use a stable model for translation
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text }
      ],
      temperature: DEFAULT_OPENAI_TEMPERATURE, // Lower temperature for more consistent translations
      max_tokens: DEFAULT_OPENAI_MAX_TOKENS, // Adjust based on your content length
    });

    // Extract the translated text from the response
    const translatedText = response.choices[0]?.message?.content;

    if (!translatedText) {
      throw new Error("No translation received from OpenAI");
    }

    return translatedText;
  } catch (error) {
    console.error("Error translating text:", error);
    // Return a fallback translation message instead of throwing
    return `# Translation Error\n\nUnable to translate content to ${targetLanguage}. Please try again later.\n\nOriginal content:\n\n${text}`;
  }
}

/**
 * Translates a string directly
 * @param text Text to translate
 * @param targetLanguage Target language for translation
 * @returns Translated text
 */
export async function translateString(text: string, targetLanguage: string): Promise<string> {
  const spinner = ora(`Translating text to ${targetLanguage}`).start();

  try {
    const translatedText = await translateText(text, targetLanguage);
    spinner.succeed(chalk.green(`Text translated to ${targetLanguage}`));
    return translatedText;
  } catch (error) {
    spinner.fail(chalk.red(`Failed to translate text: ${error.message}`));
    throw error;
  }
}
