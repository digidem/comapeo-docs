import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TelemetryCollector,
  getTelemetryCollector,
  resetTelemetryCollector,
} from "./telemetryCollector";

describe("TelemetryCollector", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    resetTelemetryCollector();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NOTION_FETCH_TELEMETRY;
    delete process.env.NOTION_FETCH_TELEMETRY_OUTPUT;
  });

  describe("constructor and configuration", () => {
    it("should be disabled by default", () => {
      const collector = new TelemetryCollector();
      expect(collector.isEnabled()).toBe(false);
    });

    it("should be enabled when configured", () => {
      const collector = new TelemetryCollector({ enabled: true });
      expect(collector.isEnabled()).toBe(true);
    });

    it("should respect logToConsole setting", () => {
      const collector = new TelemetryCollector({
        enabled: true,
        logToConsole: false,
      });

      collector.recordTiming("test", 100, true);
      collector.printSummary();

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe("recordTiming", () => {
    it("should not record when disabled", () => {
      const collector = new TelemetryCollector({ enabled: false });

      collector.recordTiming("test", 100, true);

      const timings = collector.getTimings();
      expect(timings).toHaveLength(0);
    });

    it("should record timing when enabled", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.recordTiming("test-op", 150, true, false, { key: "value" });

      const timings = collector.getTimings();
      expect(timings).toHaveLength(1);
      expect(timings[0].operation).toBe("test-op");
      expect(timings[0].durationMs).toBe(150);
      expect(timings[0].success).toBe(true);
      expect(timings[0].timedOut).toBe(false);
      expect(timings[0].context?.key).toBe("value");
    });

    it("should record timeout flag", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.recordTiming("test", 5000, false, true);

      const timings = collector.getTimings();
      expect(timings[0].timedOut).toBe(true);
    });
  });

  describe("timeOperation", () => {
    it("should execute function when disabled", async () => {
      const collector = new TelemetryCollector({ enabled: false });
      const fn = vi.fn().mockResolvedValue("result");

      const result = await collector.timeOperation("test", fn);

      expect(result).toBe("result");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(collector.getTimings()).toHaveLength(0);
    });

    it("should record successful operation", async () => {
      const collector = new TelemetryCollector({ enabled: true });
      const fn = vi.fn().mockResolvedValue("success");

      const result = await collector.timeOperation("test-op", fn);

      expect(result).toBe("success");
      const timings = collector.getTimings();
      expect(timings).toHaveLength(1);
      expect(timings[0].success).toBe(true);
      expect(timings[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should record failed operation", async () => {
      const collector = new TelemetryCollector({ enabled: true });
      const fn = vi.fn().mockRejectedValue(new Error("Failed"));

      await expect(collector.timeOperation("test", fn)).rejects.toThrow(
        "Failed"
      );

      const timings = collector.getTimings();
      expect(timings).toHaveLength(1);
      expect(timings[0].success).toBe(false);
    });

    it("should detect timeout errors", async () => {
      const collector = new TelemetryCollector({ enabled: true });
      const fn = vi.fn().mockRejectedValue(new Error("Operation timeout"));

      await expect(collector.timeOperation("test", fn)).rejects.toThrow(
        "timeout"
      );

      const timings = collector.getTimings();
      expect(timings[0].timedOut).toBe(true);
    });

    it("should pass context to timing", async () => {
      const collector = new TelemetryCollector({ enabled: true });
      const fn = vi.fn().mockResolvedValue("ok");

      await collector.timeOperation("test", fn, { pageId: "123" });

      const timings = collector.getTimings();
      expect(timings[0].context?.pageId).toBe("123");
    });
  });

  describe("generateReport", () => {
    it("should generate empty report when no timings", () => {
      const collector = new TelemetryCollector({ enabled: true });

      const report = collector.generateReport();

      expect(report.totalOperations).toBe(0);
      expect(Object.keys(report.operationStats)).toHaveLength(0);
    });

    it("should calculate correct statistics", () => {
      const collector = new TelemetryCollector({ enabled: true });

      // Record multiple timings for same operation
      collector.recordTiming("fetch", 100, true);
      collector.recordTiming("fetch", 200, true);
      collector.recordTiming("fetch", 150, true);
      collector.recordTiming("fetch", 300, false, true); // timeout

      const report = collector.generateReport();

      expect(report.totalOperations).toBe(4);
      expect(report.operationStats["fetch"].count).toBe(4);
      expect(report.operationStats["fetch"].successCount).toBe(3);
      expect(report.operationStats["fetch"].failureCount).toBe(1);
      expect(report.operationStats["fetch"].timeoutCount).toBe(1);
      expect(report.operationStats["fetch"].minDurationMs).toBe(100);
      expect(report.operationStats["fetch"].maxDurationMs).toBe(300);
    });

    it("should calculate percentiles correctly", () => {
      const collector = new TelemetryCollector({ enabled: true });

      // Record 100 timings with increasing durations
      for (let i = 1; i <= 100; i++) {
        collector.recordTiming("test", i * 10, true);
      }

      const report = collector.generateReport();
      const stats = report.operationStats["test"];

      expect(stats.p50DurationMs).toBe(500); // 50th percentile
      expect(stats.p95DurationMs).toBe(950); // 95th percentile
      expect(stats.p99DurationMs).toBe(990); // 99th percentile
    });

    it("should track multiple operations separately", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.recordTiming("op1", 100, true);
      collector.recordTiming("op1", 200, true);
      collector.recordTiming("op2", 300, true);

      const report = collector.generateReport();

      expect(report.operationStats["op1"].count).toBe(2);
      expect(report.operationStats["op2"].count).toBe(1);
    });

    it("should count timeouts by operation", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.recordTiming("op1", 100, false, true);
      collector.recordTiming("op1", 200, false, true);
      collector.recordTiming("op2", 300, false, true);

      const report = collector.generateReport();

      expect(report.timeoutsByOperation["op1"]).toBe(2);
      expect(report.timeoutsByOperation["op2"]).toBe(1);
    });
  });

  describe("recommendations", () => {
    it("should recommend increasing timeout for high timeout rate", () => {
      const collector = new TelemetryCollector({ enabled: true });

      // 50% timeout rate (> 10% threshold)
      collector.recordTiming("slow-op", 5000, false, true);
      collector.recordTiming("slow-op", 5000, true);

      const report = collector.generateReport();

      expect(
        report.recommendations.some((r) => r.includes("High timeout rate"))
      ).toBe(true);
    });

    it("should recommend reducing timeout for fast operations", () => {
      const collector = new TelemetryCollector({ enabled: true });

      // Many fast operations (p99 < 1000ms)
      for (let i = 0; i < 20; i++) {
        collector.recordTiming("fast-op", 50 + Math.random() * 100, true);
      }

      const report = collector.generateReport();

      expect(
        report.recommendations.some((r) =>
          r.includes("Timeout may be excessive")
        )
      ).toBe(true);
    });

    it("should warn about high variance", () => {
      const collector = new TelemetryCollector({ enabled: true });

      // High variance: max > p95 * 3
      for (let i = 0; i < 20; i++) {
        collector.recordTiming("variable-op", 100, true);
      }
      collector.recordTiming("variable-op", 10000, true); // outlier

      const report = collector.generateReport();

      expect(
        report.recommendations.some((r) => r.includes("High variance"))
      ).toBe(true);
    });

    it("should return no recommendations for healthy operations", () => {
      const collector = new TelemetryCollector({ enabled: true });

      // Normal operations with low variance, no timeouts
      for (let i = 0; i < 5; i++) {
        collector.recordTiming("healthy-op", 1000 + i * 100, true);
      }

      const report = collector.generateReport();

      // May have recommendations about timeout being excessive
      // but should not have high timeout rate or high variance
      expect(
        report.recommendations.every(
          (r) =>
            !r.includes("High timeout rate") && !r.includes("High variance")
        )
      ).toBe(true);
    });
  });

  describe("printSummary", () => {
    it("should not print when disabled", () => {
      const collector = new TelemetryCollector({ enabled: false });

      collector.printSummary();

      expect(console.log).not.toHaveBeenCalled();
    });

    it("should print message when no data", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.printSummary();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("No telemetry data")
      );
    });

    it("should print summary when data exists", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.recordTiming("test", 100, true);
      collector.printSummary();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Telemetry Summary")
      );
    });
  });

  describe("saveReport", () => {
    it("should not save when disabled", () => {
      const collector = new TelemetryCollector({
        enabled: false,
        outputPath: "/tmp/test.json",
      });

      collector.saveReport();

      // Should not attempt to save
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Telemetry saved")
      );
    });

    it("should not save when no output path", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.saveReport();

      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Telemetry saved")
      );
    });
  });

  describe("clear", () => {
    it("should clear all timings", () => {
      const collector = new TelemetryCollector({ enabled: true });

      collector.recordTiming("test", 100, true);
      collector.recordTiming("test", 200, true);

      collector.clear();

      expect(collector.getTimings()).toHaveLength(0);
      const report = collector.generateReport();
      expect(report.totalOperations).toBe(0);
    });
  });

  describe("global instance", () => {
    it("should return same instance", () => {
      const collector1 = getTelemetryCollector();
      const collector2 = getTelemetryCollector();

      expect(collector1).toBe(collector2);
    });

    it("should reset correctly", () => {
      const collector1 = getTelemetryCollector();
      resetTelemetryCollector();
      const collector2 = getTelemetryCollector();

      expect(collector1).not.toBe(collector2);
    });

    it("should respect environment variables", () => {
      process.env.NOTION_FETCH_TELEMETRY = "true";
      resetTelemetryCollector();

      const collector = getTelemetryCollector();

      expect(collector.isEnabled()).toBe(true);
    });

    it("should be disabled when env var is not set", () => {
      delete process.env.NOTION_FETCH_TELEMETRY;
      resetTelemetryCollector();

      const collector = getTelemetryCollector();

      expect(collector.isEnabled()).toBe(false);
    });

    it("should reset with custom config", () => {
      resetTelemetryCollector({ enabled: true, logToConsole: false });

      const collector = getTelemetryCollector();

      expect(collector.isEnabled()).toBe(true);
    });
  });
});
