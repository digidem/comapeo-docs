import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { captureConsoleOutput } from "../test-utils";
import { StatusAnalyzer } from "./statusAnalyzer";
import type { PageWithStatus } from "./fetchAll";

describe("StatusAnalyzer", () => {
  let consoleCapture: ReturnType<typeof captureConsoleOutput>;

  beforeEach(() => {
    consoleCapture = captureConsoleOutput();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  describe("analyzePublicationStatus", () => {
    it("should analyze status breakdown correctly", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "In progress" }),
        createMockPage({ status: "No Status" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.length).toBeGreaterThan(0);

      const readyStatus = result.breakdown.find(
        (b) => b.status === "Ready to publish"
      );
      expect(readyStatus).toBeDefined();
      expect(readyStatus?.count).toBe(2);
      expect(readyStatus?.percentage).toBe(40); // 2/5 = 40%
    });

    it("should calculate readiness percentage correctly", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "Draft" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.readiness.readyToPublish).toBe(3);
      expect(result.readiness.needsWork).toBe(2);
      expect(result.readiness.totalPages).toBe(5);
      expect(result.readiness.readinessPercentage).toBe(60); // 3/5 = 60%
    });

    it("should identify blockers correctly", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "In progress" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.readiness.blockers).toBeDefined();
      expect(result.readiness.blockers.length).toBeGreaterThan(0);

      const draftBlocker = result.readiness.blockers.find(
        (b) => b.type === "draft_status"
      );
      expect(draftBlocker).toBeDefined();
      expect(draftBlocker?.count).toBe(2); // Draft + In progress
    });

    it("should analyze language progress", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish", language: "English" }),
        createMockPage({ status: "Ready to publish", language: "English" }),
        createMockPage({ status: "Draft", language: "Spanish" }),
        createMockPage({ status: "Ready to publish", language: "Portuguese" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.languages).toBeDefined();
      expect(result.languages.length).toBe(3); // English, Spanish, Portuguese

      const englishLang = result.languages.find((l) => l.language === "English");
      expect(englishLang).toBeDefined();
      expect(englishLang?.totalPages).toBe(2);
      expect(englishLang?.readyPages).toBe(2);
      expect(englishLang?.completionPercentage).toBe(100);
    });

    it("should analyze trends correctly", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      const pages: PageWithStatus[] = [
        createMockPage({ lastEdited: new Date() }), // Recently updated (within 7 days)
        createMockPage({ lastEdited: threeDaysAgo }), // Recently updated (within 7 days)
        createMockPage({ lastEdited: fortyDaysAgo }), // Stale (> 30 days)
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.trends).toBeDefined();
      expect(result.trends.recentlyUpdated).toBe(2);
      expect(result.trends.staleContent).toBe(1);
      expect(result.trends.averageAge).toBeGreaterThan(0);
    });

    it("should handle empty pages array", () => {
      const result = StatusAnalyzer.analyzePublicationStatus([]);

      expect(result.breakdown).toHaveLength(0);
      expect(result.readiness.totalPages).toBe(0);
      expect(result.readiness.readinessPercentage).toBe(0);
      expect(result.languages).toHaveLength(0);
    });

    it("should handle pages with default language", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }), // No language specified
        createMockPage({ status: "Draft" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.languages).toBeDefined();
      const defaultLang = result.languages.find((l) => l.language === "English");
      expect(defaultLang).toBeDefined();
      expect(defaultLang?.totalPages).toBe(2);
    });

    it("should sort breakdown by count descending", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "In progress" }),
        createMockPage({ status: "In progress" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      // Should be sorted: Ready (3), In progress (2), Draft (1)
      expect(result.breakdown[0].status).toBe("Ready to publish");
      expect(result.breakdown[0].count).toBe(3);
      expect(result.breakdown[1].count).toBe(2);
      expect(result.breakdown[2].count).toBe(1);
    });

    it("should sort languages by completion percentage", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish", language: "English" }),
        createMockPage({ status: "Ready to publish", language: "English" }),
        createMockPage({ status: "Draft", language: "Spanish" }),
        createMockPage({ status: "Ready to publish", language: "Spanish" }),
        createMockPage({ status: "Draft", language: "Portuguese" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      // English: 100% (2/2), Spanish: 50% (1/2), Portuguese: 0% (0/1)
      expect(result.languages[0].language).toBe("English");
      expect(result.languages[0].completionPercentage).toBe(100);
      expect(result.languages[1].completionPercentage).toBeLessThan(100);
    });
  });

  describe("identifyContentGaps", () => {
    it("should identify missing common sections", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Introduction" }),
        createMockPage({ title: "User Guide" }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      expect(result.missingPages).toBeDefined();
      expect(result.missingPages.length).toBeGreaterThan(0);

      // Should identify missing common sections
      const missingTitles = result.missingPages.map((p) => p.expectedTitle);
      expect(missingTitles).toContain("Getting Started");
      expect(missingTitles).toContain("Installation");
    });

    it("should identify missing translations", () => {
      const pages: PageWithStatus[] = [
        createMockPage({
          id: "parent-1",
          title: "Getting Started",
          status: "Ready to publish",
          language: "English",
        }),
        // No Spanish or Portuguese translations
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      const translationGaps = result.missingPages.filter(
        (p) => p.reason.includes("translation")
      );

      expect(translationGaps.length).toBeGreaterThan(0);
    });

    it("should identify empty sections", () => {
      const parentId = "section-123";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Empty Section",
          elementType: "Section",
        }),
        // No child pages
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      expect(result.inconsistentStructure).toBeDefined();
      const emptySection = result.inconsistentStructure.find(
        (issue) => issue.section === "Empty Section"
      );

      expect(emptySection).toBeDefined();
      expect(emptySection?.issue).toContain("Empty section");
    });

    it("should identify orphaned pages", () => {
      const pages: PageWithStatus[] = [
        createMockPage({
          id: "orphan-1",
          title: "Orphaned Page",
          parentItem: "non-existent-parent",
        }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      const orphaned = result.inconsistentStructure.find(
        (issue) => issue.section === "Orphaned Page"
      );

      expect(orphaned).toBeDefined();
      expect(orphaned?.issue).toContain("Orphaned page");
    });

    it("should identify outdated content", () => {
      const sixtyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);

      const pages: PageWithStatus[] = [
        createMockPage({
          title: "Old Page",
          status: "Ready to publish",
          lastEdited: sixtyDaysAgo,
        }),
        createMockPage({
          title: "Recent Page",
          status: "Ready to publish",
          lastEdited: new Date(),
        }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      expect(result.outdatedContent).toBeDefined();
      expect(result.outdatedContent.length).toBe(1);
      expect(result.outdatedContent[0].title).toBe("Old Page");
      expect(result.outdatedContent[0].staleDays).toBeGreaterThan(60);
    });

    it("should sort outdated content by staleness", () => {
      const seventyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);

      const pages: PageWithStatus[] = [
        createMockPage({
          title: "Somewhat Old",
          status: "Ready to publish",
          lastEdited: seventyDaysAgo,
        }),
        createMockPage({
          title: "Very Old",
          status: "Ready to publish",
          lastEdited: ninetyDaysAgo,
        }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      // Should be sorted by staleness descending
      expect(result.outdatedContent.length).toBe(2);
      expect(result.outdatedContent[0].title).toBe("Very Old");
      expect(result.outdatedContent[0].staleDays).toBeGreaterThan(
        result.outdatedContent[1].staleDays
      );
    });

    it("should not include draft pages in outdated content", () => {
      const sixtyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);

      const pages: PageWithStatus[] = [
        createMockPage({
          title: "Old Draft",
          status: "Draft",
          lastEdited: sixtyDaysAgo,
        }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      expect(result.outdatedContent).toHaveLength(0);
    });

    it("should handle pages with children correctly", () => {
      const parentId = "section-123";
      const pages: PageWithStatus[] = [
        createMockPage({
          id: parentId,
          title: "Section with Children",
          elementType: "Section",
        }),
        createMockPage({
          id: "child-1",
          title: "Child Page",
          parentItem: parentId,
        }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      // Should NOT identify this as an empty section
      const emptySection = result.inconsistentStructure.find(
        (issue) => issue.section === "Section with Children"
      );

      expect(emptySection).toBeUndefined();
    });
  });

  describe("generateReadinessReport", () => {
    it("should generate comprehensive summary", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
      ];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain("Publication Readiness");
      expect(result.summary).toContain("67%"); // 2/3
      expect(result.summary).toContain("Ready to Publish**: 2");
      expect(result.summary).toContain("Needs Work**: 1");
    });

    it("should provide actionable recommendations", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "In progress" }),
      ];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);

      const hasBlockersRec = result.recommendations.some((r) =>
        r.includes("Address Critical Blockers")
      );
      expect(hasBlockersRec).toBe(true);
    });

    it("should include timeline with immediate, short-term, and long-term tasks", () => {
      const pages: PageWithStatus[] = [createMockPage({ status: "Draft" })];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      expect(result.timeline).toBeDefined();
      expect(result.timeline.immediate).toBeDefined();
      expect(result.timeline.shortTerm).toBeDefined();
      expect(result.timeline.longTerm).toBeDefined();

      expect(result.timeline.immediate.length).toBeGreaterThan(0);
      expect(result.timeline.shortTerm.length).toBeGreaterThan(0);
      expect(result.timeline.longTerm.length).toBeGreaterThan(0);
    });

    it("should recommend missing content additions", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Random Page" }),
      ];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      const missingContentRec = result.recommendations.find((r) =>
        r.includes("Add Missing Content")
      );

      expect(missingContentRec).toBeDefined();
    });

    it("should recommend stale content updates", () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      const pages: PageWithStatus[] = [
        createMockPage({
          status: "Ready to publish",
          lastEdited: fortyDaysAgo,
        }),
        createMockPage({
          status: "Ready to publish",
          lastEdited: fortyDaysAgo,
        }),
      ];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      const staleContentRec = result.recommendations.find((r) =>
        r.includes("Update Stale Content")
      );

      expect(staleContentRec).toBeDefined();
    });

    it("should handle 100% ready pages", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Ready to publish" }),
        createMockPage({ status: "Ready to publish" }),
      ];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      expect(result.summary).toContain("100%");
      expect(result.summary).toContain("Needs Work**: 0");
    });

    it("should handle 0% ready pages", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Draft" }),
        createMockPage({ status: "In progress" }),
      ];

      const result = StatusAnalyzer.generateReadinessReport(pages);

      expect(result.summary).toContain("0%");
      expect(result.summary).toContain("Ready to Publish**: 0");
    });
  });

  describe("Edge Cases", () => {
    it("should handle pages with very old dates", () => {
      const veryOld = new Date("2020-01-01");

      const pages: PageWithStatus[] = [
        createMockPage({
          status: "Ready to publish",
          lastEdited: veryOld,
          createdTime: veryOld,
        }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.trends.averageAge).toBeGreaterThan(365 * 3); // More than 3 years
    });

    it("should handle pages with future dates gracefully", () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const pages: PageWithStatus[] = [
        createMockPage({
          status: "Ready to publish",
          lastEdited: future,
        }),
      ];

      // Should not throw error
      const result = StatusAnalyzer.analyzePublicationStatus(pages);
      expect(result).toBeDefined();
    });

    it("should handle duplicate page titles", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ id: "1", title: "Duplicate", status: "Ready to publish" }),
        createMockPage({ id: "2", title: "Duplicate", status: "Draft" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.breakdown).toBeDefined();
      expect(result.readiness.totalPages).toBe(2);
    });

    it("should handle very long page titles", () => {
      const longTitle = "A".repeat(500);

      const pages: PageWithStatus[] = [
        createMockPage({ title: longTitle, status: "Ready to publish" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.breakdown[0].pages[0].title).toBe(longTitle);
    });

    it("should handle pages with special characters in titles", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ title: "Page <>&\"'", status: "Ready to publish" }),
        createMockPage({ title: "Page with 中文", status: "Draft" }),
        createMockPage({ title: "Page with émojis 🎉", status: "In progress" }),
      ];

      const result = StatusAnalyzer.analyzePublicationStatus(pages);

      expect(result.breakdown).toBeDefined();
      expect(result.readiness.totalPages).toBe(3);
    });

    it("should handle many pages efficiently", () => {
      const manyPages: PageWithStatus[] = Array.from({ length: 1000 }, (_, i) =>
        createMockPage({
          id: `page-${i}`,
          title: `Page ${i}`,
          status: i % 3 === 0 ? "Ready to publish" : "Draft",
        })
      );

      const startTime = Date.now();
      const result = StatusAnalyzer.analyzePublicationStatus(manyPages);
      const duration = Date.now() - startTime;

      expect(result.readiness.totalPages).toBe(1000);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it("should handle missing translation check with no ready pages", () => {
      const pages: PageWithStatus[] = [
        createMockPage({ status: "Draft", language: "English" }),
      ];

      const result = StatusAnalyzer.identifyContentGaps(pages);

      // Should not try to find translations for draft pages
      const translationGaps = result.missingPages.filter((p) =>
        p.reason.includes("translation")
      );
      expect(translationGaps).toHaveLength(0);
    });

    it("should handle circular parent relationships gracefully", () => {
      const pages: PageWithStatus[] = [
        createMockPage({
          id: "page-1",
          title: "Page 1",
          parentItem: "page-2",
        }),
        createMockPage({
          id: "page-2",
          title: "Page 2",
          parentItem: "page-1",
        }),
      ];

      // Should not crash
      const result = StatusAnalyzer.identifyContentGaps(pages);
      expect(result).toBeDefined();
    });
  });
});

// Helper function to create mock PageWithStatus
function createMockPage(
  options: Partial<PageWithStatus> = {}
): PageWithStatus {
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
