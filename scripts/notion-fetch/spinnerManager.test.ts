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
});
