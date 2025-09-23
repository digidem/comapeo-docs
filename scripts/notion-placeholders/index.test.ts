import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main, parseArgs } from './index.js';
import * as fetchNotionData from '../fetchNotionData.js';
import { PageAnalyzer } from './pageAnalyzer.js';
import { ContentGenerator } from './contentGenerator.js';
import { NotionUpdater } from './notionUpdater.js';
import { BackupManager } from './utils/backupManager.js';

// Mock external dependencies
vi.mock('../fetchNotionData.js');
vi.mock('./pageAnalyzer.js');
vi.mock('./contentGenerator.js');
vi.mock('./notionUpdater.js');
vi.mock('./utils/backupManager.js');
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis()
  }))
}));

describe('notion-placeholders', () => {
  const mockPages = [
    {
      id: 'page1',
      properties: {
        'Content elements': {
          title: [{ plain_text: 'Getting Started' }]
        }
      }
    },
    {
      id: 'page2',
      properties: {
        'Content elements': {
          title: [{ plain_text: 'API Reference' }]
        }
      }
    }
  ];

  const mockAnalyses = new Map([
    ['page1', {
      pageId: 'page1',
      title: 'Getting Started',
      contentScore: 5,
      hasContent: false,
      blockCount: 0,
      recommendedAction: 'fill',
      recommendedContentType: 'tutorial',
      lastModified: new Date('2024-01-01'),
      isRecentlyModified: false
    }],
    ['page2', {
      pageId: 'page2', 
      title: 'API Reference',
      contentScore: 85,
      hasContent: true,
      blockCount: 15,
      recommendedAction: 'skip',
      recommendedContentType: 'reference',
      lastModified: new Date('2024-01-15'),
      isRecentlyModified: false
    }]
  ]);

  const mockBlocks = [
    { type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Getting Started' }] } },
    { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'This is placeholder content.' }] } }
  ];

  const mockUpdateResults = [
    {
      pageId: 'page1',
      success: true,
      blocksAdded: 2,
      originalBlockCount: 0,
      newBlockCount: 2
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup environment variables
    process.env.NOTION_API_KEY = 'test-api-key';
    process.env.DATABASE_ID = 'test-database-id';
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock process.exit
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NOTION_API_KEY;
    delete process.env.DATABASE_ID;
  });

  describe('parseArgs', () => {
    it('should parse command line arguments correctly', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--dry-run', '--verbose', '--content-length', 'long'];
      
      const options = parseArgs();
      
      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.contentLength).toBe('long');
      
      process.argv = originalArgv;
    });

    it('should use default values when no arguments provided', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      const options = parseArgs();
      
      expect(options.dryRun).toBe(false);
      expect(options.verbose).toBe(false);
      expect(options.contentLength).toBe('medium');
      expect(options.backup).toBe(true);
      expect(options.includeRemoved).toBe(false);
      
      process.argv = originalArgv;
    });

    it('should handle status filter and max pages options', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--filter-status', 'Draft', '--max-pages', '10'];
      
      const options = parseArgs();
      
      expect(options.filterStatus).toBe('Draft');
      expect(options.maxPages).toBe(10);
      
      process.argv = originalArgv;
    });
  });

  describe('main function', () => {
    beforeEach(() => {
      vi.mocked(fetchNotionData.fetchNotionData).mockResolvedValue(mockPages);
      vi.mocked(PageAnalyzer.analyzePages).mockResolvedValue(mockAnalyses);
      vi.mocked(PageAnalyzer.generateAnalysisSummary).mockReturnValue({
        totalPages: 2,
        emptyPages: 1,
        pagesNeedingFill: 1,
        pagesNeedingEnhancement: 0,
        averageContentScore: 45,
        recentlyModifiedSkipped: 0
      });
      vi.mocked(ContentGenerator.generateCompletePage).mockReturnValue(mockBlocks);
      vi.mocked(NotionUpdater.updatePages).mockResolvedValue(mockUpdateResults);
      vi.mocked(NotionUpdater.generateUpdateSummary).mockReturnValue({
        totalPages: 1,
        successfulUpdates: 1,
        failedUpdates: 0,
        totalBlocksAdded: 2,
        errors: []
      });
      vi.mocked(BackupManager.cleanupOldBackups).mockReturnValue(0);
      vi.mocked(BackupManager.getBackupStats).mockReturnValue({
        totalBackups: 1,
        uniquePages: 1,
        totalSizeBytes: 1024
      });
    });

    it('should exit early if NOTION_API_KEY is missing', async () => {
      delete process.env.NOTION_API_KEY;
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await expect(main()).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('NOTION_API_KEY not found')
      );
      
      process.argv = originalArgv;
    });

    it('should exit early if DATABASE_ID is missing', async () => {
      delete process.env.DATABASE_ID;
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await expect(main()).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_ID not found')
      );
      
      process.argv = originalArgv;
    });

    it('should complete full workflow successfully', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await main();
      
      expect(fetchNotionData.fetchNotionData).toHaveBeenCalledWith(undefined);
      expect(PageAnalyzer.analyzePages).toHaveBeenCalled();
      expect(ContentGenerator.generateCompletePage).toHaveBeenCalled();
      expect(NotionUpdater.updatePages).toHaveBeenCalled();
      
      process.argv = originalArgv;
    });

    it('should handle dry run mode', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--dry-run'];
      
      await main();
      
      expect(NotionUpdater.updatePages).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ dryRun: true })
      );
      
      process.argv = originalArgv;
    });

    it('should handle status filter', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--filter-status', 'Draft'];
      
      await main();
      
      expect(fetchNotionData.fetchNotionData).toHaveBeenCalledWith({
        property: "Status",
        select: { equals: 'Draft' }
      });
      
      process.argv = originalArgv;
    });

    it('should handle no pages needing updates', async () => {
      // Mock no pages needing fill
      vi.mocked(PageAnalyzer.analyzePages).mockResolvedValue(new Map());
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await main();
      
      expect(ContentGenerator.generateCompletePage).not.toHaveBeenCalled();
      expect(NotionUpdater.updatePages).not.toHaveBeenCalled();
      
      process.argv = originalArgv;
    });

    it('should handle force mode', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--force'];
      
      await main();
      
      expect(PageAnalyzer.analyzePages).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ minContentScore: 0 })
      );
      
      process.argv = originalArgv;
    });

    it('should handle verbose mode', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--verbose'];
      
      await main();
      
      expect(BackupManager.getBackupStats).toHaveBeenCalled();
      
      process.argv = originalArgv;
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(fetchNotionData.fetchNotionData).mockRejectedValue(new Error('API Error'));
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await expect(main()).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error:'),
        expect.any(Error)
      );
      
      process.argv = originalArgv;
    });

    it('should limit pages when max-pages is specified', async () => {
      const manyPages = Array.from({ length: 20 }, (_, i) => ({
        id: `page${i}`,
        properties: {
          'Content elements': {
            title: [{ plain_text: `Page ${i}` }]
          }
        }
      }));
      
      vi.mocked(fetchNotionData.fetchNotionData).mockResolvedValue(manyPages);
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--max-pages', '5'];
      
      await main();
      
      expect(PageAnalyzer.analyzePages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'page0' }),
          expect.objectContaining({ id: 'page1' }),
          expect.objectContaining({ id: 'page2' }),
          expect.objectContaining({ id: 'page3' }),
          expect.objectContaining({ id: 'page4' })
        ]),
        expect.any(Object)
      );
      
      process.argv = originalArgv;
    });
  });

  describe('error handling', () => {
    it('should handle analysis errors', async () => {
      vi.mocked(fetchNotionData.fetchNotionData).mockResolvedValue(mockPages);
      vi.mocked(PageAnalyzer.analyzePages).mockRejectedValue(new Error('Analysis failed'));
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await expect(main()).rejects.toThrow('process.exit called');
      
      process.argv = originalArgv;
    });

    it('should handle content generation errors', async () => {
      vi.mocked(fetchNotionData.fetchNotionData).mockResolvedValue(mockPages);
      vi.mocked(PageAnalyzer.analyzePages).mockResolvedValue(mockAnalyses);
      vi.mocked(ContentGenerator.generateCompletePage).mockImplementation(() => {
        throw new Error('Generation failed');
      });
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await expect(main()).rejects.toThrow('process.exit called');
      
      process.argv = originalArgv;
    });

    it('should handle update errors gracefully', async () => {
      vi.mocked(fetchNotionData.fetchNotionData).mockResolvedValue(mockPages);
      vi.mocked(PageAnalyzer.analyzePages).mockResolvedValue(mockAnalyses);
      vi.mocked(ContentGenerator.generateCompletePage).mockReturnValue(mockBlocks);
      vi.mocked(NotionUpdater.updatePages).mockResolvedValue([
        {
          pageId: 'page1',
          success: false,
          blocksAdded: 0,
          originalBlockCount: 0,
          newBlockCount: 0,
          error: 'Update failed'
        }
      ]);
      vi.mocked(NotionUpdater.generateUpdateSummary).mockReturnValue({
        totalPages: 1,
        successfulUpdates: 0,
        failedUpdates: 1,
        totalBlocksAdded: 0,
        errors: ['page1: Update failed']
      });
      
      const originalArgv = process.argv;
      process.argv = ['node', 'script'];
      
      await main();
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed updates: 1')
      );
      
      process.argv = originalArgv;
    });
  });

  describe('configuration validation', () => {
    it('should validate content length options', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--content-length', 'invalid'];
      
      const options = parseArgs();
      
      // Should default to medium for invalid option
      expect(options.contentLength).toBe('medium');
      
      process.argv = originalArgv;
    });

    it('should handle numeric arguments correctly', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'script', '--recent-hours', 'abc', '--max-pages', 'def'];
      
      const options = parseArgs();
      
      expect(options.recentThresholdHours).toBe(24); // default fallback
      expect(options.maxPages).toBeUndefined(); // invalid number
      
      process.argv = originalArgv;
    });
  });
});