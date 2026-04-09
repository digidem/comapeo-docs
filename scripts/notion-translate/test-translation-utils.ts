import { mockOpenAIChatCompletionCreate } from "./test-openai-mock";

export type MockOpenAIRequest = {
  messages?: Array<{ role: string; content: string }>;
};

export function extractPromptMarkdown(request: MockOpenAIRequest): {
  title: string;
  markdown: string;
} {
  const userPrompt =
    request.messages?.find((message) => message.role === "user")?.content ?? "";
  const titleMatch = userPrompt.match(/^title:\s*(.*)$/m);
  const markdownMarker = "\nmarkdown: ";
  const markdownIndex = userPrompt.indexOf(markdownMarker);

  return {
    title: titleMatch?.[1] ?? "",
    markdown:
      markdownIndex >= 0
        ? userPrompt.slice(markdownIndex + markdownMarker.length)
        : "",
  };
}

export function installStructuredTranslationMock(
  mapResponse?: (payload: { title: string; markdown: string }) => {
    title: string;
    markdown: string;
  }
) {
  mockOpenAIChatCompletionCreate.mockImplementation(
    async (request: MockOpenAIRequest) => {
      const payload = extractPromptMarkdown(request);
      const translated = mapResponse
        ? mapResponse(payload)
        : {
            title: payload.title ? `Translated ${payload.title}` : "",
            markdown: payload.markdown,
          };

      return {
        choices: [
          {
            message: {
              content: JSON.stringify(translated),
            },
          },
        ],
      };
    }
  );
}
