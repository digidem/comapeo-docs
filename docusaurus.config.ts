import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Comapeo Documentation',
  tagline: 'Learn how to use the CoMapeo platform',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://docs.comapeo.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'awana-digital', // Usually your GitHub org/user name.
  projectName: 'comapeo-docs', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt', 'es'],
    path: 'i18n',
    localeConfigs: {
      en: {
        label: 'English',
        direction: 'ltr',
        htmlLang: 'en-US',
        calendar: 'gregory',
        path: 'en',
      },
      pt: {
        label: 'Português',
        direction: 'ltr',
        htmlLang: 'pt-BR',
        calendar: 'gregory',
        path: 'pt',
      },
      es: {
        label: 'Español',
        direction: 'ltr',
        htmlLang: 'es-ES',
        calendar: 'gregory',
        path: 'es',
      },
    },
  },
  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          // Redirect `/docs` and `/docs/` to `/docs/introduction`
          {
            to: '/docs/introduction',
            from: '/docs',
          },
        ],
      },
    ],
    [
      '@docusaurus/plugin-pwa',
      {
        debug: true,
        offlineModeActivationStrategies: [
          'appInstalled',
          'standalone',
          'queryString',
        ],
        pwaHead: [
          {
            tagName: 'link',
            rel: 'icon',
            href: '/img/comapeo.png',
          },
          {
            tagName: 'link',
            rel: 'manifest',
            href: '/manifest.json', // your PWA manifest
          },
          {
            tagName: 'meta',
            name: 'theme-color',
            content: '#050F77',
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
      '@docusaurus/plugin-ideal-image',
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
      'classic',
      {
        docs: {
          sidebarPath: './src/components/sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/digidem/comapeo-docs/tree/main/packages/create-docusaurus/templates/shared/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/comapeo-social-card.jpg',
    navbar: {
      // title: 'CoMapeo',
      logo: {
        alt: 'CoMapeo',
        src: 'img/comapeo_icon.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/digidem/comapeo-docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Awana Digital',
          items: [
            {
              label: 'Website',
              href: 'https://awana.digital',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/NtZgtAjj',
            },
            {
              label: 'Bluesky',
              href: 'https://bsky.app/profile/awana.digital',
            },
            {
              label: 'Blog',
              href: 'https://awana.digital/blog',
            },
          ],
        },
        {
          title: 'CoMapeo',
          items: [
            {
              label: 'Website',
              href: 'https://comapeo.app',
            },
            {
              label: 'CoMapeo Mobile GitHub',
              href: 'https://github.com/digidem/comapeo-docs',
            },
            {
              label: 'CoMapeo Desktop GitHub',
              href: 'https://github.com/digidem/comapeo-docs',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'PlayStore',
              href: 'https://play.google.com/store/apps/details?id=com.comapeo',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/digidem/comapeo-docs',
            },
            {
              label: 'Earth Defenders Toolkit',
              href: 'https://www.earthdefenderstoolkit.com/',
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
