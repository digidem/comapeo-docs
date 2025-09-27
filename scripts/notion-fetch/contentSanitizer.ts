/**
 * Content sanitization utilities for fixing malformed HTML/JSX tags in markdown content
 * that cause MDX compilation errors in Docusaurus.
 */

/**
 * Sanitizes markdown content to fix malformed HTML/JSX tags that cause MDX compilation errors
 * @param content - The markdown content string
 * @returns Sanitized content with fixed HTML/JSX tags
 */
export function sanitizeMarkdownContent(content: string): string {
  // Fix specific malformed patterns that cause MDX errors

  // 0. Remove invalid curly brace expressions while preserving code fences and inline code
  // Mask code fences (```...```) and inline code (`...`) to avoid altering them
  const codeBlocks: string[] = [];
  const codeSpans: string[] = [];
  content = content.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });
  content = content.replace(/`[^`\n]*`/g, (m) => {
    codeSpans.push(m);
    return `__CODESPAN_${codeSpans.length - 1}__`;
  });

  // Aggressively strip all curly-brace expressions by unwrapping to inner text
  // BUT preserve JSX style objects for emoji images
  // Run a few passes to handle simple nesting like {{text}}
  for (let i = 0; i < 5 && /\{[^{}]*\}/.test(content); i++) {
    content = content.replace(/\{([^{}]*)\}/g, (match, inner) => {
      // Preserve JSX style objects in emoji img tags
      if (
        match.includes("display:") &&
        match.includes("height:") &&
        match.includes("margin:")
      ) {
        return match; // Keep JSX style objects unchanged
      }
      return String(inner).trim(); // Strip other curly braces
    });
  }

  // 1. Fix malformed <link to section.> patterns (the main issue from the error)
  content = content.replace(
    /<link\s+to\s+section\.?>/gi,
    "[link to section](#section)"
  );

  // 2. Fix other malformed <link> tags with invalid attributes (spaces, dots in attr names)
  content = content.replace(/<link\s+[^>]*[^\w\s"=-][^>]*>/g, "[link](#)");

  // 3. Fix malformed <Link> tags with invalid attributes
  content = content.replace(/<Link\s+[^>]*[^\w\s"=-][^>]*>/g, "[Link](#)");

  // 4. Fix general malformed tags with dots or spaces in attribute names
  // This catches patterns like <tag attr.name> or <tag attr value> (without quotes)
  // BUT exclude emoji img tags which are valid HTML
  content = content.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*?)([.\s]+)([^>]*?)>/g,
    (match, tagName, before, separator, after) => {
      // Skip emoji img tags - they are valid JSX that should be preserved
      if (
        tagName.toLowerCase() === "img" &&
        (before + after).includes('className="emoji"')
      ) {
        return match; // Keep emoji img tags unchanged
      }

      // Only replace if the separator indicates malformed attributes
      if (
        separator.includes(".") ||
        (separator.includes(" ") && !before.includes("="))
      ) {
        return `[${tagName}](#${tagName.toLowerCase()})`;
      }
      return match; // Keep valid tags
    }
  );

  // 5. Fix unquoted attribute values in JSX (e.g., <tag attr value> -> <tag attr="value">)
  // BUT exclude emoji img tags which are valid HTML
  content = content.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([^>\s"=]+)(\s|>)/g,
    (match, tagName, attrName, attrValue, suffix) => {
      // Skip emoji img tags - they are valid JSX that should be preserved
      if (
        tagName.toLowerCase() === "img" &&
        match.includes('className="emoji"')
      ) {
        return match; // Keep emoji img tags unchanged
      }
      return `<${tagName} ${attrName}="${attrValue}"${suffix}`;
    }
  );

  // 6. Final hard cleanup: strip any remaining { ... } to avoid MDX/Acorn errors
  // BUT preserve JSX style objects for emoji images
  // Run a few passes to handle simple nesting like {{text}}.
  for (let i = 0; i < 3 && /\{[^{}]*\}/.test(content); i++) {
    content = content.replace(/\{([^{}]*)\}/g, (match, inner) => {
      // Preserve JSX style objects in emoji img tags
      if (
        match.includes("display:") &&
        match.includes("height:") &&
        match.includes("margin:")
      ) {
        return match; // Keep JSX style objects unchanged
      }
      return inner; // Strip other curly braces
    });
  }

  // 7. Restore masked code blocks and inline code
  content = content.replace(
    /__CODEBLOCK_(\d+)__/g,
    (_m, i) => codeBlocks[Number(i)]
  );
  content = content.replace(
    /__CODESPAN_(\d+)__/g,
    (_m, i) => codeSpans[Number(i)]
  );

  return content;
}
