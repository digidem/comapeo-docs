import OpenAI from "openai";
import dotenv from "dotenv";
import ora from "ora";
import chalk from "chalk";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_MAX_TOKENS,
  getModelParams,
  IS_CUSTOM_OPENAI_API,
  OPENAI_BASE_URL,
} from "../constants.js";

// Load environment variables
dotenv.config({ override: true, quiet: true });

// JSON Translation prompt template
const JSON_TRANSLATION_PROMPT = `
You are a JSON translation assistant. Your task is to translate only "message" values in the provided JSON object from English to {targetLanguage}.

- Do NOT translate any keys or values of "description" fields.
- Preserve the original JSON structure, formatting, and all non-"message" values.
- Output must be valid, parseable JSON.
- Do not include any explanations, markdown, code blocks, or extra text—return only the translated JSON object.

Example input:
{
  "Welcome": {
    "message": "Welcome to our application",
    "description": "Greeting message on homepage"
  }
}

Example output (Spanish):
{
  "Welcome": {
    "message": "Bienvenido a nuestra aplicación",
    "description": "Greeting message on homepage"
  }
}
`;

/**
 * Translates JSON content using OpenAI
 * @param jsonContent The JSON content to translate
 * @param targetLanguage The target language
 * @param retryCount The current retry count
 * @returns The translated JSON content
 */
export async function translateJson(
  jsonContent: string,
  targetLanguage: string,
  retryCount = 0
): Promise<string> {
  const MAX_RETRIES = 3;
  const spinner = ora(
    `Translating to ${targetLanguage}${
      retryCount > 0 ? ` (Attempt ${retryCount + 1}/${MAX_RETRIES})` : ""
    }...`
  );

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
  });

  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const prompt = JSON_TRANSLATION_PROMPT.replace(
    "{targetLanguage}",
    targetLanguage
  );

  // Get model-specific parameters (handles GPT-5 temperature constraints)
  // For GPT-5.2, use reasoning_effort="none" to allow custom temperature
  const modelParams = getModelParams(model, { useReasoningNone: true });

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: jsonContent },
      ],
      // Use json_object format: code.json and theme configs have dynamic keys
      // so a strict schema cannot be defined.
      response_format: { type: "json_object" },
      ...modelParams,
      ...(IS_CUSTOM_OPENAI_API
        ? { max_tokens: DEFAULT_OPENAI_MAX_TOKENS }
        : {}),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty JSON translation response");
    }

    const translatedJsonObj = JSON.parse(content);
    const translatedJsonString = JSON.stringify(translatedJsonObj, null, 2);

    spinner.succeed(
      chalk.green(`Successfully translated to ${targetLanguage}`)
    );
    return translatedJsonString;
  } catch (error) {
    const message = (error as Error).message || String(error);
    spinner.fail(
      chalk.red(`Translation failed for ${targetLanguage}: ${message}`)
    );
    if (retryCount < MAX_RETRIES - 1) {
      const baseDelayMs = 750 * 2 ** retryCount;
      const jitterMs = Math.floor(Math.random() * 250);
      const retryDelayMs = baseDelayMs + jitterMs;
      spinner.info(
        chalk.yellow(
          `Retrying translation for ${targetLanguage} in ${retryDelayMs}ms...`
        )
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return translateJson(jsonContent, targetLanguage, retryCount + 1);
    } else {
      throw new Error(`Invalid JSON after ${MAX_RETRIES} attempts: ${message}`);
    }
  }
}
