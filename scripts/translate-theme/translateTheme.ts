import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { extractTranslatableText as defaultExtractTranslatableText } from "./navbarFooter.js";
import { getLanguageName as defaultGetLanguageName } from "./languageNames.js";
import { translateJson as defaultTranslateJson } from "./translateJson.js";
import type {
  TranslationFailure,
  NavbarConfig,
  FooterConfig,
} from "./types.js";

export interface TranslateThemeOptions {
  config?: {
    themeConfig?: {
      navbar?: NavbarConfig;
      footer?: FooterConfig;
    };
  };
  cwd?: string;
  languages?: string[];
  extractTranslatableTextFn?: typeof defaultExtractTranslatableText;
  getLanguageNameFn?: typeof defaultGetLanguageName;
  translateJsonFn?: typeof defaultTranslateJson;
}

/**
 * Translates navbar and footer from docusaurus.config.ts for all configured languages except English.
 * Outputs to i18n/<lang>/docusaurus-theme-classic/navbar.json and footer.json.
 */
export async function translateThemeConfig(
  options: TranslateThemeOptions = {}
): Promise<TranslationFailure[]> {
  const failures: TranslationFailure[] = [];
  const rootDir = options.cwd || process.cwd();
  const extractTranslatableText =
    options.extractTranslatableTextFn || defaultExtractTranslatableText;
  const getLanguageName = options.getLanguageNameFn || defaultGetLanguageName;
  const translateJson = options.translateJsonFn || defaultTranslateJson;

  // Load config: either passed directly or imported from docusaurus.config.ts
  let config = options.config;
  if (!config) {
    const configPath = path.join(rootDir, "docusaurus.config.ts");
    const configModule = await import(configPath);
    config = configModule.default || configModule;
  }

  // Extract navbar and footer configs
  const navbarConfig = config?.themeConfig?.navbar;
  const footerConfig = config?.themeConfig?.footer;

  const navbarTranslations = navbarConfig
    ? extractTranslatableText(navbarConfig, "navbar")
    : undefined;
  const footerTranslations = footerConfig
    ? extractTranslatableText(footerConfig, "footer")
    : undefined;

  // Get language directories
  const i18nDir = path.join(rootDir, "i18n");
  let langDirs: string[] = [];

  if (options.languages) {
    langDirs = options.languages;
  } else {
    langDirs = await fs.readdir(i18nDir);
  }

  for (const langDir of langDirs) {
    if (langDir === "en") continue; // Skip English

    const langPath = path.join(i18nDir, langDir);
    try {
      const langStat = await fs.stat(langPath);
      if (!langStat.isDirectory()) continue;
    } catch {
      continue;
    }

    const themeClassicDir = path.join(langPath, "docusaurus-theme-classic");
    await fs.mkdir(themeClassicDir, { recursive: true });

    const languageName = getLanguageName(langDir);

    // Translate and save navbar
    if (navbarTranslations && Object.keys(navbarTranslations).length > 0) {
      try {
        const translatedNavbar = await translateJson(
          JSON.stringify(navbarTranslations, null, 2),
          languageName
        );
        const navbarPath = path.join(themeClassicDir, "navbar.json");
        await fs.writeFile(navbarPath, translatedNavbar, "utf8");
        console.log(
          chalk.green(
            `✓ Successfully saved translated navbar.json for ${languageName}`
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(
            `✗ Error translating navbar for ${languageName}: ${message}`
          )
        );
        failures.push({
          language: langDir,
          title: "navbar.json",
          error: message,
          isCritical: Boolean(
            error &&
              typeof error === "object" &&
              "isCritical" in error &&
              (error as any).isCritical
          ),
        });
      }
    }

    // Translate and save footer
    if (footerTranslations && Object.keys(footerTranslations).length > 0) {
      try {
        const translatedFooter = await translateJson(
          JSON.stringify(footerTranslations, null, 2),
          languageName
        );
        const footerPath = path.join(themeClassicDir, "footer.json");
        await fs.writeFile(footerPath, translatedFooter, "utf8");
        console.log(
          chalk.green(
            `✓ Successfully saved translated footer.json for ${languageName}`
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(
            `✗ Error translating footer for ${languageName}: ${message}`
          )
        );
        failures.push({
          language: langDir,
          title: "footer.json",
          error: message,
          isCritical: Boolean(
            error &&
              typeof error === "object" &&
              "isCritical" in error &&
              (error as any).isCritical
          ),
        });
      }
    }
  }

  return failures;
}
