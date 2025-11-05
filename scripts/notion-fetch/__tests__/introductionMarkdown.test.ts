import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("../notionClient", () => ({
  n2m: {},
}));

let ensureBlankLineAfterStandaloneBold: (content: string) => string;

beforeAll(async () => {
  ({ ensureBlankLineAfterStandaloneBold } = await import("../generateBlocks"));
});

describe("ensureBlankLineAfterStandaloneBold", () => {
  it("inserts a blank line after standalone bold headings", () => {
    const input = [
      "**Collected Data**",
      "This section provides overviews and walkthroughs of features.",
      "",
      "**Another Section**",
      "",
      "Already spaced content.",
    ].join("\n");

    const output = ensureBlankLineAfterStandaloneBold(input);

    expect(output).toBe(
      [
        "**Collected Data**",
        "",
        "This section provides overviews and walkthroughs of features.",
        "",
        "**Another Section**",
        "",
        "Already spaced content.",
      ].join("\n")
    );
  });

  it("ignores bold text that is not standalone", () => {
    const input = "Some **inline bold** content.";
    const output = ensureBlankLineAfterStandaloneBold(input);

    expect(output).toBe(input);
  });
});
