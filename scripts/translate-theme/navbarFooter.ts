/* eslint-disable security/detect-object-injection -- dictionary construction for translation catalog keys */
import type {
  NavbarConfig,
  FooterConfig,
  NavbarItem,
  FooterSection,
  FooterLink,
  TranslatableDictionary,
} from "./types.js";

/**
 * Extracts translatable text from navbar/footer config and converts to i18n format.
 * @param config The navbar or footer config object
 * @param type Either 'navbar' or 'footer'
 * @returns Dictionary of translation keys, messages, and descriptions
 */
export function extractTranslatableText(
  config: NavbarConfig | FooterConfig,
  type: "navbar" | "footer"
): TranslatableDictionary {
  const result: TranslatableDictionary = {};

  if (type === "navbar") {
    const nav = config as NavbarConfig;
    if (nav.items) {
      nav.items.forEach((item: NavbarItem) => {
        if (item.label) {
          const key = `item.label.${item.label}`;
          result[key] = {
            message: item.label,
            description: `Navbar item with label ${item.label}`,
          };
        }
      });
    }

    // Docusaurus's own navbar i18n key (see @docusaurus/theme-classic
    // translations.js): required or the logo alt text is dropped at runtime.
    if (nav.logo?.alt) {
      result["logo.alt"] = {
        message: nav.logo.alt,
        description: "The alt text of navbar logo",
      };
    }
  }

  if (type === "footer") {
    const footer = config as FooterConfig;
    if (footer.links) {
      footer.links.forEach((section: FooterSection) => {
        if (section.title) {
          const titleKey = `links.title.${section.title}`;
          result[titleKey] = {
            message: section.title,
            description: `Footer section title: ${section.title}`,
          };

          // Docusaurus's own footer i18n key (see @docusaurus/theme-classic
          // translations.js): required or translations are dropped at runtime.
          const docusaurusTitleKey = `link.title.${section.title}`;
          result[docusaurusTitleKey] = {
            message: section.title,
            description: `The title of the footer links column with title=${section.title} in the footer`,
          };
        }

        if (section.items) {
          section.items.forEach((item: FooterLink) => {
            if (item.label) {
              const labelKey = `links.${section.title}.${item.label}`;
              result[labelKey] = {
                message: item.label,
                description: `Footer link label: ${item.label}`,
              };

              // Docusaurus's own footer i18n key (see @docusaurus/theme-classic
              // translations.js): required or translations are dropped at runtime.
              const docusaurusLabelKey = `link.item.label.${item.label}`;
              result[docusaurusLabelKey] = {
                message: item.label,
                description: `The label of footer link with label=${item.label} linking to ${item.href ?? ""}`,
              };
            }
          });
        }
      });
    }

    if (footer.copyright) {
      result["copyright"] = {
        message: footer.copyright.replace(
          /\$\{new Date\(\)\.getFullYear\(\)\}/,
          new Date().getFullYear().toString()
        ),
        description: "Footer copyright text",
      };
    }
  }

  return result;
}
