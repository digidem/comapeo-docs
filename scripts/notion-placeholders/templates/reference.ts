// Content templates for reference/documentation pages

export const referenceTemplates = {
  short: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Reference" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This reference page provides essential information and quick access to key concepts, settings, and procedures related to this feature."
            }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Key Concepts" } }]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Primary functionality and core features" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Configuration options and settings" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Best practices and recommendations" }
          }
        ]
      }
    }
  ],
  
  medium: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Complete Reference Guide" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This comprehensive reference guide provides detailed information about all aspects of this feature, including configuration options, usage patterns, and troubleshooting guidance."
            }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Overview" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Understanding the fundamental concepts and architecture of this feature is essential for effective implementation and troubleshooting."
            }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Configuration Parameters" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "The following parameters can be configured to customize behavior:"
            }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Primary settings that control core functionality" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Advanced options for specialized use cases" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Security and privacy configuration options" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Common Use Cases" } }]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Standard implementation for typical workflows" }
          }
        ]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Advanced configuration for specialized requirements" }
          }
        ]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Integration with other CoMapeo features and external tools" }
          }
        ]
      }
    }
  ],
  
  long: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Comprehensive Technical Reference" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This technical reference provides exhaustive documentation for all aspects of this feature, including detailed parameter descriptions, implementation patterns, troubleshooting procedures, and advanced configuration scenarios."
            }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Architecture and Design Principles" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Understanding the underlying architecture and design principles is crucial for effective implementation and customization. This feature is built on several key architectural concepts:"
            }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Modular design that allows for flexible configuration and extension" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Event-driven architecture that supports real-time updates and collaboration" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Offline-first design that ensures functionality without network connectivity" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Detailed Configuration Reference" } }]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Core Settings" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Core settings control the fundamental behavior of the feature:"
            }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Enable/disable functionality with appropriate fallback behaviors" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Data synchronization settings for offline and collaborative scenarios" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "User interface customization options for different workflows" }
          }
        ]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Advanced Configuration" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Advanced configuration options provide fine-grained control over feature behavior:"
            }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Performance tuning parameters for large datasets and complex operations" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Security policies and access control configurations" }
          }
        ]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Integration settings for external systems and data sources" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Implementation Patterns" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Several proven implementation patterns have emerged through extensive use in diverse community mapping projects:"
            }
          }
        ]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Standard Implementation: Basic configuration suitable for most use cases" }
          }
        ]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "High-Security Implementation: Enhanced security for sensitive territorial data" }
          }
        ]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Large-Scale Implementation: Optimized for extensive mapping projects with multiple teams" }
          }
        ]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Integration Implementation: Designed for integration with external GIS and database systems" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Troubleshooting and Diagnostics" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This section provides systematic approaches to diagnosing and resolving common issues. When encountering problems, follow the diagnostic procedures in order to identify the root cause efficiently."
            }
          }
        ]
      }
    },
    {
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: { content: "📋 Always check the system logs and configuration files before making changes to troubleshoot issues effectively." }
          }
        ],
        icon: { emoji: "📋" }
      }
    }
  ]
};