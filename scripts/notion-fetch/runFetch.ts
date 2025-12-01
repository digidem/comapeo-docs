import chalk from "chalk";
import { fetchNotionData, sortAndExpandNotionData } from "../fetchNotionData";
import { generateBlocks, GenerateBlocksOptions } from "./generateBlocks";
import { trackSpinner } from "./runtime";
import { perfTelemetry } from "../perfTelemetry";
import SpinnerManager from "./spinnerManager";

const FETCH_TIMEOUT = 300000; // 5 minutes

export interface ContentGenerationOptions {
  pages: Array<Record<string, unknown>>;
  generateSpinnerText?: string;
  onProgress?: (progress: { current: number; total: number }) => void;
  generateOptions?: GenerateBlocksOptions;
  flushTelemetry?: boolean;
}

export interface ContentGenerationResult {
  metrics: Awaited<ReturnType<typeof generateBlocks>>;
}

export async function runContentGeneration({
  pages,
  generateSpinnerText = "Generating blocks",
  onProgress,
  generateOptions = {},
  flushTelemetry = true,
}: ContentGenerationOptions): Promise<ContentGenerationResult> {
  const generateSpinner = SpinnerManager.create(
    generateSpinnerText,
    FETCH_TIMEOUT
  );
  const safePages = Array.isArray(pages) ? pages : [];
  let unregisterGenerateSpinner: (() => void) | undefined;

  try {
    perfTelemetry.phaseStart("generate");
    unregisterGenerateSpinner = trackSpinner(generateSpinner);
    const metrics = await generateBlocks(
      safePages,
      (progress) => {
        if (generateSpinner.isSpinning) {
          generateSpinner.text = chalk.blue(
            `${generateSpinnerText}: ${progress.current}/${progress.total}`
          );
        }
        onProgress?.(progress);
      },
      generateOptions
    );
    generateSpinner.succeed(chalk.green("Blocks generated successfully"));
    return { metrics };
  } catch (error) {
    generateSpinner.fail(chalk.red("Failed to generate blocks"));
    throw error;
  } finally {
    perfTelemetry.phaseEnd("generate");
    unregisterGenerateSpinner?.();
    SpinnerManager.remove(generateSpinner);
    if (flushTelemetry) {
      perfTelemetry.flush();
    }
  }
}

export interface FetchPipelineOptions {
  filter?: any; // QueryDatabase filter parameter
  fetchSpinnerText?: string;
  generateSpinnerText?: string;
  onProgress?: (progress: { current: number; total: number }) => void;
  transform?: (
    data: Array<Record<string, unknown>>
  ) => Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;
  shouldGenerate?: boolean;
  /** Options for incremental sync */
  generateOptions?: GenerateBlocksOptions;
}

export interface FetchPipelineResult {
  data: Array<Record<string, unknown>>;
  metrics?: {
    totalSaved: number;
    sectionCount: number;
    titleSectionCount: number;
    emojiCount: number;
  };
}

export async function runFetchPipeline(
  options: FetchPipelineOptions = {}
): Promise<FetchPipelineResult> {
  console.log(`🔍 [DEBUG runFetchPipeline] Starting pipeline with options:`);
  console.log(`  - shouldGenerate: ${options.shouldGenerate ?? true}`);
  console.log(`  - transform provided: ${!!options.transform}`);
  console.log(`  - filter provided: ${!!options.filter}`);

  const {
    filter,
    fetchSpinnerText = "Fetching data from Notion",
    generateSpinnerText = "Generating blocks",
    onProgress,
    transform,
    shouldGenerate = true,
    generateOptions = {},
  } = options;

  console.log(`  - shouldGenerate (after destructure): ${shouldGenerate}`);

  const fetchSpinner = SpinnerManager.create(fetchSpinnerText, FETCH_TIMEOUT);
  let unregisterFetchSpinner: (() => void) | undefined;
  let fetchSucceeded = false;
  try {
    perfTelemetry.phaseStart("fetch");
    unregisterFetchSpinner = trackSpinner(fetchSpinner);
    let data = await fetchNotionData(filter);
    perfTelemetry.recordDataset({
      pages: Array.isArray(data) ? data.length : 0,
    });
    perfTelemetry.phaseEnd("fetch");
    data = Array.isArray(data) ? data : [];

    perfTelemetry.phaseStart("sort-expand");
    console.log(
      `🔍 [DEBUG] Before sortAndExpandNotionData, data length: ${data.length}`
    );
    data = await sortAndExpandNotionData(data);
    console.log(
      `🔍 [DEBUG] After sortAndExpandNotionData, data length: ${data.length}`
    );
    perfTelemetry.phaseEnd("sort-expand");
    data = Array.isArray(data) ? data : [];
    console.log(`🔍 [DEBUG] After array check, data length: ${data.length}`);

    perfTelemetry.phaseStart("transform");
    console.log(`🔍 [DEBUG runFetchPipeline] Transform phase:`);
    console.log(`  - transform provided: ${!!transform}`);
    console.log(`  - data length before transform: ${data.length}`);
    if (transform) {
      console.log(`  ✅ Calling transform function...`);
      const transformed = await transform(data);
      console.log(
        `  ✅ Transform completed, result length: ${Array.isArray(transformed) ? transformed.length : 0}`
      );
      data = Array.isArray(transformed) ? transformed : [];
    } else {
      console.log(`  ⚠️  No transform function provided, skipping`);
    }
    console.log(`  - data length after transform: ${data.length}`);
    perfTelemetry.phaseEnd("transform");

    fetchSpinner.succeed(chalk.green("Data fetched successfully"));
    fetchSucceeded = true;

    if (!shouldGenerate) {
      perfTelemetry.flush();
      return { data };
    }

    const { metrics } = await runContentGeneration({
      pages: data,
      generateSpinnerText,
      onProgress,
      generateOptions,
      flushTelemetry: false,
    });

    perfTelemetry.flush();
    return { data, metrics };
  } catch (error) {
    if (!fetchSucceeded) {
      fetchSpinner.fail(chalk.red("Failed to fetch data from Notion"));
    }
    perfTelemetry.flush();
    throw error;
  } finally {
    unregisterFetchSpinner?.();
    SpinnerManager.remove(fetchSpinner);
  }
}
