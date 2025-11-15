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
    content: {
      [locale]: page,
    } as Record<string, Record<string, any>>,
  };
};
