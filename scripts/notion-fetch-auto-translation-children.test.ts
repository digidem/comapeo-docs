import { describe, expect, it } from "vitest";
import { NOTION_PROPERTIES } from "./constants";
import { isEligibleRootPage } from "./notion-fetch-auto-translation-children";

type TestPage = {
  id: string;
  properties: Record<string, unknown>;
};

function buildPage({
  id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  language = "English",
  status = "Auto translation generated",
  parentIds = [],
}: {
  id?: string;
  language?: string;
  status?: string;
  parentIds?: string[];
} = {}): TestPage {
  return {
    id,
    properties: {
      [NOTION_PROPERTIES.LANGUAGE]: {
        select: { name: language },
      },
      [NOTION_PROPERTIES.STATUS]: {
        select: { name: status },
      },
      "Parent item": {
        relation: parentIds.map((parentId) => ({ id: parentId })),
      },
    },
  };
}

describe("isEligibleRootPage", () => {
  it("matches only English root pages in Auto translation generated status", () => {
    expect(isEligibleRootPage(buildPage())).toBe(true);
    expect(isEligibleRootPage(buildPage({ language: "Spanish" }))).toBe(false);
    expect(
      isEligibleRootPage(
        buildPage({ parentIds: ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] })
      )
    ).toBe(false);
    expect(isEligibleRootPage(buildPage({ status: "Published" }))).toBe(false);
  });

  it("supports optional page-id filtering", () => {
    const rootPage = buildPage({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });

    expect(
      isEligibleRootPage(rootPage, {
        pageId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })
    ).toBe(true);
    expect(
      isEligibleRootPage(rootPage, {
        pageId: "cccccccccccccccccccccccccccccccc",
      })
    ).toBe(false);
  });
});
