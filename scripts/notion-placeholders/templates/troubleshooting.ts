// Content templates for troubleshooting/problem-solution pages

export const troubleshootingTemplates = {
  short: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Troubleshooting" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "If you're experiencing issues with this feature, try these common solutions first:"
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
            text: { content: "Restart CoMapeo and try the operation again" }
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
            text: { content: "Check your internet connection and sync status" }
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
            text: { content: "Verify that you have the necessary permissions for this operation" }
          }
        ]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "If these steps don't resolve the issue, please consult the detailed troubleshooting guide or contact support."
            }
          }
        ]
      }
    }
  ],
  
  medium: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Problem Resolution Guide" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This troubleshooting guide helps you diagnose and resolve common issues systematically. Follow the steps in order for the most efficient problem resolution."
            }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Quick Diagnostic Steps" } }]
      }
    },
    {
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Check the current status and error messages in the CoMapeo interface" }
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
            text: { content: "Verify that all required services and connections are active" }
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
            text: { content: "Review recent changes to configuration or data that might impact functionality" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Common Issues and Solutions" } }]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Connection Problems" } }]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Verify network connectivity and firewall settings" }
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
            text: { content: "Check synchronization settings and peer discovery configuration" }
          }
        ]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Data Synchronization Issues" } }]
      }
    },
    {
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: "Force a manual sync and monitor for error messages" }
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
            text: { content: "Check available storage space and data integrity" }
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
            text: { content: "💡 Tip: Most synchronization issues can be resolved by ensuring all devices are using the same project configuration and have adequate storage space." }
          }
        ],
        icon: { emoji: "💡" }
      }
    }
  ],
  
  long: [
    {
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Comprehensive Troubleshooting Guide" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This comprehensive troubleshooting guide provides systematic approaches to diagnosing and resolving issues with CoMapeo features. Whether you're dealing with connectivity problems, data synchronization issues, or performance concerns, this guide will help you identify root causes and implement effective solutions."
            }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Diagnostic Methodology" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Effective troubleshooting follows a systematic approach to isolate and resolve issues efficiently:"
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
            text: { content: "Symptom Identification: Document exact error messages, timing, and conditions" }
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
            text: { content: "Environment Analysis: Check system status, network conditions, and resource availability" }
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
            text: { content: "Reproduction Testing: Attempt to recreate the issue under controlled conditions" }
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
            text: { content: "Isolation: Determine if the issue is local, network-related, or systemic" }
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
            text: { content: "Resolution: Apply targeted fixes based on diagnostic findings" }
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
            text: { content: "Verification: Confirm that the solution resolves the issue without creating new problems" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Common Problem Categories" } }]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Installation and Setup Issues" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Installation problems often stem from system compatibility, permissions, or corrupted files:"
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
            text: { content: "Verify system requirements and compatibility with your operating system" }
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
            text: { content: "Check administrative privileges and file system permissions" }
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
            text: { content: "Clear temporary files and perform a clean installation if necessary" }
          }
        ]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Network and Connectivity Problems" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Network issues can affect data synchronization, peer discovery, and collaborative features:"
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
            text: { content: "Test basic connectivity and DNS resolution" }
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
            text: { content: "Review firewall rules and port configurations" }
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
            text: { content: "Check proxy settings and corporate network policies" }
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
            text: { content: "Verify peer discovery settings and local network configuration" }
          }
        ]
      }
    },
    {
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Data Management and Synchronization" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Data-related issues can impact collaboration and data integrity:"
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
            text: { content: "Monitor synchronization status and resolve conflicts systematically" }
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
            text: { content: "Verify data integrity and backup procedures" }
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
            text: { content: "Check storage capacity and implement data archiving if needed" }
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
            text: { content: "Review user permissions and access control settings" }
          }
        ]
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Advanced Troubleshooting Techniques" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "When standard troubleshooting steps don't resolve the issue, these advanced techniques can help identify more complex problems:"
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
            text: { content: "Enable detailed logging and analyze system logs for error patterns" }
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
            text: { content: "Use network analysis tools to diagnose connectivity and performance issues" }
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
            text: { content: "Create minimal test cases to isolate specific functionality" }
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
            text: { content: "Compare working and non-working configurations to identify critical differences" }
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
            text: { content: "⚠️ Important: Always backup your data before attempting advanced troubleshooting procedures that might affect system configuration or data integrity." }
          }
        ],
        icon: { emoji: "⚠️" }
      }
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "When to Seek Additional Support" } }]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "If you've exhausted the troubleshooting options in this guide, consider these additional support resources:"
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
            text: { content: "Consult the CoMapeo community forums and user groups" }
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
            text: { content: "Contact technical support with detailed problem documentation" }
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
            text: { content: "Check for software updates and known issue announcements" }
          }
        ]
      }
    }
  ]
};