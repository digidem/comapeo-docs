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

  // 1. Fix malformed <link to section.> patterns (the main issue from the error)
  content = content.replace(/<link\s+to\s+section\.?>/gi, '[link to section](#section)');

  // 2. Fix other malformed <link> tags with invalid attributes (spaces, dots in attr names)
  content = content.replace(/<link\s+[^>]*[^\w\s"=-][^>]*>/g, '[link](#)');

  // 3. Fix malformed <Link> tags with invalid attributes
  content = content.replace(/<Link\s+[^>]*[^\w\s"=-][^>]*>/g, '[Link](#)');

  // 4. Fix general malformed tags with dots or spaces in attribute names
  // This catches patterns like <tag attr.name> or <tag attr value> (without quotes)
  content = content.replace(/<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*?)([.\s]+)([^>]*?)>/g, (match, tagName, before, separator) => {
    // Only replace if the separator indicates malformed attributes
    if (separator.includes('.') || (separator.includes(' ') && !before.includes('='))) {
      return `[${tagName}](#${tagName.toLowerCase()})`;
    }
    return match; // Keep valid tags
  });

  // 5. Fix unquoted attribute values in JSX (e.g., <tag attr value> -> <tag attr="value">)
  content = content.replace(/<([a-zA-Z][a-zA-Z0-9]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([^>\s"=]+)(\s|>)/g,
    '<$1 $2="$3"$4');

  return content;
}