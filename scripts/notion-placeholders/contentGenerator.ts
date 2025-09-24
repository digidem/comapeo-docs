import { introTemplates } from "./templates/intro";
import { tutorialTemplates } from "./templates/tutorial";
import { referenceTemplates } from "./templates/reference";
import { troubleshootingTemplates } from "./templates/troubleshooting";

export type ContentLength = "short" | "medium" | "long";
export type ContentType =
  | "intro"
  | "tutorial"
  | "reference"
  | "troubleshooting"
  | "general";

export interface ContentGenerationOptions {
  type: ContentType;
  length: ContentLength;
  title?: string;
  language?: "English" | "Spanish" | "Portuguese";
}

export interface NotionBlock {
  type: string;
  [key: string]: any;
}

/**
 * Generates appropriate placeholder content based on page characteristics
 */
export class ContentGenerator {
  private static readonly languageMap = {
    English: "en",
    Spanish: "es",
    Portuguese: "pt",
  };

  /**
   * Generate content blocks based on page type and requirements
   */
  static generateContent(options: ContentGenerationOptions): NotionBlock[] {
    const { type, length } = options;

    switch (type) {
      case "intro":
        return this.adaptContentForLanguage(
          introTemplates[length],
          options.language
        );
      case "tutorial":
        return this.adaptContentForLanguage(
          tutorialTemplates[length],
          options.language
        );
      case "reference":
        return this.adaptContentForLanguage(
          referenceTemplates[length],
          options.language
        );
      case "troubleshooting":
        return this.adaptContentForLanguage(
          troubleshootingTemplates[length],
          options.language
        );
      case "general":
      default:
        return this.generateGenericContent(length, options.language);
    }
  }

  /**
   * Detect appropriate content type based on page title and context
   */
  static detectContentType(title: string): ContentType {
    const titleLower = title.toLowerCase();

    // Detect based on common keywords in titles
    if (
      titleLower.includes("introduction") ||
      titleLower.includes("overview") ||
      titleLower.includes("about") ||
      titleLower.includes("getting started")
    ) {
      return "intro";
    }

    if (
      titleLower.includes("tutorial") ||
      titleLower.includes("step") ||
      titleLower.includes("guide") ||
      titleLower.includes("how to") ||
      titleLower.includes("walkthrough")
    ) {
      return "tutorial";
    }

    if (
      titleLower.includes("reference") ||
      titleLower.includes("api") ||
      titleLower.includes("documentation") ||
      titleLower.includes("spec")
    ) {
      return "reference";
    }

    if (
      titleLower.includes("troubleshoot") ||
      titleLower.includes("problem") ||
      titleLower.includes("error") ||
      titleLower.includes("issue") ||
      titleLower.includes("fix") ||
      titleLower.includes("debug")
    ) {
      return "troubleshooting";
    }

    return "general";
  }

  /**
   * Generate generic content when specific templates don't apply
   */
  private static generateGenericContent(
    length: ContentLength,
    language?: string
  ): NotionBlock[] {
    const contentLengths = {
      short: 2,
      medium: 4,
      long: 6,
    };

    const paragraphCount = contentLengths[length];
    const blocks: NotionBlock[] = [];

    // Add title
    blocks.push({
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Content Overview" } }],
      },
    });

    // Add introduction
    blocks.push({
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "This section provides important information about CoMapeo functionality and usage. The content here covers key concepts, procedures, and best practices relevant to effective territorial mapping and data collection.",
            },
          },
        ],
      },
    });

    // Add content based on length
    if (length === "medium" || length === "long") {
      blocks.push({
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "Key Information" } }],
        },
      });

      blocks.push({
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "Essential concepts and terminology for effective use",
              },
            },
          ],
        },
      });

      blocks.push({
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: { content: "Step-by-step procedures and best practices" },
            },
          ],
        },
      });

      if (length === "long") {
        blocks.push({
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Advanced configuration options and customization",
                },
              },
            ],
          },
        });

        blocks.push({
          type: "heading_2",
          heading_2: {
            rich_text: [
              { type: "text", text: { content: "Additional Resources" } },
            ],
          },
        });

        blocks.push({
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content:
                    "For more detailed information and advanced usage scenarios, consult the comprehensive documentation sections and community resources available through the CoMapeo platform.",
                },
              },
            ],
          },
        });
      }
    }

    return this.adaptContentForLanguage(blocks, language);
  }

  /**
   * Adapt content for specific languages (placeholder for future localization)
   */
  private static adaptContentForLanguage(
    blocks: NotionBlock[],
    language?: string
  ): NotionBlock[] {
    // For now, return English content
    // Future enhancement: implement proper localization
    if (language === "Spanish" || language === "Portuguese") {
      // Add language-specific adaptations here
      // This could include translating key terms or adjusting cultural references
    }

    return blocks;
  }

  /**
   * Generate content with CoMapeo-specific terminology and context
   */
  static generateContextualContent(
    baseType: ContentType,
    length: ContentLength,
    context: {
      isMapping?: boolean;
      isCollaboration?: boolean;
      isSecurity?: boolean;
      isSetup?: boolean;
    }
  ): NotionBlock[] {
    const baseContent = this.generateContent({ type: baseType, length });

    // Enhance content based on context
    if (context.isMapping) {
      baseContent.push({
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: {
                content:
                  "🗺️ This feature integrates with CoMapeo's mapping capabilities for enhanced territorial documentation.",
              },
            },
          ],
          icon: { emoji: "🗺️" },
        },
      });
    }

    if (context.isCollaboration) {
      baseContent.push({
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: {
                content:
                  "👥 Collaborative features enable team coordination and data sharing across multiple devices.",
              },
            },
          ],
          icon: { emoji: "👥" },
        },
      });
    }

    if (context.isSecurity) {
      baseContent.push({
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: {
                content:
                  "🔒 Security considerations are essential when working with sensitive territorial and community data.",
              },
            },
          ],
          icon: { emoji: "🔒" },
        },
      });
    }

    return baseContent;
  }

  /**
   * Create image placeholder blocks for visual content
   */
  static createImagePlaceholder(
    description: string = "Placeholder image"
  ): NotionBlock {
    return {
      type: "image",
      image: {
        type: "external",
        external: {
          url: "https://via.placeholder.com/600x400/E5E7EB/6B7280?text=CoMapeo+Placeholder",
        },
        caption: [
          {
            type: "text",
            text: { content: description },
          },
        ],
      },
    };
  }

  /**
   * Generate a complete page structure with varied content types
   */
  static generateCompletePage(
    options: ContentGenerationOptions
  ): NotionBlock[] {
    const baseContent = this.generateContent(options);

    // Add varied content elements for richer pages
    if (options.length === "long") {
      // Add an image placeholder
      baseContent.splice(
        3,
        0,
        this.createImagePlaceholder("Feature overview diagram")
      );

      // Add a code block for technical content
      baseContent.push({
        type: "code",
        code: {
          rich_text: [
            {
              type: "text",
              text: {
                content:
                  '// Example configuration\n{\n  "feature": "enabled",\n  "mode": "collaborative",\n  "security": "high"\n}',
              },
            },
          ],
          language: "json",
        },
      });
    }

    return baseContent;
  }
}
