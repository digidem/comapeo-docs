import type { JobType, JobStatus } from "./job-tracker";
import { JOB_COMMANDS } from "./job-executor";

export const MAX_REQUEST_SIZE = 1_000_000; // 1MB max request size
export const MAX_JOB_ID_LENGTH = 100;

// Derive valid job types from JOB_COMMANDS keys (single source of truth)
export const VALID_JOB_TYPES = Object.keys(JOB_COMMANDS) as readonly JobType[];

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
export const PUBLIC_ENDPOINTS = [
  "/health",
  "/jobs/types",
  "/docs",
  "/notion-trigger",
];

export function isPublicEndpoint(path: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => path === endpoint);
}
