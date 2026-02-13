/**
 * Tests for race condition handling in job persistence
 * Verifies that concurrent job updates don't lose data
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveJob,
  loadJob,
  loadAllJobs,
  type PersistedJob,
} from "./job-persistence";
import { setupTestEnvironment } from "./test-helpers";

describe("job-persistence race conditions", () => {
  let testEnv: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    testEnv = setupTestEnvironment();
  });

  afterEach(() => {
    testEnv.cleanup();
  });

  describe("concurrent job updates", () => {
    it("should handle simultaneous job completions without data loss", async () => {
      // Create 10 jobs
      const jobs: PersistedJob[] = [];
      for (let i = 0; i < 10; i++) {
        const job: PersistedJob = {
          id: `job-${i}`,
          type: "notion:fetch",
          status: "running",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
        };
        jobs.push(job);
        saveJob(job);
      }

      // Wait for all initial saves to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify all jobs were saved
      const initialJobs = loadAllJobs();
      expect(initialJobs).toHaveLength(10);

      // Simulate concurrent job completions
      const completionPromises = jobs.map((job, index) => {
        return new Promise<void>((resolve) => {
          // Add small random delay to increase likelihood of race conditions
          const delay = Math.random() * 10;
          setTimeout(() => {
            const completedJob: PersistedJob = {
              ...job,
              status: "completed",
              completedAt: new Date().toISOString(),
              result: {
                success: true,
                data: { index, message: `Job ${index} completed` },
              },
            };
            saveJob(completedJob);
            resolve();
          }, delay);
        });
      });

      // Wait for all completions to finish
      await Promise.all(completionPromises);

      // Wait for all writes to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify ALL jobs were saved with their completion status
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(10);

      // Check each job individually
      for (let i = 0; i < 10; i++) {
        const job = loadJob(`job-${i}`);
        expect(job).toBeDefined();
        expect(job?.status).toBe("completed");
        expect(job?.completedAt).toBeDefined();
        expect(job?.result?.success).toBe(true);
        expect(job?.result?.data).toEqual({
          index: i,
          message: `Job ${i} completed`,
        });
      }
    });

    it("should handle rapid sequential updates to the same job", async () => {
      const job: PersistedJob = {
        id: "rapid-update-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);

      // Wait for initial save
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Rapidly update the same job multiple times
      const updates = [
        { status: "running" as const, startedAt: new Date().toISOString() },
        {
          status: "running" as const,
          progress: { current: 10, total: 100, message: "10%" },
        },
        {
          status: "running" as const,
          progress: { current: 50, total: 100, message: "50%" },
        },
        {
          status: "running" as const,
          progress: { current: 90, total: 100, message: "90%" },
        },
        {
          status: "completed" as const,
          completedAt: new Date().toISOString(),
          result: { success: true, output: "final output" },
        },
      ];

      const updatePromises = updates.map((update, index) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const updatedJob: PersistedJob = {
              ...job,
              ...update,
            };
            saveJob(updatedJob);
            resolve();
          }, index * 5); // 5ms between updates
        });
      });

      await Promise.all(updatePromises);

      // Wait for all writes to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify the final state is correct
      const finalJob = loadJob("rapid-update-job");
      expect(finalJob).toBeDefined();
      expect(finalJob?.status).toBe("completed");
      expect(finalJob?.completedAt).toBeDefined();
      expect(finalJob?.result?.success).toBe(true);
      expect(finalJob?.result?.output).toBe("final output");
    });

    it("should preserve all jobs when multiple jobs update simultaneously", async () => {
      // Create 20 jobs in different states
      const jobs: PersistedJob[] = [];
      for (let i = 0; i < 20; i++) {
        const job: PersistedJob = {
          id: `multi-job-${i}`,
          type: i % 2 === 0 ? "notion:fetch" : "notion:fetch-all",
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        jobs.push(job);
        saveJob(job);
      }

      // Wait for initial saves
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify initial state
      const initialJobs = loadAllJobs();
      expect(initialJobs).toHaveLength(20);

      // Update jobs with different statuses simultaneously
      const updatePromises = jobs.map((job, index) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            let updatedJob: PersistedJob;

            if (index < 5) {
              // First 5: mark as running
              updatedJob = {
                ...job,
                status: "running",
                startedAt: new Date().toISOString(),
              };
            } else if (index < 10) {
              // Next 5: mark as completed
              updatedJob = {
                ...job,
                status: "completed",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                result: { success: true },
              };
            } else if (index < 15) {
              // Next 5: mark as failed
              updatedJob = {
                ...job,
                status: "failed",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                result: { success: false, error: "Test error" },
              };
            } else {
              // Last 5: keep as pending but add progress
              updatedJob = {
                ...job,
                progress: { current: index, total: 100, message: "Pending" },
              };
            }

            saveJob(updatedJob);
            resolve();
          }, Math.random() * 20);
        });
      });

      await Promise.all(updatePromises);

      // Wait for all writes to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify ALL jobs are still present and correctly updated
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(20);

      // Verify specific job states
      for (let i = 0; i < 20; i++) {
        const job = loadJob(`multi-job-${i}`);
        expect(job).toBeDefined();

        if (i < 5) {
          expect(job?.status).toBe("running");
          expect(job?.startedAt).toBeDefined();
        } else if (i < 10) {
          expect(job?.status).toBe("completed");
          expect(job?.result?.success).toBe(true);
        } else if (i < 15) {
          expect(job?.status).toBe("failed");
          expect(job?.result?.success).toBe(false);
        } else {
          expect(job?.status).toBe("pending");
          expect(job?.progress).toBeDefined();
        }
      }
    });

    it("should handle mixed create and update operations", async () => {
      // Pre-create 10 jobs
      const existingJobs: PersistedJob[] = [];
      for (let i = 0; i < 10; i++) {
        const job: PersistedJob = {
          id: `existing-job-${i}`,
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        existingJobs.push(job);
        saveJob(job);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simultaneously: create 10 new jobs AND update 10 existing jobs
      const operations = [];

      // Update existing jobs
      for (let i = 0; i < 10; i++) {
        operations.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              const updatedJob: PersistedJob = {
                // eslint-disable-next-line security/detect-object-injection -- i is a controlled loop index
                ...existingJobs[i],
                status: "completed",
                completedAt: new Date().toISOString(),
                result: { success: true },
              };
              saveJob(updatedJob);
              resolve();
            }, Math.random() * 20);
          })
        );
      }

      // Create new jobs
      for (let i = 0; i < 10; i++) {
        operations.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              const newJob: PersistedJob = {
                id: `new-job-${i}`,
                type: "notion:fetch-all",
                status: "pending",
                createdAt: new Date().toISOString(),
              };
              saveJob(newJob);
              resolve();
            }, Math.random() * 20);
          })
        );
      }

      await Promise.all(operations);

      // Wait for all writes to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify we have 20 total jobs
      const allJobs = loadAllJobs();
      expect(allJobs).toHaveLength(20);

      // Verify existing jobs were updated
      for (let i = 0; i < 10; i++) {
        const job = loadJob(`existing-job-${i}`);
        expect(job).toBeDefined();
        expect(job?.status).toBe("completed");
      }

      // Verify new jobs were created
      for (let i = 0; i < 10; i++) {
        const job = loadJob(`new-job-${i}`);
        expect(job).toBeDefined();
        expect(job?.status).toBe("pending");
      }
    });

    it("should maintain data integrity under extreme concurrent load", async () => {
      // Stress test: 100 concurrent job updates
      const jobCount = 100;
      const jobs: PersistedJob[] = [];

      // Create all jobs first
      for (let i = 0; i < jobCount; i++) {
        const job: PersistedJob = {
          id: `stress-job-${i}`,
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        jobs.push(job);
        saveJob(job);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Update all jobs simultaneously with unique data
      const updatePromises = jobs.map((job, index) => {
        return new Promise<void>((resolve) => {
          // Random delay to maximize concurrency
          setTimeout(() => {
            const completedJob: PersistedJob = {
              ...job,
              status: "completed",
              completedAt: new Date().toISOString(),
              result: {
                success: true,
                data: {
                  jobIndex: index,
                  uniqueValue: `value-${index}`,
                  timestamp: Date.now(),
                },
              },
            };
            saveJob(completedJob);
            resolve();
          }, Math.random() * 50);
        });
      });

      await Promise.all(updatePromises);

      // Wait for all writes to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify ALL jobs are present with correct unique data
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(jobCount);

      // Verify each job has its unique data intact
      for (let i = 0; i < jobCount; i++) {
        const job = loadJob(`stress-job-${i}`);
        expect(job).toBeDefined();
        expect(job?.status).toBe("completed");
        expect(job?.result?.success).toBe(true);
        expect(job?.result?.data).toBeDefined();

        const data = job?.result?.data as {
          jobIndex: number;
          uniqueValue: string;
        };
        expect(data.jobIndex).toBe(i);
        expect(data.uniqueValue).toBe(`value-${i}`);
      }
    });
  });

  describe("atomic file writes", () => {
    it("should use temp file and atomic rename", async () => {
      const job: PersistedJob = {
        id: "atomic-test-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);

      // Wait for write to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify job was saved
      const loaded = loadJob("atomic-test-job");
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe("atomic-test-job");

      // Verify temp file doesn't exist (should be renamed)
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const tempFile = join(testEnv.dataDir, "jobs.json.tmp");
      expect(existsSync(tempFile)).toBe(false);
    });
  });
});
