import type { JobType, JobStatus } from "./job-tracker";

export const MAX_REQUEST_SIZE = 1_000_000; // 1MB max request size
export const MAX_JOB_ID_LENGTH = 100;

export const VALID_JOB_TYPES: readonly JobType[] = [
  "notion:fetch",
  "notion:fetch-all",
  "notion:count-pages",
  "notion:translate",
  "notion:status-translation",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
] as const;

export const VALID_JOB_STATUSES: readonly JobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

export function isValidJobType(type: string): type is JobType {
  return VALID_JOB_TYPES.includes(type as JobType);
}

export function isValidJobStatus(status: string): status is JobStatus {
  return VALID_JOB_STATUSES.includes(status as JobStatus);
}

export function isValidJobId(jobId: string): boolean {
  if (!jobId || jobId.length > MAX_JOB_ID_LENGTH) return false;
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\"))
    return false;
  return true;
}

// Public endpoints that don't require authentication
export const PUBLIC_ENDPOINTS = ["/health", "/jobs/types", "/docs"];

export function isPublicEndpoint(path: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => path === endpoint);
}
