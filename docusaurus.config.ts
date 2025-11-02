import fs from "node:fs";
import path from "node:path";
import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import dotenv from "dotenv";
import remarkFixImagePaths from "./scripts/remark-fix-image-paths";

// Load environment variables from .env file
dotenv.config();

const docsRoot = path.join(__dirname, "docs");

const collectDocRouteInfo = (root: string) => {
  const explicitSlugs = new Set<string>();
  const docIds = new Set<string>();
  const relativePaths = new Set<string>();

  if (!fs.existsSync(root)) {
    return { explicitSlugs, docIds, relativePaths };
  }

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (!entry.name.endsWith(".md") && !entry.name.endsWith(".mdx")) {
        continue;
      }

      const relativePath = path
        .relative(root, entryPath)
        .replace(/\\/g, "/")
        .replace(/(index)?\.(md|mdx)$/i, "")
        .replace(/(^\/|\/$)/g, "");

      if (relativePath) {
        relativePaths.add(relativePath);
      }

      try {
        const content = fs.readFileSync(entryPath, "utf8");
        if (content.startsWith("---")) {
          const closingIndex = content.indexOf("---", 3);
          if (closingIndex !== -1) {
            const frontmatter = content.slice(3, closingIndex);
            const slugMatch = frontmatter.match(
              /^slug:\s*["']?(\/?[^"'\n]+)["']?/m
            );
            if (slugMatch?.[1]) {
              const explicit = slugMatch[1].replace(/(^\/|\/$)/g, "").trim();
              if (explicit) {
                explicitSlugs.add(explicit);
              }
            }

            const idMatch = frontmatter.match(/^id:\s*["']?([^"'\n]+)["']?/m);
            if (idMatch?.[1]) {
              const docId = idMatch[1].trim();
              if (docId) {
                docIds.add(docId);
              }
            } else if (relativePath) {
              docIds.add(relativePath);
            }
          }
        }
      } catch (error) {
        console.warn(
          `[docusaurus] Unable to read doc frontmatter for ${entryPath}:`,
          error
        );
      }
    }
  };

  walk(root);
  return { explicitSlugs, docIds, relativePaths };
};

const DOC_ROUTE_INFO = collectDocRouteInfo(docsRoot);
const ALL_DOC_PATHS = new Set<string>([
  ...DOC_ROUTE_INFO.explicitSlugs,
  ...DOC_ROUTE_INFO.docIds,
]);

const resolveDefaultDocsPage = (
  value: string | undefined,
  validSlugs: Set<string>
): string => {
  const preferredFallbackCandidates = [
    "overview",
    "doc-overview",
    "introduction",
    "doc-introduction",
  ];

  const preferredFallback =
    preferredFallbackCandidates.find((candidate) =>
      validSlugs.has(candidate)
    ) ??
    Array.from(validSlugs)[0] ??
    "overview";

  const sanitize = (candidate?: string): string | undefined => {
    if (!candidate) return undefined;
    const trimmed = candidate.trim();
    if (!trimmed) return undefined;
    if (!/^[a-z0-9\-/]+$/i.test(trimmed)) {
      console.warn(
        `[docusaurus] DEFAULT_DOCS_PAGE="${trimmed}" contains invalid characters; ignoring.`
      );
      return undefined;
    }
    return trimmed.replace(/(^\/|\/$)/g, "");
  };

  const sanitized = sanitize(value);

  if (sanitized && validSlugs.has(sanitized)) {
    return sanitized;
  }

  if (sanitized && !validSlugs.has(sanitized)) {
    console.warn(
      `[docusaurus] DEFAULT_DOCS_PAGE="${sanitized}" not found under docs/. Falling back to "${preferredFallback}".`
    );
  }

  return preferredFallback;
};

const DEFAULT_DOCS_PAGE = resolveDefaultDocsPage(
  process.env.DEFAULT_DOCS_PAGE,
  ALL_DOC_PATHS
);

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "Comapeo Documentation",
  tagline: "Learn how to use the CoMapeo platform",
  favicon: "img/favicon.ico",

  // Custom fields to pass environment variables to client-side code
  customFields: {
    defaultDocsPage: DEFAULT_DOCS_PAGE,
  },

  // Set the production url of your site here
  url: "https://docs.comapeo.app",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: process.env.BASE_URL || "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "awana-digital", // Usually your GitHub org/user name.
  projectName: "comapeo-docs", // Usually your repo name.

  onBrokenLinks: "throw",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en", "pt", "es"],
    localeConfigs: {
      en: {
        label: "English",
        htmlLang: "en-US",
      },
      pt: {
        label: "Português",
        htmlLang: "pt-BR",
      },
      es: {
        label: "Español",
        htmlLang: "es-ES",
      },
    },
  },

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        redirects: [
          // Redirect `/docs` and `/docs/` to default docs page (configurable via DEFAULT_DOCS_PAGE env var)
          {
            to: `/docs/${DEFAULT_DOCS_PAGE}`,
            from: "/docs",
          },
        ],
      },
    ],
    [
      "@docusaurus/plugin-pwa",
      {
        debug: true,
        offlineModeActivationStrategies: [
          "appInstalled",
          "standalone",
          "queryString",
        ],
        pwaHead: [
          {
            tagName: "link",
            rel: "icon",
            href: "/img/comapeo.png",
          },
          {
            tagName: "link",
            rel: "manifest",
            href: "/manifest.json", // your PWA manifest
          },
          {
            tagName: "meta",
            name: "theme-color",
            content: "#050F77",
          },
        ],
      },
    ],
    // [
    //   '@docusaurus/preset-classic',
    //   {
    //     sitemap: {
    //       lastmod: 'date',
    //       changefreq: 'weekly',
    //       priority: 0.5,
    //       ignorePatterns: ['/tags/**'],
    //       filename: 'sitemap.xml',
    //       createSitemapItems: async (params) => {
    //         const { defaultCreateSitemapItems, ...rest } = params;
    //         const items = await defaultCreateSitemapItems(rest);
    //         return items.filter((item) => !item.url.includes('/page/'));
    //       },
    //     },
    //   },
    // ],
    // [
    //   '@docusaurus/preset-classic',
    //   {
    //     gtag: {
    //       trackingID: 'G-999X9XX9XX',
    //       anonymizeIP: true,
    //     },
    //   },
    // ],
    [
      "@docusaurus/plugin-ideal-image",
      {
        quality: 70,
        max: 1030, // max resized image's size.
        min: 640, // min resized image's size. if original is lower, use that size.
        steps: 2, // the max number of images generated between min and max (inclusive)
        disableInDev: false,
      },
    ],
  ],
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          sidebarPath: "./src/components/sidebars.ts",
          remarkPlugins: [remarkFixImagePaths],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            "https://github.com/digidem/comapeo-docs/tree/main/packages/create-docusaurus/templates/shared/",
          lastVersion: "current",
          versions: {
            current: {
              label: "Latest",
            },
          },
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: "img/comapeo-social-card.jpg",
    navbar: {
      // title: 'CoMapeo',
      logo: {
        alt: "CoMapeo",
        src: "img/comapeo_icon.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          type: "docsVersionDropdown",
          position: "left",
          dropdownActiveClassDisabled: true,
        },
        {
          type: "localeDropdown",
          position: "right",
        },
        {
          href: "https://github.com/digidem/comapeo-docs",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Awana Digital",
          items: [
            {
              label: "Website",
              href: "https://awana.digital",
            },
            {
              label: "Discord",
              href: "https://discord.gg/NtZgtAjj",
            },
            {
              label: "Bluesky",
              href: "https://bsky.app/profile/awana.digital",
            },
            {
              label: "Blog",
              href: "https://awana.digital/blog",
            },
          ],
        },
        {
          title: "CoMapeo",
          items: [
            {
              label: "Website",
              href: "https://comapeo.app",
            },
            {
              label: "CoMapeo Mobile GitHub",
              href: "https://github.com/digidem/comapeo-docs",
            },
            {
              label: "CoMapeo Desktop GitHub",
              href: "https://github.com/digidem/comapeo-docs",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "PlayStore",
              href: "https://play.google.com/store/apps/details?id=com.comapeo",
            },
            {
              label: "GitHub",
              href: "https://github.com/digidem/comapeo-docs",
            },
            {
              label: "Earth Defenders Toolkit",
              href: "https://www.earthdefenderstoolkit.com/",
            },
          ],
        },
      ],
      copyright: `Made with ❤️ by Awana Digital - ${new Date().getFullYear()}`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
