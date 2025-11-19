/**
 * Telemetry collection for Notion fetch operations.
 *
 * Collects timing data, timeout occurrences, and performance metrics
 * for data-driven optimization of timeout values.
 */

import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";

/**
 * Recorded operation timing
 */
interface OperationTiming {
  operation: string;
  durationMs: number;
  success: boolean;
  timedOut: boolean;
  timestamp: string;
  context?: Record<string, unknown>;
}

/**
 * Performance statistics for an operation
 */
interface OperationStats {
  count: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

/**
 * Telemetry report
 */
export interface TelemetryReport {
  startTime: string;
  endTime: string;
  totalOperations: number;
  operationStats: Record<string, OperationStats>;
  timeoutsByOperation: Record<string, number>;
  recommendations: string[];
}

/**
 * Configuration for TelemetryCollector
 */
export interface TelemetryConfig {
  /** Whether to enable telemetry collection (default: false - opt-in) */
  enabled?: boolean;
  /** File path to save telemetry report (optional) */
  outputPath?: string;
  /** Whether to log to console (default: true when enabled) */
  logToConsole?: boolean;
}

/**
 * Telemetry collector for performance monitoring
 */
export class TelemetryCollector {
  private timings: OperationTiming[] = [];
  private startTime: string;
  private config: Required<TelemetryConfig>;

  constructor(config: TelemetryConfig = {}) {
    this.startTime = new Date().toISOString();
    this.config = {
      enabled: config.enabled ?? false,
      outputPath: config.outputPath ?? "",
      logToConsole: config.logToConsole ?? true,
    };
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Record an operation timing
   */
  recordTiming(
    operation: string,
    durationMs: number,
    success: boolean,
    timedOut: boolean = false,
    context?: Record<string, unknown>
  ): void {
    if (!this.config.enabled) return;

    this.timings.push({
      operation,
      durationMs,
      success,
      timedOut,
      timestamp: new Date().toISOString(),
      context,
    });
  }

  /**
   * Time an async operation and record the result
   */
  async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    const start = Date.now();
    let success = false;
    let timedOut = false;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout")
      ) {
        timedOut = true;
      }
      throw error;
    } finally {
      const durationMs = Date.now() - start;
      this.recordTiming(operation, durationMs, success, timedOut, context);
    }
  }

  /**
   * Calculate percentile value from sorted array
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Generate performance report
   */
  generateReport(): TelemetryReport {
    const operationStats: Record<string, OperationStats> = {};
    const timeoutsByOperation: Record<string, number> = {};
    const durationsByOperation: Record<string, number[]> = {};

    // Group timings by operation
    for (const timing of this.timings) {
      const op = timing.operation;

      if (!durationsByOperation[op]) {
        durationsByOperation[op] = [];
        timeoutsByOperation[op] = 0;
      }

      durationsByOperation[op].push(timing.durationMs);

      if (timing.timedOut) {
        timeoutsByOperation[op]++;
      }
    }

    // Calculate stats for each operation
    for (const [op, durations] of Object.entries(durationsByOperation)) {
      const sorted = [...durations].sort((a, b) => a - b);
      const opTimings = this.timings.filter((t) => t.operation === op);

      operationStats[op] = {
        count: durations.length,
        successCount: opTimings.filter((t) => t.success).length,
        failureCount: opTimings.filter((t) => !t.success).length,
        timeoutCount: timeoutsByOperation[op],
        totalDurationMs: durations.reduce((a, b) => a + b, 0),
        minDurationMs: sorted[0] || 0,
        maxDurationMs: sorted[sorted.length - 1] || 0,
        p50DurationMs: this.percentile(sorted, 50),
        p95DurationMs: this.percentile(sorted, 95),
        p99DurationMs: this.percentile(sorted, 99),
      };
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      operationStats,
      timeoutsByOperation
    );

    return {
      startTime: this.startTime,
      endTime: new Date().toISOString(),
      totalOperations: this.timings.length,
      operationStats,
      timeoutsByOperation,
      recommendations,
    };
  }

  /**
   * Generate recommendations based on telemetry data
   */
  private generateRecommendations(
    stats: Record<string, OperationStats>,
    timeouts: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    for (const [op, opStats] of Object.entries(stats)) {
      const timeoutRate = opStats.timeoutCount / opStats.count;

      // High timeout rate
      if (timeoutRate > 0.1) {
        recommendations.push(
          `${op}: High timeout rate (${(timeoutRate * 100).toFixed(1)}%). Consider increasing timeout.`
        );
      }

      // Very fast operations might have excessive timeout
      if (opStats.p99DurationMs < 1000 && opStats.count > 10) {
        recommendations.push(
          `${op}: Operations complete quickly (p99: ${opStats.p99DurationMs}ms). Timeout may be excessive.`
        );
      }

      // High variance
      if (opStats.maxDurationMs > opStats.p95DurationMs * 3) {
        recommendations.push(
          `${op}: High variance detected (max: ${opStats.maxDurationMs}ms, p95: ${opStats.p95DurationMs}ms). May need investigation.`
        );
      }
    }

    return recommendations;
  }

  /**
   * Print telemetry summary to console
   */
  printSummary(): void {
    if (!this.config.enabled || !this.config.logToConsole) return;

    const report = this.generateReport();

    if (report.totalOperations === 0) {
      console.log(chalk.gray("📊 No telemetry data collected"));
      return;
    }

    console.log(
      chalk.blue(`\n📊 Telemetry Summary: ${report.totalOperations} operations`)
    );

    for (const [op, stats] of Object.entries(report.operationStats)) {
      const successRate = ((stats.successCount / stats.count) * 100).toFixed(1);
      console.log(chalk.gray(`  ${op}:`));
      console.log(
        chalk.gray(
          `    Count: ${stats.count} | Success: ${successRate}% | Timeouts: ${stats.timeoutCount}`
        )
      );
      console.log(
        chalk.gray(
          `    Duration: p50=${stats.p50DurationMs}ms, p95=${stats.p95DurationMs}ms, p99=${stats.p99DurationMs}ms`
        )
      );
    }

    if (report.recommendations.length > 0) {
      console.log(chalk.yellow("\n💡 Recommendations:"));
      for (const rec of report.recommendations) {
        console.log(chalk.yellow(`  - ${rec}`));
      }
    }
  }

  /**
   * Save telemetry report to file
   */
  saveReport(): void {
    if (!this.config.enabled || !this.config.outputPath) return;

    const report = this.generateReport();
    const outputPath = path.resolve(this.config.outputPath);

    try {
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(chalk.green(`📊 Telemetry saved to: ${outputPath}`));
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to save telemetry: ${error}`));
    }
  }

  /**
   * Clear all collected timings
   */
  clear(): void {
    this.timings = [];
    this.startTime = new Date().toISOString();
  }

  /**
   * Get raw timings (for testing)
   */
  getTimings(): OperationTiming[] {
    return [...this.timings];
  }
}

// Global telemetry collector instance
let globalTelemetryCollector: TelemetryCollector | null = null;

/**
 * Get the global TelemetryCollector instance
 *
 * Note: Telemetry is disabled by default. Enable via:
 * - Environment variable: NOTION_FETCH_TELEMETRY=true
 * - Or by calling resetTelemetryCollector with enabled config
 */
export function getTelemetryCollector(): TelemetryCollector {
  if (!globalTelemetryCollector) {
    const enabled = process.env.NOTION_FETCH_TELEMETRY === "true";
    const outputPath = process.env.NOTION_FETCH_TELEMETRY_OUTPUT || "";

    globalTelemetryCollector = new TelemetryCollector({
      enabled,
      outputPath,
      logToConsole: true,
    });
  }
  return globalTelemetryCollector;
}

/**
 * Reset the global TelemetryCollector (useful for testing)
 */
export function resetTelemetryCollector(config?: TelemetryConfig): void {
  if (config) {
    globalTelemetryCollector = new TelemetryCollector(config);
  } else {
    globalTelemetryCollector = null;
  }
}
