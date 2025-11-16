import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import config from "../../docusaurus.config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to the i18n directory
 */
export const I18N_PATH = path.join(__dirname, "../../i18n/");

/**
 * Get the path to the i18n directory for a specific locale
 *
 * @param locale - The locale code (e.g., "es", "pt")
 * @returns Path to the locale's docusaurus-plugin-content-docs/current directory
 */
export function getI18NPath(locale: string): string {
  return path.join(
    I18N_PATH,
    locale,
    "docusaurus-plugin-content-docs",
    "current"
  );
}

/**
 * Sets a translation string in the i18n code.json file for a given language
 *
 * This function manages the translation files for Docusaurus i18n system.
 * It reads the existing code.json file for the locale, adds or updates the
 * translation, and writes it back to disk.
 *
 * @param lang - The language code (e.g., "es", "pt")
 * @param original - The original string (key)
 * @param translated - The translated string (value)
 *
 * @example
 * ```ts
 * setTranslationString("es", "Hello", "Hola");
 * setTranslationString("pt", "Hello", "Olá");
 * ```
 */
export function setTranslationString(
  lang: string,
  original: string,
  translated: string
): void {
  const lPath = path.join(I18N_PATH, lang, "code.json");
  const dir = path.dirname(lPath);
  fs.mkdirSync(dir, { recursive: true });

  let fileContents = "{}";
  try {
    const existing = fs.readFileSync(lPath, "utf8");
    if (typeof existing === "string" && existing.trim().length > 0) {
      fileContents = existing;
    }
  } catch {
    console.warn(
      chalk.yellow(
        `Translation file missing for ${lang}, creating a new one at ${lPath}`
      )
    );
  }

  let file: Record<string, any>;
  try {
    file = JSON.parse(fileContents);
  } catch (parseError) {
    console.warn(
      chalk.yellow(
        `Failed to parse translation file for ${lang}, resetting content`
      ),
      parseError
    );
    file = {};
  }

  const safeKey =
    typeof original === "string"
      ? original.slice(0, 2000)
      : String(original).slice(0, 2000);
  const safeMessage =
    typeof translated === "string"
      ? translated.slice(0, 5000)
      : String(translated).slice(0, 5000);

  file[safeKey] = { message: safeMessage };
  fs.writeFileSync(lPath, JSON.stringify(file, null, 4));
}

/**
 * Initialize i18n directories for all configured locales
 *
 * This ensures that the directory structure exists for all locales
 * defined in the Docusaurus configuration.
 */
export function initializeI18NDirectories(): void {
  const locales = config.i18n.locales;
  const DEFAULT_LOCALE = config.i18n.defaultLocale;

  for (const locale of locales.filter((l) => l !== DEFAULT_LOCALE)) {
    fs.mkdirSync(getI18NPath(locale), { recursive: true });
  }
}

/**
 * Get all configured locales from Docusaurus config
 *
 * @returns Array of locale codes
 */
export function getConfiguredLocales(): string[] {
  return config.i18n.locales;
}

/**
 * Get the default locale from Docusaurus config
 *
 * @returns The default locale code
 */
export function getDefaultLocale(): string {
  return config.i18n.defaultLocale;
}

/**
 * Read translation file for a specific locale
 *
 * @param lang - The language code
 * @returns Parsed translation object or empty object if file doesn't exist
 */
export function readTranslationFile(
  lang: string
): Record<string, { message: string }> {
  const lPath = path.join(I18N_PATH, lang, "code.json");

  try {
    if (!fs.existsSync(lPath)) {
      return {};
    }

    const content = fs.readFileSync(lPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.warn(
      chalk.yellow(`Failed to read translation file for ${lang}`),
      error
    );
    return {};
  }
}

/**
 * Check if a translation exists for a given key and locale
 *
 * @param lang - The language code
 * @param key - The translation key
 * @returns True if translation exists, false otherwise
 */
export function hasTranslation(lang: string, key: string): boolean {
  const translations = readTranslationFile(lang);
  return key in translations;
}

/**
 * Get a translation for a given key and locale
 *
 * @param lang - The language code
 * @param key - The translation key
 * @returns The translated message or undefined if not found
 */
export function getTranslation(lang: string, key: string): string | undefined {
  const translations = readTranslationFile(lang);
  return translations[key]?.message;
}
