import { describe, it, expect } from "vitest";
import { extractTranslatableText } from "../navbarFooter.js";

describe("translate-theme: navbarFooter", () => {
  describe("navbar extraction", () => {
    it("extracts navbar item labels and logo.alt", () => {
      const result = extractTranslatableText(
        {
          logo: { alt: "CoMapeo Logo" },
          items: [
            { label: "Documentation", type: "docSidebar" },
            { label: "Community", href: "https://example.org" },
          ],
        },
        "navbar"
      );

      expect(result).toEqual({
        "item.label.Documentation": {
          message: "Documentation",
          description: "Navbar item with label Documentation",
        },
        "item.label.Community": {
          message: "Community",
          description: "Navbar item with label Community",
        },
        "logo.alt": {
          message: "CoMapeo Logo",
          description: "The alt text of navbar logo",
        },
      });
    });

    it("omits logo.alt when navbar has no logo", () => {
      const result = extractTranslatableText(
        {
          items: [{ label: "Overview" }],
        },
        "navbar"
      );

      expect(result).not.toHaveProperty("logo.alt");
      expect(result["item.label.Overview"]).toBeDefined();
    });

    it("handles empty navbar config gracefully", () => {
      const result = extractTranslatableText({}, "navbar");
      expect(result).toEqual({});
    });
  });

  describe("footer extraction", () => {
    it("extracts footer section titles and link items with both keys", () => {
      const result = extractTranslatableText(
        {
          links: [
            {
              title: "Docs",
              items: [
                { label: "Getting Started", href: "/docs/intro" },
                { label: "Tutorial", href: "/docs/tutorial" },
              ],
            },
          ],
          copyright: `Copyright © ${new Date().getFullYear()} Digital Democracy`,
        },
        "footer"
      );

      // Section titles
      expect(result["links.title.Docs"]).toEqual({
        message: "Docs",
        description: "Footer section title: Docs",
      });
      expect(result["link.title.Docs"]).toBeDefined();

      // Section items
      expect(result["links.Docs.Getting Started"]).toEqual({
        message: "Getting Started",
        description: "Footer link label: Getting Started",
      });
      expect(result["link.item.label.Getting Started"]).toBeDefined();

      // Copyright
      expect(result["copyright"]).toBeDefined();
      expect(result["copyright"].message).toContain(
        new Date().getFullYear().toString()
      );
    });

    it("replaces ${new Date().getFullYear()} in copyright if template string is used", () => {
      const currentYear = new Date().getFullYear().toString();
      const result = extractTranslatableText(
        {
          copyright: "Copyright © ${new Date().getFullYear()} CoMapeo",
        },
        "footer"
      );

      expect(result["copyright"]).toEqual({
        message: `Copyright © ${currentYear} CoMapeo`,
        description: "Footer copyright text",
      });
    });

    it("handles empty footer config gracefully", () => {
      const result = extractTranslatableText({}, "footer");
      expect(result).toEqual({});
    });
  });
});
