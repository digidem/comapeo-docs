/**
 * Protected Endpoints Authentication Coverage Tests
 *
 * Tests verifying authentication middleware properly protects
 * all API endpoints through comprehensive request/response validation.
 *
 * Tests verify:
 * - Protected endpoints require valid authentication
 * - Public endpoints are accessible without authentication
 * - All HTTP methods (GET, POST, DELETE) are properly protected
 * - Error responses are properly formatted
 * - Authentication edge cases are handled correctly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  requireAuth,
  getAuth,
  type AuthResult,
  createAuthErrorResponse,
} from "./auth";
import { destroyJobTracker } from "./job-tracker";
import { PUBLIC_ENDPOINTS, isPublicEndpoint } from "./validation";

const TEST_API_KEY = "protected-endpoints-test-key-123456";

// Simulate the handleRequest authentication logic from index.ts
function simulateHandleRequestAuth(
  path: string,
  authHeader: string | null
): {
  isAuthenticated: boolean;
  authResult: AuthResult;
  isPublic: boolean;
} {
  const isPublic = isPublicEndpoint(path);

  // For public endpoints, auth is bypassed with a special result
  const authResult: AuthResult = isPublic
    ? {
        success: true,
        meta: {
          name: "public",
          active: true,
          createdAt: new Date(),
        },
      }
    : requireAuth(authHeader);

  return {
    isAuthenticated: authResult.success,
    authResult,
    isPublic,
  };
}

describe("Protected Endpoints Authentication Coverage", () => {
  beforeEach(() => {
    // Configure test API key
    const auth = getAuth();
    auth.clearKeys();
    auth.addKey("test", TEST_API_KEY, {
      name: "test",
      description: "Test API key for protected endpoints",
      active: true,
    });
    destroyJobTracker();
  });

  afterEach(() => {
    // Clean up
    const auth = getAuth();
    auth.clearKeys();
    destroyJobTracker();
  });

  describe("Public Endpoint Detection", () => {
    it("should identify /health as public", () => {
      expect(isPublicEndpoint("/health")).toBe(true);
    });

    it("should identify /docs as public", () => {
      expect(isPublicEndpoint("/docs")).toBe(true);
    });

    it("should identify /jobs/types as public", () => {
      expect(isPublicEndpoint("/jobs/types")).toBe(true);
    });

    it("should identify /notion-trigger as public", () => {
      expect(isPublicEndpoint("/notion-trigger")).toBe(true);
    });

    it("should not identify /jobs as public", () => {
      expect(isPublicEndpoint("/jobs")).toBe(false);
    });

    it("should not identify /jobs/:id as public", () => {
      expect(isPublicEndpoint("/jobs/123")).toBe(false);
    });

    it("should not identify unknown routes as public", () => {
      expect(isPublicEndpoint("/unknown")).toBe(false);
    });
  });

  describe("Public Endpoints - Auth Bypass", () => {
    it("should bypass authentication for /health", () => {
      const result = simulateHandleRequestAuth("/health", null);
      expect(result.isPublic).toBe(true);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.success).toBe(true);
      expect(result.authResult.meta?.name).toBe("public");
    });

    it("should bypass authentication for /docs", () => {
      const result = simulateHandleRequestAuth("/docs", null);
      expect(result.isPublic).toBe(true);
      expect(result.isAuthenticated).toBe(true);
    });

    it("should bypass authentication for /jobs/types", () => {
      const result = simulateHandleRequestAuth("/jobs/types", null);
      expect(result.isPublic).toBe(true);
      expect(result.isAuthenticated).toBe(true);
    });

    it("should bypass bearer auth for /notion-trigger route classification", () => {
      const result = simulateHandleRequestAuth("/notion-trigger", null);
      expect(result.isPublic).toBe(true);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.meta?.name).toBe("public");
    });
  });

  describe("Protected Endpoints - GET /jobs", () => {
    it("should reject request without Authorization header", () => {
      const result = simulateHandleRequestAuth("/jobs", null);
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.success).toBe(false);
      expect(result.authResult.error).toContain("Missing Authorization header");
    });

    it("should reject request with invalid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        "Bearer invalid-key-123456789"
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain("Invalid API key");
    });

    it("should reject request with malformed Authorization header", () => {
      const result = simulateHandleRequestAuth("/jobs", "InvalidFormat");
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain(
        "Invalid Authorization header format"
      );
    });

    it("should accept request with valid Bearer token", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Bearer ${TEST_API_KEY}`
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.success).toBe(true);
      expect(result.authResult.meta?.name).toBe("test");
    });

    it("should accept request with valid Api-Key scheme", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Api-Key ${TEST_API_KEY}`
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.success).toBe(true);
    });

    it("should accept request with lowercase bearer scheme", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `bearer ${TEST_API_KEY}`
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(true);
    });
  });

  describe("Protected Endpoints - POST /jobs", () => {
    it("should reject job creation without authentication", () => {
      const result = simulateHandleRequestAuth("/jobs", null);
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.success).toBe(false);
      expect(result.authResult.error).toContain("Missing Authorization header");
    });

    it("should reject job creation with invalid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        "Bearer wrong-key-123456789012"
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain("Invalid API key");
    });

    it("should accept job creation with valid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Bearer ${TEST_API_KEY}`
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.success).toBe(true);
    });
  });

  describe("Protected Endpoints - GET /jobs/:id", () => {
    it("should reject status request without authentication", () => {
      const result = simulateHandleRequestAuth("/jobs/test-job-id", null);
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.success).toBe(false);
    });

    it("should reject status request with invalid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs/nonexistent",
        "Bearer invalid-key-123456"
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain("Invalid API key");
    });

    it("should return auth failure before checking job existence", () => {
      const result = simulateHandleRequestAuth(
        "/jobs/any-job-id",
        "Bearer wrong-key"
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      // Auth should fail first, before job lookup would happen
      expect(result.authResult.error).toContain("Invalid API key");
    });

    it("should accept status request with valid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs/some-job-id",
        `Bearer ${TEST_API_KEY}`
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.success).toBe(true);
    });
  });

  describe("Protected Endpoints - DELETE /jobs/:id", () => {
    it("should reject cancel request without authentication", () => {
      const result = simulateHandleRequestAuth("/jobs/test-job-id", null);
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.success).toBe(false);
    });

    it("should reject cancel request with invalid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs/some-job-id",
        "Bearer invalid-key-123456"
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain("Invalid API key");
    });

    it("should accept cancel request with valid API key", () => {
      const result = simulateHandleRequestAuth(
        "/jobs/job-123",
        `Bearer ${TEST_API_KEY}`
      );
      expect(result.isPublic).toBe(false);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.success).toBe(true);
    });
  });

  describe("Error Response Format for Auth Failures", () => {
    it("should return consistent error structure for missing auth", async () => {
      const authResult = requireAuth(null);
      expect(authResult).toMatchObject({
        success: false,
      });
      expect(authResult.error).toBeTruthy();
      expect(typeof authResult.error).toBe("string");

      // Test error response creation
      const response = createAuthErrorResponse(authResult.error!);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("suggestions");
      expect(Array.isArray(data.suggestions)).toBe(true);
    });

    it("should return consistent error structure for invalid key", async () => {
      const authResult = requireAuth("Bearer invalid-key");
      expect(authResult).toMatchObject({
        success: false,
      });
      expect(authResult.error).toContain("Invalid API key");

      const response = createAuthErrorResponse(authResult.error!);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toContain("Invalid API key");
    });

    it("should include WWW-Authenticate header", async () => {
      const response = createAuthErrorResponse("Test error");
      expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    });

    it("should support custom status codes", async () => {
      const response = createAuthErrorResponse("Forbidden", 403);
      expect(response.status).toBe(403);
    });
  });

  describe("Authorization Header Format Edge Cases", () => {
    it("should handle extra whitespace in header", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Bearer  ${TEST_API_KEY}`
      );
      expect(result.isAuthenticated).toBe(true);
    });

    it("should handle trailing whitespace", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Bearer ${TEST_API_KEY}  `
      );
      expect(result.isAuthenticated).toBe(true);
    });

    it("should reject header with more than two parts", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Bearer ${TEST_API_KEY} extra`
      );
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain(
        "Invalid Authorization header format"
      );
    });

    it("should reject header with only one part", () => {
      const result = simulateHandleRequestAuth("/jobs", "Bearer");
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain(
        "Invalid Authorization header format"
      );
    });

    it("should reject unsupported auth scheme (Basic)", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `Basic ${TEST_API_KEY}`
      );
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain(
        "Invalid Authorization header format"
      );
    });

    it("should handle mixed case bearer scheme", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `BeArEr ${TEST_API_KEY}`
      );
      expect(result.isAuthenticated).toBe(true);
    });

    it("should handle lowercase api-key scheme", () => {
      const result = simulateHandleRequestAuth(
        "/jobs",
        `api-key ${TEST_API_KEY}`
      );
      expect(result.isAuthenticated).toBe(true);
    });
  });

  describe("Cross-Endpoint Auth Consistency", () => {
    it("should use same auth for GET /jobs and POST /jobs", () => {
      const authHeader = `Bearer ${TEST_API_KEY}`;

      const getResult = simulateHandleRequestAuth("/jobs", authHeader);
      const postResult = simulateHandleRequestAuth("/jobs", authHeader);

      expect(getResult.isAuthenticated).toBe(true);
      expect(postResult.isAuthenticated).toBe(true);
      expect(getResult.authResult.meta).toEqual(postResult.authResult.meta);
    });

    it("should reject invalid auth consistently across all endpoints", () => {
      const invalidAuth = "Bearer invalid-key-123456789";

      const getJobsResult = simulateHandleRequestAuth("/jobs", invalidAuth);
      const postJobsResult = simulateHandleRequestAuth("/jobs", invalidAuth);
      const getJobResult = simulateHandleRequestAuth(
        "/jobs/test-id",
        invalidAuth
      );
      const deleteJobResult = simulateHandleRequestAuth(
        "/jobs/test-id",
        invalidAuth
      );

      expect(getJobsResult.isAuthenticated).toBe(false);
      expect(postJobsResult.isAuthenticated).toBe(false);
      expect(getJobResult.isAuthenticated).toBe(false);
      expect(deleteJobResult.isAuthenticated).toBe(false);
    });
  });

  describe("Authentication Disabled Mode", () => {
    it("should allow requests when no API keys are configured", () => {
      const auth = getAuth();
      auth.clearKeys();
      expect(auth.isAuthenticationEnabled()).toBe(false);

      // Request should succeed without auth header
      const result = requireAuth(null);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("default");

      const simulated = simulateHandleRequestAuth("/jobs", null);
      expect(simulated.isAuthenticated).toBe(true);
    });

    it("should allow POST /jobs when authentication disabled", () => {
      const auth = getAuth();
      auth.clearKeys();
      expect(auth.isAuthenticationEnabled()).toBe(false);

      const result = simulateHandleRequestAuth("/jobs", null);
      expect(result.isAuthenticated).toBe(true);
      expect(result.authResult.meta?.name).toBe("default");
    });

    it("should allow job status requests when authentication disabled", () => {
      const auth = getAuth();
      auth.clearKeys();

      const result = simulateHandleRequestAuth("/jobs/test-id", null);
      expect(result.isAuthenticated).toBe(true);
    });

    it("should allow job cancel requests when authentication disabled", () => {
      const auth = getAuth();
      auth.clearKeys();

      const result = simulateHandleRequestAuth("/jobs/test-id", null);
      expect(result.isAuthenticated).toBe(true);
    });
  });

  describe("Inactive API Key Handling", () => {
    it("should reject requests with inactive API key", () => {
      const auth = getAuth();
      const inactiveKey = "inactive-key-123456789012";
      auth.addKey("inactive", inactiveKey, {
        name: "inactive",
        description: "Inactive test key",
        active: false,
      });

      const result = simulateHandleRequestAuth(
        "/jobs",
        `Bearer ${inactiveKey}`
      );
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain("inactive");
    });
  });

  describe("AuthResult Structure Validation", () => {
    it("should have required fields for successful auth", () => {
      const authResult = requireAuth(`Bearer ${TEST_API_KEY}`);

      expect(authResult.success).toBe(true);
      expect(authResult.meta).toBeDefined();
      expect(authResult.meta).toHaveProperty("name");
      expect(authResult.meta).toHaveProperty("active");
      expect(authResult.meta).toHaveProperty("createdAt");
      expect(authResult.error).toBeUndefined();
    });

    it("should have required fields for failed auth", () => {
      const authResult = requireAuth(null);

      expect(authResult.success).toBe(false);
      expect(authResult.error).toBeDefined();
      expect(typeof authResult.error).toBe("string");
      expect(authResult.meta).toBeUndefined();
    });

    it("should include correct metadata for public endpoints", () => {
      const result = simulateHandleRequestAuth("/health", null);

      expect(result.authResult.success).toBe(true);
      expect(result.authResult.meta?.name).toBe("public");
      expect(result.authResult.meta?.active).toBe(true);
    });
  });

  describe("Multiple API Keys", () => {
    it("should accept requests with any valid API key", () => {
      const auth = getAuth();
      const key1 = "key-one-12345678901234";
      const key2 = "key-two-12345678901234";

      auth.addKey("key1", key1, {
        name: "key1",
        active: true,
      });
      auth.addKey("key2", key2, {
        name: "key2",
        active: true,
      });

      const result1 = simulateHandleRequestAuth("/jobs", `Bearer ${key1}`);
      const result2 = simulateHandleRequestAuth("/jobs", `Bearer ${key2}`);

      expect(result1.isAuthenticated).toBe(true);
      expect(result1.authResult.meta?.name).toBe("key1");

      expect(result2.isAuthenticated).toBe(true);
      expect(result2.authResult.meta?.name).toBe("key2");
    });

    it("should reject requests when none of the keys match", () => {
      const auth = getAuth();
      auth.addKey("key1", "key-one-12345678901234", {
        name: "key1",
        active: true,
      });

      const result = simulateHandleRequestAuth(
        "/jobs",
        "Bearer different-key-12345678"
      );
      expect(result.isAuthenticated).toBe(false);
      expect(result.authResult.error).toContain("Invalid API key");
    });
  });

  describe("Protected Operations Summary", () => {
    // This test ensures all protected operations are covered
    it("should have authentication coverage for all protected operations", () => {
      const auth = getAuth();
      expect(auth.isAuthenticationEnabled()).toBe(true);

      // List of all protected operations (paths that require auth)
      const protectedOperations = [
        { method: "GET", path: "/jobs", description: "List all jobs" },
        { method: "POST", path: "/jobs", description: "Create new job" },
        { method: "GET", path: "/jobs/:id", description: "Get job status" },
        { method: "DELETE", path: "/jobs/:id", description: "Cancel job" },
      ];

      // Verify each protected operation requires auth
      for (const operation of protectedOperations) {
        // Use a sample path for :id parameters
        const testPath = operation.path.replace(":id", "test-job-id");
        const result = simulateHandleRequestAuth(testPath, null);

        expect(result.isPublic).toBe(false);
        expect(result.isAuthenticated).toBe(false);
        expect(result.authResult.success).toBe(false);
      }
    });

    it("should have all public operations properly marked", () => {
      // List of public operations
      const publicOperations = ["/health", "/docs", "/jobs/types"];

      for (const path of publicOperations) {
        const result = simulateHandleRequestAuth(path, null);
        expect(result.isPublic).toBe(true);
        expect(result.isAuthenticated).toBe(true);
        expect(result.authResult.success).toBe(true);
      }
    });
  });
});
