/**
 * Documentation Validation Utilities
 *
 * Shared utilities for validating deployment documentation structure,
 * content, and executable commands *
 * ESLint security warnings disabled for:
 * - detect-non-literal-regexp: Dynamic regex patterns use controlled input (function parameters)
 * - detect-object-injection: Array pushes are incorrectly flagged as object injection
 */

/* eslint-disable security/detect-non-literal-regexp */
/* eslint-disable security/detect-object-injection */

import { readFileSync } from "node:fs";

/**
 * Represents a code block extracted from markdown
 */
export interface CodeBlock {
  lang: string;
  code: string;
  lineStart: number;
}

/**
 * Represents a section in markdown documentation
 */
export interface Section {
  level: number;
  title: string;
  lineStart: number;
}

/**
 * Represents a validation error for an executable command
 */
export interface CommandValidationError {
  line: number;
  command: string;
  reason: string;
  severity: "error" | "warning";
}

/**
 * Parse frontmatter from markdown content
 * Returns the raw frontmatter text for simpler validation
 */
export function getFrontmatterText(content: string): string | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  return match ? match[1] : null;
}

/**
 * Extract a specific frontmatter value by key
 */
export function getFrontmatterValue(
  content: string,
  key: string
): string | null {
  const frontmatterText = getFrontmatterText(content);
  if (!frontmatterText) {
    return null;
  }

  // Look for "key: value" pattern
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = frontmatterText.match(regex);
  if (!match) {
    return null;
  }

  let value = match[1].trim();

  // Remove quotes if present
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value;
}

/**
 * Extract array values from frontmatter
 */
export function getFrontmatterArray(content: string, key: string): string[] {
  const frontmatterText = getFrontmatterText(content);
  if (!frontmatterText) {
    return [];
  }

  // Look for array pattern
  const regex = new RegExp(
    `^${key}:\\s*[\\r\\n]+((?:\\s+-\\s.+[\\r\\n]+)+)`,
    "m"
  );
  const match = frontmatterText.match(regex);
  if (!match) {
    // Try inline array format
    const inlineRegex = new RegExp(`^${key}:\\s*\\[(.+)\\]$`, "m");
    const inlineMatch = frontmatterText.match(inlineRegex);
    if (inlineMatch) {
      return inlineMatch[1]
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""));
    }
    return [];
  }

  // Parse multi-line array
  const arrayText = match[1];
  return arrayText
    .split("\n")
    .map((line) => line.replace(/^\s+-\s+/, "").trim())
    .filter((line) => line.length > 0)
    .map((item) => item.replace(/^['"]|['"]$/g, ""));
}

/**
 * Extract all code blocks from markdown content
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const lines = content.split("\n");
  const codeBlocks: CodeBlock[] = [];
  let inCodeBlock = false;
  let currentBlock: Partial<CodeBlock> | null = null;
  let currentCode: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codeBlockStart = line.match(/^```(\w*)/);

    if (codeBlockStart) {
      if (inCodeBlock && currentBlock) {
        // Closing code block
        codeBlocks.push({
          lang: currentBlock.lang || "text",
          code: currentCode.join("\n"),
          lineStart: currentBlock.lineStart,
        });
        currentBlock = null;
        currentCode = [];
      } else {
        // Starting new code block
        currentBlock = {
          lang: codeBlockStart[1] || "text",
          lineStart: i + 1,
        };
      }
      inCodeBlock = !inCodeBlock;
    } else if (inCodeBlock) {
      currentCode.push(line);
    }
  }

  return codeBlocks;
}

/**
 * Extract all sections (headings) from markdown content
 */
export function extractSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      sections.push({
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        lineStart: i + 1,
      });
    }
  }

  return sections;
}

/**
 * Extract all links from markdown content
 */
export function extractLinks(
  content: string
): Array<{ text: string; url: string }> {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ text: string; url: string }> = [];

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
    });
  }

  return links;
}

/**
 * Validate bash command syntax
 * Checks for common syntax errors that would prevent execution
 */
export function validateBashCommand(
  command: string
): CommandValidationError | null {
  const trimmed = command.trim();

  // Skip empty commands and comments
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  // Check for unbalanced quotes
  const singleQuotes = (trimmed.match(/'/g) || []).length;
  const doubleQuotes = (trimmed.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
    return {
      line: 0,
      command: trimmed,
      reason: "Unbalanced quotes",
      severity: "error",
    };
  }

  // Check for unbalanced parentheses (in command substitution, not subshells)
  const openParens = (trimmed.match(/\$\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    return {
      line: 0,
      command: trimmed,
      reason: "Unbalanced parentheses in command substitution",
      severity: "error",
    };
  }

  // Check for obvious typos in common commands
  const commonTypos = [
    { typo: "cd  ", correct: "cd " },
    { typo: "ls  ", correct: "ls " },
    { typo: "grep  ", correct: "grep " },
    { typo: "sudo  ", correct: "sudo " },
    { typo: "docker  ", correct: "docker " },
  ];

  for (const { typo, correct } of commonTypos) {
    if (trimmed.includes(typo)) {
      return {
        line: 0,
        command: trimmed,
        reason: `Possible typo: "${typo}" should be "${correct}"`,
        severity: "warning",
      };
    }
  }

  // Check for improper use of && and || (common in multi-line commands)
  if (/[;&|]\s*$/.test(trimmed) && !trimmed.endsWith("\\")) {
    return {
      line: 0,
      command: trimmed,
      reason: "Line continuation expected with backslash",
      severity: "warning",
    };
  }

  return null;
}

/**
 * Validate bash code block for executable commands
 */
export function validateBashCodeBlock(
  codeBlock: CodeBlock
): CommandValidationError[] {
  if (codeBlock.lang !== "bash" && codeBlock.lang !== "sh") {
    return [];
  }

  const errors: CommandValidationError[] = [];
  const lines = codeBlock.code.split("\n");

  // Track multi-line commands (continuation with backslash)
  let multiLineCommand = "";
  let multiLineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Handle multi-line commands
    if (trimmed.endsWith("\\")) {
      if (!multiLineCommand) {
        multiLineStart = codeBlock.lineStart + i;
      }
      multiLineCommand += trimmed.slice(0, -1).trim() + " ";
      continue;
    }

    if (multiLineCommand) {
      multiLineCommand += trimmed;
      const error = validateBashCommand(multiLineCommand);
      if (error) {
        errors.push({
          ...error,
          line: multiLineStart,
        });
      }
      multiLineCommand = "";
      continue;
    }

    // Validate single-line command
    const error = validateBashCommand(trimmed);
    if (error) {
      errors.push({
        ...error,
        line: codeBlock.lineStart + i,
      });
    }
  }

  return errors;
}

/**
 * Check if required sections exist in documentation
 */
export function hasRequiredSections(
  content: string,
  requiredSections: string[]
): { passed: string[]; missing: string[] } {
  const sections = extractSections(content);
  const sectionTitles = sections.map((s) => s.title.toLowerCase());

  const missing: string[] = [];
  const passed: string[] = [];

  for (const required of requiredSections) {
    if (sectionTitles.some((title) => title.includes(required.toLowerCase()))) {
      passed.push(required);
    } else {
      missing.push(required);
    }
  }

  return { passed, missing };
}

/**
 * Validate all executable commands in markdown documentation
 */
export function validateDocumentationCommands(
  content: string
): CommandValidationError[] {
  const codeBlocks = extractCodeBlocks(content);
  const allErrors: CommandValidationError[] = [];

  for (const block of codeBlocks) {
    const errors = validateBashCodeBlock(block);
    allErrors.push(...errors);
  }

  return allErrors;
}

/**
 * Load documentation file and return content
 */
export function loadDocumentation(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}
