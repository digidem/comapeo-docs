import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Mock dependencies before importing
vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

vi.mock('./spinnerManager.js', () => ({
  default: {
    create: vi.fn(() => ({
      text: '',
      succeed: vi.fn(),
      fail: vi.fn()
    })),
    remove: vi.fn()
  }
}));

vi.mock('./utils.js', () => ({
  compressImageToFileWithFallback: vi.fn(),
  isResizableFormat: vi.fn(),
  detectFormatFromBuffer: vi.fn(),
  extForFormat: vi.fn()
}));

import { EmojiProcessor } from './emojiProcessor.js';

describe('EmojiProcessor', () => {
  const testEmojiDir = path.join(process.cwd(), 'static/images/emojis-test/');
  const originalEmojiPath = EmojiProcessor['EMOJI_PATH'];
  
  beforeEach(() => {
    // Override the emoji path for testing
    (EmojiProcessor as any).EMOJI_PATH = testEmojiDir;
    (EmojiProcessor as any).EMOJI_CACHE_FILE = path.join(testEmojiDir, '.emoji-cache.json');
    (EmojiProcessor as any).initialized = false;
    (EmojiProcessor as any).emojiCache.clear();
    
    // Ensure test directory exists
    fs.mkdirSync(testEmojiDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testEmojiDir)) {
      fs.rmSync(testEmojiDir, { recursive: true, force: true });
    }
    
    // Restore original path
    (EmojiProcessor as any).EMOJI_PATH = originalEmojiPath;
  });

  describe('processPageEmojis', () => {
    it('should return content unchanged when no emojis present', async () => {
      const content = 'This is a test content without emojis.';
      const result = await EmojiProcessor.processPageEmojis('test-page', content);
      
      expect(result.content).toBe(content);
      expect(result.totalSaved).toBe(0);
    });

    it('should detect Notion emoji URLs', async () => {
      const content = `Check out this emoji: https://amazonaws.com/emoji/smile.png and this one: https://notion.site/emoji/heart.svg`;
      
      // Mock successful emoji processing
      vi.spyOn(EmojiProcessor, 'processEmoji').mockResolvedValue({
        newPath: '/images/emojis/test-emoji.png',
        savedBytes: 1024,
        reused: false
      });
      
      const result = await EmojiProcessor.processPageEmojis('test-page', content);
      
      expect(EmojiProcessor.processEmoji).toHaveBeenCalledTimes(2);
      expect(result.content).toContain('/images/emojis/test-emoji.png');
      expect(result.totalSaved).toBe(2048); // 1024 * 2
    });

    it('should handle emoji processing failures gracefully', async () => {
      const content = `Check out this emoji: https://amazonaws.com/emoji/broken.png`;
      
      // Mock failed emoji processing
      vi.spyOn(EmojiProcessor, 'processEmoji').mockRejectedValue(new Error('Network error'));
      
      // Should not throw, but continue processing
      const result = await EmojiProcessor.processPageEmojis('test-page', content);
      
      expect(result.content).toBe(content); // Content unchanged on failure
      expect(result.totalSaved).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct cache statistics', () => {
      // Add some test entries to cache
      (EmojiProcessor as any).emojiCache.set('url1', {
        url: 'url1',
        filename: 'emoji1.png',
        localPath: '/path/emoji1.png',
        hash: 'hash1',
        size: 1024
      });
      
      (EmojiProcessor as any).emojiCache.set('url2', {
        url: 'url2',
        filename: 'emoji2.png',
        localPath: '/path/emoji2.png',
        hash: 'hash2',
        size: 2048
      });
      
      const stats = EmojiProcessor.getCacheStats();
      
      expect(stats.totalEmojis).toBe(2);
      expect(stats.totalSize).toBe(3072);
      expect(stats.uniqueEmojis).toBe(2);
    });
  });

  describe('initialization', () => {
    it('should create emoji directory on initialization', async () => {
      await EmojiProcessor.initialize();
      
      expect(fs.existsSync(testEmojiDir)).toBe(true);
    });

    it('should only initialize once', async () => {
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync');
      
      await EmojiProcessor.initialize();
      await EmojiProcessor.initialize();
      
      // Should only be called once for the directory creation
      expect(mkdirSpy).toHaveBeenCalledTimes(1);
    });
  });
});