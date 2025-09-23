import { describe, it, expect } from 'vitest';
import { ContentGenerator, ContentType, ContentLength } from './contentGenerator.js';

describe('ContentGenerator', () => {
  describe('detectContentType', () => {
    it('should detect tutorial content type', () => {
      expect(ContentGenerator.detectContentType('Getting Started Guide')).toBe('tutorial');
      expect(ContentGenerator.detectContentType('Quick Start Tutorial')).toBe('tutorial');
      expect(ContentGenerator.detectContentType('How to Setup CoMapeo')).toBe('tutorial');
      expect(ContentGenerator.detectContentType('Step by Step Guide')).toBe('tutorial');
    });

    it('should detect reference content type', () => {
      expect(ContentGenerator.detectContentType('API Reference')).toBe('reference');
      expect(ContentGenerator.detectContentType('Configuration Options')).toBe('reference');
      expect(ContentGenerator.detectContentType('Command Line Interface')).toBe('reference');
      expect(ContentGenerator.detectContentType('Settings Documentation')).toBe('reference');
    });

    it('should detect troubleshooting content type', () => {
      expect(ContentGenerator.detectContentType('Troubleshooting Common Issues')).toBe('troubleshooting');
      expect(ContentGenerator.detectContentType('FAQ - Frequently Asked Questions')).toBe('troubleshooting');
      expect(ContentGenerator.detectContentType('Error Messages and Solutions')).toBe('troubleshooting');
      expect(ContentGenerator.detectContentType('Known Issues and Workarounds')).toBe('troubleshooting');
    });

    it('should default to intro for unrecognized titles', () => {
      expect(ContentGenerator.detectContentType('Random Title')).toBe('intro');
      expect(ContentGenerator.detectContentType('Some Feature')).toBe('intro');
      expect(ContentGenerator.detectContentType('')).toBe('intro');
    });

    it('should handle case insensitive matching', () => {
      expect(ContentGenerator.detectContentType('GETTING STARTED')).toBe('tutorial');
      expect(ContentGenerator.detectContentType('api reference')).toBe('reference');
      expect(ContentGenerator.detectContentType('TrOuBlEsHoOtInG')).toBe('troubleshooting');
    });
  });

  describe('generateCompletePage', () => {
    it('should generate intro content with all required blocks', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'medium',
        title: 'CoMapeo Overview'
      });

      expect(blocks).toHaveLength(6);
      expect(blocks[0].type).toBe('heading_1');
      expect(blocks[0].heading_1?.rich_text[0]?.plain_text).toBe('CoMapeo Overview');
      
      // Should have paragraph blocks
      const paragraphs = blocks.filter(b => b.type === 'paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
    });

    it('should generate tutorial content with structured elements', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'tutorial',
        length: 'medium',
        title: 'Getting Started with CoMapeo'
      });

      expect(blocks.length).toBeGreaterThan(5);
      expect(blocks[0].type).toBe('heading_1');
      
      // Should have numbered list for steps
      const numberedLists = blocks.filter(b => b.type === 'numbered_list_item');
      expect(numberedLists.length).toBeGreaterThan(0);
    });

    it('should generate reference content with code blocks', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'reference',
        length: 'medium',
        title: 'API Documentation'
      });

      expect(blocks.length).toBeGreaterThan(5);
      
      // Should have code blocks for API examples
      const codeBlocks = blocks.filter(b => b.type === 'code');
      expect(codeBlocks.length).toBeGreaterThan(0);
      
      // Code blocks should have language specified
      codeBlocks.forEach(block => {
        expect(block.code?.language).toBeDefined();
      });
    });

    it('should generate troubleshooting content with bullet points', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'troubleshooting',
        length: 'medium',
        title: 'Common Issues'
      });

      expect(blocks.length).toBeGreaterThan(5);
      
      // Should have bulleted lists for symptoms/solutions
      const bulletedLists = blocks.filter(b => b.type === 'bulleted_list_item');
      expect(bulletedLists.length).toBeGreaterThan(0);
    });

    it('should vary content length appropriately', () => {
      const shortBlocks = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'short',
        title: 'Test Title'
      });

      const mediumBlocks = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'medium',
        title: 'Test Title'
      });

      const longBlocks = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'long',
        title: 'Test Title'
      });

      expect(shortBlocks.length).toBeLessThan(mediumBlocks.length);
      expect(mediumBlocks.length).toBeLessThan(longBlocks.length);
    });

    it('should include consistent heading structure', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'reference',
        length: 'medium',
        title: 'Test Documentation'
      });

      // First block should be the main heading
      expect(blocks[0].type).toBe('heading_1');
      expect(blocks[0].heading_1?.rich_text[0]?.plain_text).toBe('Test Documentation');

      // Should have subheadings
      const subheadings = blocks.filter(b => b.type === 'heading_2' || b.type === 'heading_3');
      expect(subheadings.length).toBeGreaterThan(0);
    });

    it('should generate valid Notion block structure', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'tutorial',
        length: 'medium',
        title: 'Test Tutorial'
      });

      blocks.forEach(block => {
        // Every block should have a type
        expect(block.type).toBeDefined();
        expect(typeof block.type).toBe('string');

        // Block-specific validation
        switch (block.type) {
          case 'paragraph':
            expect(block.paragraph?.rich_text).toBeDefined();
            expect(Array.isArray(block.paragraph?.rich_text)).toBe(true);
            break;
          case 'heading_1':
            expect(block.heading_1?.rich_text).toBeDefined();
            expect(Array.isArray(block.heading_1?.rich_text)).toBe(true);
            break;
          case 'heading_2':
            expect(block.heading_2?.rich_text).toBeDefined();
            expect(Array.isArray(block.heading_2?.rich_text)).toBe(true);
            break;
          case 'heading_3':
            expect(block.heading_3?.rich_text).toBeDefined();
            expect(Array.isArray(block.heading_3?.rich_text)).toBe(true);
            break;
          case 'bulleted_list_item':
            expect(block.bulleted_list_item?.rich_text).toBeDefined();
            expect(Array.isArray(block.bulleted_list_item?.rich_text)).toBe(true);
            break;
          case 'numbered_list_item':
            expect(block.numbered_list_item?.rich_text).toBeDefined();
            expect(Array.isArray(block.numbered_list_item?.rich_text)).toBe(true);
            break;
          case 'code':
            expect(block.code?.rich_text).toBeDefined();
            expect(Array.isArray(block.code?.rich_text)).toBe(true);
            expect(block.code?.language).toBeDefined();
            break;
        }
      });
    });

    it('should handle empty or undefined title gracefully', () => {
      const blocks1 = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'medium',
        title: ''
      });

      const blocks2 = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'medium',
        title: undefined as any
      });

      expect(blocks1.length).toBeGreaterThan(0);
      expect(blocks2.length).toBeGreaterThan(0);
      
      // Should have fallback title
      expect(blocks1[0].heading_1?.rich_text[0]?.plain_text).toBeTruthy();
      expect(blocks2[0].heading_1?.rich_text[0]?.plain_text).toBeTruthy();
    });

    it('should include contextual CoMapeo content', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'intro',
        length: 'medium',
        title: 'CoMapeo Platform'
      });

      // Convert all block text to string for easier searching
      const allText = blocks
        .map(block => {
          const richText = block[block.type as keyof typeof block]?.rich_text;
          if (Array.isArray(richText)) {
            return richText.map(rt => rt.plain_text).join(' ');
          }
          return '';
        })
        .join(' ')
        .toLowerCase();

      // Should contain CoMapeo-specific terms
      const coMapeoTerms = ['comapeo', 'territorial', 'mapping', 'community', 'collaboration'];
      const hasCoMapeoContent = coMapeoTerms.some(term => allText.includes(term));
      expect(hasCoMapeoContent).toBe(true);
    });

    it('should maintain consistent rich text format', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'reference',
        length: 'short',
        title: 'API Guide'
      });

      blocks.forEach(block => {
        const blockData = block[block.type as keyof typeof block];
        if (blockData && 'rich_text' in blockData) {
          const richText = blockData.rich_text;
          expect(Array.isArray(richText)).toBe(true);
          
          richText.forEach((rt: any) => {
            expect(rt).toHaveProperty('type', 'text');
            expect(rt).toHaveProperty('text');
            expect(rt.text).toHaveProperty('content');
            expect(rt).toHaveProperty('plain_text');
          });
        }
      });
    });
  });

  describe('template content quality', () => {
    it('should generate meaningful content for different types', () => {
      const types: ContentType[] = ['intro', 'tutorial', 'reference', 'troubleshooting'];
      
      types.forEach(type => {
        const blocks = ContentGenerator.generateCompletePage({
          type,
          length: 'medium',
          title: `Test ${type} Page`
        });

        // Should have sufficient content
        expect(blocks.length).toBeGreaterThan(3);
        
        // Text blocks should not be empty
        blocks.forEach(block => {
          const blockData = block[block.type as keyof typeof block];
          if (blockData && 'rich_text' in blockData) {
            const text = blockData.rich_text.map((rt: any) => rt.plain_text).join('');
            expect(text.trim().length).toBeGreaterThan(0);
          }
        });
      });
    });

    it('should avoid repetitive content', () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: 'tutorial',
        length: 'long',
        title: 'Comprehensive Guide'
      });

      const textBlocks = blocks
        .filter(block => {
          const blockData = block[block.type as keyof typeof block];
          return blockData && 'rich_text' in blockData;
        })
        .map(block => {
          const blockData = block[block.type as keyof typeof block];
          return blockData.rich_text.map((rt: any) => rt.plain_text).join('');
        });

      // Check for excessive repetition (simple heuristic)
      const uniqueTexts = new Set(textBlocks);
      const repetitionRatio = textBlocks.length / uniqueTexts.size;
      expect(repetitionRatio).toBeLessThan(3); // Allow some repetition but not excessive
    });
  });
});