import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { captureConsoleOutput } from "../test-utils";
import { ComparisonEngine } from "./comparisonEngine";
import type { PageWithStatus } from "./fetchAll";
import type { PreviewSection } from "./previewGenerator";

describe("ComparisonEngine", () => {
  let consoleCapture: ReturnType<typeof captureConsoleOutput>;

  beforeEach(() => {
    consoleCapture = captureConsoleOutput();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  describe("compareWithPublished", () => {
    it("should compare preview with published structure", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction", pagesCount: 2 }),
        createMockPreviewSection({ title: "User Guide", pagesCount: 3 }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Getting Started",
          status: "Ready to publish",
        }),
        createMockPage({ title: "Overview", status: "Ready to publish" }),
        createMockPage({ title: "Installation", status: "Ready to publish" }),
        createMockPage({ title: "Configuration", status: "Ready to publish" }),
        createMockPage({
          title: "Advanced Topics",
          status: "Ready to publish",
        }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.published).toBeDefined();
      expect(result.preview).toBeDefined();
      expect(result.differences).toBeDefined();
      expect(result.impact).toBeDefined();
    });

    it("should identify new pages correctly", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "New Feature", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.differences.newPages.length).toBeGreaterThan(0);
    });

    it("should identify updated pages", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "Getting Started", status: "Draft" }), // Already published but in draft
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.differences).toBeDefined();
    });

    it("should calculate content volume changes", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = Array.from(
        { length: 20 },
        (_, i) =>
          createMockPage({
            title: `Page ${i}`,
            status: "Ready to publish",
          })
      );

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.impact.contentVolume).toBeDefined();
      expect(result.impact.contentVolume.increase).toBeDefined();
      expect(result.impact.contentVolume.percentageChange).toBeDefined();
    });

    it("should count structural changes", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "New Section", pagesCount: 5 }),
      ];

      const previewPages: PageWithStatus[] = Array.from({ length: 5 }, (_, i) =>
        createMockPage({ status: "Ready to publish" })
      );

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.impact.structuralChanges).toBeDefined();
      expect(result.impact.structuralChanges).toBeGreaterThanOrEqual(0);
    });

    it("should include language information", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ language: "English", status: "Ready to publish" }),
        createMockPage({ language: "Spanish", status: "Ready to publish" }),
        createMockPage({ language: "Portuguese", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.preview.languages).toContain("English");
      expect(result.preview.languages).toContain("Spanish");
      expect(result.preview.languages).toContain("Portuguese");
    });

    it("should handle empty preview", async () => {
      const result = await ComparisonEngine.compareWithPublished([], []);

      expect(result.preview.totalPages).toBe(0);
      expect(result.preview.sections).toBe(0);
      expect(result.differences.newPages).toHaveLength(0);
      expect(result.differences.updatedPages).toHaveLength(0);
    });
  });

  describe("generateComparisonReport", () => {
    it("should generate markdown report", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "New Page", status: "Ready to publish" }),
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      expect(report).toBeDefined();
      expect(report).toContain("Documentation Comparison Report");
      expect(report).toContain("Overview");
    });

    it("should include new content section when present", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Brand New Feature",
          status: "Ready to publish",
        }),
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      expect(report).toContain("New Content");
    });

    it("should include updated content section when present", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "Getting Started", status: "Draft" }), // Existing but updated
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      expect(report).toContain("Updated Content");
    });

    it("should include structural changes section", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Brand New Section", pagesCount: 3 }),
      ];

      const previewPages: PageWithStatus[] = Array.from({ length: 3 }, () =>
        createMockPage({ status: "Ready to publish" })
      );

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      expect(report).toContain("Structural Changes");
    });

    it("should include impact summary", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      expect(report).toContain("Impact Summary");
      expect(report).toContain("Content Volume");
      expect(report).toContain("Structural Changes");
      expect(report).toContain("Language Coverage");
    });

    it("should show language information in page listings", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Spanish Guide",
          language: "Spanish",
          status: "Ready to publish",
        }),
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      expect(report).toContain("Spanish");
    });

    it("should use appropriate icons for changes", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Test Section" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(comparison);

      // Check for presence of emoji/icons in appropriate contexts
      expect(report).toMatch(/[✅❌🔄✏️📝]/);
    });
  });

  describe("generateMigrationChecklist", () => {
    it("should generate comprehensive migration checklist", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      expect(checklist.preDeployment).toBeDefined();
      expect(checklist.deployment).toBeDefined();
      expect(checklist.postDeployment).toBeDefined();
      expect(checklist.rollback).toBeDefined();
    });

    it("should include baseline pre-deployment tasks", async () => {
      const previewSections: PreviewSection[] = [];
      const previewPages: PageWithStatus[] = [];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      expect(checklist.preDeployment.length).toBeGreaterThan(0);
      expect(
        checklist.preDeployment.some((task) =>
          task.includes("Review all new content")
        )
      ).toBe(true);
    });

    it("should include baseline deployment tasks", async () => {
      const previewSections: PreviewSection[] = [];
      const previewPages: PageWithStatus[] = [];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      expect(checklist.deployment.length).toBeGreaterThan(0);
      expect(
        checklist.deployment.some((task) => task.includes("Deploy preview"))
      ).toBe(true);
    });

    it("should include baseline post-deployment tasks", async () => {
      const previewSections: PreviewSection[] = [];
      const previewPages: PageWithStatus[] = [];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      expect(checklist.postDeployment.length).toBeGreaterThan(0);
      expect(
        checklist.postDeployment.some((task) => task.includes("Monitor"))
      ).toBe(true);
    });

    it("should include baseline rollback tasks", async () => {
      const previewSections: PreviewSection[] = [];
      const previewPages: PageWithStatus[] = [];

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      expect(checklist.rollback.length).toBeGreaterThan(0);
      expect(checklist.rollback.some((task) => task.includes("Backup"))).toBe(
        true
      );
    });

    it("should add extra review task for large content additions", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = Array.from(
        { length: 10 },
        (_, i) =>
          createMockPage({
            title: `New Page ${i}`,
            status: "Ready to publish",
          })
      );

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      const hasExtraReview = checklist.preDeployment.some((task) =>
        task.includes("Extra review")
      );

      expect(hasExtraReview).toBe(true);
    });

    it("should add extended navigation testing for structural changes", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "New Section 1" }),
        createMockPreviewSection({ title: "New Section 2" }),
        createMockPreviewSection({ title: "New Section 3" }),
        createMockPreviewSection({ title: "New Section 4" }),
      ];

      const previewPages: PageWithStatus[] = Array.from({ length: 20 }, () =>
        createMockPage({ status: "Ready to publish" })
      );

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      const hasExtendedTesting = checklist.deployment.some((task) =>
        task.includes("Extended navigation testing")
      );

      expect(hasExtendedTesting).toBe(true);
    });

    it("should add performance monitoring for large volume changes", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = Array.from({ length: 30 }, () =>
        createMockPage({ status: "Ready to publish" })
      );

      const comparison = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const checklist = ComparisonEngine.generateMigrationChecklist(comparison);

      const hasPerformanceMonitoring = checklist.postDeployment.some((task) =>
        task.includes("performance")
      );

      expect(hasPerformanceMonitoring).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle comparison with zero published pages", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result).toBeDefined();
      expect(result.differences.newPages.length).toBeGreaterThan(0);
    });

    it("should handle identical preview and published", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Getting Started",
          status: "Ready to publish",
        }),
        createMockPage({ title: "Overview", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result).toBeDefined();
    });

    it("should handle pages with special characters in titles", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: 'Page with <html> & "quotes"',
          status: "Ready to publish",
        }),
        createMockPage({
          title: "Page with 中文",
          status: "Ready to publish",
        }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      const report = ComparisonEngine.generateComparisonReport(result);

      expect(report).toContain('Page with <html> & "quotes"');
      expect(report).toContain("Page with 中文");
    });

    it("should handle very large previews efficiently", async () => {
      const previewSections: PreviewSection[] = Array.from(
        { length: 50 },
        (_, i) => createMockPreviewSection({ title: `Section ${i}` })
      );

      const previewPages: PageWithStatus[] = Array.from(
        { length: 200 },
        (_, i) =>
          createMockPage({
            title: `Page ${i}`,
            status: i % 2 === 0 ? "Ready to publish" : "Draft",
          })
      );

      const startTime = Date.now();
      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it("should handle negative content volume change", async () => {
      const previewSections: PreviewSection[] = [];
      const previewPages: PageWithStatus[] = [];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.impact.contentVolume.increase).toBeLessThan(0);
    });

    it("should handle removed pages correctly", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      // No "Getting Started" page in preview (it's in published mock data)
      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "Other Page", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.differences.removedPages.length).toBeGreaterThan(0);
    });

    it("should handle pages without section assignment", async () => {
      const previewSections: PreviewSection[] = [];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Orphan Page",
          status: "Ready to publish",
          parentItem: undefined,
        }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result).toBeDefined();
    });

    it("should generate valid markdown even with empty data", async () => {
      const result = await ComparisonEngine.compareWithPublished([], []);

      const report = ComparisonEngine.generateComparisonReport(result);

      expect(report).toContain("Documentation Comparison Report");
      expect(report).toContain("Overview");
      expect(report).toContain("Impact Summary");
    });
  });

  describe("Diagnostics", () => {
    it("should not include diagnostics by default", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "New Page", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages
      );

      expect(result.diagnostics).toBeUndefined();
    });

    it("should include diagnostics when enabled", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "New Page", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true // enable diagnostics
      );

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.mismatches).toBeDefined();
      expect(result.diagnostics?.mismatches.length).toBeGreaterThan(0);
      expect(result.diagnostics?.timestamp).toBeDefined();
      expect(result.diagnostics?.comparisonMetadata).toBeDefined();
    });

    it("should provide diagnostic details for new pages", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Brand New Page",
          status: "Ready to publish",
          language: "Spanish",
        }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      const newPageDiagnostics = result.diagnostics?.mismatches.filter(
        (m) => m.type === "new"
      );

      expect(newPageDiagnostics?.length).toBeGreaterThan(0);
      expect(newPageDiagnostics?.[0].pageTitle).toBe("Brand New Page");
      expect(newPageDiagnostics?.[0].reason).toContain("not in published");
      expect(newPageDiagnostics?.[0].details.previewStatus).toBe(
        "Ready to publish"
      );
      expect(newPageDiagnostics?.[0].details.language).toBe("Spanish");
      expect(newPageDiagnostics?.[0].suggestion).toBeDefined();
    });

    it("should provide diagnostic details for updated pages", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "Getting Started", status: "Draft" }), // Exists in published but different status
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      const updatedDiagnostics = result.diagnostics?.mismatches.filter(
        (m) => m.type === "updated"
      );

      expect(updatedDiagnostics?.length).toBeGreaterThan(0);
      expect(updatedDiagnostics?.[0].pageTitle).toBe("Getting Started");
      expect(updatedDiagnostics?.[0].reason).toContain("differs");
      expect(updatedDiagnostics?.[0].details.previewStatus).toBe("Draft");
      expect(updatedDiagnostics?.[0].details.publishedStatus).toBe("Published");
      expect(updatedDiagnostics?.[0].suggestion).toContain("Draft");
    });

    it("should provide diagnostic details for removed pages", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      // Empty preview - all published pages should be marked as removed
      const previewPages: PageWithStatus[] = [];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      const removedDiagnostics = result.diagnostics?.mismatches.filter(
        (m) => m.type === "removed"
      );

      expect(removedDiagnostics?.length).toBeGreaterThan(0);
      expect(removedDiagnostics?.[0].reason).toContain("not found in preview");
      expect(removedDiagnostics?.[0].details.publishedStatus).toBe("Published");
      expect(removedDiagnostics?.[0].suggestion).toContain("removed");
    });

    it("should include comparison metadata in diagnostics", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "Test Page", status: "Ready to publish" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      expect(result.diagnostics?.comparisonMetadata).toBeDefined();
      expect(
        result.diagnostics?.comparisonMetadata.publishedPagesAnalyzed
      ).toBe(4); // Mock data has 4 pages (2 sections x 2 pages each)
      expect(result.diagnostics?.comparisonMetadata.previewPagesAnalyzed).toBe(
        1
      );
      expect(
        result.diagnostics?.comparisonMetadata.comparisonDuration
      ).toBeGreaterThanOrEqual(0);
    });

    it("should generate diagnostic report", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "New Feature",
          status: "Ready to publish",
          language: "Portuguese",
        }),
        createMockPage({ title: "Getting Started", status: "Draft" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      const diagnosticReport =
        ComparisonEngine.generateDiagnosticReport(result);

      expect(diagnosticReport).toBeDefined();
      expect(diagnosticReport).toContain("Mismatch Diagnostics Report");
      expect(diagnosticReport).toContain("Comparison Metadata");
      expect(diagnosticReport).toContain("Summary");
      expect(diagnosticReport).toContain("New Feature");
      expect(diagnosticReport).toContain("Getting Started");
      expect(diagnosticReport).toContain("Portuguese");
    });

    it("should return null for diagnostic report when diagnostics disabled", async () => {
      const previewSections: PreviewSection[] = [];
      const previewPages: PageWithStatus[] = [];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        false
      );

      const diagnosticReport =
        ComparisonEngine.generateDiagnosticReport(result);

      expect(diagnosticReport).toBeNull();
    });

    it("should include troubleshooting guide in diagnostic report", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({ title: "Test Page", status: "Draft" }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      const diagnosticReport =
        ComparisonEngine.generateDiagnosticReport(result);

      expect(diagnosticReport).toContain("Troubleshooting Guide");
      expect(diagnosticReport).toContain("Common Issues and Solutions");
      expect(diagnosticReport).toContain("Issue");
      expect(diagnosticReport).toContain("Cause");
      expect(diagnosticReport).toContain("Solution");
    });

    it("should handle pages with detailed diagnostic information", async () => {
      const lastEdited = new Date("2024-01-15T10:30:00Z");
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "User Guide" }),
      ];

      const previewPages: PageWithStatus[] = [
        createMockPage({
          title: "Advanced Configuration",
          status: "Ready to publish",
          language: "Spanish",
          lastEdited,
          parentItem: "section-1",
        }),
      ];

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      const newPageDiagnostics = result.diagnostics?.mismatches.find(
        (m) => m.pageTitle === "Advanced Configuration"
      );

      expect(newPageDiagnostics).toBeDefined();
      expect(newPageDiagnostics?.details.lastEdited).toEqual(lastEdited);
      expect(newPageDiagnostics?.details.language).toBe("Spanish");
      expect(newPageDiagnostics?.details.section).toBeDefined();
    });

    it("should track comparison duration accurately", async () => {
      const previewSections: PreviewSection[] = [
        createMockPreviewSection({ title: "Introduction" }),
      ];

      const previewPages: PageWithStatus[] = Array.from(
        { length: 50 },
        (_, i) =>
          createMockPage({
            title: `Page ${i}`,
            status: "Ready to publish",
          })
      );

      const result = await ComparisonEngine.compareWithPublished(
        previewSections,
        previewPages,
        true
      );

      expect(
        result.diagnostics?.comparisonMetadata.comparisonDuration
      ).toBeGreaterThanOrEqual(0);
      expect(
        result.diagnostics?.comparisonMetadata.comparisonDuration
      ).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

// Helper functions
function createMockPreviewSection(options: {
  title: string;
  pagesCount?: number;
}): PreviewSection {
  const { title, pagesCount = 0 } = options;

  const pages = Array.from({ length: pagesCount }, (_, i) => ({
    id: `page-${i}`,
    title: `${title} - Page ${i + 1}`,
    status: "Ready to publish",
    elementType: "Page",
    order: i,
    language: undefined,
    parentItem: undefined,
    subItems: [],
    hasContent: true,
    url: `https://notion.so/page-${i}`,
    lastEdited: new Date(),
    createdTime: new Date(),
  }));

  return {
    title,
    status: "Ready to publish",
    elementType: "Section",
    order: 0,
    pages,
    subSections: [],
    contentStats: {
      totalPages: pagesCount + 1,
      readyPages: pagesCount,
      draftPages: 0,
      emptyPages: 0,
      completionPercentage: pagesCount > 0 ? 100 : 0,
    },
  };
}

function createMockPage(options: Partial<PageWithStatus> = {}): PageWithStatus {
  return {
    id: options.id || "page-" + Math.random().toString(36).substr(2, 9),
    url:
      options.url ||
      `https://notion.so/${(options.id || "test").replace(/-/g, "")}`,
    title: options.title || "Test Page",
    status: options.status || "Ready to publish",
    elementType: options.elementType || "Page",
    order: options.order ?? 0,
    language: options.language,
    parentItem: options.parentItem,
    subItems: options.subItems || [],
    lastEdited: options.lastEdited || new Date(),
    createdTime: options.createdTime || new Date(),
    properties: options.properties || {},
    rawPage: options.rawPage || {},
  };
}
