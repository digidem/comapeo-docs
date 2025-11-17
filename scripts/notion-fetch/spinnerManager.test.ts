import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SpinnerManager from "./spinnerManager";

describe("spinnerManager", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Clean up any existing spinners
    SpinnerManager.stopAll();
  });

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
    // Ensure all spinners are stopped
    SpinnerManager.stopAll();
  });

  it("should run without errors", () => {
    // This basic test ensures the module can be imported
    expect(SpinnerManager).toBeDefined();
  });

  describe("SpinnerManager class methods", () => {
    it("should have static methods defined", () => {
      expect(typeof SpinnerManager.create).toBe("function");
      expect(typeof SpinnerManager.remove).toBe("function");
      expect(typeof SpinnerManager.stopAll).toBe("function");
      expect(typeof SpinnerManager.getActiveCount).toBe("function");
      expect(typeof SpinnerManager.hasActiveSpinners).toBe("function");
    });

    it("should handle basic spinner lifecycle", () => {
      // Test initial state
      expect(SpinnerManager.getActiveCount()).toBe(0);
      expect(SpinnerManager.hasActiveSpinners()).toBe(false);

      // Create a spinner
      const spinner = SpinnerManager.create("Test spinner", 1000);
      expect(spinner).toBeDefined();
      expect(SpinnerManager.getActiveCount()).toBe(1);
      expect(SpinnerManager.hasActiveSpinners()).toBe(true);

      // Remove the spinner
      SpinnerManager.remove(spinner);
      expect(SpinnerManager.getActiveCount()).toBe(0);
      expect(SpinnerManager.hasActiveSpinners()).toBe(false);
    });

    it("should handle multiple spinners", () => {
      // Create multiple spinners
      const spinner1 = SpinnerManager.create("Spinner 1", 1000);
      const spinner2 = SpinnerManager.create("Spinner 2", 1000);

      expect(SpinnerManager.getActiveCount()).toBe(2);
      expect(SpinnerManager.hasActiveSpinners()).toBe(true);

      // Stop all spinners
      SpinnerManager.stopAll();
      expect(SpinnerManager.getActiveCount()).toBe(0);
      expect(SpinnerManager.hasActiveSpinners()).toBe(false);
    });

    it("should handle spinner creation with default timeout", () => {
      const spinner = SpinnerManager.create("Default timeout spinner");
      expect(spinner).toBeDefined();
      expect(SpinnerManager.getActiveCount()).toBe(1);

      // Clean up
      SpinnerManager.remove(spinner);
    });

    it("should handle spinner creation with custom timeout", () => {
      const spinner = SpinnerManager.create("Custom timeout spinner", 5000);
      expect(spinner).toBeDefined();
      expect(SpinnerManager.getActiveCount()).toBe(1);

      // Clean up
      SpinnerManager.remove(spinner);
    });

    it("should safely handle removing non-existent spinner", () => {
      // This should not throw an error
      const fakeSpinner = { isSpinning: false, stop: () => {} };
      expect(() => SpinnerManager.remove(fakeSpinner as any)).not.toThrow();
    });

    it("should handle stopAll when no spinners are active", () => {
      expect(SpinnerManager.getActiveCount()).toBe(0);
      expect(() => SpinnerManager.stopAll()).not.toThrow();
      expect(SpinnerManager.getActiveCount()).toBe(0);
    });

    it("should provide correct active count tracking", () => {
      expect(SpinnerManager.getActiveCount()).toBe(0);

      const spinner1 = SpinnerManager.create("Test 1", 1000);
      expect(SpinnerManager.getActiveCount()).toBe(1);

      const spinner2 = SpinnerManager.create("Test 2", 1000);
      expect(SpinnerManager.getActiveCount()).toBe(2);

      SpinnerManager.remove(spinner1);
      expect(SpinnerManager.getActiveCount()).toBe(1);

      SpinnerManager.remove(spinner2);
      expect(SpinnerManager.getActiveCount()).toBe(0);
    });

    it("should provide correct hasActiveSpinners status", () => {
      expect(SpinnerManager.hasActiveSpinners()).toBe(false);

      const spinner = SpinnerManager.create("Status test", 1000);
      expect(SpinnerManager.hasActiveSpinners()).toBe(true);

      SpinnerManager.remove(spinner);
      expect(SpinnerManager.hasActiveSpinners()).toBe(false);
    });
  });

  describe("CI environment detection", () => {
    const originalCI = process.env.CI;
    const originalGitHubActions = process.env.GITHUB_ACTIONS;

    afterEach(() => {
      // Restore original environment variables
      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }
      if (originalGitHubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = originalGitHubActions;
      }
    });

    it("should create no-op spinner when CI=true", () => {
      process.env.CI = "true";

      const spinner = SpinnerManager.create("Test spinner");

      expect(spinner).toBeDefined();
      expect(spinner.isSpinning).toBe(false);
      expect(spinner.isEnabled).toBe(false);
      // No-op spinners are not tracked in the active spinners set
      expect(SpinnerManager.getActiveCount()).toBe(0);
    });

    it("should create no-op spinner when GITHUB_ACTIONS=true", () => {
      process.env.GITHUB_ACTIONS = "true";

      const spinner = SpinnerManager.create("Test spinner");

      expect(spinner).toBeDefined();
      expect(spinner.isSpinning).toBe(false);
      expect(spinner.isEnabled).toBe(false);
      expect(SpinnerManager.getActiveCount()).toBe(0);
    });

    it("should create normal spinner in non-CI environment", () => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;

      const spinner = SpinnerManager.create("Test spinner", 1000);

      expect(spinner).toBeDefined();
      // Normal spinners are tracked
      expect(SpinnerManager.getActiveCount()).toBe(1);

      SpinnerManager.remove(spinner);
    });

    it("should handle no-op spinner methods without errors in CI", () => {
      process.env.CI = "true";

      // Mock console methods to verify they're called
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const spinner = SpinnerManager.create("Test operation");

      // Test succeed method
      spinner.succeed("Success message");
      expect(consoleLogSpy).toHaveBeenCalledWith("✓ Success message");

      // Test fail method
      spinner.fail("Error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("✗ Error message");

      // Test warn method
      spinner.warn("Warning message");
      expect(consoleWarnSpy).toHaveBeenCalledWith("⚠ Warning message");

      // Test info method
      spinner.info("Info message");
      expect(consoleInfoSpy).toHaveBeenCalledWith("ℹ Info message");

      // Test methods that should be no-ops
      expect(() => spinner.start()).not.toThrow();
      expect(() => spinner.stop()).not.toThrow();
      expect(() => spinner.clear()).not.toThrow();
      expect(() => spinner.render()).not.toThrow();

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it("should use default text when no message provided in CI", () => {
      process.env.CI = "true";

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const spinner = SpinnerManager.create("Default text");
      spinner.succeed();

      expect(consoleLogSpy).toHaveBeenCalledWith("✓ Default text");

      consoleLogSpy.mockRestore();
    });

    it("should not create timeout for no-op spinners in CI", () => {
      process.env.CI = "true";

      // Create a spinner with very short timeout
      const spinner = SpinnerManager.create("Test spinner", 1);

      // Wait longer than timeout
      return new Promise((resolve) => {
        setTimeout(() => {
          // No timeout warning should occur for no-op spinners
          expect(spinner.isSpinning).toBe(false);
          resolve(undefined);
        }, 10);
      });
    });
  });
});
