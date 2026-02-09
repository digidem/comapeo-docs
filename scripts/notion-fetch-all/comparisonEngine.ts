import { PageWithStatus } from "./fetchAll";
import { PreviewSection } from "./previewGenerator";

export interface ComparisonResult {
  published: {
    totalPages: number;
    sections: number;
    languages: string[];
  };
  preview: {
    totalPages: number;
    sections: number;
    languages: string[];
  };
  differences: {
    newPages: Array<{
      title: string;
      status: string;
      section: string;
      language?: string;
    }>;
    updatedPages: Array<{
      title: string;
      currentStatus: string;
      section: string;
      language?: string;
    }>;
    removedPages: Array<{
      title: string;
      section: string;
      language?: string;
    }>;
  };
  impact: {
    sidebarChanges: Array<{
      type: "added" | "moved" | "renamed" | "removed";
      section: string;
      description: string;
    }>;
    contentVolume: {
      increase: number;
      percentageChange: number;
    };
    structuralChanges: number;
  };
  diagnostics?: {
    mismatches: MismatchDiagnostic[];
    timestamp: Date;
    comparisonMetadata: {
      publishedPagesAnalyzed: number;
      previewPagesAnalyzed: number;
      comparisonDuration: number;
    };
  };
}

export interface MismatchDiagnostic {
  type: "new" | "updated" | "removed";
  pageTitle: string;
  reason: string;
  details: {
    previewStatus?: string;
    publishedStatus?: string;
    language?: string;
    section?: string;
    lastEdited?: Date;
    contentHash?: string;
  };
  suggestion: string;
}

export interface PublishedStructure {
  sections: Array<{
    title: string;
    path: string;
    pages: Array<{
      title: string;
      path: string;
      language?: string;
    }>;
    subSections: any[];
  }>;
  metadata: {
    lastGenerated: Date;
    totalPages: number;
    languages: string[];
  };
}

/**
 * Compares preview structure with currently published documentation
 */
export class ComparisonEngine {
  /**
   * Compare preview with published documentation structure
   */
  static async compareWithPublished(
    previewSections: PreviewSection[],
    previewPages: PageWithStatus[],
    enableDiagnostics: boolean = false
  ): Promise<ComparisonResult> {
    console.log("🔍 Comparing preview with published documentation...");

    const startTime = Date.now();

    // Get current published structure (would be loaded from actual site)
    const publishedStructure = await this.loadPublishedStructure();

    // Analyze differences with optional diagnostics
    const { differences, diagnostics } = this.analyzeDifferences(
      previewPages,
      publishedStructure,
      enableDiagnostics
    );

    // Calculate impact
    const impact = this.calculateImpact(
      previewSections,
      publishedStructure,
      differences
    );

    const duration = Date.now() - startTime;

    const result: ComparisonResult = {
      published: {
        totalPages: publishedStructure.metadata.totalPages,
        sections: publishedStructure.sections.length,
        languages: publishedStructure.metadata.languages,
      },
      preview: {
        totalPages: previewPages.length,
        sections: previewSections.length,
        languages: [
          ...new Set(previewPages.map((p) => p.language).filter(Boolean)),
        ],
      },
      differences,
      impact,
    };

    // Add diagnostics if enabled
    if (enableDiagnostics && diagnostics) {
      result.diagnostics = {
        mismatches: diagnostics,
        timestamp: new Date(),
        comparisonMetadata: {
          publishedPagesAnalyzed:
            this.extractPublishedPages(publishedStructure).length,
          previewPagesAnalyzed: previewPages.length,
          comparisonDuration: duration,
        },
      };

      console.log(
        `🔧 Diagnostics enabled: ${diagnostics.length} mismatch details available`
      );
    }

    console.log(
      `✅ Comparison complete: ${differences.newPages.length} new pages, ${differences.updatedPages.length} updates`
    );

    return result;
  }

  /**
   * Load current published documentation structure
   */
  private static async loadPublishedStructure(): Promise<PublishedStructure> {
    // In a real implementation, this would:
    // 1. Fetch from the published documentation site
    // 2. Parse the sidebar structure
    // 3. Extract page metadata

    // For now, return a mock structure
    return {
      sections: [
        {
          title: "Introduction",
          path: "/introduction",
          pages: [
            { title: "Getting Started", path: "/introduction/getting-started" },
            { title: "Overview", path: "/introduction/overview" },
          ],
          subSections: [],
        },
        {
          title: "User Guide",
          path: "/user-guide",
          pages: [
            { title: "Installation", path: "/user-guide/installation" },
            { title: "Configuration", path: "/user-guide/configuration" },
          ],
          subSections: [],
        },
      ],
      metadata: {
        lastGenerated: new Date("2024-01-01"),
        totalPages: 15,
        languages: ["English", "Spanish", "Portuguese"],
      },
    };
  }

  /**
   * Analyze differences between preview and published
   */
  private static analyzeDifferences(
    previewPages: PageWithStatus[],
    publishedStructure: PublishedStructure,
    enableDiagnostics: boolean = false
  ): {
    differences: ComparisonResult["differences"];
    diagnostics?: MismatchDiagnostic[];
  } {
    // Get published pages for comparison
    const publishedPages = this.extractPublishedPages(publishedStructure);
    const publishedTitles = new Set(publishedPages.map((p) => p.title));
    const previewTitles = new Set(previewPages.map((p) => p.title));

    // Collect diagnostics if enabled
    const diagnostics: MismatchDiagnostic[] = [];

    // Find new pages (in preview but not published)
    const newPages = previewPages
      .filter(
        (page) =>
          !publishedTitles.has(page.title) && page.status === "Ready to publish"
      )
      .map((page) => {
        const section = this.findSectionForPage(page, previewPages);

        if (enableDiagnostics) {
          diagnostics.push({
            type: "new",
            pageTitle: page.title,
            reason: "Page exists in preview but not in published documentation",
            details: {
              previewStatus: page.status,
              language: page.language,
              section,
              lastEdited: page.lastEdited,
            },
            suggestion: `Review new page "${page.title}" for publication readiness`,
          });
        }

        return {
          title: page.title,
          status: page.status,
          section,
          language: page.language,
        };
      });

    // Find updated pages (different status or content)
    const updatedPages = previewPages
      .filter((page) => {
        if (!publishedTitles.has(page.title)) return false;

        // In a real implementation, you'd compare content hash or modification dates
        return page.status === "Draft" || page.status === "In progress";
      })
      .map((page) => {
        const section = this.findSectionForPage(page, previewPages);
        const publishedPage = publishedPages.find(
          (p) => p.title === page.title
        );

        if (enableDiagnostics && publishedPage) {
          diagnostics.push({
            type: "updated",
            pageTitle: page.title,
            reason:
              "Page status differs between preview and published versions",
            details: {
              previewStatus: page.status,
              publishedStatus: "Published",
              language: page.language,
              section,
              lastEdited: page.lastEdited,
            },
            suggestion: `Review status change for "${page.title}" - currently ${page.status}`,
          });
        }

        return {
          title: page.title,
          currentStatus: page.status,
          section,
          language: page.language,
        };
      });

    // Find removed pages (published but not in ready preview)
    const readyPreviewTitles = new Set(
      previewPages
        .filter((p) => p.status === "Ready to publish")
        .map((p) => p.title)
    );

    const removedPages = publishedPages
      .filter((page) => !readyPreviewTitles.has(page.title))
      .map((page) => {
        if (enableDiagnostics) {
          // Check if page exists in preview but with different status
          const inPreview = previewPages.find((p) => p.title === page.title);
          const reason = inPreview
            ? `Page exists in preview with status "${inPreview.status}" instead of "Ready to publish"`
            : "Page not found in preview";

          diagnostics.push({
            type: "removed",
            pageTitle: page.title,
            reason,
            details: {
              previewStatus: inPreview?.status,
              publishedStatus: "Published",
              language: page.language,
              section: page.section,
            },
            suggestion: `Verify if "${page.title}" should be removed or updated`,
          });
        }

        return {
          title: page.title,
          section: page.section || "Unknown",
          language: page.language,
        };
      });

    return {
      differences: {
        newPages,
        updatedPages,
        removedPages,
      },
      diagnostics: enableDiagnostics ? diagnostics : undefined,
    };
  }

  /**
   * Calculate impact of changes
   */
  private static calculateImpact(
    previewSections: PreviewSection[],
    publishedStructure: PublishedStructure,
    differences: ComparisonResult["differences"]
  ): ComparisonResult["impact"] {
    // Analyze sidebar changes
    const sidebarChanges = this.analyzeSidebarChanges(
      previewSections,
      publishedStructure
    );

    // Calculate content volume changes
    const currentPages = publishedStructure.metadata.totalPages;
    const newPages =
      differences.newPages.length - differences.removedPages.length;
    const contentVolume = {
      increase: newPages,
      percentageChange: Math.round((newPages / currentPages) * 100),
    };

    // Count structural changes
    const structuralChanges = sidebarChanges.filter(
      (change) =>
        change.type === "added" ||
        change.type === "moved" ||
        change.type === "removed"
    ).length;

    return {
      sidebarChanges,
      contentVolume,
      structuralChanges,
    };
  }

  /**
   * Analyze changes to sidebar structure
   */
  private static analyzeSidebarChanges(
    previewSections: PreviewSection[],
    publishedStructure: PublishedStructure
  ): ComparisonResult["impact"]["sidebarChanges"] {
    const changes: ComparisonResult["impact"]["sidebarChanges"] = [];

    const publishedSectionTitles = new Set(
      publishedStructure.sections.map((s) => s.title)
    );
    const previewSectionTitles = new Set(previewSections.map((s) => s.title));

    // Find new sections
    for (const section of previewSections) {
      if (!publishedSectionTitles.has(section.title)) {
        changes.push({
          type: "added",
          section: section.title,
          description: `New section with ${section.pages.length} pages`,
        });
      }
    }

    // Find removed sections
    for (const section of publishedStructure.sections) {
      if (!previewSectionTitles.has(section.title)) {
        changes.push({
          type: "removed",
          section: section.title,
          description: `Section removed with ${section.pages.length} pages`,
        });
      }
    }

    // Detect significant structural changes
    const previewStructureHash = this.generateStructureHash(previewSections);
    const publishedStructureHash = this.generateStructureHash(
      publishedStructure.sections
    );

    if (previewStructureHash !== publishedStructureHash) {
      changes.push({
        type: "moved",
        section: "Multiple sections",
        description: "Significant structural reorganization detected",
      });
    }

    return changes;
  }

  /**
   * Generate a simple hash of structure for comparison
   */
  private static generateStructureHash(sections: any[]): string {
    const structure = sections.map((s) => ({
      title: s.title,
      pageCount: s.pages?.length || 0,
      subSectionCount: s.subSections?.length || 0,
    }));

    return JSON.stringify(structure);
  }

  /**
   * Extract pages from published structure
   */
  private static extractPublishedPages(publishedStructure: PublishedStructure) {
    const pages: Array<{ title: string; section?: string; language?: string }> =
      [];

    for (const section of publishedStructure.sections) {
      for (const page of section.pages) {
        pages.push({
          title: page.title,
          section: section.title,
          language: page.language,
        });
      }
    }

    return pages;
  }

  /**
   * Find which section a page belongs to
   */
  private static findSectionForPage(
    page: PageWithStatus,
    allPages: PageWithStatus[]
  ): string {
    if (!page.parentItem) return "Root";

    const parent = allPages.find((p) => p.id === page.parentItem);
    if (!parent) return "Unknown";

    // If parent is a section, return its title
    if (parent.elementType === "Section") {
      return parent.title;
    }

    // Otherwise, recursively find the section
    return this.findSectionForPage(parent, allPages);
  }

  /**
   * Generate detailed comparison report
   */
  static generateComparisonReport(comparison: ComparisonResult): string {
    let report = "# 📊 Documentation Comparison Report\n\n";

    // Overview
    report += "## 🎯 Overview\n\n";
    report += `**Current Published**: ${comparison.published.totalPages} pages, ${comparison.published.sections} sections\n`;
    report += `**Preview Version**: ${comparison.preview.totalPages} pages, ${comparison.preview.sections} sections\n`;
    report += `**Content Change**: ${comparison.impact.contentVolume.increase > 0 ? "+" : ""}${comparison.impact.contentVolume.increase} pages (${comparison.impact.contentVolume.percentageChange}%)\n\n`;

    // New content
    if (comparison.differences.newPages.length > 0) {
      report += "## ✨ New Content\n\n";
      for (const page of comparison.differences.newPages) {
        const langNote = page.language ? ` (${page.language})` : "";
        report += `- **${page.title}**${langNote} in ${page.section}\n`;
      }
      report += "\n";
    }

    // Updated content
    if (comparison.differences.updatedPages.length > 0) {
      report += "## 🔄 Updated Content\n\n";
      for (const page of comparison.differences.updatedPages) {
        const langNote = page.language ? ` (${page.language})` : "";
        report += `- **${page.title}**${langNote} - Status: ${page.currentStatus}\n`;
      }
      report += "\n";
    }

    // Removed content
    if (comparison.differences.removedPages.length > 0) {
      report += "## 🗑️ Removed Content\n\n";
      for (const page of comparison.differences.removedPages) {
        const langNote = page.language ? ` (${page.language})` : "";
        report += `- **${page.title}**${langNote} from ${page.section}\n`;
      }
      report += "\n";
    }

    // Structural changes
    if (comparison.impact.sidebarChanges.length > 0) {
      report += "## 🏗️ Structural Changes\n\n";
      for (const change of comparison.impact.sidebarChanges) {
        const icon = this.getChangeIcon(change.type);
        report += `- ${icon} **${change.section}**: ${change.description}\n`;
      }
      report += "\n";
    }

    // Impact summary
    report += "## 📈 Impact Summary\n\n";
    report += `- **Content Volume**: ${Math.abs(comparison.impact.contentVolume.increase)} pages ${comparison.impact.contentVolume.increase >= 0 ? "added" : "removed"}\n`;
    report += `- **Structural Changes**: ${comparison.impact.structuralChanges} modifications\n`;
    report += `- **Language Coverage**: ${comparison.preview.languages.length} languages\n\n`;

    return report;
  }

  /**
   * Get icon for change type
   */
  private static getChangeIcon(type: string): string {
    switch (type) {
      case "added":
        return "✅";
      case "removed":
        return "❌";
      case "moved":
        return "🔄";
      case "renamed":
        return "✏️";
      default:
        return "📝";
    }
  }

  /**
   * Generate diagnostic report for mismatches
   */
  static generateDiagnosticReport(comparison: ComparisonResult): string | null {
    if (!comparison.diagnostics) {
      return null;
    }

    const { mismatches, timestamp, comparisonMetadata } =
      comparison.diagnostics;

    let report = "# 🔧 Mismatch Diagnostics Report\n\n";

    // Header with metadata
    report += "## 📋 Comparison Metadata\n\n";
    report += `- **Generated**: ${timestamp.toISOString()}\n`;
    report += `- **Published Pages Analyzed**: ${comparisonMetadata.publishedPagesAnalyzed}\n`;
    report += `- **Preview Pages Analyzed**: ${comparisonMetadata.previewPagesAnalyzed}\n`;
    report += `- **Comparison Duration**: ${comparisonMetadata.comparisonDuration}ms\n\n`;

    // Summary
    report += "## 📊 Summary\n\n";
    const newCount = mismatches.filter((m) => m.type === "new").length;
    const updatedCount = mismatches.filter((m) => m.type === "updated").length;
    const removedCount = mismatches.filter((m) => m.type === "removed").length;

    report += `- **New Pages**: ${newCount}\n`;
    report += `- **Updated Pages**: ${updatedCount}\n`;
    report += `- **Removed Pages**: ${removedCount}\n`;
    report += `- **Total Mismatches**: ${mismatches.length}\n\n`;

    // Group by type
    const byType = mismatches.reduce(
      (acc, m) => {
        acc[m.type].push(m);
        return acc;
      },
      {
        new: [] as MismatchDiagnostic[],
        updated: [] as MismatchDiagnostic[],
        removed: [] as MismatchDiagnostic[],
      }
    );

    // New pages diagnostics
    if (byType.new.length > 0) {
      report += "## ✨ New Pages Diagnostics\n\n";
      for (const mismatch of byType.new) {
        report += `### ${mismatch.pageTitle}\n\n`;
        report += `- **Reason**: ${mismatch.reason}\n`;
        if (mismatch.details.previewStatus) {
          report += `- **Preview Status**: ${mismatch.details.previewStatus}\n`;
        }
        if (mismatch.details.language) {
          report += `- **Language**: ${mismatch.details.language}\n`;
        }
        if (mismatch.details.section) {
          report += `- **Section**: ${mismatch.details.section}\n`;
        }
        if (mismatch.details.lastEdited) {
          report += `- **Last Edited**: ${mismatch.details.lastEdited.toISOString()}\n`;
        }
        report += `- **💡 Suggestion**: ${mismatch.suggestion}\n\n`;
      }
    }

    // Updated pages diagnostics
    if (byType.updated.length > 0) {
      report += "## 🔄 Updated Pages Diagnostics\n\n";
      for (const mismatch of byType.updated) {
        report += `### ${mismatch.pageTitle}\n\n`;
        report += `- **Reason**: ${mismatch.reason}\n`;
        if (
          mismatch.details.previewStatus &&
          mismatch.details.publishedStatus
        ) {
          report += `- **Status Change**: ${mismatch.details.publishedStatus} → ${mismatch.details.previewStatus}\n`;
        }
        if (mismatch.details.language) {
          report += `- **Language**: ${mismatch.details.language}\n`;
        }
        if (mismatch.details.section) {
          report += `- **Section**: ${mismatch.details.section}\n`;
        }
        if (mismatch.details.lastEdited) {
          report += `- **Last Edited**: ${mismatch.details.lastEdited.toISOString()}\n`;
        }
        report += `- **💡 Suggestion**: ${mismatch.suggestion}\n\n`;
      }
    }

    // Removed pages diagnostics
    if (byType.removed.length > 0) {
      report += "## 🗑️ Removed Pages Diagnostics\n\n";
      for (const mismatch of byType.removed) {
        report += `### ${mismatch.pageTitle}\n\n`;
        report += `- **Reason**: ${mismatch.reason}\n`;
        if (mismatch.details.previewStatus) {
          report += `- **Preview Status**: ${mismatch.details.previewStatus}\n`;
        }
        if (mismatch.details.publishedStatus) {
          report += `- **Published Status**: ${mismatch.details.publishedStatus}\n`;
        }
        if (mismatch.details.language) {
          report += `- **Language**: ${mismatch.details.language}\n`;
        }
        if (mismatch.details.section) {
          report += `- **Section**: ${mismatch.details.section}\n`;
        }
        report += `- **💡 Suggestion**: ${mismatch.suggestion}\n\n`;
      }
    }

    // Troubleshooting section
    report += "## 🔍 Troubleshooting Guide\n\n";
    report += "### Common Issues and Solutions\n\n";
    report += "**Issue**: Page appears as new but was previously published\n";
    report +=
      "- **Cause**: Title mismatch or page was removed from published\n";
    report +=
      "- **Solution**: Check for title variations, verify parent section\n\n";
    report += "**Issue**: Page shows as updated but no changes were made\n";
    report +=
      "- **Cause**: Status change, metadata update, or timestamp difference\n";
    report +=
      "- **Solution**: Review page status in Notion, check last edited time\n\n";
    report += "**Issue**: Page appears as removed but exists in preview\n";
    report +=
      '- **Cause**: Status is not "Ready to publish" (e.g., Draft, In progress)\n';
    report +=
      '- **Solution**: Update page status to "Ready to publish" if appropriate\n\n';

    return report;
  }

  /**
   * Generate migration checklist
   */
  static generateMigrationChecklist(comparison: ComparisonResult): {
    preDeployment: string[];
    deployment: string[];
    postDeployment: string[];
    rollback: string[];
  } {
    const checklist = {
      preDeployment: [
        "✅ Review all new content for accuracy",
        "✅ Validate translation quality",
        "✅ Test navigation structure",
        "✅ Verify all links are functional",
      ],
      deployment: [
        "🚀 Deploy preview to staging environment",
        "🚀 Run automated accessibility tests",
        "🚀 Perform cross-browser testing",
        "🚀 Validate search functionality",
      ],
      postDeployment: [
        "📊 Monitor user engagement metrics",
        "📊 Check for broken internal links",
        "📊 Verify analytics tracking",
        "📊 Collect user feedback",
      ],
      rollback: [
        "🔄 Backup current published version",
        "🔄 Document rollback procedure",
        "🔄 Test rollback in staging",
        "🔄 Prepare emergency contact list",
      ],
    };

    // Add specific items based on changes
    if (comparison.differences.newPages.length > 5) {
      checklist.preDeployment.push(
        "✅ Extra review for large content additions"
      );
    }

    if (comparison.impact.structuralChanges > 3) {
      checklist.deployment.push("🚀 Extended navigation testing required");
    }

    if (comparison.impact.contentVolume.percentageChange > 20) {
      checklist.postDeployment.push("📊 Monitor server performance impact");
    }

    return checklist;
  }
}
