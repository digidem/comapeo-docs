import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import {
  removeDuplicateTitle,
  writeMarkdownFile,
  writePlaceholderFile,
} from "./contentWriter";

// Mock fs module
vi.mock("node:fs");

describe("contentWriter", () => {
  describe("removeDuplicateTitle", () => {
    it("should remove H1 heading that exactly matches page title", () => {
      const content = "# My Page Title\n\nSome content here.";
      const pageTitle = "My Page Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe("Some content here.");
      expect(result).not.toContain("# My Page Title");
    });

    it("should remove H1 heading when page title contains heading text", () => {
      const content = "# Short Title\n\nContent";
      const pageTitle = "Short Title - Extended Version";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe("Content");
    });

    it("should remove H1 heading when heading contains page title", () => {
      const content = "# Extended Title With More Words\n\nContent";
      const pageTitle = "Extended Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe("Content");
    });

    it("should not remove non-matching H1 heading", () => {
      const content = "# Different Heading\n\nContent";
      const pageTitle = "Page Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe(content);
      expect(result).toContain("# Different Heading");
    });

    it("should handle content without H1 heading", () => {
      const content = "## H2 Heading\n\nSome content.";
      const pageTitle = "Page Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe(content);
    });

    it("should remove leading whitespace after removing heading", () => {
      const content = "# Title\n\n\n\nContent";
      const pageTitle = "Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe("Content");
      expect(result).not.toMatch(/^\s/);
    });

    it("should only remove first H1, not subsequent ones", () => {
      const content =
        "# Duplicate Title\n\n## Subheading\n\n# Another H1\n\nContent";
      const pageTitle = "Duplicate Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toContain("# Another H1");
      expect(result).not.toContain("# Duplicate Title");
    });

    it("should handle H1 with trailing content on same line", () => {
      const content = "# Title\nImmediate content";
      const pageTitle = "Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe("Immediate content");
    });

    it("should handle empty content", () => {
      const result = removeDuplicateTitle("", "Title");

      expect(result).toBe("");
    });

    it("should handle content with only whitespace", () => {
      const content = "   \n\n   ";
      const pageTitle = "Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe(content);
    });

    it("should be case-sensitive in matching", () => {
      const content = "# my page title\n\nContent";
      const pageTitle = "My Page Title";

      const result = removeDuplicateTitle(content, pageTitle);

      // Should not remove due to case mismatch
      expect(result).toBe(content);
    });

    it("should handle H1 with leading whitespace", () => {
      const content = "   # Title\n\nContent";
      const pageTitle = "Title";

      const result = removeDuplicateTitle(content, pageTitle);

      expect(result).toBe("Content");
    });
  });

  describe("writeMarkdownFile", () => {
    const mockWriteFileSync = vi.mocked(fs.writeFileSync);
    let mockSpinner: any;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockSpinner = {
        succeed: vi.fn(),
      };
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should write file with frontmatter and content", () => {
      const frontmatter = "---\ntitle: Test\n---\n";
      const content = "# Content";

      writeMarkdownFile(
        "/path/to/file.md",
        frontmatter,
        content,
        "Test Title",
        0,
        10,
        mockSpinner,
        "test-file",
        {},
        {},
        "en"
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/path/to/file.md",
        "---\ntitle: Test\n---\n# Content",
        "utf8"
      );
    });

    it("should report success via spinner", () => {
      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "Title",
        5,
        10,
        mockSpinner,
        "file",
        {},
        {},
        "en"
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("Page 6/10 processed")
      );
    });

    it("should log frontmatter id and title", () => {
      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "My Title",
        0,
        1,
        mockSpinner,
        "my-file",
        {},
        {},
        "en"
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("id: doc-my-file")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("title: My Title")
      );
    });

    it("should log custom properties when present", () => {
      const customProps = { icon: "📄", custom: "value" };

      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "Title",
        0,
        1,
        mockSpinner,
        "file",
        customProps,
        {},
        "en"
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("custom properties")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(customProps))
      );
    });

    it("should not log custom properties when empty", () => {
      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "Title",
        0,
        1,
        mockSpinner,
        "file",
        {},
        {},
        "en"
      );

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("custom properties")
      );
    });

    it("should log section folder placement when in section", () => {
      const currentSectionFolder = { en: "my-section" };

      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "Title",
        0,
        1,
        mockSpinner,
        "file",
        {},
        currentSectionFolder,
        "en"
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Placed in section folder: my-section")
      );
    });

    it("should not log section folder when not in section", () => {
      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "Title",
        0,
        1,
        mockSpinner,
        "file",
        {},
        {},
        "en"
      );

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Placed in section folder")
      );
    });

    it("should handle different locales correctly", () => {
      const currentSectionFolder = { en: "section-en", es: "section-es" };

      writeMarkdownFile(
        "/path/file.md",
        "---\n---\n",
        "content",
        "Título",
        0,
        1,
        mockSpinner,
        "file",
        {},
        currentSectionFolder,
        "es"
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("section-es")
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("section-en")
      );
    });

    it("should handle empty content", () => {
      writeMarkdownFile(
        "/path/file.md",
        "---\ntitle: Test\n---\n",
        "",
        "Title",
        0,
        1,
        mockSpinner,
        "file",
        {},
        {},
        "en"
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/path/file.md",
        "---\ntitle: Test\n---\n",
        "utf8"
      );
    });

    it("should concatenate frontmatter and content correctly", () => {
      const frontmatter = "---\nkey: value\n---\n";
      const content = "Content body";

      writeMarkdownFile(
        "/path/file.md",
        frontmatter,
        content,
        "Title",
        0,
        1,
        mockSpinner,
        "file",
        {},
        {},
        "en"
      );

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toBe("---\nkey: value\n---\nContent body");
    });
  });

  describe("writePlaceholderFile", () => {
    const mockWriteFileSync = vi.mocked(fs.writeFileSync);
    let mockSpinner: any;

    beforeEach(() => {
      vi.clearAllMocks();
      mockSpinner = {
        warn: vi.fn(),
      };
    });

    it("should write file with frontmatter and placeholder content", () => {
      const frontmatter = "---\ntitle: Test\n---\n";

      writePlaceholderFile(
        "/path/file.md",
        frontmatter,
        "page-123",
        0,
        10,
        mockSpinner
      );

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain(frontmatter);
      expect(writtenContent).toContain("Placeholder content generated");
      expect(writtenContent).toContain(":::note");
    });

    it("should warn via spinner about missing Website Block", () => {
      writePlaceholderFile(
        "/path/file.md",
        "---\n---\n",
        "page-456",
        5,
        10,
        mockSpinner
      );

      expect(mockSpinner.warn).toHaveBeenCalledWith(
        expect.stringContaining("No 'Website Block' property found")
      );
      expect(mockSpinner.warn).toHaveBeenCalledWith(
        expect.stringContaining("page 6/10")
      );
      expect(mockSpinner.warn).toHaveBeenCalledWith(
        expect.stringContaining("page-456")
      );
    });

    it("should include HTML comment about auto-generation", () => {
      writePlaceholderFile(
        "/path/file.md",
        "---\n---\n",
        "page-789",
        0,
        1,
        mockSpinner
      );

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain(
        "<!-- Placeholder content generated automatically"
      );
    });

    it("should include Docusaurus note admonition", () => {
      writePlaceholderFile(
        "/path/file.md",
        "---\n---\n",
        "page-abc",
        0,
        1,
        mockSpinner
      );

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain(":::note");
      expect(writtenContent).toContain("Content placeholder");
      expect(writtenContent).toContain(":::");
    });

    it("should instruct user to add blocks in Notion", () => {
      writePlaceholderFile(
        "/path/file.md",
        "---\n---\n",
        "page-def",
        0,
        1,
        mockSpinner
      );

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain("add blocks in Notion");
    });

    it("should write to correct file path", () => {
      writePlaceholderFile(
        "/custom/path/placeholder.md",
        "---\n---\n",
        "page-xyz",
        0,
        1,
        mockSpinner
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/custom/path/placeholder.md",
        expect.any(String),
        "utf8"
      );
    });

    it("should handle empty frontmatter", () => {
      writePlaceholderFile(
        "/path/file.md",
        "",
        "page-empty",
        0,
        1,
        mockSpinner
      );

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain("Placeholder content");
    });
  });
});
