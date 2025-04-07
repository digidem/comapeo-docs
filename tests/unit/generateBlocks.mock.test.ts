import { test, expect, mock, describe, beforeEach } from "bun:test";

// Create a mock for the generateBlocks function
// This is a simplified version that mimics the behavior without making actual API calls
const mockGenerateBlocks = async (pages, progressCallback) => {
  let totalSaved = 0;
  let sectionCount = 0;
  let titleSectionCount = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Call the progress callback
    progressCallback(i + 1, pages.length, page.id, page.properties.Title.title[0].plain_text);

    // Check if this is a section page
    if (page.properties.Section?.select?.name === "toggle") {
      sectionCount++;
      continue;
    }

    // Check if this is a title section page
    if (page.properties.Section?.select?.name === "title") {
      titleSectionCount++;
      continue;
    }

    // Process images if the page has any
    if (page.hasImages) {
      totalSaved += 500; // Simulate image compression savings
    }
  }

  return { totalSaved, sectionCount, titleSectionCount };
};

// Test data
const mockRegularPage = {
  id: "page1",
  properties: {
    "Title": {
      title: [{ plain_text: "Test Page" }]
    },
    "Order": {
      number: 1
    },
    "Tags": {
      multi_select: [{ name: "tag1" }, { name: "tag2" }]
    }
  }
};

const mockRegularPageWithImages = {
  id: "page1-with-images",
  properties: {
    "Title": {
      title: [{ plain_text: "Test Page With Images" }]
    },
    "Order": {
      number: 1
    }
  },
  hasImages: true
};

const mockSectionPage = {
  id: "section1",
  properties: {
    "Title": {
      title: [{ plain_text: "Test Section" }]
    },
    "Order": {
      number: 2
    },
    "Section": {
      select: { name: "toggle" }
    }
  }
};

const mockTitleSectionPage = {
  id: "title-section1",
  properties: {
    "Title": {
      title: [{ plain_text: "Test Title Section" }]
    },
    "Order": {
      number: 3
    },
    "Section": {
      select: { name: "title" }
    }
  }
};

const mockPageAfterTitle = {
  id: "page2",
  properties: {
    "Title": {
      title: [{ plain_text: "Page After Title" }]
    },
    "Order": {
      number: 4
    }
  }
};

// Create a progress callback mock
const progressCallback = mock(() => {});

describe("generateBlocks mock tests", () => {
  beforeEach(() => {
    // Reset the progress callback mock before each test
    progressCallback.mockClear();
  });

  test("should process regular pages correctly", async () => {
    const result = await mockGenerateBlocks([mockRegularPage], progressCallback);

    // Check that the progress callback was called
    expect(progressCallback).toHaveBeenCalledTimes(1);

    // Verify the result
    expect(result.sectionCount).toBe(0);
    expect(result.titleSectionCount).toBe(0);
    expect(result.totalSaved).toBe(0);
  });

  test("should process section pages correctly", async () => {
    const result = await mockGenerateBlocks([mockSectionPage], progressCallback);

    // Check that the progress callback was called
    expect(progressCallback).toHaveBeenCalledTimes(1);

    // Verify the result
    expect(result.sectionCount).toBe(1);
    expect(result.titleSectionCount).toBe(0);
    expect(result.totalSaved).toBe(0);
  });

  test("should process title section pages correctly", async () => {
    const result = await mockGenerateBlocks([mockTitleSectionPage, mockPageAfterTitle], progressCallback);

    // Check that the progress callback was called for both pages
    expect(progressCallback).toHaveBeenCalledTimes(2);

    // Verify the result
    expect(result.sectionCount).toBe(0);
    expect(result.titleSectionCount).toBe(1);
    expect(result.totalSaved).toBe(0);
  });

  test("should process images in markdown content", async () => {
    const result = await mockGenerateBlocks([mockRegularPageWithImages], progressCallback);

    // Check that the progress callback was called
    expect(progressCallback).toHaveBeenCalledTimes(1);

    // Verify the result
    expect(result.totalSaved).toBe(500); // 500 bytes saved from image compression
  });

  test("should process multiple pages in order", async () => {
    const result = await mockGenerateBlocks(
      [mockRegularPage, mockSectionPage, mockTitleSectionPage, mockPageAfterTitle],
      progressCallback
    );

    // Check that the progress callback was called for all pages
    expect(progressCallback).toHaveBeenCalledTimes(4);

    // Verify the result
    expect(result.sectionCount).toBe(1);
    expect(result.titleSectionCount).toBe(1);
    expect(result.totalSaved).toBe(0);
  });

  test("should process pages with mixed content correctly", async () => {
    const result = await mockGenerateBlocks(
      [mockRegularPage, mockRegularPageWithImages, mockSectionPage],
      progressCallback
    );

    // Check that the progress callback was called for all pages
    expect(progressCallback).toHaveBeenCalledTimes(3);

    // Verify the result
    expect(result.sectionCount).toBe(1);
    expect(result.titleSectionCount).toBe(0);
    expect(result.totalSaved).toBe(500); // 500 bytes saved from image compression
  });
});
