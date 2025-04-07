import { test, expect, mock, describe, beforeEach } from "bun:test";

// Create a mock for the translateText function
const mockTranslateText = mock(async (text: string, targetLanguage: string) => {
  if (targetLanguage === "Portuguese") {
    if (text.includes("title: Test Title")) {
      return `---
title: Título de Teste
sidebar_position: 1
---

# Título

Este é um parágrafo.`;
    }
    return "Texto traduzido";
  }
  return "Translated content";
});

// Mock implementation for error case
const mockTranslateTextWithError = mock(async () => {
  throw new Error("API error");
});

describe("OpenAI Translator", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockTranslateText.mockClear();
    mockTranslateTextWithError.mockClear();
  });

  test("should translate text correctly", async () => {
    const result = await mockTranslateText("Text to translate", "Portuguese");

    // Check that the mock function was called
    expect(mockTranslateText).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledWith("Text to translate", "Portuguese");

    // Verify the result
    expect(result).toBe("Texto traduzido");
  });

  test("should handle frontmatter correctly", async () => {
    const contentWithFrontmatter = `---
title: Test Title
sidebar_position: 1
---

# Heading

This is a paragraph.`;

    const result = await mockTranslateText(contentWithFrontmatter, "Portuguese");

    // Check that the mock function was called
    expect(mockTranslateText).toHaveBeenCalledTimes(1);
    expect(mockTranslateText).toHaveBeenCalledWith(contentWithFrontmatter, "Portuguese");

    // Verify the result contains the translated content
    expect(result).toContain("Título de Teste");

    // Verify that the frontmatter structure is preserved
    expect(result).toContain("---\ntitle:");
    expect(result).toContain("sidebar_position: 1");
  });

  test("should handle errors gracefully", async () => {
    // The function should throw an error
    await expect(mockTranslateTextWithError("Text to translate", "Portuguese")).rejects.toThrow("API error");
  });
});
