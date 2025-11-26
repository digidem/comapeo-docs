import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installTestNotionEnv,
  createMockNotionPage,
  createMockAxios,
} from "../../test-utils";

describe("Notion Fetch Integration Tests", () => {
  let restoreEnv: () => void;
  let mockAxios: ReturnType<typeof createMockAxios>;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    mockAxios = createMockAxios();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("should validate test utilities work correctly", async () => {
    const mockPage = createMockNotionPage({
      title: "Test Page",
      elementType: "Page",
    });

    expect(mockPage).toBeDefined();
    expect(mockPage.properties.Title.title[0].plain_text).toBe("Test Page");
    expect(mockPage.properties["Element Type"].select.name).toBe("Page");
  });

  it("should create mock axios with image download functionality", async () => {
    const testUrl = "https://example.com/test.jpg";
    const testBuffer = Buffer.from("test-image-data");

    mockAxios.mockImageDownload(testUrl, testBuffer);

    // Verify the mock was set up correctly
    expect(mockAxios.axios.get).toBeDefined();

    const response = await mockAxios.axios.get(testUrl);
    expect(response.data).toEqual(testBuffer);
    expect(response.headers["content-type"]).toBe("image/jpeg");
  });

  it("should handle axios errors correctly", async () => {
    const testUrl = "https://example.com/fail.jpg";
    const testError = new Error("Network error");

    mockAxios.mockImageDownloadFailure(testUrl, testError);

    await expect(mockAxios.axios.get(testUrl)).rejects.toThrow("Network error");
  });

  it("should validate environment variables are properly mocked", () => {
    expect(process.env.NOTION_API_KEY).toBe("test-api-key");
    expect(process.env.DATABASE_ID).toBe("test-database-id");
  });

  it("should create mock page families correctly", async () => {
    const { createMockPageFamily } = await import("../../test-utils");

    const family = createMockPageFamily("Test Section", "Toggle");

    expect(family.mainPage).toBeDefined();
    expect(family.pages).toHaveLength(4); // main + en + pt + es
    expect(family.enPage.properties.Language.select.name).toBe("English");
    expect(family.ptPage.properties.Language.select.name).toBe("Portuguese");
    expect(family.esPage.properties.Language.select.name).toBe("Spanish");
  });

  it("should create different page types correctly", async () => {
    const {
      createMockNotionPageWithoutTitle,
      createMockNotionPageWithoutWebsiteBlock,
      createMockTogglePage,
      createMockHeadingPage,
    } = await import("../../test-utils");

    const pageWithoutTitle = createMockNotionPageWithoutTitle();
    expect(pageWithoutTitle.properties.Title).toBeUndefined();

    const pageWithoutWebsite = createMockNotionPageWithoutWebsiteBlock();
    expect(pageWithoutWebsite.properties["Website Block"]).toBeUndefined();

    const togglePage = createMockTogglePage();
    expect(togglePage.properties["Element Type"].select.name).toBe("Toggle");

    const headingPage = createMockHeadingPage();
    expect(headingPage.properties["Element Type"].select.name).toBe("Title");
  });

  it("should handle image processing mock data", async () => {
    const { createMockMarkdownWithImages, mockImageBuffer } = await import(
      "../../test-utils"
    );

    const imageUrls = [
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ];
    const markdown = createMockMarkdownWithImages(imageUrls);

    expect(markdown.parent).toContain(
      "![Test Image 1](https://example.com/1.jpg)"
    );
    expect(markdown.parent).toContain(
      "![Test Image 2](https://example.com/2.jpg)"
    );
    expect(mockImageBuffer).toBeInstanceOf(Buffer);
  });

  it("should validate test fixtures provide comprehensive coverage", async () => {
    const page = createMockNotionPage({
      title: "Complete Test Page",
      status: "Ready to publish",
      order: 5,
      language: "English",
      elementType: "Page",
      hasTitle: true,
      hasWebsiteBlock: true,
      tags: ["test", "example"],
      keywords: ["docs", "testing"],
      icon: "📝",
    });

    // Verify all properties are set correctly
    expect(page.properties.Title.title[0].plain_text).toBe(
      "Complete Test Page"
    );
    expect(page.properties.Status.select.name).toBe("Ready to publish");
    expect(page.properties.Order.number).toBe(5);
    expect(page.properties.Language.select.name).toBe("English");
    expect(page.properties["Element Type"].select.name).toBe("Page");
    expect(page.properties.Tags.multi_select).toHaveLength(2);
    expect(page.properties.Keywords.multi_select).toHaveLength(2);
    expect(page.properties.Icon.rich_text[0].plain_text).toBe("📝");
    expect(page.properties["Website Block"]).toBeDefined();
  });
});
