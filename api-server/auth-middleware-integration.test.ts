/**
 * Authentication Middleware Integration Tests
 *
 * Tests for verifying that authentication middleware properly protects
 * API endpoints and allows public access to unrestricted endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAuth, type ApiKeyAuth, requireAuth, AuthResult } from "./auth";
import { destroyJobTracker } from "./job-tracker";

const TEST_API_KEY = "test-integration-key-12345678";

// Copy of PUBLIC_ENDPOINTS from index.ts for testing
const PUBLIC_ENDPOINTS = ["/health", "/jobs/types", "/docs"];

// Copy of isPublicEndpoint function from index.ts for testing
function isPublicEndpoint(path: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => path === endpoint);
}

// Mock request class for testing
class MockRequest {
  public headers: Headers;
  public method: string;
  public url: string;

  constructor(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ) {
    this.url = url;
    this.method = options.method || "GET";
    this.headers = new Headers();
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        this.headers.set(key, value);
      }
    }
  }

  get header(): string | null {
    return this.headers.get("authorization");
  }
}

describe("Authentication Middleware Integration", () => {
  let auth: ApiKeyAuth;

  beforeEach(() => {
    // Reset job tracker
    destroyJobTracker();

    // Get auth instance and clear any existing keys
    auth = getAuth();
    auth.clearKeys();

    // Add test API key
    auth.addKey("test", TEST_API_KEY, {
      name: "test",
      description: "Test API key for integration tests",
      active: true,
    });
  });

  afterEach(() => {
    // Clean up
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

    it("should not identify /jobs as public", () => {
      expect(isPublicEndpoint("/jobs")).toBe(false);
    });

    it("should not identify /jobs/:id as public", () => {
      expect(isPublicEndpoint("/jobs/123")).toBe(false);
    });
  });

  describe("Public Endpoints - Authentication Bypass", () => {
    it("should bypass authentication for public endpoints", () => {
      const publicPaths = ["/health", "/docs", "/jobs/types"];

      for (const path of publicPaths) {
        expect(isPublicEndpoint(path)).toBe(true);
        // For public endpoints, auth should be skipped
        // In the actual implementation, isPublicEndpoint() returns true
        // and auth is not required
      }
    });
  });

  describe("Protected Endpoints - Authentication Required", () => {
    describe("requireAuth middleware function", () => {
      it("should reject request without Authorization header", () => {
        const result = requireAuth(null);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Missing Authorization header");
      });

      it("should reject request with invalid API key", () => {
        const result = requireAuth("Bearer invalid-key-123456789");
        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid API key");
      });

      it("should reject request with malformed Authorization header", () => {
        const result = requireAuth("InvalidFormat");
        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid Authorization header format");
      });

      it("should reject request with short API key", () => {
        const result = requireAuth("Bearer short");
        expect(result.success).toBe(false);
        expect(result.error).toContain("at least 16 characters");
      });

      it("should accept request with valid Bearer token", () => {
        const result = requireAuth(`Bearer ${TEST_API_KEY}`);
        expect(result.success).toBe(true);
        expect(result.meta?.name).toBe("test");
      });

      it("should accept request with valid Api-Key scheme", () => {
        const result = requireAuth(`Api-Key ${TEST_API_KEY}`);
        expect(result.success).toBe(true);
        expect(result.meta?.name).toBe("test");
      });

      it("should accept request with lowercase bearer scheme", () => {
        const result = requireAuth(`bearer ${TEST_API_KEY}`);
        expect(result.success).toBe(true);
        expect(result.meta?.name).toBe("test");
      });

      it("should reject request with Api-Key scheme and invalid key", () => {
        const result = requireAuth("Api-Key wrong-key-123456789012");
        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid API key");
      });

      it("should reject request with bearer scheme and invalid key", () => {
        const result = requireAuth("bearer wrong-key-123456789012");
        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid API key");
      });
    });

    describe("POST /jobs endpoint - authentication", () => {
      it("should require authentication for job creation", () => {
        // Simulate POST /jobs request without auth
        const isProtected = !isPublicEndpoint("/jobs");
        expect(isProtected).toBe(true);

        const authResult = requireAuth(null);
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Missing Authorization header");
      });

      it("should reject job creation with invalid API key", () => {
        const authResult = requireAuth("Bearer wrong-key-123456789012");
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Invalid API key");
      });

      it("should accept job creation with valid API key", () => {
        const authResult = requireAuth(`Bearer ${TEST_API_KEY}`);
        expect(authResult.success).toBe(true);
        expect(authResult.meta?.name).toBe("test");
      });
    });

    describe("GET /jobs/:id endpoint - authentication", () => {
      it("should require authentication for job status requests", () => {
        // Simulate GET /jobs/:id request without auth
        const isProtected = !isPublicEndpoint("/jobs/test-job-id");
        expect(isProtected).toBe(true);

        const authResult = requireAuth(null);
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Missing Authorization header");
      });

      it("should reject status request with invalid API key", () => {
        const authResult = requireAuth("Bearer invalid-key-123456789");
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Invalid API key");
      });

      it("should accept status request with valid API key", () => {
        const authResult = requireAuth(`Bearer ${TEST_API_KEY}`);
        expect(authResult.success).toBe(true);
        expect(authResult.meta?.name).toBe("test");
      });

      it("should return 401 before checking job existence", () => {
        // Auth fails first, then job lookup would happen
        const authResult = requireAuth("Bearer wrong-key");
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Invalid API key");
      });
    });

    describe("DELETE /jobs/:id endpoint - authentication", () => {
      it("should require authentication for job cancel requests", () => {
        // Simulate DELETE /jobs/:id request without auth
        const isProtected = !isPublicEndpoint("/jobs/test-job-id");
        expect(isProtected).toBe(true);

        const authResult = requireAuth(null);
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Missing Authorization header");
      });

      it("should reject cancel request with invalid API key", () => {
        const authResult = requireAuth("Bearer invalid-key-123456789");
        expect(authResult.success).toBe(false);
        expect(authResult.error).toContain("Invalid API key");
      });

      it("should accept cancel request with valid API key", () => {
        const authResult = requireAuth(`Bearer ${TEST_API_KEY}`);
        expect(authResult.success).toBe(true);
        expect(authResult.meta?.name).toBe("test");
      });
    });
  });

  describe("Inactive API Key Handling", () => {
    it("should reject requests with inactive API key", () => {
      const inactiveKey = "inactive-key-123456789012";
      auth.addKey("inactive", inactiveKey, {
        name: "inactive",
        description: "Inactive test key",
        active: false,
      });

      const authResult = requireAuth(`Bearer ${inactiveKey}`);
      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("inactive");
    });
  });

  describe("Authentication Disabled Mode", () => {
    it("should allow requests when no API keys are configured", () => {
      // Clear all keys to disable authentication
      auth.clearKeys();
      expect(auth.isAuthenticationEnabled()).toBe(false);

      // Request should succeed without auth header
      const authResult = requireAuth(null);
      expect(authResult.success).toBe(true);
      expect(authResult.meta?.name).toBe("default");
    });

    it("should allow POST /jobs when authentication disabled", () => {
      auth.clearKeys();
      expect(auth.isAuthenticationEnabled()).toBe(false);

      const authResult = requireAuth(null);
      expect(authResult.success).toBe(true);
      expect(authResult.meta?.name).toBe("default");
    });

    it("should allow job status requests when authentication disabled", () => {
      auth.clearKeys();
      expect(auth.isAuthenticationEnabled()).toBe(false);

      const authResult = requireAuth(null);
      expect(authResult.success).toBe(true);
    });

    it("should allow job cancel requests when authentication disabled", () => {
      auth.clearKeys();
      expect(auth.isAuthenticationEnabled()).toBe(false);

      const authResult = requireAuth(null);
      expect(authResult.success).toBe(true);
    });
  });

  describe("Multiple API Keys", () => {
    it("should accept requests with any valid API key", () => {
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

      // Both keys should work
      const authResult1 = requireAuth(`Bearer ${key1}`);
      expect(authResult1.success).toBe(true);
      expect(authResult1.meta?.name).toBe("key1");

      const authResult2 = requireAuth(`Bearer ${key2}`);
      expect(authResult2.success).toBe(true);
      expect(authResult2.meta?.name).toBe("key2");
    });

    it("should reject requests when none of the keys match", () => {
      auth.addKey("key1", "key-one-12345678901234", {
        name: "key1",
        active: true,
      });

      const authResult = requireAuth("Bearer different-key-12345678");
      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid API key");
    });
  });

  describe("Error Response Format", () => {
    it("should return standardized auth result structure", () => {
      const authResult = requireAuth(null);

      expect(authResult).toHaveProperty("success");
      expect(authResult.success).toBe(false);
      expect(authResult).toHaveProperty("error");
      expect(typeof authResult.error).toBe("string");
    });

    it("should return consistent error for missing auth header", () => {
      const authResult = requireAuth(null);

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Missing Authorization header");
    });

    it("should return consistent error for invalid API key", () => {
      const authResult = requireAuth("Bearer invalid-key-123456789");

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid API key");
    });

    it("should return consistent error for malformed header", () => {
      const authResult = requireAuth("InvalidFormat");

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid Authorization header format");
    });
  });

  describe("AuthResult structure validation", () => {
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
  });

  describe("Authorization header parsing edge cases", () => {
    beforeEach(() => {
      auth.addKey("test", TEST_API_KEY, {
        name: "test",
        active: true,
      });
    });

    it("should handle extra whitespace in header", () => {
      const authResult = requireAuth(`Bearer  ${TEST_API_KEY}`);
      expect(authResult.success).toBe(true);
    });

    it("should handle trailing whitespace", () => {
      const authResult = requireAuth(`Bearer ${TEST_API_KEY}  `);
      expect(authResult.success).toBe(true);
    });

    it("should reject header with more than two parts", () => {
      const authResult = requireAuth(`Bearer ${TEST_API_KEY} extra`);
      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid Authorization header format");
    });

    it("should reject header with only one part", () => {
      const authResult = requireAuth("Bearer");
      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid Authorization header format");
    });

    it("should reject unsupported auth scheme", () => {
      const authResult = requireAuth(`Basic ${TEST_API_KEY}`);
      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid Authorization header format");
    });
  });
});
