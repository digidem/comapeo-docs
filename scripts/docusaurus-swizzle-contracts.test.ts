/**
 * Swizzled component contract tests.
 *
 * These tests verify that all upstream Docusaurus APIs our swizzled
 * components depend on still exist in the installed @docusaurus/* packages.
 * They catch breaking changes when upgrading Docusaurus — especially
 * swizzle API removals/renames and type export changes.
 *
 * If a Docusaurus upgrade removes or renames any of these exports,
 * the corresponding test fails, surfacing the exact breakage before
 * it reaches production.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Check that a package's type declaration file contains a specific export.
 * Used for type-only packages that can't be imported at runtime.
 */
function expectTypeExport(pkgDir: string, exportName: string): void {
  const typesPath = `${pkgDir}/src/index.d.ts`;
  expect(fs.existsSync(typesPath), `${typesPath} should exist`).toBe(true);
  const content = fs.readFileSync(typesPath, "utf8");
  expect(
    content.includes(exportName),
    `@docusaurus/types should export "${exportName}"`
  ).toBe(true);
}

describe("Swizzled component upstream contracts", () => {
  describe("theme-original re-exports (wrapper swizzles)", () => {
    // Wrapper swizzles import from @theme-original/* which Docusaurus
    // resolves at build time. We verify the underlying source files exist
    // in the installed theme-classic package.
    it("@theme-original/TOC source exists", () => {
      const p =
        "node_modules/@docusaurus/theme-classic/src/theme/TOC/index.tsx";
      expect(fs.existsSync(p), `${p} should exist`).toBe(true);
    });

    it("@theme-original/DocSidebarItem source exists", () => {
      const p =
        "node_modules/@docusaurus/theme-classic/src/theme/DocSidebarItem/index.tsx";
      expect(fs.existsSync(p), `${p} should exist`).toBe(true);
    });

    it("@theme-original/DocSidebar source exists", () => {
      const p =
        "node_modules/@docusaurus/theme-classic/src/theme/DocSidebar/index.tsx";
      expect(fs.existsSync(p), `${p} should exist`).toBe(true);
    });
  });

  describe("@docusaurus/plugin-content-docs/client exports", () => {
    // Used by DocCard (useDocById, findFirstSidebarItemLink) and
    // LocaleDropdownNavbarItem (useActiveDocContext, etc.)
    // Runtime import fails in vitest (depends on Docusaurus virtual modules),
    // so we verify via the source barrel file.
    const clientSrc =
      "node_modules/@docusaurus/plugin-content-docs/src/client/index.ts";

    function expectClientExport(exportName: string): void {
      expect(fs.existsSync(clientSrc), `${clientSrc} should exist`).toBe(true);
      const content = fs.readFileSync(clientSrc, "utf8");
      expect(
        content.includes(exportName),
        `plugin-content-docs/client should export "${exportName}"`
      ).toBe(true);
    }

    it("exports findFirstSidebarItemLink", () => {
      expectClientExport("findFirstSidebarItemLink");
    });

    it("exports useDocById (added in Docusaurus 3.10)", () => {
      expectClientExport("useDocById");
    });

    it("exports useActiveDocContext", () => {
      expectClientExport("useActiveDocContext");
    });
  });

  describe("@docusaurus/theme-common exports", () => {
    // Used by DocCard (usePluralForm) and LocaleDropdownNavbarItem.
    // Runtime import fails in vitest (depends on Docusaurus virtual modules),
    // so we verify via the source barrel file.
    const themeCommonSrc = "node_modules/@docusaurus/theme-common/src/index.ts";

    it("exports usePluralForm", () => {
      expect(fs.existsSync(themeCommonSrc)).toBe(true);
      const content = fs.readFileSync(themeCommonSrc, "utf8");
      expect(content.includes("usePluralForm")).toBe(true);
    });

    it("exports useHistorySelector", () => {
      expect(fs.existsSync(themeCommonSrc)).toBe(true);
      const content = fs.readFileSync(themeCommonSrc, "utf8");
      expect(content.includes("useHistorySelector")).toBe(true);
    });
  });

  describe("@docusaurus/types type exports", () => {
    // Type-only package — verify via declaration file content.
    // Used by TOC, DocSidebar, DocSidebarItem (WrapperProps) and
    // LocaleDropdownNavbarItem (I18nLocaleConfig)
    const typesDir = "node_modules/@docusaurus/types";

    it("exports WrapperProps type", () => {
      expectTypeExport(typesDir, "WrapperProps");
    });

    it("exports I18nLocaleConfig type", () => {
      expectTypeExport(typesDir, "I18nLocaleConfig");
    });

    it("exports Config type", () => {
      expectTypeExport(typesDir, "Config");
    });
  });

  describe("theme-classic type declarations", () => {
    // DocCard and LocaleDropdownNavbarItem import Props from @theme/*
    // These are declared in theme-classic's type declarations.
    it("@theme/DocCard Props type is declared", () => {
      const p = "node_modules/@docusaurus/theme-classic/src/theme-classic.d.ts";
      expect(fs.existsSync(p), `${p} should exist`).toBe(true);
      const content = fs.readFileSync(p, "utf8");
      expect(
        content.includes("module '@theme/DocCard'"),
        "theme-classic should declare @theme/DocCard module"
      ).toBe(true);
    });

    it("@theme/NavbarItem/LocaleDropdownNavbarItem Props type is declared", () => {
      const p = "node_modules/@docusaurus/theme-classic/src/theme-classic.d.ts";
      const content = fs.readFileSync(p, "utf8");
      expect(
        content.includes("LocaleDropdownNavbarItem"),
        "theme-classic should declare LocaleDropdownNavbarItem"
      ).toBe(true);
    });
  });

  describe("virtual module declarations (module-type-aliases)", () => {
    // Packages like @docusaurus/Translate, @docusaurus/Link, etc. are
    // virtual modules — their types are declared in module-type-aliases
    // and their runtime implementations live in @docusaurus/core.
    // We verify the type declarations exist.
    const aliasesFile =
      "node_modules/@docusaurus/module-type-aliases/src/index.d.ts";

    function expectModuleDeclared(moduleName: string): void {
      expect(fs.existsSync(aliasesFile), `${aliasesFile} should exist`).toBe(
        true
      );
      const content = fs.readFileSync(aliasesFile, "utf8");
      expect(
        content.includes(`declare module '${moduleName}'`),
        `module-type-aliases should declare "${moduleName}"`
      ).toBe(true);
    }

    it("declares @docusaurus/Translate", () => {
      expectModuleDeclared("@docusaurus/Translate");
    });

    it("declares @docusaurus/isInternalUrl", () => {
      expectModuleDeclared("@docusaurus/isInternalUrl");
    });

    it("declares @docusaurus/Link", () => {
      expectModuleDeclared("@docusaurus/Link");
    });

    it("declares @docusaurus/router", () => {
      expectModuleDeclared("@docusaurus/router");
    });

    it("declares @docusaurus/useDocusaurusContext", () => {
      expectModuleDeclared("@docusaurus/useDocusaurusContext");
    });
  });

  describe("DropdownNavbarItem (LocaleDropdownNavbarItem base)", () => {
    // LocaleDropdownNavbarItem extends DropdownNavbarItem
    it("@theme/NavbarItem/DropdownNavbarItem source exists", () => {
      const p =
        "node_modules/@docusaurus/theme-classic/src/theme/NavbarItem/DropdownNavbarItem/index.tsx";
      expect(fs.existsSync(p), `${p} should exist`).toBe(true);
    });

    it("@theme/Icon/Language source exists", () => {
      const p =
        "node_modules/@docusaurus/theme-classic/src/theme/Icon/Language/index.tsx";
      expect(fs.existsSync(p), `${p} should exist`).toBe(true);
    });
  });
});
