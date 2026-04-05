import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

type BenchmarkOptions = {
  filePath: string;
  targetLanguage: string;
};

type ApiCallMetric = {
  url: string;
  durationMs: number;
  status?: number | "error";
  errorMessage?: string;
};

function parseArgs(argv: string[]): BenchmarkOptions {
  let filePath = "";
  let targetLanguage = "pt-BR";

  for (let i = 0; i < argv.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- argv indices are bounded by the loop condition
    const arg = argv[i];

    if (arg === "--target-language") {
      targetLanguage = argv[++i] ?? targetLanguage;
      continue;
    }

    if (!arg.startsWith("--") && !filePath) {
      filePath = arg;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!filePath) {
    throw new Error(
      "Usage: bun scripts/eval/translation-benchmark.ts <file> [--target-language pt-BR]"
    );
  }

  return { filePath, targetLanguage };
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) {
    throw new Error("global fetch is not available in this runtime");
  }

  const apiCalls: ApiCallMetric[] = [];
  globalThis.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    const start = performance.now();
    try {
      const response = await originalFetch(input, init);
      const durationMs = performance.now() - start;

      if (url.includes("/chat/completions")) {
        apiCalls.push({
          url,
          durationMs,
          status: response.status,
        });
      }

      return response;
    } catch (error) {
      const durationMs = performance.now() - start;
      if (url.includes("/chat/completions")) {
        apiCalls.push({
          url,
          durationMs,
          status: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  };

  try {
    const input = await readFile(options.filePath, "utf-8");
    const extension = path.extname(options.filePath) || ".md";
    const start = performance.now();

    if (extension === ".json") {
      const { translateJson } = await import(
        "../notion-translate/translateCodeJson.ts"
      );
      await translateJson(input, options.targetLanguage);
    } else {
      const { translateText } = await import(
        "../notion-translate/translateFrontMatter.ts"
      );
      await translateText(
        input,
        path.basename(options.filePath, extension),
        options.targetLanguage
      );
    }

    const totalMs = performance.now() - start;
    const report = {
      file: options.filePath,
      extension,
      chars: input.length,
      targetLanguage: options.targetLanguage,
      model: process.env.OPENAI_MODEL,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiCalls: apiCalls.length,
      totalMs: Math.round(totalMs),
      meanApiCallMs:
        apiCalls.length > 0
          ? Math.round(
              apiCalls.reduce((sum, call) => sum + call.durationMs, 0) /
                apiCalls.length
            )
          : 0,
      apiCallDurationsMs: apiCalls.map((call) => Math.round(call.durationMs)),
      apiCallStatuses: apiCalls.map((call) => call.status ?? "unknown"),
    };

    console.error(
      `Benchmarked ${path.basename(options.filePath)}: ${report.apiCalls} API calls in ${report.totalMs}ms`
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();
