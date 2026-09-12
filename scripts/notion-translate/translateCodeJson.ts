import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import {
  translateJson,
  extractTranslatableText,
  getLanguageName,
} from "../translate-theme/index.js";

// Re-export for backward compatibility with existing callers/tests
export { translateJson, extractTranslatableText, getLanguageName };

/**
 * Main function to translate code.json files
 */
export async function main() {
  console.log(chalk.blue("🌐 Starting code.json translation process\n"));

  try {
    // Get i18n directory
    const i18nDir = path.join(process.cwd(), "i18n");

    // Get all language directories
    const langDirs = await fs.readdir(i18nDir);

    // Get English code.json as source
    const englishCodeJsonPath = path.join(i18nDir, "en", "code.json");
    let englishCodeJson: string;

    try {
      englishCodeJson = await fs.readFile(englishCodeJsonPath, "utf8");
      // Validate JSON
      JSON.parse(englishCodeJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNotFound =
        error instanceof Error &&
        ("code" in error
          ? error.code === "ENOENT"
          : message.includes("ENOENT"));

      // Check if this is a SyntaxError from JSON.parse (malformed JSON)
      const isMalformedJson = error instanceof SyntaxError;

      // Only soft-fail for ENOENT (file not found) or SyntaxError (malformed JSON)
      // Re-throw system errors like EACCES, EIO, etc.
      if (!isNotFound && !isMalformedJson) {
        throw error;
      }

      if (isNotFound) {
        console.warn(
          chalk.yellow(
            "⚠ English code.json not found. Skipping code.json translation."
          )
        );
      } else {
        console.warn(
          chalk.yellow(
            `⚠ English code.json is malformed: ${message}. Skipping code.json translation.`
          )
        );
      }
      return; // Exit gracefully instead of hard exit
    }

    // Process each language directory (except 'en')
    for (const langDir of langDirs) {
      if (langDir === "en") continue; // Skip English

      const langPath = path.join(i18nDir, langDir);
      const langStat = await fs.stat(langPath);

      if (!langStat.isDirectory()) continue; // Skip if not a directory

      const codeJsonPath = path.join(langPath, "code.json");
      const languageName = getLanguageName(langDir);

      console.log(
        chalk.cyan(`\nProcessing ${languageName} (${langDir}) translation:`)
      );

      try {
        // Translate English code.json to target language
        const translatedJson = await translateJson(
          englishCodeJson,
          languageName
        );

        // Write the translated JSON to the target file
        await fs.writeFile(codeJsonPath, translatedJson, "utf8");
        console.log(
          chalk.green(
            `✓ Successfully saved translated code.json for ${languageName}`
          )
        );
      } catch (error) {
        console.error(
          chalk.red(
            `✗ Error translating code.json for ${languageName}: ${error.message}`
          )
        );
      }
    }

    console.log(chalk.blue("\n✨ code.json translation process completed!"));
  } catch (error) {
    console.error(chalk.red(`Error in translation process: ${error.message}`));
    process.exit(1);
  }
}

// Run main function only when executed directly outside of tests
const isExecutedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (process.env.NODE_ENV !== "test" && isExecutedDirectly) {
  void main();
}
