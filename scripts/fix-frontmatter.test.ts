import { describe, expect, it } from "vitest";
import { sanitizeFrontmatter } from "./fix-frontmatter";

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
});
