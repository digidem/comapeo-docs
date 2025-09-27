import ora from "ora";
import chalk from "chalk";
import type { QueryDatabaseParameters } from "@notionhq/client/build/src/api-endpoints";
import { fetchNotionData, sortAndExpandNotionData } from "../fetchNotionData";
import { generateBlocks } from "./generateBlocks";
import { trackSpinner } from "./runtime";

export interface FetchPipelineOptions {
  filter?: QueryDatabaseParameters["filter"];
  fetchSpinnerText?: string;
  generateSpinnerText?: string;
  onProgress?: (progress: { current: number; total: number }) => void;
  transform?: (
    data: Array<Record<string, unknown>>
  ) => Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;
  shouldGenerate?: boolean;
}

export interface FetchPipelineResult {
  data: Array<Record<string, unknown>>;
  metrics?: {
    totalSaved: number;
    sectionCount: number;
    titleSectionCount: number;
  };
}

export async function runFetchPipeline(
  options: FetchPipelineOptions = {}
): Promise<FetchPipelineResult> {
  const {
    filter,
    fetchSpinnerText = "Fetching data from Notion",
    generateSpinnerText = "Generating blocks",
    onProgress,
    transform,
    shouldGenerate = true,
  } = options;

  const fetchSpinner = ora(fetchSpinnerText);
  let unregisterFetchSpinner: (() => void) | undefined;
  try {
    fetchSpinner.start();
    unregisterFetchSpinner = trackSpinner(fetchSpinner);
    let data = await fetchNotionData(filter);
    data = Array.isArray(data) ? data : [];

    data = await sortAndExpandNotionData(data);
    data = Array.isArray(data) ? data : [];

    if (transform) {
      const transformed = await transform(data);
      data = Array.isArray(transformed) ? transformed : [];
    }

    if (fetchSpinner.isSpinning) {
      fetchSpinner.succeed(chalk.green("Data fetched successfully"));
    }

    if (!shouldGenerate) {
      return { data };
    }

    const generateSpinner = ora(generateSpinnerText);
    let unregisterGenerateSpinner: (() => void) | undefined;
    try {
      generateSpinner.start();
      unregisterGenerateSpinner = trackSpinner(generateSpinner);
      const metrics = await generateBlocks(data, (progress) => {
        if (generateSpinner.isSpinning) {
          generateSpinner.text = chalk.blue(
            `${generateSpinnerText}: ${progress.current}/${progress.total}`
          );
        }
        onProgress?.(progress);
      });

      if (generateSpinner.isSpinning) {
        generateSpinner.succeed(chalk.green("Blocks generated successfully"));
      }

      return { data, metrics };
    } catch (error) {
      if (generateSpinner.isSpinning) {
        generateSpinner.fail(chalk.red("Failed to generate blocks"));
      }
      throw error;
    } finally {
      unregisterGenerateSpinner?.();
    }
  } catch (error) {
    if (fetchSpinner.isSpinning) {
      fetchSpinner.fail(chalk.red("Failed to fetch data from Notion"));
    }
    throw error;
  } finally {
    unregisterFetchSpinner?.();
  }
}
