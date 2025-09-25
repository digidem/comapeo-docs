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

  const fetchSpinner = ora(fetchSpinnerText).start();
  const unregisterFetchSpinner = trackSpinner(fetchSpinner);

  try {
    let data = await fetchNotionData(filter);
    data = await sortAndExpandNotionData(data);

    if (transform) {
      data = await transform(data);
    }

    fetchSpinner.succeed(chalk.green("Data fetched successfully"));
    unregisterFetchSpinner();

    if (!shouldGenerate) {
      return { data };
    }

    const generateSpinner = ora(generateSpinnerText).start();
    const unregisterGenerateSpinner = trackSpinner(generateSpinner);

    try {
      const metrics = await generateBlocks(data, (progress) => {
        generateSpinner.text = chalk.blue(
          `${generateSpinnerText}: ${progress.current}/${progress.total}`
        );
        if (onProgress) {
          onProgress(progress);
        }
      });

      generateSpinner.succeed(chalk.green("Blocks generated successfully"));
      unregisterGenerateSpinner();

      return { data, metrics };
    } catch (error) {
      generateSpinner.fail(chalk.red("Failed to generate blocks"));
      unregisterGenerateSpinner();
      throw error;
    }
  } catch (error) {
    fetchSpinner.fail(chalk.red("Failed to fetch data from Notion"));
    unregisterFetchSpinner();
    throw error;
  }
}
