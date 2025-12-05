import { NOTION_PROPERTIES } from "../constants";

const PARENT_RELATION_PROPERTY = "Parent item";
const SUBITEM_RELATION_PROPERTY = "Sub-item";
const LANGUAGE_PROPERTY = NOTION_PROPERTIES.LANGUAGE || "Language";
const ORDER_PROPERTY = NOTION_PROPERTIES.ORDER || "Order";
const ELEMENT_TYPE_PROPERTY = NOTION_PROPERTIES.ELEMENT_TYPE || "Element Type";

type NotionPage = Record<string, any>;

function getRelationIds(
  page: NotionPage | undefined,
  property: string
): string[] {
  if (!page?.properties?.[property]) {
    return [];
  }

  const relationProperty = page.properties[property];
  const relation = Array.isArray(relationProperty?.relation)
    ? relationProperty.relation
    : [];

  return relation
    .map((entry: any) => entry?.id)
    .filter((id: string | undefined): id is string => Boolean(id));
}

function buildPageIndex(pages: NotionPage[]): Map<string, NotionPage> {
  const index = new Map<string, NotionPage>();
  for (const page of pages) {
    if (page?.id) {
      index.set(page.id, page);
    }
  }
  return index;
}

function getLanguage(page: NotionPage): string | null {
  const languageProperty = page?.properties?.[LANGUAGE_PROPERTY];
  const fallbackLanguage = page?.properties?.Language;
  const selectValue = languageProperty?.select ?? fallbackLanguage?.select;
  return selectValue?.name ?? null;
}

function getElementType(page: NotionPage): string {
  const elementTypeProperty =
    page?.properties?.[ELEMENT_TYPE_PROPERTY] ??
    page?.properties?.["Element Type"];

  const value =
    elementTypeProperty?.select?.name ??
    elementTypeProperty?.name ??
    (typeof elementTypeProperty === "string" ? elementTypeProperty : "");

  return typeof value === "string" ? value.toLowerCase() : "";
}

function getOrder(page: NotionPage): number {
  const orderProperty = page?.properties?.[ORDER_PROPERTY];
  if (
    orderProperty &&
    typeof orderProperty === "object" &&
    typeof orderProperty.number === "number"
  ) {
    return orderProperty.number;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortPagesByOrder(pages: NotionPage[]): NotionPage[] {
  return [...pages].sort((a, b) => getOrder(a) - getOrder(b));
}

function collectContextualIds(
  sortedPages: NotionPage[],
  targetIndex: number
): string[] {
  if (targetIndex <= 0) {
    return [];
  }

  const contextIds: string[] = [];
  let foundTitle = false;

  for (let i = targetIndex - 1; i >= 0; i--) {
    const candidate = sortedPages[i];
    if (!candidate?.id) {
      continue;
    }

    const elementType = getElementType(candidate);

    if (elementType === "toggle") {
      contextIds.unshift(candidate.id);
      continue;
    }

    if (elementType === "title" || elementType === "heading") {
      contextIds.unshift(candidate.id);
      foundTitle = true;
      break;
    }

    // Skip other page types but continue scanning until we hit a title/heading
  }

  if (!foundTitle) {
    return contextIds;
  }

  return contextIds;
}

function isTranslationPage(page: NotionPage): boolean {
  const language = getLanguage(page);
  if (!language) {
    return false;
  }
  return language.toLowerCase() !== "english";
}

function collectAncestorIds(
  pageId: string,
  pageIndex: Map<string, NotionPage>,
  visited: Set<string> = new Set()
): string[] {
  const page = pageIndex.get(pageId);
  if (!page) {
    return [];
  }

  const parents = getRelationIds(page, PARENT_RELATION_PROPERTY).filter(
    (parentId) => !visited.has(parentId)
  );

  const ancestors: string[] = [];
  for (const parentId of parents) {
    visited.add(parentId);
    ancestors.push(...collectAncestorIds(parentId, pageIndex, visited));
    ancestors.push(parentId);
  }
  return ancestors;
}

function collectDescendantIds(
  rootId: string,
  pageIndex: Map<string, NotionPage>
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [
    ...getRelationIds(pageIndex.get(rootId), SUBITEM_RELATION_PROPERTY),
  ];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const currentPage = pageIndex.get(currentId);
    if (!currentPage) {
      continue;
    }

    if (isTranslationPage(currentPage)) {
      continue;
    }

    result.push(currentId);
    const children = getRelationIds(currentPage, SUBITEM_RELATION_PROPERTY);
    for (const childId of children) {
      if (!visited.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return result;
}

function getTranslationIds(
  page: NotionPage,
  pageIndex: Map<string, NotionPage>
): string[] {
  return getRelationIds(page, SUBITEM_RELATION_PROPERTY).filter((id) => {
    const related = pageIndex.get(id);
    if (!related) {
      return false;
    }
    return isTranslationPage(related);
  });
}

export function buildFetchOneSelection(
  pages: NotionPage[],
  rootPageId: string
): {
  orderedPages: NotionPage[];
  stats: { ancestors: number; descendants: number; translations: number };
} {
  const pageIndex = buildPageIndex(pages);
  const rootPage = pageIndex.get(rootPageId);

  if (!rootPage) {
    return {
      orderedPages: [],
      stats: { ancestors: 0, descendants: 0, translations: 0 },
    };
  }

  const ancestorIds = collectAncestorIds(rootPageId, pageIndex);
  const sortedPages = sortPagesByOrder(pages);
  const targetIndex = sortedPages.findIndex((page) => page?.id === rootPageId);
  const contextualIds =
    targetIndex >= 0 ? collectContextualIds(sortedPages, targetIndex) : [];
  const descendantIds = collectDescendantIds(rootPageId, pageIndex);

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  let translationCount = 0;

  const addPageAndTranslations = (
    pageId: string,
    { includeTranslations = true }: { includeTranslations?: boolean } = {}
  ) => {
    if (seen.has(pageId)) {
      return;
    }
    const page = pageIndex.get(pageId);
    if (!page) {
      return;
    }
    orderedIds.push(pageId);
    seen.add(pageId);

    if (!includeTranslations) {
      return;
    }

    const translationIds = getTranslationIds(page, pageIndex);
    for (const translationId of translationIds) {
      if (seen.has(translationId)) {
        continue;
      }
      const translationPage = pageIndex.get(translationId);
      if (!translationPage) {
        continue;
      }
      orderedIds.push(translationId);
      seen.add(translationId);
      translationCount++;
    }
  };

  for (const contextualId of contextualIds) {
    addPageAndTranslations(contextualId, { includeTranslations: false });
  }
  for (const ancestorId of ancestorIds) {
    addPageAndTranslations(ancestorId);
  }
  addPageAndTranslations(rootPageId);
  for (const descendantId of descendantIds) {
    addPageAndTranslations(descendantId);
  }

  return {
    orderedPages: orderedIds
      .map((id) => pageIndex.get(id))
      .filter((page): page is NotionPage => Boolean(page)),
    stats: {
      ancestors: ancestorIds.length,
      descendants: descendantIds.length,
      translations: translationCount,
    },
  };
}
