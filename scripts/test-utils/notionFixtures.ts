/**
 * Mock page builders and fixtures for Notion Fetch Test Suite
 * Provides helpers to create test data for various page configurations
 */

import { generateMockUUID } from "./helpers";
import { NOTION_PROPERTIES } from "../constants";

export interface MockNotionPageOptions {
  id?: string;
  title?: string;
  status?: string;
  order?: number;
  language?: string;
  elementType?: string;
  hasTitle?: boolean;
  hasWebsiteBlock?: boolean;
  hasSubItems?: boolean;
  subItemIds?: string[];
  tags?: string[];
  keywords?: string[];
  icon?: string;
  lastEditedTime?: string;
}

export interface MockNotionBlockOptions {
  id?: string;
  type?: string;
  hasChildren?: boolean;
  content?: string;
  imageUrl?: string;
  calloutColor?: string;
  calloutIcon?: string;
}

/**
 * Create a mock Notion page with configurable properties
 */
export const createMockNotionPage = (options: MockNotionPageOptions = {}) => {
  const {
    id = generateMockUUID(),
    title = "Test Page Title",
    status = "Ready to publish",
    order = 1,
    language = "English",
    elementType = "Page",
    hasTitle = true,
    hasWebsiteBlock = true,
    hasSubItems = false,
    subItemIds = [],
    tags = ["comapeo"],
    keywords = ["docs", "comapeo"],
    icon = "📄",
    lastEditedTime = "2024-01-01T00:00:00.000Z",
  } = options;

  const page: any = {
    id,
    last_edited_time: lastEditedTime,
    properties: {
      Status: {
        select: { name: status },
      },
      Order: {
        number: order,
      },
      Language: {
        select: { name: language },
      },
      "Element Type": {
        select: { name: elementType },
      },
      "Sub-item": {
        relation: subItemIds.map(id => ({ id })),
      },
      Tags: {
        multi_select: tags.map(tag => ({ name: tag })),
      },
      Keywords: {
        multi_select: keywords.map(keyword => ({ name: keyword })),
      },
      Icon: {
        rich_text: icon ? [{ plain_text: icon }] : [],
      },
    },
    parent: {
      type: "database_id",
      database_id: "test-database-id",
    },
    url: `https://notion.so/${id}`,
  };

  // Add Title property if hasTitle is true
  if (hasTitle) {
    const titleProperty = {
      title: [{ plain_text: title }],
    };
    page.properties.Title = titleProperty;
    page.properties[NOTION_PROPERTIES.TITLE] = titleProperty;
  }

  // Add Website Block property if hasWebsiteBlock is true
  if (hasWebsiteBlock) {
    page.properties["Website Block"] = {
      rich_text: [{ plain_text: "Present" }],
    };
  }

  return page;
};

/**
 * Create a mock Notion page without Title property (for fallback testing)
 */
export const createMockNotionPageWithoutTitle = (options: MockNotionPageOptions = {}) => {
  return createMockNotionPage({ ...options, hasTitle: false });
};

/**
 * Create a mock Notion page without Website Block (for placeholder testing)
 */
export const createMockNotionPageWithoutWebsiteBlock = (options: MockNotionPageOptions = {}) => {
  return createMockNotionPage({ ...options, hasWebsiteBlock: false });
};

/**
 * Create a mock Toggle section page
 */
export const createMockTogglePage = (options: MockNotionPageOptions = {}) => {
  return createMockNotionPage({ 
    ...options, 
    elementType: "Toggle",
    hasSubItems: true,
    subItemIds: options.subItemIds || [generateMockUUID(), generateMockUUID()],
  });
};

/**
 * Create a mock Heading section page
 */
export const createMockHeadingPage = (options: MockNotionPageOptions = {}) => {
  return createMockNotionPage({ 
    ...options, 
    elementType: "Heading",
  });
};

/**
 * Create a mock page with translation (Portuguese)
 */
export const createMockPortuguesePage = (options: MockNotionPageOptions = {}) => {
  return createMockNotionPage({
    ...options,
    title: options.title || "Página de Teste",
    language: "Portuguese",
  });
};

/**
 * Create a mock page with translation (Spanish)
 */
export const createMockSpanishPage = (options: MockNotionPageOptions = {}) => {
  return createMockNotionPage({
    ...options,
    title: options.title || "Página de Prueba",
    language: "Spanish",
  });
};

/**
 * Create a mock Notion block with configurable properties
 */
export const createMockNotionBlock = (options: MockNotionBlockOptions = {}) => {
  const {
    id = generateMockUUID(),
    type = "paragraph",
    hasChildren = false,
    content = "This is a test paragraph block.",
    imageUrl,
    calloutColor,
    calloutIcon,
  } = options;

  const baseBlock = {
    id,
    has_children: hasChildren,
  };

  switch (type) {
    case "paragraph":
      return {
        ...baseBlock,
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content },
              plain_text: content,
            },
          ],
        },
      };

    case "image":
      return {
        ...baseBlock,
        type: "image",
        image: {
          type: "external",
          external: {
            url: imageUrl || "https://example.com/test-image.jpg",
          },
        },
      };

    case "callout":
      return {
        ...baseBlock,
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: { content },
              plain_text: content,
            },
          ],
          icon: calloutIcon ? { emoji: calloutIcon } : null,
          color: calloutColor || "default",
        },
      };

    case "toggle":
      return {
        ...baseBlock,
        type: "toggle",
        toggle: {
          rich_text: [
            {
              type: "text",
              text: { content },
              plain_text: content,
            },
          ],
        },
      };

    default:
      throw new Error(`Unsupported block type: ${type}`);
  }
};

/**
 * Create a mock image block with specific URL
 */
export const createMockImageBlock = (imageUrl: string, options: MockNotionBlockOptions = {}) => {
  return createMockNotionBlock({
    ...options,
    type: "image",
    imageUrl,
  });
};

/**
 * Create a mock callout block with color
 */
export const createMockCalloutBlock = (
  content: string,
  color: string,
  icon?: string,
  options: MockNotionBlockOptions = {}
) => {
  return createMockNotionBlock({
    ...options,
    type: "callout",
    content,
    calloutColor: color,
    calloutIcon: icon,
  });
};

/**
 * Create a mock database query response
 */
export const createMockDatabaseResponse = (pages: any[], hasMore = false, nextCursor?: string) => {
  return {
    results: pages,
    next_cursor: nextCursor || null,
    has_more: hasMore,
  };
};

/**
 * Create a mock blocks list response
 */
export const createMockBlocksResponse = (blocks: any[], hasMore = false, nextCursor?: string) => {
  return {
    results: blocks,
    next_cursor: nextCursor || null,
    has_more: hasMore,
  };
};

/**
 * Create a complete page family with main page and translations
 */
export const createMockPageFamily = (mainTitle: string, elementType: string = "Page") => {
  const mainPageId = generateMockUUID();
  const enPageId = generateMockUUID();
  const ptPageId = generateMockUUID();
  const esPageId = generateMockUUID();

  const mainPage = createMockNotionPage({
    id: mainPageId,
    title: mainTitle,
    elementType,
    hasSubItems: true,
    subItemIds: [enPageId, ptPageId, esPageId],
  });

  const enPage = createMockNotionPage({
    id: enPageId,
    title: mainTitle,
    language: "English",
  });

  const ptPage = createMockPortuguesePage({
    id: ptPageId,
    title: `${mainTitle} (PT)`,
  });

  const esPage = createMockSpanishPage({
    id: esPageId,
    title: `${mainTitle} (ES)`,
  });

  return {
    mainPage,
    pages: [mainPage, enPage, ptPage, esPage],
    enPage,
    ptPage,
    esPage,
  };
};

/**
 * Create mock markdown content with images
 */
export const createMockMarkdownWithImages = (imageUrls: string[] = []) => {
  let content = "# Test Content\n\nThis is test content.\n\n";
  
  imageUrls.forEach((url, index) => {
    content += `![Test Image ${index + 1}](${url})\n\n`;
  });

  content += "More content after images.";

  return {
    parent: content,
  };
};

/**
 * Create mock processing metrics
 */
export const createMockProcessingMetrics = () => {
  return {
    totalSaved: 1024,
    sectionCount: 3,
    titleSectionCount: 1,
    processedPages: 5,
    totalPages: 5,
    successfulImages: 3,
    failedImages: 1,
  };
};
