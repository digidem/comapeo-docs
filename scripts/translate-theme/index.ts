/**
 * Standalone Theme-Chrome Translation Module (Issue #192 Phase 3)
 *
 * Translates theme UI strings (navbar, footer) from docusaurus.config.ts
 * and provides translation helpers.
 */

export * from "./types.js";
export * from "./languageNames.js";
export * from "./navbarFooter.js";
export * from "./translateJson.js";
export * from "./translateTheme.js";

// If executed directly, run theme config translation
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateThemeConfig } from "./translateTheme.js";

const modulePath = fileURLToPath(import.meta.url);
const isExecutedDirectly =
  process.argv[1] !== undefined &&
  (path.resolve(process.argv[1]) === modulePath ||
    path.resolve(process.argv[1]) === path.dirname(modulePath));

if (process.env.NODE_ENV !== "test" && isExecutedDirectly) {
  translateThemeConfig()
    .then((failures) => {
      if (failures.length > 0) {
        console.warn(
          `Completed with ${failures.length} theme translation failures.`
        );
        process.exitCode = 1;
      }
      return null;
    })
    .catch((err) => {
      console.error("Fatal error translating theme config:", err);
      process.exitCode = 1;
    });
}
