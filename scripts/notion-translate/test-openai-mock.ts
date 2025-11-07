import { vi } from "vitest";

type ParseResult = {
  output_parsed: {
    markdown: string;
    title: string;
  };
};

export const mockOpenAIParse = vi.fn().mockResolvedValue<ParseResult>({
  output_parsed: {
    markdown: "# translated\n\nMock content",
    title: "Mock Title",
  },
});

class MockOpenAI {
  responses = {
    parse: mockOpenAIParse,
  };

  constructor(public config: { apiKey?: string } = {}) {
    // No-op: tests provide dummy API keys (or none) without throwing.
  }
}

vi.mock("openai", () => ({
  default: MockOpenAI,
}));

export const resetOpenAIMock = () => {
  mockOpenAIParse.mockClear();
};
