/**
 * ProgressTracker: Aggregated progress tracking for parallel operations
 *
 * Replaces individual spinners with a single aggregate progress indicator
 * showing overall progress, ETA, and status counts.
 *
 * Example output:
 *   ⠋ Processing images: 5/15 complete (33%) | 2 in progress | 1 failed | ETA: 45s
 */

import SpinnerManager from "./spinnerManager";

export interface ProgressTrackerOptions {
  /** Total number of items to process */
  total: number;
  /** Operation description (e.g., "images", "pages") */
  operation: string;
  /** Optional timeout for the spinner in milliseconds */
  spinnerTimeoutMs?: number;
}

export class ProgressTracker {
  private total: number;
  private operation: string;
  private completed = 0;
  private inProgress = 0;
  private failed = 0;
  private startTime = Date.now();
  private spinner: ReturnType<typeof SpinnerManager.create> | null = null;
  private isFinished = false;

  constructor(options: ProgressTrackerOptions) {
    this.total = options.total;
    this.operation = options.operation;

    // Create spinner with initial text
    this.spinner = SpinnerManager.create(
      this.getProgressText(),
      options.spinnerTimeoutMs
    );
  }

  /**
   * Mark an item as started (increment in-progress count)
   */
  startItem(): void {
    if (this.isFinished) return;

    this.inProgress++;
    this.updateSpinner();
  }

  /**
   * Mark an item as completed (decrement in-progress, increment completed/failed)
   * @param success - Whether the item completed successfully
   */
  completeItem(success: boolean): void {
    if (this.isFinished) return;

    this.inProgress--;

    if (success) {
      this.completed++;
    } else {
      this.failed++;
    }

    this.updateSpinner();

    // Check if all items are done
    if (this.completed + this.failed >= this.total) {
      this.finish();
    }
  }

  /**
   * Finish the progress tracker and clean up spinner
   */
  finish(): void {
    if (this.isFinished) return;

    this.isFinished = true;

    if (!this.spinner) return;

    // Show final status
    const finalText = this.getFinalText();

    if (this.failed > 0) {
      this.spinner.text = finalText;
      this.spinner.succeed(finalText);
    } else {
      this.spinner.succeed(finalText);
    }

    SpinnerManager.remove(this.spinner);
    this.spinner = null;
  }

  /**
   * Force fail the tracker (for error conditions)
   */
  fail(message?: string): void {
    if (this.isFinished) return;

    this.isFinished = true;

    if (!this.spinner) return;

    const failText = message || this.getFinalText();
    this.spinner.fail(failText);

    SpinnerManager.remove(this.spinner);
    this.spinner = null;
  }

  /**
   * Get current progress statistics
   */
  getStats(): {
    total: number;
    completed: number;
    inProgress: number;
    failed: number;
    percentage: number;
  } {
    return {
      total: this.total,
      completed: this.completed,
      inProgress: this.inProgress,
      failed: this.failed,
      percentage: this.total > 0 ? (this.completed / this.total) * 100 : 0,
    };
  }

  /**
   * Update the spinner text with current progress
   */
  private updateSpinner(): void {
    if (!this.spinner || this.isFinished) return;

    this.spinner.text = this.getProgressText();
  }

  /**
   * Generate the progress text for the spinner
   */
  private getProgressText(): string {
    const percentage =
      this.total > 0 ? Math.round((this.completed / this.total) * 100) : 0;
    const eta = this.calculateETA();

    let text = `Processing ${this.operation}: ${this.completed}/${this.total} (${percentage}%)`;

    if (this.inProgress > 0) {
      text += ` | ${this.inProgress} in progress`;
    }

    if (this.failed > 0) {
      text += ` | ${this.failed} failed`;
    }

    if (eta) {
      text += ` | ETA: ${eta}`;
    }

    return text;
  }

  /**
   * Get final completion text
   */
  private getFinalText(): string {
    const duration = this.formatDuration(Date.now() - this.startTime);

    if (this.failed > 0) {
      return `Processed ${this.operation}: ${this.completed} succeeded, ${this.failed} failed (${duration})`;
    }

    return `Processed ${this.total} ${this.operation} successfully (${duration})`;
  }

  /**
   * Calculate estimated time to completion
   */
  private calculateETA(): string | null {
    if (this.completed === 0) {
      return "calculating...";
    }

    const elapsed = Date.now() - this.startTime;
    const avgTimePerItem = elapsed / this.completed;
    const remaining = this.total - this.completed - this.inProgress;

    // Don't show ETA if we're almost done
    if (remaining <= 0) {
      return null;
    }

    const etaMs = remaining * avgTimePerItem;

    return this.formatDuration(etaMs);
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }

    const seconds = Math.round(ms / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  }
}
