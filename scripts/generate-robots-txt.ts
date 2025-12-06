/**
 * Generates robots.txt based on deployment environment.
 *
 * - Production (IS_PRODUCTION=true): Allow crawling, include sitemap
 * - Staging/Preview: Disallow all crawling
 *
 * The noindex meta tag (configured in docusaurus.config.ts) provides the
 * primary protection against indexing. The robots.txt Disallow directive
 * provides an additional signal to well-behaved crawlers.
 *
 * Note: Google recommends allowing crawling so crawlers can see noindex tags.
 * However, the Disallow approach is used here as defense-in-depth since:
 * 1. Well-behaved crawlers (Google, Bing) respect robots.txt and won't crawl
 * 2. For any pages that do get crawled, the noindex meta tag prevents indexing
 * 3. This dual approach is commonly used for staging environments
 *
 * Usage:
 *   IS_PRODUCTION=true bun scripts/generate-robots-txt.ts
 *   bun scripts/generate-robots-txt.ts  # defaults to staging/disallow
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get directory of current script (compatible with Node.js 18+)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATIC_DIR = path.join(__dirname, "..", "static");
const ROBOTS_PATH = path.join(STATIC_DIR, "robots.txt");

// Production URL for sitemap reference
const PRODUCTION_URL = "https://docs.comapeo.app";

const isProduction = process.env.IS_PRODUCTION === "true";

// Generate appropriate robots.txt content
const generateRobotsTxt = (): string => {
  if (isProduction) {
    // Production: Allow crawling with sitemap reference
    return `# robots.txt for ${PRODUCTION_URL}
# Generated automatically during build

User-agent: *
Allow: /

# Sitemap location
Sitemap: ${PRODUCTION_URL}/sitemap.xml
`;
  } else {
    // Staging/Preview: Disallow all crawling
    // Combined with noindex meta tags for defense-in-depth
    return `# robots.txt for staging/preview environment
# Generated automatically during build
# This file prevents search engines from indexing staging content

User-agent: *
Disallow: /

# Note: This is a staging/preview environment.
# Production site is at ${PRODUCTION_URL}
`;
  }
};

// Main execution with error handling
try {
  // Ensure static directory exists
  if (!fs.existsSync(STATIC_DIR)) {
    fs.mkdirSync(STATIC_DIR, { recursive: true });
  }

  // Write robots.txt
  const content = generateRobotsTxt();
  fs.writeFileSync(ROBOTS_PATH, content, "utf-8");

  const envLabel = isProduction ? "production (allow)" : "staging (disallow)";
  console.log(`✅ Generated robots.txt for ${envLabel}`);
  console.log(`   Path: ${ROBOTS_PATH}`);
} catch (error) {
  console.error("❌ Failed to generate robots.txt:", error);
  process.exit(1);
}
