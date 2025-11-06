import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

type PhaseName =
  | "fetch"
  | "sort-expand"
  | "transform"
  | "generate"
  | "prefetch-blocks"
  | "prefetch-markdown";

interface PhaseTiming {
  start: number;
  end?: number;
  durationMs?: number;
}

interface RetryRecord {
  operation: string;
  attempt: number;
  status?: number;
  delayMs?: number;
}

interface DatasetSnapshot {
  pages?: number;
  parentPages?: number;
  subpageRelations?: number;
}

interface QueueSnapshot {
  label?: string;
  active: number;
  queued: number;
  timestamp: number;
}

interface PerfEvent {
  type: string;
  timestamp: number;
  detail?: Record<string, unknown>;
}

interface PerfMetrics {
  phases: Record<PhaseName, PhaseTiming>;
  retries: RetryRecord[];
  counters: {
    totalRetries: number;
    rateLimit429: number;
  };
  dataset: DatasetSnapshot;
  queueSamples: QueueSnapshot[];
  events: PerfEvent[];
}

function normalizeBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/**
 * Parse and validate positive integer from environment variable
 */
function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
  min: number = 1,
  max: number = Number.MAX_SAFE_INTEGER
): number {
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < min) {
    return defaultValue;
  }

  if (parsed > max) {
    return max;
  }

  return parsed;
}

const LOG_ENABLED = normalizeBooleanEnv(process.env.NOTION_PERF_LOG);
const OUTPUT_PATH = process.env.NOTION_PERF_OUTPUT;
const SUMMARY_ENABLED = normalizeBooleanEnv(process.env.NOTION_PERF_SUMMARY);
const SUMMARY_PATH =
  process.env.NOTION_PERF_SUMMARY_PATH || process.env.GITHUB_STEP_SUMMARY;

// Maximum number of queue samples to keep (circular buffer to prevent memory leak)
const MAX_QUEUE_SAMPLES = parsePositiveInt(
  process.env.NOTION_PERF_MAX_QUEUE_SAMPLES,
  1000, // Default: keep last 1000 samples
  100,  // Min: 100 samples
  10000 // Max: 10000 samples
);

class PerfTelemetry {
  private metrics: PerfMetrics = {
    phases: {} as Record<PhaseName, PhaseTiming>,
    retries: [],
    counters: {
      totalRetries: 0,
      rateLimit429: 0,
    },
    dataset: {},
    queueSamples: [],
    events: [],
  };

  private static instance: PerfTelemetry | undefined;
  private flushed = false;

  static getInstance(): PerfTelemetry {
    if (!PerfTelemetry.instance) {
      PerfTelemetry.instance = new PerfTelemetry();
    }
    return PerfTelemetry.instance;
  }

  static reset(): void {
    if (PerfTelemetry.instance) {
      PerfTelemetry.instance.metrics = {
        phases: {} as Record<PhaseName, PhaseTiming>,
        retries: [],
        counters: {
          totalRetries: 0,
          rateLimit429: 0,
        },
        dataset: {},
        queueSamples: [],
        events: [],
      };
      PerfTelemetry.instance.flushed = false;
    }
  }

  private shouldCapture(): boolean {
    return (
      LOG_ENABLED ||
      Boolean(OUTPUT_PATH) ||
      SUMMARY_ENABLED ||
      Boolean(SUMMARY_PATH)
    );
  }

  phaseStart(phase: PhaseName): void {
    if (!this.shouldCapture()) return;
    this.metrics.phases[phase] = { start: performance.now() };
  }

  phaseEnd(phase: PhaseName): void {
    if (!this.shouldCapture()) return;
    const entry = this.metrics.phases[phase];
    if (!entry) return;
    entry.end = performance.now();
    entry.durationMs = entry.end - entry.start;
  }

  recordDataset(snapshot: DatasetSnapshot): void {
    if (!this.shouldCapture()) return;
    this.metrics.dataset = {
      ...this.metrics.dataset,
      ...snapshot,
    };
  }

  recordRetry(record: RetryRecord): void {
    if (!this.shouldCapture()) return;
    this.metrics.retries.push({ ...record });
    this.metrics.counters.totalRetries += 1;
    if (record.status === 429) {
      this.metrics.counters.rateLimit429 += 1;
    }
  }

  recordQueueSample(sample: QueueSnapshot): void {
    if (!this.shouldCapture()) return;

    // Implement circular buffer to prevent unbounded memory growth
    // Keep only the most recent MAX_QUEUE_SAMPLES samples
    if (this.metrics.queueSamples.length >= MAX_QUEUE_SAMPLES) {
      // Remove oldest sample (FIFO)
      this.metrics.queueSamples.shift();
    }

    this.metrics.queueSamples.push(sample);
  }

  recordEvent(type: string, detail?: Record<string, unknown>): void {
    if (!this.shouldCapture()) return;
    this.metrics.events.push({ type, detail, timestamp: Date.now() });
  }

  flush(): void {
    if (this.flushed || !this.shouldCapture()) return;

    const output = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
    };

    if (OUTPUT_PATH) {
      const resolved = path.resolve(OUTPUT_PATH);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, JSON.stringify(output, null, 2), "utf8");
    }

    const summaryMarkdown = this.buildSummaryMarkdown();

    if (SUMMARY_PATH && (SUMMARY_ENABLED || !LOG_ENABLED)) {
      try {
        fs.appendFileSync(SUMMARY_PATH, `\n${summaryMarkdown}\n`);
      } catch (error) {
        console.warn(
          "⚠️  Failed to append performance summary to GitHub step summary",
          error
        );
      }
    }

    if (LOG_ENABLED) {
      console.log(summaryMarkdown.replace(/\n\n/g, "\n"));
    }

    this.flushed = true;
  }

  private buildSummaryMarkdown(): string {
    const { phases, counters, dataset, queueSamples, events } = this.metrics;

    const lines: string[] = ["## 📊 Notion Fetch Performance Summary"];

    const phaseEntries = Object.entries(phases).filter(
      ([, timing]) => timing.durationMs !== undefined
    );
    if (phaseEntries.length > 0) {
      lines.push("### Phase Durations");
      phaseEntries.forEach(([name, timing]) => {
        const seconds = ((timing.durationMs ?? 0) / 1000).toFixed(2);
        lines.push(`- ${name}: ${seconds}s`);
      });
    }

    lines.push("### Dataset Snapshot");
    lines.push(
      `- Pages: ${dataset.pages ?? "?"} (parents: ${dataset.parentPages ?? "?"}, sub-relations: ${dataset.subpageRelations ?? "?"})`
    );

    lines.push("### Retry Stats");
    lines.push(
      `- Total retries: ${counters.totalRetries} (rate-limit 429: ${counters.rateLimit429})`
    );

    if (queueSamples.length > 0) {
      const peak = queueSamples.reduce(
        (acc, sample) => ({
          active: Math.max(acc.active, sample.active),
          queued: Math.max(acc.queued, sample.queued),
        }),
        { active: 0, queued: 0 }
      );
      const avgQueue =
        queueSamples.reduce((sum, s) => sum + s.queued, 0) /
        queueSamples.length;
      lines.push("### Scheduler Load");
      lines.push(
        `- Peak active requests: ${peak.active}, peak queued: ${peak.queued}`
      );
      lines.push(`- Avg queue depth: ${avgQueue.toFixed(2)}`);
      lines.push(
        `- Queue samples: ${queueSamples.length}${queueSamples.length >= MAX_QUEUE_SAMPLES ? ` (capped at ${MAX_QUEUE_SAMPLES})` : ""}`
      );
    }

    if (events.length > 0) {
      lines.push("### Events");
      events.forEach((event) => {
        const iso = new Date(event.timestamp).toISOString();
        const detail = event.detail
          ? ` – ${JSON.stringify(event.detail)}`
          : "";
        lines.push(`- ${iso} • ${event.type}${detail}`);
      });
    }

    return lines.join("\n");
  }
}

export const perfTelemetry = PerfTelemetry.getInstance();
