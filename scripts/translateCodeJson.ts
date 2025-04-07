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

// JSON Translation prompt template
const JSON_TRANSLATION_PROMPT = `
# Role: JSON Translation Assistant

You are a specialized JSON translation assistant, responsible for translating JSON content from English to the specified target language.

## Profile

- Source Language: English
- Translation Language: {targetLanguage}
- Translation Format: Valid JSON

## Goal

- Translate only the "message" values in the JSON structure to the target language.
- Preserve all JSON structure, keys, and formatting.
- Ensure the output is valid, parseable JSON.
- Do not translate the "description" values.

## Constraints

- Only translate the values of "message" fields.
- Do not translate keys.
- Do not translate the values of "description" fields.
- Preserve all JSON syntax, including quotes, braces, commas, etc.
- Ensure the output is valid JSON that can be parsed without errors.
- Maintain any special characters or formatting in the original JSON.
- Do not include any markdown formatting, code blocks, or backticks in your response.
- Return ONLY the raw JSON content.

## Example

Input JSON:
{
  "Welcome": {
    "message": "Welcome to our application",
    "description": "Greeting message on homepage"
  }
}

Output JSON (translated to Spanish):
{
  "Welcome": {
    "message": "Bienvenido a nuestra aplicación",
    "description": "Greeting message on homepage"
  }
}

## Response Format

Respond with only the translated JSON. Do not include any explanations, markdown formatting, or additional text. Do not wrap the JSON in code blocks or backticks.
`;

/**
 * Translates JSON content using OpenAI
 * @param jsonContent The JSON content to translate
 * @param targetLanguage The target language
 * @param retryCount The current retry count
 * @returns The translated JSON content
 */
export async function translateJsonWithOpenAI(jsonContent: string, targetLanguage: string, retryCount = 0): Promise<string> {
  const MAX_RETRIES = 3;
  const spinner = ora(`Translating to ${targetLanguage}${retryCount > 0 ? ` (Attempt ${retryCount + 1}/${MAX_RETRIES})` : ''}...`).start();

  try {
    const prompt = JSON_TRANSLATION_PROMPT.replace('{targetLanguage}', targetLanguage);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: jsonContent }
      ],
      temperature: DEFAULT_OPENAI_TEMPERATURE,
      max_tokens: DEFAULT_OPENAI_MAX_TOKENS,
    });

    const translatedContent = response.choices[0].message.content?.trim() || '';

    // Clean up the response to ensure it's valid JSON
    let cleanedContent = translatedContent;

    // Remove any markdown code block markers if present
    cleanedContent = cleanedContent.replace(/```json\s*/g, '');
    cleanedContent = cleanedContent.replace(/```\s*$/g, '');

    // Validate JSON
    try {
      JSON.parse(cleanedContent);
      spinner.succeed(chalk.green(`Successfully translated to ${targetLanguage}`));
      return cleanedContent;
    } catch (error) {
      spinner.fail(chalk.red(`Translation resulted in invalid JSON for ${targetLanguage}`));

      // Try to fix common JSON issues
      console.log(chalk.yellow(`Attempting to fix JSON formatting issues...`));

      // Try to extract JSON from the response if it's wrapped in text
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extractedJson = jsonMatch[0];
          JSON.parse(extractedJson);
          spinner.succeed(chalk.green(`Successfully fixed JSON formatting for ${targetLanguage}`));
          return extractedJson;
        } catch (extractError) {
          // Still invalid
          throw new Error(`Invalid JSON after extraction: ${extractError.message}`);
        }
      }

      // If we can't fix it, try again if we haven't reached the maximum retries
      if (retryCount < MAX_RETRIES - 1) {
        spinner.info(chalk.yellow(`Retrying translation for ${targetLanguage}...`));
        return translateJsonWithOpenAI(jsonContent, targetLanguage, retryCount + 1);
      } else {
        // If we've reached the maximum retries, throw an error
        throw new Error(`Invalid JSON after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Translation failed for ${targetLanguage}: ${error.message}`));
    throw error;
  }
}

/**
 * Gets the language name from the language code
 * @param langCode The language code (e.g., 'pt', 'es')
 * @returns The language name (e.g., 'Portuguese', 'Spanish')
 */
export function getLanguageName(langCode: string): string {
  const languageMap: Record<string, string> = {
    'pt': 'Portuguese',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ru': 'Russian',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'tr': 'Turkish',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'pl': 'Polish',
    'vi': 'Vietnamese',
    'th': 'Thai',
    'id': 'Indonesian',
    'uk': 'Ukrainian',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'el': 'Greek',
    'da': 'Danish',
    'fi': 'Finnish',
    'no': 'Norwegian',
    'he': 'Hebrew',
    'bg': 'Bulgarian',
    'hr': 'Croatian',
    'sk': 'Slovak',
    'lt': 'Lithuanian',
    'sl': 'Slovenian',
    'et': 'Estonian',
    'lv': 'Latvian',
    'sr': 'Serbian',
    'ms': 'Malay',
    'bn': 'Bengali',
    'fa': 'Persian',
    'ur': 'Urdu',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'sw': 'Swahili',
    'am': 'Amharic',
    'km': 'Khmer',
    'lo': 'Lao',
    'my': 'Burmese',
    'ne': 'Nepali',
    'si': 'Sinhala',
    'ka': 'Georgian',
    'hy': 'Armenian',
    'az': 'Azerbaijani',
    'be': 'Belarusian',
    'is': 'Icelandic',
    'mk': 'Macedonian',
    'mn': 'Mongolian',
    'cy': 'Welsh',
    'gl': 'Galician',
    'eu': 'Basque',
    'ca': 'Catalan',
    'af': 'Afrikaans',
    'zu': 'Zulu',
    'xh': 'Xhosa',
    'st': 'Sesotho',
    'tn': 'Tswana',
    'yo': 'Yoruba',
    'ig': 'Igbo',
    'ha': 'Hausa',
    'lb': 'Luxembourgish',
    'mt': 'Maltese',
    'ga': 'Irish',
    'gd': 'Scottish Gaelic',
    'en': 'English'
  };

  return languageMap[langCode] || langCode;
}

/**
 * Main function to translate code.json files
 */
export async function main() {
  console.log(chalk.blue('🌐 Starting code.json translation process\n'));

  try {
    // Get the i18n directory
    const i18nDir = path.join(process.cwd(), 'i18n');

    // Get all language directories
    const langDirs = await fs.readdir(i18nDir);

    // Get the English code.json as source
    const englishCodeJsonPath = path.join(i18nDir, 'en', 'code.json');
    let englishCodeJson: string;

    try {
      englishCodeJson = await fs.readFile(englishCodeJsonPath, 'utf8');
      // Validate JSON
      JSON.parse(englishCodeJson);
    } catch (error) {
      console.error(chalk.red(`Error reading or parsing English code.json: ${error.message}`));
      process.exit(1);
    }

    // Process each language directory (except 'en')
    for (const langDir of langDirs) {
      if (langDir === 'en') continue; // Skip English

      const langPath = path.join(i18nDir, langDir);
      const langStat = await fs.stat(langPath);

      if (!langStat.isDirectory()) continue; // Skip if not a directory

      const codeJsonPath = path.join(langPath, 'code.json');
      const languageName = getLanguageName(langDir);

      console.log(chalk.cyan(`\nProcessing ${languageName} (${langDir}) translation:`));

      try {
        // Translate the English code.json to the target language
        const translatedJson = await translateJsonWithOpenAI(englishCodeJson, languageName);

        // Write the translated JSON to the target file
        await fs.writeFile(codeJsonPath, translatedJson, 'utf8');
        console.log(chalk.green(`✓ Successfully saved translated code.json for ${languageName}`));
      } catch (error) {
        console.error(chalk.red(`✗ Error translating code.json for ${languageName}: ${error.message}`));
      }
    }

    console.log(chalk.blue('\n✨ code.json translation process completed!'));
  } catch (error) {
    console.error(chalk.red(`Error in translation process: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (import.meta.url.endsWith('translateCodeJson.js') || import.meta.url.endsWith('translateCodeJson.ts')) {
  main();
}
