/**
 * Docusaurus config validation test.
 *
 * Validates that docusaurus.config.ts loads without runtime errors and
 * has all required fields. Catches config-level breaking changes when
 * upgrading Docusaurus — config schema changes, import path changes,
 * type export renames, etc.
 *
 * Note: docusaurus.config.ts uses top-level await and ESM imports that
 * require the Docusaurus build context. We validate the config shape by
 * importing it as a module (Bun/vitest handles the ESM transpilation).
 */
import { describe, it, expect } from "vitest";

describe("Docusaurus config validation", () => {
  it("config module should export a default config object", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("should have required top-level fields", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(config.title).toBeDefined();
    expect(typeof config.title).toBe("string");
    expect(config.url).toBeDefined();
    expect(typeof config.url).toBe("string");
    expect(config.baseUrl).toBeDefined();
    expect(typeof config.baseUrl).toBe("string");
  });

  it("should have correct i18n configuration", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(config.i18n).toBeDefined();
    expect(config.i18n.defaultLocale).toBe("en");
    expect(config.i18n.locales).toEqual(["en", "pt", "es"]);
  });

  it("should have localeConfigs for all locales", async () => {
    const config = (await import("../docusaurus.config")).default;
    const { localeConfigs } = config.i18n;
    expect(localeConfigs.en).toBeDefined();
    expect(localeConfigs.pt).toBeDefined();
    expect(localeConfigs.es).toBeDefined();
    // Each should have a label
    expect(localeConfigs.en.label).toBe("English");
    expect(localeConfigs.pt.label).toBe("Português");
    expect(localeConfigs.es.label).toBe("Español");
  });

  it("should have presets array", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(Array.isArray(config.presets)).toBe(true);
    expect(config.presets.length).toBeGreaterThan(0);
  });

  it("should have plugins array", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(Array.isArray(config.plugins)).toBe(true);
  });

  it("should have customFields with expected keys", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(config.customFields).toBeDefined();
    expect(config.customFields.defaultDocsPage).toBeDefined();
    expect(config.customFields.localizedDocKeysByLocale).toBeDefined();
  });

  it("should have markdown hooks config (3.10+ pattern)", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(config.markdown).toBeDefined();
    expect(config.markdown.hooks).toBeDefined();
    expect(config.markdown.hooks.onBrokenMarkdownLinks).toBeDefined();
  });

  it("should have production URL", async () => {
    const config = (await import("../docusaurus.config")).default;
    expect(config.url).toBe("https://docs.comapeo.app");
  });
});
