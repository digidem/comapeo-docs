// Content templates for tutorial/step-by-step pages

export const tutorialTemplates = {
  short: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Quick Start Guide" } }],
      },
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Follow these steps to get started with this feature quickly and efficiently.",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Open CoMapeo and navigate to the relevant section",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Configure your settings according to your project needs",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Save your changes and test the functionality" },
          },
        ],
      },
    },
  ],

  medium: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [
          { type: "text", text: { content: "Step-by-Step Tutorial" } },
        ],
      },
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "This tutorial will walk you through the complete process of using this feature effectively. Each step includes important tips and best practices to ensure successful implementation.",
            },
          },
        ],
      },
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Prerequisites" } }],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "CoMapeo installed and running on your device" },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Basic familiarity with the CoMapeo interface" },
          },
        ],
      },
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [
          { type: "text", text: { content: "Implementation Steps" } },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Launch CoMapeo and ensure you're connected to your project",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Navigate to the appropriate section using the main menu",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Review the available options and select those that match your workflow",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Apply your changes and verify they work as expected",
            },
          },
        ],
      },
    },
    {
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "💡 Pro tip: Always test your configuration in a safe environment before applying to important project data.",
            },
          },
        ],
        icon: { emoji: "💡" },
      },
    },
  ],

  long: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [
          { type: "text", text: { content: "Comprehensive Tutorial Guide" } },
        ],
      },
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "This detailed tutorial provides comprehensive guidance for implementing and mastering this feature. We'll cover everything from basic setup through advanced configuration options and troubleshooting common issues.",
            },
          },
        ],
      },
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Learning Objectives" } }],
      },
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "By the end of this tutorial, you will be able to:",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Understand the fundamental concepts and terminology",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Configure and customize settings for your specific use case",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Implement best practices for optimal performance and security",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Troubleshoot common issues and apply effective solutions",
            },
          },
        ],
      },
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [
          { type: "text", text: { content: "Prerequisites and Requirements" } },
        ],
      },
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Before beginning this tutorial, please ensure you have:",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "CoMapeo installed and properly configured on your device",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Administrative access to modify project settings",
            },
          },
        ],
      },
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "A backup of your current project data (recommended)",
            },
          },
        ],
      },
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "Detailed Implementation Process" },
          },
        ],
      },
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [
          { type: "text", text: { content: "Phase 1: Initial Setup" } },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Launch CoMapeo and verify your installation is up to date",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Access the main configuration menu from the settings panel",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Review current settings and note any existing configurations",
            },
          },
        ],
      },
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [
          { type: "text", text: { content: "Phase 2: Configuration" } },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Navigate to the specific feature settings you want to modify",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Apply recommended settings based on your project requirements",
            },
          },
        ],
      },
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Test each setting change incrementally to ensure proper function",
            },
          },
        ],
      },
    },
    {
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "⚠️ Important: Always save your progress after each major configuration change to prevent data loss.",
            },
          },
        ],
        icon: { emoji: "⚠️" },
      },
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [
          { type: "text", text: { content: "Validation and Testing" } },
        ],
      },
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "After completing the configuration, thoroughly test all functionality to ensure everything works as expected. Pay special attention to any workflow changes that might affect other team members or project stakeholders.",
            },
          },
        ],
      },
    },
  ],
};
