/**
 * Tests for standardized API response schemas
 *
 * Ensures all API responses follow consistent patterns for automation
 */

import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  type ErrorResponse,
  type ApiResponse,
  type PaginationMeta,
  createErrorResponse,
  createApiResponse,
  createPaginationMeta,
  generateRequestId,
  getErrorCodeForStatus,
  getValidationErrorForField,
} from "./response-schemas";

describe("Response Schemas", () => {
  describe("ErrorCode enum", () => {
    it("should have all expected error codes", () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
      expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED");
      expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND");
      expect(ErrorCode.CONFLICT).toBe("CONFLICT");
      expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    });

    it("should have consistent error code format (uppercase with underscores)", () => {
      const allCodes = Object.values(ErrorCode);
      for (const code of allCodes) {
        expect(code).toMatch(/^[A-Z_]+$/);
        expect(code).not.toContain(" ");
      }
    });
  });

  describe("generateRequestId", () => {
    it("should generate unique request IDs", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
    });

    it("should generate IDs starting with 'req_'", () => {
      const id = generateRequestId();
      expect(id.startsWith("req_")).toBe(true);
    });

    it("should generate IDs with reasonable length", () => {
      const id = generateRequestId();
      expect(id.length).toBeGreaterThan(10);
      expect(id.length).toBeLessThan(50);
    });
  });

  describe("createErrorResponse", () => {
    it("should create a valid error response with all fields", () => {
      const requestId = "req_test_123";
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid input",
        400,
        requestId,
        { field: "type" },
        ["Check the input format"]
      );

      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.message).toBe("Invalid input");
      expect(error.status).toBe(400);
      expect(error.requestId).toBe(requestId);
      expect(error.details).toEqual({ field: "type" });
      expect(error.suggestions).toEqual(["Check the input format"]);
      expect(error.timestamp).toBeDefined();
    });

    it("should create error response without optional fields", () => {
      const requestId = "req_test_456";
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.NOT_FOUND,
        "Resource not found",
        404,
        requestId
      );

      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.message).toBe("Resource not found");
      expect(error.status).toBe(404);
      expect(error.requestId).toBe(requestId);
      expect(error.details).toBeUndefined();
      expect(error.suggestions).toBeUndefined();
      expect(error.timestamp).toBeDefined();
    });

    it("should not include suggestions if empty array provided", () => {
      const requestId = "req_test_789";
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        "Server error",
        500,
        requestId,
        undefined,
        []
      );

      expect(error.suggestions).toBeUndefined();
    });

    it("should include ISO 8601 timestamp", () => {
      const requestId = "req_test_timestamp";
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Test error",
        400,
        requestId
      );

      expect(error.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe("createApiResponse", () => {
    it("should create a valid API response with data", () => {
      const requestId = "req_api_123";
      const data = { id: "test", value: 42 };
      const response: ApiResponse<typeof data> = createApiResponse(
        data,
        requestId
      );

      expect(response.data).toEqual(data);
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeDefined();
      expect(response.pagination).toBeUndefined();
    });

    it("should create API response with pagination metadata", () => {
      const requestId = "req_api_456";
      const data = [{ id: "1" }, { id: "2" }];
      const pagination: PaginationMeta = createPaginationMeta(1, 10, 25);
      const response: ApiResponse<typeof data> = createApiResponse(
        data,
        requestId,
        pagination
      );

      expect(response.data).toEqual(data);
      expect(response.requestId).toBe(requestId);
      expect(response.pagination).toEqual(pagination);
      expect(response.timestamp).toBeDefined();
    });

    it("should include ISO 8601 timestamp", () => {
      const requestId = "req_api_timestamp";
      const response: ApiResponse<unknown> = createApiResponse(null, requestId);

      expect(response.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe("createPaginationMeta", () => {
    it("should calculate pagination metadata correctly", () => {
      const meta: PaginationMeta = createPaginationMeta(2, 10, 25);

      expect(meta.page).toBe(2);
      expect(meta.perPage).toBe(10);
      expect(meta.total).toBe(25);
      expect(meta.totalPages).toBe(3);
      expect(meta.hasNext).toBe(true);
      expect(meta.hasPrevious).toBe(true);
    });

    it("should handle first page correctly", () => {
      const meta: PaginationMeta = createPaginationMeta(1, 10, 25);

      expect(meta.page).toBe(1);
      expect(meta.hasPrevious).toBe(false);
      expect(meta.hasNext).toBe(true);
    });

    it("should handle last page correctly", () => {
      const meta: PaginationMeta = createPaginationMeta(3, 10, 25);

      expect(meta.page).toBe(3);
      expect(meta.hasPrevious).toBe(true);
      expect(meta.hasNext).toBe(false);
    });

    it("should handle single page correctly", () => {
      const meta: PaginationMeta = createPaginationMeta(1, 10, 5);

      expect(meta.totalPages).toBe(1);
      expect(meta.hasPrevious).toBe(false);
      expect(meta.hasNext).toBe(false);
    });

    it("should handle exact page boundary", () => {
      const meta: PaginationMeta = createPaginationMeta(2, 10, 20);

      expect(meta.totalPages).toBe(2);
      expect(meta.hasPrevious).toBe(true);
      expect(meta.hasNext).toBe(false);
    });
  });

  describe("getErrorCodeForStatus", () => {
    it("should map HTTP status codes to error codes", () => {
      expect(getErrorCodeForStatus(400)).toBe(ErrorCode.VALIDATION_ERROR);
      expect(getErrorCodeForStatus(401)).toBe(ErrorCode.UNAUTHORIZED);
      expect(getErrorCodeForStatus(403)).toBe(ErrorCode.FORBIDDEN);
      expect(getErrorCodeForStatus(404)).toBe(ErrorCode.NOT_FOUND);
      expect(getErrorCodeForStatus(409)).toBe(ErrorCode.CONFLICT);
      expect(getErrorCodeForStatus(429)).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(getErrorCodeForStatus(500)).toBe(ErrorCode.INTERNAL_ERROR);
      expect(getErrorCodeForStatus(503)).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    });

    it("should return INTERNAL_ERROR for unknown status codes", () => {
      expect(getErrorCodeForStatus(418)).toBe(ErrorCode.INTERNAL_ERROR);
      expect(getErrorCodeForStatus(502)).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe("getValidationErrorForField", () => {
    it("should return error details for known fields", () => {
      const result = getValidationErrorForField("type");

      expect(result.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(result.message).toContain("type");
    });

    it("should return error details for options fields", () => {
      const result = getValidationErrorForField("maxPages");

      expect(result.code).toBe(ErrorCode.INVALID_FORMAT);
      expect(result.message).toContain("maxPages");
    });

    it("should return generic validation error for unknown fields", () => {
      const result = getValidationErrorForField("unknownField");

      expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.message).toContain("unknownField");
    });
  });

  describe("Response envelope structure", () => {
    it("should have consistent structure for error responses", () => {
      const requestId = "req_envelope_error";
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.NOT_FOUND,
        "Not found",
        404,
        requestId
      );

      // Verify all required fields are present
      expect(error).toHaveProperty("code");
      expect(error).toHaveProperty("message");
      expect(error).toHaveProperty("status");
      expect(error).toHaveProperty("requestId");
      expect(error).toHaveProperty("timestamp");

      // Verify field types
      expect(typeof error.code).toBe("string");
      expect(typeof error.message).toBe("string");
      expect(typeof error.status).toBe("number");
      expect(typeof error.requestId).toBe("string");
      expect(typeof error.timestamp).toBe("string");
    });

    it("should have consistent structure for success responses", () => {
      const requestId = "req_envelope_success";
      const data = { result: "success" };
      const response: ApiResponse<typeof data> = createApiResponse(
        data,
        requestId
      );

      // Verify all required fields are present
      expect(response).toHaveProperty("data");
      expect(response).toHaveProperty("requestId");
      expect(response).toHaveProperty("timestamp");

      // Verify field types
      expect(typeof response.data).toBe("object");
      expect(typeof response.requestId).toBe("string");
      expect(typeof response.timestamp).toBe("string");
    });
  });

  describe("Automation-friendly design", () => {
    it("should provide machine-readable error codes", () => {
      const requestId = "req_automation_1";
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Human readable message",
        400,
        requestId
      );

      // Error code should be constant and comparable
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(ErrorCode.VALIDATION_ERROR).toBe(error.code);
    });

    it("should include request ID for tracing", () => {
      const requestId = "req_automation_2";

      const error: ErrorResponse = createErrorResponse(
        ErrorCode.NOT_FOUND,
        "Not found",
        404,
        requestId
      );
      const response: ApiResponse<unknown> = createApiResponse(null, requestId);

      expect(error.requestId).toBe(requestId);
      expect(response.requestId).toBe(requestId);
    });

    it("should provide ISO 8601 timestamps for parsing", () => {
      const requestId = "req_automation_3";

      const error: ErrorResponse = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Test",
        400,
        requestId
      );
      const response: ApiResponse<unknown> = createApiResponse(null, requestId);

      // Both should have parseable ISO 8601 timestamps
      expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);
      expect(new Date(response.timestamp).toISOString()).toBe(
        response.timestamp
      );
    });
  });
});
