/* eslint-disable security/detect-object-injection -- Notion API responses require dynamic property access */
import { NOTION_PROPERTIES } from "../constants";
import config from "../../docusaurus.config";

const DEFAULT_LOCALE = config.i18n.defaultLocale;
const LEGACY_SECTION_PROPERTY = "Section";
const FALLBACK_TITLE_PREFIX = "untitled";

const LANGUAGE_NAME_TO_LOCALE: Record<string, string> = {
  English: "en",
  Spanish: "es",
  Portuguese: "pt",
};
const LOCALE_PRIORITY = new Map(
  config.i18n.locales.map((locale, index) => [locale, index])
);

/**
 * Sort locales deterministically with default locale first.
 *
 * Remaining locales follow configured i18n order, with unknown locales sorted
 * alphabetically as a stable fallback.
 */
export const getOrderedLocales = (locales: string[]): string[] => {
  const uniqueLocales = [...new Set(locales)];

  return uniqueLocales.sort((a, b) => {
    if (a === DEFAULT_LOCALE && b !== DEFAULT_LOCALE) {
      return -1;
    }
    if (b === DEFAULT_LOCALE && a !== DEFAULT_LOCALE) {
      return 1;
    }

    const aPriority = LOCALE_PRIORITY.get(a);
    const bPriority = LOCALE_PRIORITY.get(b);

    if (aPriority !== undefined && bPriority !== undefined) {
      return aPriority - bPriority;
    }
    if (aPriority !== undefined) {
      return -1;
    }
    if (bPriority !== undefined) {
      return 1;
    }

    return a.localeCompare(b);
  });
};

const orderContentByLocale = (
  content: Record<string, Record<string, any>>
): Record<string, Record<string, any>> => {
  const orderedContent: Record<string, Record<string, any>> = {};
  for (const locale of getOrderedLocales(Object.keys(content))) {
    orderedContent[locale] = content[locale];
  }
  return orderedContent;
};

/**
 * Get the Element Type property from a page, with fallback to legacy Section property
 */
export const getElementTypeProperty = (page: Record<string, any>) =>
  page?.properties?.[NOTION_PROPERTIES.ELEMENT_TYPE] ??
  page?.properties?.[LEGACY_SECTION_PROPERTY];

/**
 * Extract plain text from a Notion property
 */
const extractPlainText = (property: any): string | undefined => {
  if (!property) {
    return undefined;
  }

  if (typeof property === "string") {
    return property;
  }

  const candidates = Array.isArray(property.title)
    ? property.title
    : Array.isArray(property.rich_text)
      ? property.rich_text
      : [];

  for (const item of candidates) {
    if (item?.plain_text) {
      return item.plain_text;
    }
    if (item?.text?.content) {
      return item.text.content;
    }
  }

  return undefined;
};

/**
 * Resolve the title of a Notion page from various property candidates
 *
 * @param page - The Notion page object
 * @returns The resolved page title or a fallback untitled-{id}
 */
export const resolvePageTitle = (page: Record<string, any>): string => {
  const properties = page?.properties ?? {};
  const candidates = [
    properties[NOTION_PROPERTIES.TITLE],
    properties.Title,
    properties.title,
  ];

  for (const candidate of candidates) {
    const resolved = extractPlainText(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const fallbackId = (page?.id ?? "page").slice(0, 8);
  return `${FALLBACK_TITLE_PREFIX}-${fallbackId}`;
};

/**
 * Resolve the locale/language of a Notion page
 *
 * @param page - The Notion page object
 * @returns The resolved locale code (e.g., 'en', 'es', 'pt') or default locale
 */
export const resolvePageLocale = (page: Record<string, any>): string => {
  const languageProperty =
    page?.properties?.[NOTION_PROPERTIES.LANGUAGE] ??
    page?.properties?.Language;

  const languageName = languageProperty?.select?.name;
  if (languageName && LANGUAGE_NAME_TO_LOCALE[languageName]) {
    return LANGUAGE_NAME_TO_LOCALE[languageName];
  }

  return DEFAULT_LOCALE;
};

/**
 * Group related pages by language into a unified structure
 *
 * @param pages - All pages to search through for related sub-items
 * @param page - The main page to group
 * @returns Grouped page structure with content by locale
 */
export const groupPagesByLang = (
  pages: Array<Record<string, any>>,
  page: Record<string, any>
) => {
  const elementType = getElementTypeProperty(page);
  const sectionName = (
    elementType?.select?.name ??
    elementType?.name ??
    elementType ??
    ""
  )
    .toString()
    .trim();

  const grouped = {
    mainTitle: resolvePageTitle(page),
    section: sectionName,
    content: {} as Record<string, Record<string, any>>,
  };

  const subItemRelation = page?.properties?.["Sub-item"]?.relation ?? [];

  for (const relation of subItemRelation) {
    const subpage = pages.find((candidate) => candidate.id === relation?.id);
    if (!subpage) {
      continue;
    }

    const lang = resolvePageLocale(subpage);
    grouped.content[lang] = subpage;
  }

  const parentLocale = resolvePageLocale(page);
  if (!grouped.content[parentLocale]) {
    grouped.content[parentLocale] = page;
  }

  grouped.content = orderContentByLocale(grouped.content);

  return grouped;
};

/**
 * Create a standalone page group for a page without sub-items
 *
 * @param page - The page to create a standalone group for
 * @returns Standalone page group structure
 */
export const createStandalonePageGroup = (page: Record<string, any>) => {
  const elementType = getElementTypeProperty(page);
  const sectionName = (
    elementType?.select?.name ??
    elementType?.name ??
    elementType ??
    ""
  )
    .toString()
    .trim();
  const locale = resolvePageLocale(page);

  return {
    mainTitle: resolvePageTitle(page),
    section: sectionName,
    content: orderContentByLocale({
      [locale]: page,
    }) as Record<string, Record<string, any>>,
  };
};

/**
 * Result of checking translation siblings
 */
export interface TranslationSiblingsResult {
  /** All available translation locales for this page */
  availableLocales: string[];
  /** Missing translation locales (es, pt) */
  missingLocales: string[];
  /** Whether all translations (es, pt) exist */
  hasAllTranslations: boolean;
  /** The grouped page content */
  groupedPage: ReturnType<typeof groupPagesByLang>;
}

/**
 * Supported translation locales (excluding English which is the source)
 */
const TRANSLATION_LOCALES = ["es", "pt"];

/**
 * Check if translation siblings exist for Spanish and Portuguese
 *
 * This function checks if a page has translation siblings for Spanish (es) and
 * Portuguese (pt). It returns information about which translations exist and
 * which are missing.
 *
 * @param pages - All pages to search through for related sub-items
 * @param page - The page to check for translation siblings
 * @returns Translation siblings check result
 *
 * @example
 * ```ts
 * const result = ensureTranslationSiblings(allPages, englishPage);
 * if (!result.hasAllTranslations) {
 *   console.log("Missing translations:", result.missingLocales);
 * }
 * ```
 */
export const ensureTranslationSiblings = (
  pages: Array<Record<string, any>>,
  page: Record<string, any>
): TranslationSiblingsResult => {
  const grouped = groupPagesByLang(pages, page);
  const availableLocales = getOrderedLocales(Object.keys(grouped.content));

  const missingLocales = TRANSLATION_LOCALES.filter(
    (locale) => !availableLocales.includes(locale)
  );

  return {
    availableLocales,
    missingLocales,
    hasAllTranslations: missingLocales.length === 0,
    groupedPage: grouped,
  };
};

/**
 * Get all translation locales for a page
 *
 * Returns an array of locale codes that have content for the given page,
 * including English and any available translations.
 *
 * @param pages - All pages to search through for related sub-items
 * @param page - The page to get translation locales for
 * @returns Array of available locale codes
 *
 * @example
 * ```ts
 * const locales = getTranslationLocales(allPages, englishPage);
 * // Returns: ["en", "es", "pt"] if all translations exist
 * // Returns: ["en", "es"] if Portuguese is missing
 * ```
 */
export const getTranslationLocales = (
  pages: Array<Record<string, any>>,
  page: Record<string, any>
): string[] => {
  const grouped = groupPagesByLang(pages, page);
  return getOrderedLocales(Object.keys(grouped.content));
};

/**
 * Check if a specific translation locale exists for a page
 *
 * @param pages - All pages to search through for related sub-items
 * @param page - The page to check
 * @param locale - The locale to check for (e.g., "es", "pt")
 * @returns true if the translation exists
 *
 * @example
 * ```ts
 * const hasSpanish = hasTranslation(allPages, englishPage, "es");
 * const hasPortuguese = hasTranslation(allPages, englishPage, "pt");
 * ```
 */
export const hasTranslation = (
  pages: Array<Record<string, any>>,
  page: Record<string, any>,
  locale: string
): boolean => {
  const locales = getTranslationLocales(pages, page);
  return locales.includes(locale);
};

/**
 * Get missing translation locales for a page
 *
 * Returns an array of locale codes that are missing translations for the
 * given page. Only checks for Spanish (es) and Portuguese (pt).
 *
 * @param pages - All pages to search through for related sub-items
 * @param page - The page to check for missing translations
 * @returns Array of missing locale codes
 *
 * @example
 * ```ts
 * const missing = getMissingTranslations(allPages, englishPage);
 * // Returns: ["pt"] if Portuguese is missing
 * // Returns: [] if all translations exist
 * ```
 */
export const getMissingTranslations = (
  pages: Array<Record<string, any>>,
  page: Record<string, any>
): string[] => {
  const result = ensureTranslationSiblings(pages, page);
  return result.missingLocales;
};

/**
 * Get the English title from a grouped page structure.
 * Returns undefined if no English version exists.
 *
 * @param pageByLang - Grouped page structure with content by locale
 * @returns English title to use as translation key, or undefined if no English page
 */
export const getEnglishTitle = (pageByLang: {
  mainTitle: string;
  content: Record<string, any>;
}): string | undefined => {
  const englishPage = pageByLang.content[DEFAULT_LOCALE];
  if (!englishPage) {
    return undefined;
  }
  const englishTitle = resolvePageTitle(englishPage);
  if (!englishTitle || englishTitle.startsWith(`${FALLBACK_TITLE_PREFIX}-`)) {
    return undefined;
  }
  return englishTitle;
};
