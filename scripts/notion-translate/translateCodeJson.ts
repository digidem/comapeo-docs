import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_TEMPERATURE } from '../constants.js';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

// JSON Translation prompt template
const JSON_TRANSLATION_PROMPT = `
You are a JSON translation assistant. Your task is to translate only the "message" values in the provided JSON object from English to {targetLanguage}.

- Do NOT translate any keys or the values of "description" fields.
- Preserve the original JSON structure, formatting, and all non-"message" values.
- Output must be valid, parseable JSON.
- Do not include any explanations, markdown, code blocks, or extra text—return only the translated JSON object.

Example input:
{
  "Welcome": {
    "message": "Welcome to our application",
    "description": "Greeting message on homepage"
  }
}

Example output (Spanish):
{
  "Welcome": {
    "message": "Bienvenido a nuestra aplicación",
    "description": "Greeting message on homepage"
  }
}
`;

/**
 * Translates JSON content using OpenAI
 * @param jsonContent The JSON content to translate
 * @param targetLanguage The target language
 * @param retryCount The current retry count
 * @returns The translated JSON content
 */
export async function translateJson(
  jsonContent: string,
  targetLanguage: string,
  retryCount = 0
): Promise<string> {
  const MAX_RETRIES = 3;
  const spinner = ora(
    `Translating to ${targetLanguage}${retryCount > 0 ? ` (Attempt ${retryCount + 1}/${MAX_RETRIES})` : ""
    }...`
  ).start();

  const prompt = JSON_TRANSLATION_PROMPT.replace('{targetLanguage}', targetLanguage);

  // Zod schema for code.json: require both message and description as strings
  // Accept objects with at least a "message" string, and optionally a "description" string
  // The schema must match the code.json format:
  // {
  //   "Some Key": {
  //     "message": "Some message",
  //     "description": "Some description"
  //   },
  //   ...
  // }
  const CodeJsonSchema = {
    type: "object",
    properties: {},
    additionalProperties: {
      type: "object",
      properties: {
        message: { type: "string" },
        description: { type: "string" }
      },
      required: ["message", "description"],
      additionalProperties: false
    }
  };
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: jsonContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "translation",
          schema: CodeJsonSchema,
          strict: true
        }
      },
      temperature: DEFAULT_OPENAI_TEMPERATURE,
    });
    const translatedJsonObj = JSON.parse(response.choices[0].message.content!);
    // Remove debug log for production
    const translatedJsonString = JSON.stringify(translatedJsonObj, null, 2);

    spinner.succeed(
      chalk.green(`Successfully translated to ${targetLanguage}`)
    );
    return translatedJsonString;
  } catch (error) {
    spinner.fail(
      chalk.red(
        `Translation failed for ${targetLanguage}: ${(error as Error).message || error
        }`
      )
    );
    if (retryCount < MAX_RETRIES - 1) {
      spinner.info(
        chalk.yellow(`Retrying translation for ${targetLanguage}...`)
      );
      return translateJson(jsonContent, targetLanguage, retryCount + 1);
    } else {
      throw new Error(
        `Invalid JSON after ${MAX_RETRIES} attempts: ${(error as Error).message || error
        }`
      );
    }
  }
}

/**
 * Extracts translatable text from navbar/footer config and converts to i18n format
 * @param config The navbar or footer config object
 * @param type Either 'navbar' or 'footer'
 * @returns JSON object in i18n format
 */
interface NavbarItem {
  label?: string;
  type?: string;
  sidebarId?: string;
  position?: string;
  href?: string;
}

interface FooterLink {
  label?: string;
  href?: string;
}

interface FooterSection {
  title?: string;
  items?: FooterLink[];
}

interface NavbarConfig {
  items?: NavbarItem[];
}

interface FooterConfig {
  links?: FooterSection[];
  copyright?: string;
}

export function extractTranslatableText(config: NavbarConfig | FooterConfig, type: 'navbar' | 'footer'): Record<string, { message: string; description: string }> {
  const result: Record<string, { message: string; description: string }> = {};

  if (type === 'navbar' && config.items) {
    (config as NavbarConfig).items?.forEach((item: NavbarItem) => {
      if (item.label) {
        const key = `item.label.${item.label}`;
        result[key] = {
          message: item.label,
          description: `Navbar item with label ${item.label}`
        };
      }
    });
  }

  if (type === 'footer' && config.links) {
    (config as FooterConfig).links?.forEach((section: FooterSection) => {
      if (section.title) {
        const titleKey = `links.title.${section.title}`;
        result[titleKey] = {
          message: section.title,
          description: `Footer section title: ${section.title}`
        };
      }

      if (section.items) {
        section.items?.forEach((item: FooterLink) => {
          if (item.label) {
            const labelKey = `links.${section.title}.${item.label}`;
            result[labelKey] = {
              message: item.label,
              description: `Footer link label: ${item.label}`
            };
          }
        });
      }
    });

    const footerConfig = config as FooterConfig;
    if (footerConfig.copyright) {
      result['copyright'] = {
        message: footerConfig.copyright.replace(/\$\{new Date\(\)\.getFullYear\(\)\}/, new Date().getFullYear().toString()),
        description: 'Footer copyright text'
      };
    }
  }

  return result;
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
        const translatedJson = await translateJson(englishCodeJson, languageName);

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
