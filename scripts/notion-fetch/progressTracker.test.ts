import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProgressTracker } from "./progressTracker";
import SpinnerManager from "./spinnerManager";

// Mock SpinnerManager
vi.mock("./spinnerManager", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    remove: vi.fn(),
  },
}));

describe("ProgressTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create a progress tracker with initial state", () => {
      const tracker = new ProgressTracker({
        total: 10,
        operation: "images",
      });

      const stats = tracker.getStats();
      expect(stats.total).toBe(10);
      expect(stats.completed).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.percentage).toBe(0);
    });

    it("should create spinner with initial progress text", () => {
      new ProgressTracker({
        total: 5,
        operation: "pages",
      });

      expect(SpinnerManager.create).toHaveBeenCalledWith(
        "Processing pages: 0/5 (0%) | ETA: calculating...",
        undefined
      );
    });

    it("should pass timeout to spinner if provided", () => {
      new ProgressTracker({
        total: 5,
        operation: "images",
        spinnerTimeoutMs: 60000,
      });

      expect(SpinnerManager.create).toHaveBeenCalledWith(
        expect.any(String),
        60000
      );
    });
  });

  describe("startItem", () => {
    it("should increment in-progress count", () => {
      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();
      tracker.startItem();

      const stats = tracker.getStats();
      expect(stats.inProgress).toBe(2);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it("should update spinner text", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();

      expect(mockSpinner.text).toContain("1 in progress");
    });
  });

  describe("completeItem", () => {
    it("should increment completed count on success", () => {
      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);

      const stats = tracker.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.inProgress).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it("should increment failed count on failure", () => {
      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();
      tracker.completeItem(false);

      const stats = tracker.getStats();
      expect(stats.completed).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it("should update spinner text with progress", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);

      expect(mockSpinner.text).toContain("1/10");
      expect(mockSpinner.text).toContain("(10%)");
    });

    it("should finish when all items are complete", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 2, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);
      tracker.startItem();
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalled();
      expect(SpinnerManager.remove).toHaveBeenCalledWith(mockSpinner);
    });
  });

  describe("ETA calculation", () => {
    it("should show 'calculating...' when no items completed", () => {
      new ProgressTracker({ total: 10, operation: "images" });

      // Check what was passed to SpinnerManager.create()
      expect(SpinnerManager.create).toHaveBeenCalledWith(
        expect.stringContaining("ETA: calculating..."),
        undefined
      );
    });

    it("should calculate ETA based on average time per item", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      // Complete first item after 1 second
      tracker.startItem();
      vi.advanceTimersByTime(1000);
      tracker.completeItem(true);

      // ETA should be ~9 seconds (9 items remaining * 1s average)
      expect(mockSpinner.text).toContain("ETA: 9s");
    });

    it("should not show ETA when all items are in progress or complete", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 3, operation: "images" });

      // Start all items
      tracker.startItem();
      tracker.startItem();
      tracker.startItem();

      // Complete one
      tracker.completeItem(true);

      // No remaining items, so no ETA
      expect(mockSpinner.text).not.toContain("ETA:");
    });
  });

  describe("percentage calculation", () => {
    it("should calculate percentage correctly", () => {
      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);
      tracker.startItem();
      tracker.completeItem(true);
      tracker.startItem();
      tracker.completeItem(true);

      const stats = tracker.getStats();
      expect(stats.percentage).toBe(30);
    });

    it("should handle zero total gracefully", () => {
      const tracker = new ProgressTracker({ total: 0, operation: "images" });

      const stats = tracker.getStats();
      expect(stats.percentage).toBe(0);
    });
  });

  describe("finish", () => {
    it("should show success message when no failures", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 2, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);
      tracker.startItem();
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("Processed 2 images successfully")
      );
    });

    it("should show failure summary when there are failures", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 3, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);
      tracker.startItem();
      tracker.completeItem(false);
      tracker.startItem();
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("2 succeeded, 1 failed")
      );
    });

    it("should not finish twice", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 1, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);

      // Try to finish again
      tracker.finish();

      expect(mockSpinner.succeed).toHaveBeenCalledTimes(1);
      expect(SpinnerManager.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe("fail", () => {
    it("should fail the tracker with custom message", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.fail("Custom error message");

      expect(mockSpinner.fail).toHaveBeenCalledWith("Custom error message");
      expect(SpinnerManager.remove).toHaveBeenCalledWith(mockSpinner);
    });

    it("should use default message if none provided", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      tracker.startItem();
      tracker.completeItem(true);
      tracker.startItem();
      tracker.completeItem(false); // Add a failure

      tracker.fail();

      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining("1 succeeded, 1 failed")
      );
    });
  });

  describe("duration formatting", () => {
    it("should format milliseconds correctly", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 1, operation: "images" });

      tracker.startItem();
      vi.advanceTimersByTime(500);
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("500ms")
      );
    });

    it("should format seconds correctly", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 1, operation: "images" });

      tracker.startItem();
      vi.advanceTimersByTime(5000);
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("5s")
      );
    });

    it("should format minutes and seconds correctly", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 1, operation: "images" });

      tracker.startItem();
      vi.advanceTimersByTime(125000); // 2m 5s
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("2m 5s")
      );
    });

    it("should format whole minutes correctly", () => {
      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
      };
      vi.mocked(SpinnerManager.create).mockReturnValue(mockSpinner);

      const tracker = new ProgressTracker({ total: 1, operation: "images" });

      tracker.startItem();
      vi.advanceTimersByTime(120000); // 2m exactly
      tracker.completeItem(true);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("2m")
      );
    });
  });

  describe("parallel operations simulation", () => {
    it("should handle multiple items in progress correctly", () => {
      const tracker = new ProgressTracker({ total: 10, operation: "images" });

      // Start 5 items
      for (let i = 0; i < 5; i++) {
        tracker.startItem();
      }

      let stats = tracker.getStats();
      expect(stats.inProgress).toBe(5);
      expect(stats.completed).toBe(0);

      // Complete 3 successfully
      tracker.completeItem(true);
      tracker.completeItem(true);
      tracker.completeItem(true);

      stats = tracker.getStats();
      expect(stats.inProgress).toBe(2);
      expect(stats.completed).toBe(3);

      // Fail 1
      tracker.completeItem(false);

      stats = tracker.getStats();
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(3);
      expect(stats.failed).toBe(1);

      // Complete the last one
      tracker.completeItem(true);

      stats = tracker.getStats();
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(4);
      expect(stats.failed).toBe(1);
    });
  });
});
