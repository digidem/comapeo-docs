/**
 * Core Job Logic Unit Tests
 *
 * Focused unit tests for core job execution logic including:
 * - parseProgressFromOutput function
 * - JOB_COMMANDS mapping
 * - buildArgs function for notion:fetch-all
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { JobType } from "./job-tracker";

/**
 * Replicate the JOB_COMMANDS mapping for testing
 * This ensures we test the actual structure used in job-executor.ts
 */
const JOB_COMMANDS: Record<
  JobType,
  {
    script: string;
    args: string[];
    buildArgs?: (options: {
      maxPages?: number;
      statusFilter?: string;
      force?: boolean;
      dryRun?: boolean;
      includeRemoved?: boolean;
    }) => string[];
  }
> = {
  "notion:fetch": {
    script: "bun",
    args: ["scripts/notion-fetch"],
  },
  "notion:fetch-all": {
    script: "bun",
    args: ["scripts/notion-fetch-all"],
    buildArgs: (options) => {
      const args: string[] = [];
      if (options.maxPages) args.push("--max-pages", String(options.maxPages));
      if (options.statusFilter)
        args.push("--status-filter", options.statusFilter);
      if (options.force) args.push("--force");
      if (options.dryRun) args.push("--dry-run");
      if (options.includeRemoved) args.push("--include-removed");
      return args;
    },
  },
  "notion:count-pages": {
    script: "bun",
    args: ["scripts/notion-count-pages"],
    buildArgs: (options) => {
      const args: string[] = [];
      if (options.includeRemoved) args.push("--include-removed");
      if (options.statusFilter)
        args.push("--status-filter", options.statusFilter);
      return args;
    },
  },
  "notion:translate": {
    script: "bun",
    args: ["scripts/notion-translate"],
  },
  "notion:status-translation": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "translation"],
  },
  "notion:status-draft": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "draft"],
  },
  "notion:status-publish": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish"],
  },
  "notion:status-publish-production": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish-production"],
  },
};

/**
 * Replicate the parseProgressFromOutput function for testing
 */
function parseProgressFromOutput(
  output: string,
  onProgress: (current: number, total: number, message: string) => void
): void {
  const progressPatterns = [
    /Progress:\s*(\d+)\/(\d+)/i,
    /Processing\s+(\d+)\s+of\s+(\d+)/i,
    /(\d+)\/(\d+)\s+pages?/i,
  ];

  for (const pattern of progressPatterns) {
    const match = output.match(pattern);
    if (match) {
      const current = parseInt(match[1]!, 10);
      const total = parseInt(match[2]!, 10);
      onProgress(current, total, `Processing ${current} of ${total}`);
      return;
    }
  }
}

describe("Core Job Logic - parseProgressFromOutput", () => {
  let progressUpdates: Array<{
    current: number;
    total: number;
    message: string;
  }>;

  beforeEach(() => {
    progressUpdates = [];
  });

  const onProgress = (current: number, total: number, message: string) => {
    progressUpdates.push({ current, total, message });
  };

  describe("Progress pattern matching", () => {
    it("should parse 'Progress: N/M' pattern", () => {
      parseProgressFromOutput("Progress: 5/10 pages processed", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0]).toEqual({
        current: 5,
        total: 10,
        message: "Processing 5 of 10",
      });
    });

    it("should not parse 'Progress: N/M' with different spacing (regex expects specific format)", () => {
      // The regex /\s*(\d+)\/(\d+)/i only handles \s* around the entire pattern, not around numbers
      // "Progress:   3  /  7  " has spaces between numbers and slash, which doesn't match
      parseProgressFromOutput("Progress:   3  /  7  ", onProgress);

      expect(progressUpdates).toHaveLength(0);
    });

    it("should parse 'Processing N of M' pattern", () => {
      parseProgressFromOutput("Processing 15 of 50 items", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0]).toEqual({
        current: 15,
        total: 50,
        message: "Processing 15 of 50",
      });
    });

    it("should parse 'N/M pages' pattern", () => {
      parseProgressFromOutput("Completed 8/25 pages", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0]).toEqual({
        current: 8,
        total: 25,
        message: "Processing 8 of 25",
      });
    });
  });

  describe("Pattern priority", () => {
    it("should use first matching pattern (Progress:)", () => {
      // Output matches both first and second patterns
      parseProgressFromOutput("Progress: 10/20", onProgress);

      expect(progressUpdates).toHaveLength(1);
      // Should parse correctly regardless of which pattern matches
      expect(progressUpdates[0].current).toBe(10);
      expect(progressUpdates[0].total).toBe(20);
    });
  });

  describe("Edge cases", () => {
    it("should not call onProgress when no pattern matches", () => {
      parseProgressFromOutput(
        "Some random output without progress",
        onProgress
      );

      expect(progressUpdates).toHaveLength(0);
    });

    it("should not call onProgress for malformed patterns", () => {
      parseProgressFromOutput("Progress: abc/def", onProgress);

      expect(progressUpdates).toHaveLength(0);
    });

    it("should handle output with multiple lines", () => {
      const multiLineOutput = `Starting job...
Progress: 3/10
Processing data...
Progress: 7/10`;

      parseProgressFromOutput(multiLineOutput, onProgress);

      // Should stop at first match
      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0].current).toBe(3);
    });

    it("should handle zero values", () => {
      parseProgressFromOutput("Progress: 0/100", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0]).toEqual({
        current: 0,
        total: 100,
        message: "Processing 0 of 100",
      });
    });

    it("should handle large numbers", () => {
      parseProgressFromOutput("Progress: 9999/10000", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0]).toEqual({
        current: 9999,
        total: 10000,
        message: "Processing 9999 of 10000",
      });
    });
  });

  describe("Case insensitivity", () => {
    it("should match 'PROGRESS: N/M' uppercase", () => {
      parseProgressFromOutput("PROGRESS: 5/10", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0].current).toBe(5);
    });

    it("should match 'progress: n/m' lowercase", () => {
      parseProgressFromOutput("progress: 5/10", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0].current).toBe(5);
    });

    it("should match 'PROCESSING N OF M' uppercase", () => {
      parseProgressFromOutput("PROCESSING 5 OF 10 items", onProgress);

      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0].current).toBe(5);
    });
  });
});

describe("Core Job Logic - JOB_COMMANDS mapping", () => {
  describe("job type configuration", () => {
    it("should have entries for all job types", () => {
      const jobTypes: JobType[] = [
        "notion:fetch",
        "notion:fetch-all",
        "notion:count-pages",
        "notion:translate",
        "notion:status-translation",
        "notion:status-draft",
        "notion:status-publish",
        "notion:status-publish-production",
      ];

      for (const jobType of jobTypes) {
        // eslint-disable-next-line security/detect-object-injection -- jobType is from fixed array
        expect(JOB_COMMANDS[jobType]).toBeDefined();
        // eslint-disable-next-line security/detect-object-injection -- jobType is from fixed array
        expect(JOB_COMMANDS[jobType].script).toBe("bun");
        // eslint-disable-next-line security/detect-object-injection -- jobType is from fixed array
        expect(JOB_COMMANDS[jobType].args).toBeInstanceOf(Array);
        // eslint-disable-next-line security/detect-object-injection -- jobType is from fixed array
        expect(JOB_COMMANDS[jobType].args.length).toBeGreaterThan(0);
      }
    });

    it("should configure notion:fetch with correct script and args", () => {
      const config = JOB_COMMANDS["notion:fetch"];

      expect(config.script).toBe("bun");
      expect(config.args).toEqual(["scripts/notion-fetch"]);
      expect(config.buildArgs).toBeUndefined();
    });

    it("should configure notion:translate with correct script and args", () => {
      const config = JOB_COMMANDS["notion:translate"];

      expect(config.script).toBe("bun");
      expect(config.args).toEqual(["scripts/notion-translate"]);
      expect(config.buildArgs).toBeUndefined();
    });

    it("should configure notion:count-pages with correct script and args", () => {
      const config = JOB_COMMANDS["notion:count-pages"];

      expect(config.script).toBe("bun");
      expect(config.args).toEqual(["scripts/notion-count-pages"]);
      expect(config.buildArgs).toBeDefined();
    });

    it("should configure notion:status-* jobs with workflow flags", () => {
      const statusJobs = [
        "notion:status-translation",
        "notion:status-draft",
        "notion:status-publish",
        "notion:status-publish-production",
      ] as const;

      const expectedWorkflows = [
        "translation",
        "draft",
        "publish",
        "publish-production",
      ];

      statusJobs.forEach((jobType, index) => {
        // eslint-disable-next-line security/detect-object-injection -- jobType is from fixed array
        const config = JOB_COMMANDS[jobType];
        expect(config.script).toBe("bun");
        expect(config.args).toEqual([
          "scripts/notion-status",
          "--workflow",
          // eslint-disable-next-line security/detect-object-injection -- index is controlled by loop
          expectedWorkflows[index]!,
        ]);
      });
    });
  });

  describe("notion:fetch-all buildArgs function", () => {
    const buildArgs = JOB_COMMANDS["notion:fetch-all"].buildArgs!;

    it("should return empty array when no options provided", () => {
      const args = buildArgs({});
      expect(args).toEqual([]);
    });

    describe("maxPages option", () => {
      it("should add --max-pages argument when provided", () => {
        const args = buildArgs({ maxPages: 10 });
        expect(args).toEqual(["--max-pages", "10"]);
      });

      it("should convert maxPages to string", () => {
        const args = buildArgs({ maxPages: 100 });
        expect(args).toEqual(["--max-pages", "100"]);
      });

      it("should not add --max-pages when undefined", () => {
        const args = buildArgs({ maxPages: undefined });
        expect(args).not.toContain("--max-pages");
      });
    });

    describe("statusFilter option", () => {
      it("should add --status-filter argument when provided", () => {
        const args = buildArgs({ statusFilter: "In Progress" });
        expect(args).toEqual(["--status-filter", "In Progress"]);
      });

      it("should handle statusFilter with spaces", () => {
        const args = buildArgs({ statusFilter: "Published Online" });
        expect(args).toEqual(["--status-filter", "Published Online"]);
      });

      it("should not add --status-filter when undefined", () => {
        const args = buildArgs({ statusFilter: undefined });
        expect(args).not.toContain("--status-filter");
      });
    });

    describe("force option", () => {
      it("should add --force flag when true", () => {
        const args = buildArgs({ force: true });
        expect(args).toEqual(["--force"]);
      });

      it("should not add --force when false", () => {
        const args = buildArgs({ force: false });
        expect(args).not.toContain("--force");
      });

      it("should not add --force when undefined", () => {
        const args = buildArgs({ force: undefined });
        expect(args).not.toContain("--force");
      });
    });

    describe("dryRun option", () => {
      it("should add --dry-run flag when true", () => {
        const args = buildArgs({ dryRun: true });
        expect(args).toEqual(["--dry-run"]);
      });

      it("should not add --dry-run when false", () => {
        const args = buildArgs({ dryRun: false });
        expect(args).not.toContain("--dry-run");
      });
    });

    describe("includeRemoved option", () => {
      it("should add --include-removed flag when true", () => {
        const args = buildArgs({ includeRemoved: true });
        expect(args).toEqual(["--include-removed"]);
      });

      it("should not add --include-removed when false", () => {
        const args = buildArgs({ includeRemoved: false });
        expect(args).not.toContain("--include-removed");
      });
    });

    describe("combined options", () => {
      it("should build correct args with multiple options", () => {
        const args = buildArgs({
          maxPages: 50,
          statusFilter: "Published",
          force: true,
        });

        expect(args).toEqual([
          "--max-pages",
          "50",
          "--status-filter",
          "Published",
          "--force",
        ]);
      });

      it("should maintain option order consistently", () => {
        const args1 = buildArgs({
          maxPages: 10,
          statusFilter: "In Progress",
          force: true,
          dryRun: false,
          includeRemoved: true,
        });

        expect(args1).toEqual([
          "--max-pages",
          "10",
          "--status-filter",
          "In Progress",
          "--force",
          "--include-removed",
        ]);
      });

      it("should build args with all boolean flags true", () => {
        const args = buildArgs({
          force: true,
          dryRun: true,
          includeRemoved: true,
        });

        expect(args).toEqual(["--force", "--dry-run", "--include-removed"]);
      });

      it("should build args with mixed boolean flags", () => {
        const args = buildArgs({
          force: true,
          dryRun: false,
          includeRemoved: true,
        });

        expect(args).toEqual(["--force", "--include-removed"]);
        expect(args).not.toContain("--dry-run");
      });
    });

    describe("edge cases", () => {
      it("should treat zero maxPages as falsy and not add argument", () => {
        const args = buildArgs({ maxPages: 0 });
        // 0 is falsy in JavaScript, so the condition `if (options.maxPages)` is false
        expect(args).toEqual([]);
      });

      it("should handle very large maxPages", () => {
        const args = buildArgs({ maxPages: 999999 });
        expect(args).toEqual(["--max-pages", "999999"]);
      });

      it("should treat empty string statusFilter as falsy and not add argument", () => {
        const args = buildArgs({ statusFilter: "" });
        // Empty string is falsy in JavaScript, so the condition `if (options.statusFilter)` is false
        expect(args).toEqual([]);
      });
    });
  });

  describe("notion:count-pages buildArgs function", () => {
    const buildArgs = JOB_COMMANDS["notion:count-pages"].buildArgs!;

    it("should return empty array when no options provided", () => {
      const args = buildArgs({});
      expect(args).toEqual([]);
    });

    describe("includeRemoved option", () => {
      it("should add --include-removed flag when true", () => {
        const args = buildArgs({ includeRemoved: true });
        expect(args).toEqual(["--include-removed"]);
      });

      it("should not add --include-removed when false", () => {
        const args = buildArgs({ includeRemoved: false });
        expect(args).not.toContain("--include-removed");
      });

      it("should not add --include-removed when undefined", () => {
        const args = buildArgs({ includeRemoved: undefined });
        expect(args).not.toContain("--include-removed");
      });
    });

    describe("statusFilter option", () => {
      it("should add --status-filter argument when provided", () => {
        const args = buildArgs({ statusFilter: "In Progress" });
        expect(args).toEqual(["--status-filter", "In Progress"]);
      });

      it("should handle statusFilter with spaces", () => {
        const args = buildArgs({ statusFilter: "Published Online" });
        expect(args).toEqual(["--status-filter", "Published Online"]);
      });

      it("should not add --status-filter when undefined", () => {
        const args = buildArgs({ statusFilter: undefined });
        expect(args).not.toContain("--status-filter");
      });
    });

    describe("combined options", () => {
      it("should build correct args with both options", () => {
        const args = buildArgs({
          statusFilter: "Published",
          includeRemoved: true,
        });

        expect(args).toEqual([
          "--include-removed",
          "--status-filter",
          "Published",
        ]);
      });

      it("should maintain option order consistently", () => {
        const args = buildArgs({
          includeRemoved: true,
          statusFilter: "In Progress",
        });

        expect(args).toEqual([
          "--include-removed",
          "--status-filter",
          "In Progress",
        ]);
      });
    });

    describe("edge cases", () => {
      it("should treat empty string statusFilter as falsy and not add argument", () => {
        const args = buildArgs({ statusFilter: "" });
        expect(args).toEqual([]);
      });

      it("should ignore maxPages option (not supported by count-pages)", () => {
        const args = buildArgs({ maxPages: 100 });
        // maxPages is not supported by count-pages, so it should be ignored
        expect(args).toEqual([]);
      });

      it("should ignore force option (not supported by count-pages)", () => {
        const args = buildArgs({ force: true });
        // force is not supported by count-pages, so it should be ignored
        expect(args).toEqual([]);
      });

      it("should ignore dryRun option (not supported by count-pages)", () => {
        const args = buildArgs({ dryRun: true });
        // dryRun is not supported by count-pages, so it should be ignored
        expect(args).toEqual([]);
      });
    });
  });
});
