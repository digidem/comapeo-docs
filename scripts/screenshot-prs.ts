#!/usr/bin/env bun
// @ts-nocheck - Playwright types not installed
/* eslint-disable import/no-unresolved */
/**
 * Screenshot script for PR visual comparisons
 * Generic tool for capturing before/after screenshots
 *
 * Usage:
 *   bun scripts/screenshot-prs.ts --url /docs/overview --name sidebar
 *   bun scripts/screenshot-prs.ts --url / --name landing --viewport mobile
 *   bun scripts/screenshot-prs.ts --url /docs/overview --selector "aside[class*='sidebar']" --name sidebar-detail
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SCREENSHOTS_DIR = join(process.cwd(), "screenshots");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  wide: { width: 1920, height: 1080 },
};

interface ScreenshotOptions {
  url: string;
  name: string;
  viewport?: keyof typeof VIEWPORTS | { width: number; height: number };
  selector?: string;
  fullPage?: boolean;
  output?: string;
}

async function takeScreenshot(options: ScreenshotOptions) {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Set viewport
    const viewport =
      typeof options.viewport === "string"
        ? VIEWPORTS[options.viewport]
        : options.viewport || VIEWPORTS.desktop;

    await page.setViewportSize(viewport);

    // Navigate
    const fullUrl = `${BASE_URL}${options.url}`;
    console.log(`📸 Navigating to ${fullUrl}`);
    await page.goto(fullUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000); // Wait for animations

    // Determine output path
    const outputDir = options.output || SCREENSHOTS_DIR;
    await mkdir(outputDir, { recursive: true });
    const screenshotPath = join(outputDir, `${options.name}.png`);

    // Take screenshot
    if (options.selector) {
      const element = await page.locator(options.selector).first();
      if ((await element.count()) > 0) {
        await element.screenshot({ path: screenshotPath });
        console.log(`✅ Saved element screenshot: ${screenshotPath}`);
      } else {
        console.log(
          `⚠️  Selector not found, taking full page: ${options.selector}`
        );
        await page.screenshot({
          path: screenshotPath,
          fullPage: options.fullPage || false,
        });
        console.log(`✅ Saved fallback screenshot: ${screenshotPath}`);
      }
    } else {
      await page.screenshot({
        path: screenshotPath,
        fullPage: options.fullPage || false,
      });
      console.log(`✅ Saved screenshot: ${screenshotPath}`);
    }

    return screenshotPath;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options: ScreenshotOptions = {
    url: "/",
    name: "screenshot",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        options.url = args[++i];
        break;
      case "--name":
        options.name = args[++i];
        break;
      case "--viewport":
        const vp = args[++i];
        options.viewport =
          vp in VIEWPORTS ? (vp as keyof typeof VIEWPORTS) : VIEWPORTS.desktop;
        break;
      case "--selector":
        options.selector = args[++i];
        break;
      case "--full-page":
        options.fullPage = true;
        break;
      case "--output":
        options.output = args[++i];
        break;
      case "--help":
        console.log(`
Screenshot Capture Tool for PR Visual Reviews

Usage:
  bun scripts/screenshot-prs.ts [options]

Options:
  --url <path>         URL path to screenshot (default: /)
  --name <name>        Output filename without extension (default: screenshot)
  --viewport <preset>  Viewport preset: mobile|tablet|desktop|wide (default: desktop)
  --selector <css>     CSS selector for specific element screenshot
  --full-page          Capture full page instead of viewport
  --output <dir>       Output directory (default: ./screenshots)
  --help               Show this help message

Examples:
  # Basic page screenshot
  bun scripts/screenshot-prs.ts --url /docs/overview --name overview

  # Mobile viewport
  bun scripts/screenshot-prs.ts --url / --name landing-mobile --viewport mobile

  # Specific element
  bun scripts/screenshot-prs.ts --url /docs/overview --selector "aside[class*='sidebar']" --name sidebar

  # Full page screenshot
  bun scripts/screenshot-prs.ts --url /docs --name docs-full --full-page
        `);
        process.exit(0);
    }
  }

  console.log(`\n🎬 Screenshot Capture Starting`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Output: ${options.output || SCREENSHOTS_DIR}\n`);

  await takeScreenshot(options);

  console.log(`\n✨ Screenshot complete!`);
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
