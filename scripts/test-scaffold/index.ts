#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { glob } from "glob";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { generateTestBoilerplate } from "./templates";
import { discoverUntrackedScripts, validateScriptPath } from "./utils";
import { ScaffoldError } from "./errors";

const program = new Command();

program
  .name("test-scaffold")
  .description("Generate test scaffolds for TypeScript scripts")
  .version("1.0.0")
  .argument("[script-path]", "Path to the script file to generate test for")
  .option("--all", "Generate tests for all untracked scripts")
  .option(
    "--template <type>",
    "Template type to use (default, integration)",
    "default"
  )
  .option("--check", "Check for untracked scripts without generating")
  .action(async (scriptPath, options) => {
    try {
      if (options.check) {
        // Check mode - just list untracked scripts
        const untracked = await discoverUntrackedScripts();
        if (untracked.length > 0) {
          console.log(chalk.yellow("Untracked scripts found:"));
          untracked.forEach((script) => {
            console.log(chalk.gray(`  - ${script}`));
          });
          process.exit(1);
        } else {
          console.log(chalk.green("✓ All scripts have test files"));
          process.exit(0);
        }
      }

      if (options.all) {
        // Batch mode - generate for all untracked scripts
        console.log(chalk.blue("🔍 Scanning for untracked scripts..."));
        const untrackedScripts = await discoverUntrackedScripts();

        if (untrackedScripts.length === 0) {
          console.log(chalk.green("✓ All scripts already have test files!"));
          return;
        }

        console.log(
          chalk.yellow(`Found ${untrackedScripts.length} untracked scripts`)
        );

        for (const script of untrackedScripts) {
          await generateTestFile(script, options.template);
        }

        console.log(
          chalk.green(`\n✓ Generated ${untrackedScripts.length} test files`)
        );
      } else if (scriptPath) {
        // Single file mode
        await generateTestFile(scriptPath, options.template);
      } else {
        // No arguments provided
        program.help();
      }
    } catch (error) {
      if (error instanceof ScaffoldError) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
      console.error(chalk.red("Unexpected error:"), error);
      process.exit(1);
    }
  });

async function generateTestFile(
  scriptPath: string,
  template: string
): Promise<void> {
  try {
    // Validate the script path
    validateScriptPath(scriptPath);

    // Check if test already exists
    const testPath = scriptPath.replace(/\.ts$/, ".test.ts");
    if (existsSync(testPath)) {
      console.log(chalk.yellow(`⚠ Test already exists: ${testPath}`));
      return;
    }

    // Read the script content for analysis
    const scriptContent = await fs.readFile(scriptPath, "utf-8");

    // Extract script name
    const scriptName = path.basename(scriptPath, ".ts");

    // Generate test boilerplate
    const testContent = generateTestBoilerplate({
      scriptName,
      scriptPath: `./${scriptName}`,
      template,
      scriptContent,
    });

    // Write the test file
    await fs.writeFile(testPath, testContent, "utf-8");

    console.log(chalk.green(`✓ Generated test: ${testPath}`));
  } catch (error) {
    if (error instanceof ScaffoldError) {
      throw error;
    }
    throw new ScaffoldError(
      `Failed to generate test for ${scriptPath}: ${error}`,
      "GENERATION_FAILED"
    );
  }
}

// Parse command line arguments
program.parse(process.argv);
