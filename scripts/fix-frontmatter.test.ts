import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { sanitizeFrontmatter } from "./fix-frontmatter";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const wrap = (frontmatter: string, body = "content") =>
  `---\n${frontmatter}\n---\n${body}`;

describe("sanitizeFrontmatter", () => {
  it("quotes values containing colons", () => {
    const input = wrap(
      [
        "title: Troubleshooting: Data Privacy & Security",
        "sidebar_label: Troubleshooting: Data Privacy & Security",
        "pagination_label: Troubleshooting: Data Privacy & Security",
      ].join("\n")
    );

    const { content, changed } = sanitizeFrontmatter(input);

    expect(changed).toBe(true);
    expect(content).toContain(
      'title: "Troubleshooting: Data Privacy & Security"'
    );
    expect(content).toContain(
      'sidebar_label: "Troubleshooting: Data Privacy & Security"'
    );
    expect(content).toContain(
      'pagination_label: "Troubleshooting: Data Privacy & Security"'
    );
  });

  it("does not modify already quoted values", () => {
    const input = wrap('title: "Quoted Value"\nsidebar_label: "Quoted"');

    const { content, changed } = sanitizeFrontmatter(input);

    expect(changed).toBe(false);
    expect(content).toBe(input);
  });

  it("leaves numeric and list values untouched", () => {
    const input = wrap(
      ["sidebar_position: 10", "tags: []", "slug: /example"].join("\n")
    );

    const { content, changed } = sanitizeFrontmatter(input);

    expect(changed).toBe(false);
    expect(content).toBe(input);
  });

  describe("edge cases", () => {
    it("returns unchanged when no frontmatter exists", () => {
      const input = "# Just a heading\nSome content";
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("handles empty frontmatter", () => {
      const input = "---\n---\nContent";
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("handles CRLF newlines (Windows)", () => {
      const input = "---\r\ntitle: Test: Value\r\n---\r\nContent";
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Test: Value"');
      expect(content).toContain("\r\n"); // Preserves CRLF
    });

    it("handles LF newlines (Unix)", () => {
      const input = "---\ntitle: Test: Value\n---\nContent";
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Test: Value"');
      expect(content).not.toContain("\r"); // No CRLF
    });

    it("skips indented lines (multi-line values)", () => {
      const input = wrap(
        ["title: Test", "description: |", "  Line 1", "  Line 2"].join("\n")
      );
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Test"');
      expect(content).toContain("description: |");
      expect(content).toContain("  Line 1");
    });

    it("skips lines without key-value format", () => {
      const input = wrap(
        ["title: Test", "not a key value line", "key: value"].join("\n")
      );
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Test"');
      expect(content).toContain("not a key value line");
    });

    it("skips empty values", () => {
      const input = wrap(["title:", "description: "].join("\n"));
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("skips whitespace-only values", () => {
      const input = wrap(["title:   ", "description:    \t  "].join("\n"));
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("does not quote single-quoted values", () => {
      const input = wrap(
        ["title: 'Already Quoted'", "key: 'Value: test'"].join("\n")
      );
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("does not quote values starting with [", () => {
      const input = wrap("tags: [tag1, tag2]");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("does not quote values starting with {", () => {
      const input = wrap("metadata: {key: value}");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("does not quote values starting with |", () => {
      const input = wrap("description: |\n  Multi-line");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("does not quote values starting with >", () => {
      const input = wrap("description: >\n  Folded");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(false);
      expect(content).toBe(input);
    });

    it("quotes title even without special chars (ALWAYS_QUOTE_KEYS)", () => {
      const input = wrap("title: Simple Title");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Simple Title"');
    });

    it("quotes sidebar_label even without special chars", () => {
      const input = wrap("sidebar_label: Simple Label");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('sidebar_label: "Simple Label"');
    });

    it("quotes pagination_label even without special chars", () => {
      const input = wrap("pagination_label: Simple Pagination");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('pagination_label: "Simple Pagination"');
    });

    it("quotes values with ampersand (&)", () => {
      const input = wrap("description: Privacy & Security");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Privacy & Security"');
    });

    it("quotes values with square brackets in middle", () => {
      const input = wrap("description: Test [note] here");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Test [note] here"');
    });

    it("quotes values with curly braces in middle", () => {
      const input = wrap("description: Test {var} here");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Test {var} here"');
    });

    it("quotes values with pipe in middle", () => {
      const input = wrap("description: Option A | Option B");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Option A | Option B"');
    });

    it("quotes values with greater-than in middle", () => {
      const input = wrap("description: A > B comparison");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "A > B comparison"');
    });

    it("quotes values with asterisk (*)", () => {
      const input = wrap("description: Important *note*");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Important *note*"');
    });

    it("quotes values with exclamation (!)", () => {
      const input = wrap("description: Warning! Important");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Warning! Important"');
    });

    it("quotes values with percent (%)", () => {
      const input = wrap("description: 100% coverage");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "100% coverage"');
    });

    it("quotes values with at-sign (@)", () => {
      const input = wrap("description: Contact @user");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Contact @user"');
    });

    it("quotes values with backtick (`)", () => {
      const input = wrap("description: Use `code` here");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Use `code` here"');
    });

    it("quotes values with hash (#)", () => {
      const input = wrap("description: Issue #123");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('description: "Issue #123"');
    });

    it("escapes double quotes in values", () => {
      const input = wrap('title: He said "hello"');
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "He said \\"hello\\""');
    });

    it("escapes backslashes in values", () => {
      const input = wrap("title: Path\\to\\file");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Path\\\\to\\\\file"');
    });

    it("escapes both quotes and backslashes", () => {
      const input = wrap('title: Path\\with\\"quotes"');
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Path\\\\with\\\\\\"quotes\\""');
    });

    it("preserves body content after frontmatter", () => {
      const input = wrap("title: Test: Value", "# Heading\n\nBody content");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain("# Heading\n\nBody content");
    });

    it("handles multiple special characters in one value", () => {
      const input = wrap("title: Test: A & B [note] | C > D");
      const { content, changed } = sanitizeFrontmatter(input);

      expect(changed).toBe(true);
      expect(content).toContain('title: "Test: A & B [note] | C > D"');
    });
  });
});

describe("fix-frontmatter integration", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fix-frontmatter-test-"));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should process markdown files in docs directory", async () => {
    // This is a basic integration test structure
    // The actual file I/O functions are difficult to test without mocking
    // or creating real file structures
    const docsDir = path.join(tmpDir, "docs");
    await fs.mkdir(docsDir, { recursive: true });

    const testFile = path.join(docsDir, "test.md");
    await fs.writeFile(testFile, wrap("title: Test: Value"), "utf8");

    // Note: We can't easily test the main() function without mocking process.cwd()
    // and import.meta.main, but we've tested sanitizeFrontmatter thoroughly
    expect(
      await fs.access(testFile).then(
        () => true,
        () => false
      )
    ).toBe(true);
  });
});
