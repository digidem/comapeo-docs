import { vi } from "vitest";

export const mockOpenAIChatCompletionCreate = vi.fn().mockResolvedValue({
  choices: [
    {
      message: {
        content: JSON.stringify({
          markdown: "# translated\n\nMock content",
          title: "Mock Title",
        }),
      },
    },
  ],
});

class MockOpenAI {
  chat = {
    completions: {
      create: mockOpenAIChatCompletionCreate,
    },
  };

  constructor(public config: { apiKey?: string } = {}) {
    // No-op: tests provide dummy API keys (or none) without throwing.
  }
}

vi.mock("openai", () => ({
  default: MockOpenAI,
}));

export const resetOpenAIMock = () => {
  mockOpenAIChatCompletionCreate.mockReset();
  mockOpenAIChatCompletionCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            markdown: "# translated\n\nMock content",
            title: "Mock Title",
          }),
        },
      },
    ],
  });
};
