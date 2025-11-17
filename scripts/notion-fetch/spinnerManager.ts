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
   * In CI environments, returns a no-op spinner with simple text output
   */
  static create(text: string, timeoutMs: number = 30000): Ora {
    // Disable spinners in CI environments to reduce noise
    if (this.isCIEnvironment()) {
      return this.createNoOpSpinner(text);
    }

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
   * Check if running in CI environment
   */
  private static isCIEnvironment(): boolean {
    return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  }

  /**
   * Create a no-op spinner for CI environments
   * Provides simple text output instead of spinner animations
   */
  private static createNoOpSpinner(text: string): Ora {
    return {
      text,
      succeed: (message?: string) => {
        console.log(`✓ ${message || text}`);
        return this.createNoOpSpinner(text) as Ora;
      },
      fail: (message?: string) => {
        console.error(`✗ ${message || text}`);
        return this.createNoOpSpinner(text) as Ora;
      },
      warn: (message?: string) => {
        console.warn(`⚠ ${message || text}`);
        return this.createNoOpSpinner(text) as Ora;
      },
      info: (message?: string) => {
        console.info(`ℹ ${message || text}`);
        return this.createNoOpSpinner(text) as Ora;
      },
      start: () => this.createNoOpSpinner(text) as Ora,
      stop: () => this.createNoOpSpinner(text) as Ora,
      clear: () => this.createNoOpSpinner(text) as Ora,
      render: () => this.createNoOpSpinner(text) as Ora,
      frame: () => "",
      isSpinning: false,
      indent: 0,
      spinner: "dots" as const,
      color: "cyan" as const,
      hideCursor: true,
      interval: 0,
      stream: process.stdout,
      id: undefined,
      isEnabled: false,
      prefixText: "",
      suffixText: "",
      stopAndPersist: () => this.createNoOpSpinner(text) as Ora,
    } as Ora;
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
