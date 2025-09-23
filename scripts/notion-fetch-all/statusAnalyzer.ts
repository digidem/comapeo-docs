import { PageWithStatus } from './fetchAll.js';

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
  pages: Array<{
    id: string;
    title: string;
    elementType: string;
    language?: string;
    lastEdited: Date;
    hasContent: boolean;
  }>;
}

export interface PublicationReadiness {
  readyToPublish: number;
  needsWork: number;
  totalPages: number;
  readinessPercentage: number;
  blockers: Array<{
    type: 'empty_content' | 'draft_status' | 'missing_translation' | 'outdated_content';
    count: number;
    pages: string[];
  }>;
}

export interface LanguageAnalysis {
  language: string;
  totalPages: number;
  readyPages: number;
  draftPages: number;
  emptyPages: number;
  completionPercentage: number;
  lastUpdated: Date;
}

export interface ContentGaps {
  missingPages: Array<{
    parentSection: string;
    expectedTitle: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;
  inconsistentStructure: Array<{
    section: string;
    issue: string;
    suggestion: string;
  }>;
  outdatedContent: Array<{
    pageId: string;
    title: string;
    lastEdited: Date;
    staleDays: number;
  }>;
}

/**
 * Analyzes publication status and readiness of documentation
 */
export class StatusAnalyzer {
  /**
   * Analyze overall publication status
   */
  static analyzePublicationStatus(pages: PageWithStatus[]): {
    breakdown: StatusBreakdown[];
    readiness: PublicationReadiness;
    languages: LanguageAnalysis[];
    trends: {
      recentlyUpdated: number;
      staleContent: number;
      averageAge: number;
    };
  } {
    console.log('📊 Analyzing publication status...');

    const breakdown = this.generateStatusBreakdown(pages);
    const readiness = this.assessPublicationReadiness(pages);
    const languages = this.analyzeLanguageProgress(pages);
    const trends = this.analyzeTrends(pages);

    console.log(`✅ Analysis complete: ${readiness.readinessPercentage}% ready for publication`);

    return {
      breakdown,
      readiness,
      languages,
      trends
    };
  }

  /**
   * Generate detailed status breakdown
   */
  private static generateStatusBreakdown(pages: PageWithStatus[]): StatusBreakdown[] {
    const statusGroups = new Map<string, PageWithStatus[]>();

    // Group pages by status
    for (const page of pages) {
      const status = page.status || 'No Status';
      if (!statusGroups.has(status)) {
        statusGroups.set(status, []);
      }
      statusGroups.get(status)!.push(page);
    }

    const totalPages = pages.length;
    const breakdown: StatusBreakdown[] = [];

    // Generate breakdown for each status
    for (const [status, statusPages] of statusGroups.entries()) {
      breakdown.push({
        status,
        count: statusPages.length,
        percentage: Math.round((statusPages.length / totalPages) * 100),
        pages: statusPages.map(page => ({
          id: page.id,
          title: page.title,
          elementType: page.elementType,
          language: page.language,
          lastEdited: page.lastEdited,
          hasContent: this.estimateHasContent(page) // Simplified estimation
        }))
      });
    }

    // Sort by count descending
    breakdown.sort((a, b) => b.count - a.count);

    return breakdown;
  }

  /**
   * Assess overall publication readiness
   */
  private static assessPublicationReadiness(pages: PageWithStatus[]): PublicationReadiness {
    const readyToPublish = pages.filter(page => page.status === 'Ready to publish').length;
    const totalPages = pages.length;
    const needsWork = totalPages - readyToPublish;
    const readinessPercentage = Math.round((readyToPublish / totalPages) * 100);

    // Identify blockers
    const blockers: PublicationReadiness['blockers'] = [];

    // Empty content blocker
    const emptyPages = pages.filter(page => !this.estimateHasContent(page));
    if (emptyPages.length > 0) {
      blockers.push({
        type: 'empty_content',
        count: emptyPages.length,
        pages: emptyPages.map(p => p.title)
      });
    }

    // Draft status blocker
    const draftPages = pages.filter(page => 
      page.status === 'Draft' || page.status === 'In progress'
    );
    if (draftPages.length > 0) {
      blockers.push({
        type: 'draft_status',
        count: draftPages.length,
        pages: draftPages.map(p => p.title)
      });
    }

    // Missing translations blocker
    const englishPages = pages.filter(page => !page.language || page.language === 'English');
    const translatedPages = pages.filter(page => page.language && page.language !== 'English');
    const translationGap = englishPages.length * 2 - translatedPages.length; // Assuming es/pt translations
    
    if (translationGap > 0) {
      blockers.push({
        type: 'missing_translation',
        count: translationGap,
        pages: ['Multiple pages need translation']
      });
    }

    // Outdated content blocker
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const outdatedPages = pages.filter(page => 
      page.lastEdited < thirtyDaysAgo && page.status === 'Ready to publish'
    );
    
    if (outdatedPages.length > 0) {
      blockers.push({
        type: 'outdated_content',
        count: outdatedPages.length,
        pages: outdatedPages.map(p => p.title)
      });
    }

    return {
      readyToPublish,
      needsWork,
      totalPages,
      readinessPercentage,
      blockers
    };
  }

  /**
   * Analyze progress by language
   */
  private static analyzeLanguageProgress(pages: PageWithStatus[]): LanguageAnalysis[] {
    const languageGroups = new Map<string, PageWithStatus[]>();

    // Group pages by language
    for (const page of pages) {
      const language = page.language || 'English'; // Default to English
      if (!languageGroups.has(language)) {
        languageGroups.set(language, []);
      }
      languageGroups.get(language)!.push(page);
    }

    const analyses: LanguageAnalysis[] = [];

    for (const [language, languagePages] of languageGroups.entries()) {
      const totalPages = languagePages.length;
      const readyPages = languagePages.filter(p => p.status === 'Ready to publish').length;
      const draftPages = languagePages.filter(p => 
        p.status === 'Draft' || p.status === 'In progress'
      ).length;
      const emptyPages = languagePages.filter(p => !this.estimateHasContent(p)).length;
      const completionPercentage = Math.round((readyPages / totalPages) * 100);
      
      // Find most recent update
      const lastUpdated = new Date(Math.max(...languagePages.map(p => p.lastEdited.getTime())));

      analyses.push({
        language,
        totalPages,
        readyPages,
        draftPages,
        emptyPages,
        completionPercentage,
        lastUpdated
      });
    }

    // Sort by completion percentage descending
    analyses.sort((a, b) => b.completionPercentage - a.completionPercentage);

    return analyses;
  }

  /**
   * Analyze content trends and patterns
   */
  private static analyzeTrends(pages: PageWithStatus[]) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentlyUpdated = pages.filter(page => page.lastEdited > sevenDaysAgo).length;
    const staleContent = pages.filter(page => page.lastEdited < thirtyDaysAgo).length;
    
    // Calculate average age in days
    const now = Date.now();
    const totalAge = pages.reduce((sum, page) => {
      const ageMs = now - page.lastEdited.getTime();
      return sum + (ageMs / (24 * 60 * 60 * 1000)); // Convert to days
    }, 0);
    const averageAge = Math.round(totalAge / pages.length);

    return {
      recentlyUpdated,
      staleContent,
      averageAge
    };
  }

  /**
   * Identify content gaps and issues
   */
  static identifyContentGaps(pages: PageWithStatus[]): ContentGaps {
    console.log('🔍 Identifying content gaps...');

    const missingPages = this.identifyMissingPages(pages);
    const inconsistentStructure = this.identifyStructureIssues(pages);
    const outdatedContent = this.identifyOutdatedContent(pages);

    console.log(`📝 Found ${missingPages.length} missing pages, ${inconsistentStructure.length} structure issues`);

    return {
      missingPages,
      inconsistentStructure,
      outdatedContent
    };
  }

  /**
   * Identify missing pages in documentation structure
   */
  private static identifyMissingPages(pages: PageWithStatus[]): ContentGaps['missingPages'] {
    const missingPages: ContentGaps['missingPages'] = [];

    // Check for common missing sections
    const commonSections = [
      'Getting Started',
      'Installation',
      'Configuration',
      'API Reference',
      'Troubleshooting',
      'FAQ'
    ];

    const existingTitles = new Set(pages.map(p => p.title.toLowerCase()));

    for (const section of commonSections) {
      if (!existingTitles.has(section.toLowerCase())) {
        missingPages.push({
          parentSection: 'Root',
          expectedTitle: section,
          priority: 'high',
          reason: 'Common documentation section missing'
        });
      }
    }

    // Check for incomplete language coverage
    const englishPages = pages.filter(p => !p.language || p.language === 'English');
    const languages = ['Spanish', 'Portuguese'];

    for (const englishPage of englishPages) {
      for (const lang of languages) {
        const hasTranslation = pages.some(p => 
          p.language === lang && 
          p.parentItem === englishPage.parentItem &&
          p.title.includes(englishPage.title)
        );
        
        if (!hasTranslation && englishPage.status === 'Ready to publish') {
          missingPages.push({
            parentSection: englishPage.title,
            expectedTitle: `${englishPage.title} (${lang})`,
            priority: 'medium',
            reason: `Missing ${lang} translation`
          });
        }
      }
    }

    return missingPages;
  }

  /**
   * Identify structural inconsistencies
   */
  private static identifyStructureIssues(pages: PageWithStatus[]): ContentGaps['inconsistentStructure'] {
    const issues: ContentGaps['inconsistentStructure'] = [];

    // Check for sections without content
    const sections = pages.filter(p => p.elementType === 'Section');
    
    for (const section of sections) {
      const childPages = pages.filter(p => p.parentItem === section.id);
      
      if (childPages.length === 0) {
        issues.push({
          section: section.title,
          issue: 'Empty section with no child pages',
          suggestion: 'Add content pages or remove section'
        });
      }
    }

    // Check for orphaned pages
    const orphanedPages = pages.filter(p => {
      if (!p.parentItem) return false; // Top-level is OK
      return !pages.some(parent => parent.id === p.parentItem);
    });

    for (const orphan of orphanedPages) {
      issues.push({
        section: orphan.title,
        issue: 'Orphaned page with missing parent',
        suggestion: 'Reassign to existing section or create parent'
      });
    }

    return issues;
  }

  /**
   * Identify outdated content
   */
  private static identifyOutdatedContent(pages: PageWithStatus[]): ContentGaps['outdatedContent'] {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    
    return pages
      .filter(page => 
        page.lastEdited < sixtyDaysAgo && 
        page.status === 'Ready to publish'
      )
      .map(page => ({
        pageId: page.id,
        title: page.title,
        lastEdited: page.lastEdited,
        staleDays: Math.floor((Date.now() - page.lastEdited.getTime()) / (24 * 60 * 60 * 1000))
      }))
      .sort((a, b) => b.staleDays - a.staleDays);
  }

  /**
   * Generate publication readiness report
   */
  static generateReadinessReport(pages: PageWithStatus[]): {
    summary: string;
    recommendations: string[];
    timeline: {
      immediate: string[];
      shortTerm: string[];
      longTerm: string[];
    };
  } {
    const analysis = this.analyzePublicationStatus(pages);
    const gaps = this.identifyContentGaps(pages);

    // Generate summary
    let summary = `📊 **Publication Readiness: ${analysis.readiness.readinessPercentage}%**\n\n`;
    summary += `- **Ready to Publish**: ${analysis.readiness.readyToPublish} pages\n`;
    summary += `- **Needs Work**: ${analysis.readiness.needsWork} pages\n`;
    summary += `- **Main Blockers**: ${analysis.readiness.blockers.length} categories\n\n`;

    // Generate recommendations
    const recommendations: string[] = [];

    if (analysis.readiness.blockers.length > 0) {
      recommendations.push('🚨 **Address Critical Blockers:**');
      for (const blocker of analysis.readiness.blockers) {
        recommendations.push(`   - ${blocker.type}: ${blocker.count} pages`);
      }
    }

    if (gaps.missingPages.length > 0) {
      recommendations.push('📝 **Add Missing Content:**');
      const highPriority = gaps.missingPages.filter(p => p.priority === 'high');
      for (const missing of highPriority.slice(0, 5)) {
        recommendations.push(`   - ${missing.expectedTitle} (${missing.reason})`);
      }
    }

    if (analysis.trends.staleContent > 0) {
      recommendations.push(`🔄 **Update Stale Content:** ${analysis.trends.staleContent} pages older than 30 days`);
    }

    // Generate timeline
    const timeline = {
      immediate: [
        'Fix empty pages with placeholder content',
        'Review and publish draft content',
        'Address critical structural issues'
      ],
      shortTerm: [
        'Complete missing translations',
        'Add missing high-priority sections',
        'Update outdated content'
      ],
      longTerm: [
        'Establish content maintenance schedule',
        'Implement automated quality checks',
        'Develop comprehensive style guide'
      ]
    };

    return {
      summary,
      recommendations,
      timeline
    };
  }

  /**
   * Simplified content estimation (to be replaced with actual analysis)
   */
  private static estimateHasContent(page: PageWithStatus): boolean {
    // This is a simplified estimation
    // In reality, you'd check the actual page content via API
    return page.status === 'Ready to publish' || page.status === 'Draft';
  }
}