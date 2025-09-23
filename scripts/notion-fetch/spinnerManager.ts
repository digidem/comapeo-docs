import ora, { Ora } from "ora";
import chalk from "chalk";

/**
 * SpinnerManager - Centralized spinner lifecycle management
 * Prevents spinners from keeping the event loop alive after completion
 */
class SpinnerManager {
  private static spinners: Set<Ora> = new Set();
  private static timeouts: Map<Ora, NodeJS.Timeout> = new Map();

  /**
   * Create a new spinner and track it
   */
  static create(text: string, timeoutMs: number = 30000): Ora {
    const spinner = ora(text).start();
    this.spinners.add(spinner);

    // Auto-stop spinner after timeout to prevent indefinite hanging
    const timeout = setTimeout(() => {
      if (spinner.isSpinning) {
        spinner.warn(
          chalk.yellow(`Spinner timed out after ${timeoutMs}ms: ${text}`)
        );
        this.remove(spinner);
      }
    }, timeoutMs);

    this.timeouts.set(spinner, timeout);
    return spinner;
  }

  /**
   * Remove and cleanup a spinner
   */
  static remove(spinner: Ora): void {
    if (this.timeouts.has(spinner)) {
      clearTimeout(this.timeouts.get(spinner)!);
      this.timeouts.delete(spinner);
    }

    if (spinner.isSpinning) {
      spinner.stop();
    }

    this.spinners.delete(spinner);
  }

  /**
   * Stop all active spinners
   */
  static stopAll(): void {
    this.spinners.forEach((spinner) => {
      if (this.timeouts.has(spinner)) {
        clearTimeout(this.timeouts.get(spinner)!);
        this.timeouts.delete(spinner);
      }

      if (spinner.isSpinning) {
        spinner.stop();
      }
    });

    this.spinners.clear();
    this.timeouts.clear();
  }

  /**
   * Get count of active spinners
   */
  static getActiveCount(): number {
    return this.spinners.size;
  }

  /**
   * Check if any spinners are still active
   */
  static hasActiveSpinners(): boolean {
    return this.spinners.size > 0;
  }
}

export default SpinnerManager;
