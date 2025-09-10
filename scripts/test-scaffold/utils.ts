import { glob } from "glob";
import { existsSync } from "fs";
import path from "path";
import { ScaffoldError } from "./errors";

/**
 * Discover all TypeScript files in the scripts directory that don't have corresponding test files
 */
export async function discoverUntrackedScripts(): Promise<string[]> {
  const scripts = await glob("scripts/**/*.ts", {
    ignore: [
      "scripts/**/*.test.ts",
      "scripts/**/*.spec.ts",
      "scripts/**/*.d.ts",
      "scripts/**/node_modules/**",
      "scripts/test-scaffold/**", // Ignore the test scaffold tool itself
    ],
  });

  return scripts.filter((scriptPath) => {
    const testPath = scriptPath.replace(/\.ts$/, ".test.ts");
    return !existsSync(testPath);
  });
}

/**
 * Validate that a script path is valid for test generation
 */
export function validateScriptPath(scriptPath: string): void {
  if (!scriptPath.endsWith(".ts")) {
    throw new ScaffoldError(
      "Invalid file: Must be a TypeScript file",
      "INVALID_EXTENSION"
    );
  }

  if (!existsSync(scriptPath)) {
    throw new ScaffoldError(`File not found: ${scriptPath}`, "FILE_NOT_FOUND");
  }

  if (scriptPath.includes(".test.") || scriptPath.includes(".spec.")) {
    throw new ScaffoldError(
      "Cannot scaffold test for a test file",
      "TEST_FILE_INPUT"
    );
  }

  if (scriptPath.includes(".d.ts")) {
    throw new ScaffoldError(
      "Cannot scaffold test for a type definition file",
      "TYPE_DEFINITION_FILE"
    );
  }
}

/**
 * Extract metadata from TypeScript source code
 */
export function extractMetadata(scriptContent: string): ScriptMetadata {
  const metadata: ScriptMetadata = {
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    hasAsync: false,
    usesFileSystem: false,
    usesNetwork: false,
  };

  // Extract imports (simple regex-based approach for KISS principle)
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(scriptContent)) !== null) {
    metadata.imports.push(match[1]);

    // Check for file system usage
    if (
      match[1].includes("fs") ||
      match[1].includes("path") ||
      match[1].includes("file")
    ) {
      metadata.usesFileSystem = true;
    }

    // Check for network usage
    if (
      match[1].includes("http") ||
      match[1].includes("fetch") ||
      match[1].includes("axios") ||
      match[1].includes("notion")
    ) {
      metadata.usesNetwork = true;
    }
  }

  // Extract function declarations
  const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  while ((match = functionRegex.exec(scriptContent)) !== null) {
    metadata.functions.push(match[1]);
  }

  // Extract arrow functions assigned to const/let
  const arrowFunctionRegex =
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g;
  while ((match = arrowFunctionRegex.exec(scriptContent)) !== null) {
    metadata.functions.push(match[1]);
  }

  // Extract class declarations
  const classRegex = /(?:export\s+)?class\s+(\w+)/g;
  while ((match = classRegex.exec(scriptContent)) !== null) {
    metadata.classes.push(match[1]);
  }

  // Check for async usage
  if (
    scriptContent.includes("async") ||
    scriptContent.includes("await") ||
    scriptContent.includes("Promise")
  ) {
    metadata.hasAsync = true;
  }

  // Extract exports
  const exportRegex =
    /export\s+(?:default\s+)?(?:const|let|var|function|class|async\s+function)?\s*(\w+)?/g;
  while ((match = exportRegex.exec(scriptContent)) !== null) {
    if (match[1]) {
      metadata.exports.push(match[1]);
    }
  }

  return metadata;
}

export interface ScriptMetadata {
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  hasAsync: boolean;
  usesFileSystem: boolean;
  usesNetwork: boolean;
}

/**
 * Get the relative import path from test file to script file
 */
export function getRelativeImportPath(
  testPath: string,
  scriptPath: string
): string {
  const testDir = path.dirname(testPath);
  const scriptDir = path.dirname(scriptPath);
  const scriptName = path.basename(scriptPath, ".ts");

  if (testDir === scriptDir) {
    return `./${scriptName}`;
  }

  const relativePath = path.relative(testDir, scriptDir);
  return path.join(relativePath, scriptName).replace(/\\/g, "/");
}

/**
 * Check if a path should be ignored for test generation
 */
export function shouldIgnorePath(filePath: string): boolean {
  const ignorePatterns = [
    "node_modules",
    "dist",
    "build",
    ".config.",
    "test-scaffold", // Don't generate tests for the test scaffold tool
    "vitest.config",
    "jest.config",
  ];

  return ignorePatterns.some((pattern) => filePath.includes(pattern));
}
