/**
 * Tests for unified error handling utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AppError,
  ConfigError,
  NetworkError,
  ValidationError,
  FileSystemError,
  RateLimitError,
  logError,
  logWarning,
  logInfo,
  logSuccess,
  withErrorHandling,
  createValidationError,
  formatErrorResponse,
} from "./errors";

describe("AppError", () => {
  it("should create error with message and suggestions", () => {
    const error = new AppError("Test error", ["Suggestion 1", "Suggestion 2"]);
    expect(error.message).toBe("Test error");
    expect(error.suggestions).toEqual(["Suggestion 1", "Suggestion 2"]);
  });

  it("should create error with context", () => {
    const error = new AppError("Test error", [], { key: "value" });
    expect(error.context).toEqual({ key: "value" });
  });

  it("should format error with suggestions and context", () => {
    const error = new AppError("Test error", ["Fix it"], { key: "value" });
    const formatted = error.format();
    expect(formatted).toContain("Test error");
    expect(formatted).toContain("Fix it");
    expect(formatted).toContain("key");
  });

  it("should format error without suggestions", () => {
    const error = new AppError("Test error");
    const formatted = error.format();
    expect(formatted).toContain("Test error");
    expect(formatted).not.toContain("Suggestions");
  });
});

describe("ConfigError", () => {
  it("should include default suggestions", () => {
    const error = new ConfigError("Missing API key");
    expect(error.suggestions).toContain("Check your .env file configuration");
    expect(error.suggestions).toContain(
      "Ensure all required environment variables are set"
    );
  });

  it("should merge custom suggestions with defaults", () => {
    const error = new ConfigError("Missing API key", ["Custom suggestion"]);
    expect(error.suggestions).toContain("Check your .env file configuration");
    expect(error.suggestions).toContain("Custom suggestion");
  });
});

describe("NetworkError", () => {
  it("should include default suggestions", () => {
    const error = new NetworkError("Connection failed");
    expect(error.suggestions).toContain("Check your internet connection");
    expect(error.suggestions).toContain("Verify API credentials are valid");
  });
});

describe("ValidationError", () => {
  it("should include status code", () => {
    const error = new ValidationError("Invalid input", 400);
    expect(error.statusCode).toBe(400);
  });

  it("should include default suggestions", () => {
    const error = new ValidationError("Invalid input");
    expect(error.suggestions).toContain(
      "Verify the input data format is correct"
    );
  });

  it("should include context in error", () => {
    const error = new ValidationError("Invalid input", 400, ["Custom"], {
      field: "email",
    });
    expect(error.context).toEqual({ field: "email" });
  });
});

describe("FileSystemError", () => {
  it("should include default suggestions", () => {
    const error = new FileSystemError("File not found");
    expect(error.suggestions).toContain("Check file permissions");
    expect(error.suggestions).toContain("Ensure the file or directory exists");
  });
});

describe("RateLimitError", () => {
  it("should include retry-after suggestion", () => {
    const error = new RateLimitError("Rate limited", 60);
    expect(error.suggestions).toContain("Wait 60 seconds before retrying");
  });

  it("should include default suggestion when no retry-after", () => {
    const error = new RateLimitError("Rate limited");
    expect(error.suggestions).toContain("Wait a few moments before retrying");
  });

  it("should include retry-after in context", () => {
    const error = new RateLimitError("Rate limited", 60);
    expect(error.retryAfter).toBe(60);
  });
});

describe("logError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log AppError with formatting", () => {
    const error = new AppError("Test error", ["Fix it"]);
    logError(error);
    expect(console.error).toHaveBeenCalled();
    const logged = (console.error as any).mock.calls[0][0];
    expect(logged).toContain("Test error");
    expect(logged).toContain("Fix it");
  });

  it("should log regular Error", () => {
    const error = new Error("Regular error");
    logError(error);
    expect(console.error).toHaveBeenCalled();
    const logged = (console.error as any).mock.calls[0][0];
    expect(logged).toContain("Regular error");
  });

  it("should log unknown error", () => {
    logError("Unknown error");
    expect(console.error).toHaveBeenCalled();
  });

  it("should include context prefix when provided", () => {
    const error = new AppError("Test error");
    logError(error, "TestContext");
    expect(console.error).toHaveBeenCalled();
    const logged = (console.error as any).mock.calls[0][0];
    expect(logged).toContain("[TestContext]");
  });
});

describe("logWarning", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log warning with formatting", () => {
    logWarning("Warning message");
    expect(console.warn).toHaveBeenCalled();
    const logged = (console.warn as any).mock.calls[0][0];
    expect(logged).toContain("Warning message");
  });

  it("should include context prefix when provided", () => {
    logWarning("Warning message", "TestContext");
    expect(console.warn).toHaveBeenCalled();
    const logged = (console.warn as any).mock.calls[0][0];
    expect(logged).toContain("[TestContext]");
  });
});

describe("logInfo", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log info with formatting", () => {
    logInfo("Info message");
    expect(console.info).toHaveBeenCalled();
    const logged = (console.info as any).mock.calls[0][0];
    expect(logged).toContain("Info message");
  });
});

describe("logSuccess", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log success with formatting", () => {
    logSuccess("Success message");
    expect(console.log).toHaveBeenCalled();
    const logged = (console.log as any).mock.calls[0][0];
    expect(logged).toContain("Success message");
  });
});

describe("withErrorHandling", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return result when function succeeds", async () => {
    const result = await withErrorHandling("testOp", async () => "success");
    expect(result).toBe("success");
  });

  it("should log and rethrow AppError", async () => {
    const error = new AppError("Test error");
    await expect(
      withErrorHandling("testOp", async () => {
        throw error;
      })
    ).rejects.toThrow(error);
    expect(console.error).toHaveBeenCalled();
  });

  it("should wrap unknown errors in AppError", async () => {
    const unknownError = "Unknown error";
    await expect(
      withErrorHandling("testOp", async () => {
        throw unknownError;
      })
    ).rejects.toThrow("Unknown error");
    expect(console.error).toHaveBeenCalled();
  });

  it("should add context to existing AppError", async () => {
    const error = new AppError("Test error");
    await expect(
      withErrorHandling(
        "testOp",
        async () => {
          throw error;
        },
        { extra: "context" }
      )
    ).rejects.toThrow("Test error");
    // The context should be added to the error
  });
});

describe("createValidationError", () => {
  it("should create ValidationError with details", () => {
    const error = createValidationError("Invalid field", 400, {
      field: "email",
    });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.statusCode).toBe(400);
    expect(error.context).toEqual({ details: { field: "email" } });
  });

  it("should create ValidationError without details", () => {
    const error = createValidationError("Invalid input");
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.statusCode).toBe(400);
  });
});

describe("formatErrorResponse", () => {
  it("should format ValidationError", () => {
    const error = new ValidationError("Invalid input", 400, ["Fix it"], {
      field: "email",
    });
    const response = formatErrorResponse(error);
    // ValidationError merges custom suggestions with defaults
    expect(response.error).toBe("Invalid input");
    expect(response.suggestions).toContain("Fix it");
    expect(response.context).toEqual({ field: "email" });
  });

  it("should format AppError", () => {
    const error = new AppError("Test error", ["Fix it"]);
    const response = formatErrorResponse(error);
    expect(response).toEqual({
      error: "Test error",
      suggestions: ["Fix it"],
    });
  });

  it("should format regular Error", () => {
    const error = new Error("Regular error");
    const response = formatErrorResponse(error);
    expect(response).toEqual({
      error: "Regular error",
    });
  });

  it("should format unknown error", () => {
    const response = formatErrorResponse("Unknown error");
    expect(response).toEqual({
      error: "Unknown error",
    });
  });
});
