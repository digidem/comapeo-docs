import { perfTelemetry } from "../perfTelemetry";

interface SchedulerOptions {
  maxConcurrent?: number;
  maxPerInterval?: number;
  intervalMs?: number;
  circuitBreakerCheck?: () => boolean;
}

interface ScheduleOptions {
  label?: string;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

interface QueueEntry<T> {
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  label?: string;
}

class RequestScheduler {
  private readonly maxConcurrent: number;
  private readonly maxPerInterval: number;
  private readonly intervalMs: number;
  private readonly circuitBreakerCheck?: () => boolean;

  private activeCount = 0;
  private tokens: number;
  private readonly queue: QueueEntry<unknown>[] = [];
  private readonly interval: NodeJS.Timeout;
  private destroyed = false;

  constructor(options: SchedulerOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
    this.maxPerInterval = Math.max(1, options.maxPerInterval ?? 2);
    this.intervalMs = Math.max(100, options.intervalMs ?? 1000);
    this.circuitBreakerCheck = options.circuitBreakerCheck;
    this.tokens = this.maxPerInterval;

    this.interval = setInterval(() => {
      this.tokens = this.maxPerInterval;
      this.processQueue();
    }, this.intervalMs);

    if (typeof this.interval.unref === "function") {
      this.interval.unref();
    }
  }

  schedule<T>(
    task: () => Promise<T>,
    options: ScheduleOptions = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error("Scheduler has been destroyed"));
        return;
      }

      // Check circuit breaker before queuing
      if (this.circuitBreakerCheck && this.circuitBreakerCheck()) {
        reject(
          new CircuitBreakerOpenError(
            "Circuit breaker is open, rejecting request"
          )
        );
        return;
      }

      this.queue.push({ task, resolve, reject, label: options.label });
      this.recordQueue(options.label);
      this.processQueue();
    });
  }

  /**
   * Destroy the scheduler and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    clearInterval(this.interval);

    // Reject all pending tasks
    const error = new Error("Scheduler destroyed");
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        entry.reject(error);
      }
    }
  }

  private processQueue(): void {
    while (
      this.activeCount < this.maxConcurrent &&
      this.tokens > 0 &&
      this.queue.length > 0
    ) {
      const entry = this.queue.shift();
      if (!entry) break;

      this.activeCount += 1;
      this.tokens -= 1;
      this.recordQueue(entry.label);

      void (async () => entry.task())()
        .then((value) => entry.resolve(value))
        .catch((error) => entry.reject(error))
        .finally(() => {
          this.activeCount -= 1;
          this.recordQueue(entry.label);
          this.processQueue();
        });
    }
  }

  private recordQueue(label?: string): void {
    perfTelemetry.recordQueueSample({
      label,
      active: this.activeCount,
      queued: this.queue.length,
      timestamp: Date.now(),
    });
  }
}

// Default scheduler instance - will be initialized with circuit breaker check
// when imported from notionClient
let defaultScheduler = new RequestScheduler();

/**
 * Set circuit breaker check for the default scheduler
 * Called by notionClient during initialization
 */
export function setCircuitBreakerCheck(check: () => boolean): void {
  // Destroy old scheduler and create new one with circuit breaker
  defaultScheduler.destroy();
  defaultScheduler = new RequestScheduler({
    circuitBreakerCheck: check,
  });
}

export function scheduleRequest<T>(
  task: () => Promise<T>,
  options?: ScheduleOptions
): Promise<T> {
  return defaultScheduler.schedule(task, options);
}

export function getRequestScheduler(): RequestScheduler {
  return defaultScheduler;
}
