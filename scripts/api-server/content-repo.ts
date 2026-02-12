import type { JobType } from "./job-tracker";

const CONTENT_MUTATING_JOBS: ReadonlySet<JobType> = new Set([
  "notion:fetch",
  "notion:fetch-all",
  "notion:translate",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
]);

export function isContentMutatingJob(jobType: JobType): boolean {
  return CONTENT_MUTATING_JOBS.has(jobType);
}

export async function runContentTask<T>(
  task: (cwd: string) => Promise<T> | T
): Promise<T> {
  const safeCwd = process.cwd();
  return await task(safeCwd);
}
