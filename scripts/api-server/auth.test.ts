/**
 * Authentication Module Tests
 *
 * Tests for API key authentication functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ApiKeyAuth,
  createAuthErrorResponse,
  getAuth,
  requireAuth,
} from "./auth";

describe("ApiKeyAuth", () => {
  let auth: ApiKeyAuth;

  beforeEach(() => {
    // Clear any existing instance and create fresh one for each test
    ApiKeyAuth["instance"] = undefined;
    auth = new ApiKeyAuth();
  });

  afterEach(() => {
    // Clean up
    auth.clearKeys();
  });

  describe("API Key Management", () => {
    it("should add and validate API keys", () => {
      const testKey = "test-api-key-123456789012";
      auth.addKey("test", testKey, {
        name: "test",
        description: "Test key",
        active: true,
      });

      const result = auth.authenticate(`Bearer ${testKey}`);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("test");
    });

    it("should reject invalid API keys", () => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });

      const result = auth.authenticate("Bearer invalid-key");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });

    it("should handle inactive API keys", () => {
      const testKey = "test-api-key-123456789012";
      auth.addKey("test", testKey, {
        name: "test",
        active: false,
      });

      const result = auth.authenticate(`Bearer ${testKey}`);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/inactive/i);
    });

    it("should support multiple API keys", () => {
      const key1 = "key-one-12345678901234";
      const key2 = "key-two-12345678901234";

      auth.addKey("key1", key1, {
        name: "key1",
        description: "First key",
        active: true,
      });

      auth.addKey("key2", key2, {
        name: "key2",
        description: "Second key",
        active: true,
      });

      const result1 = auth.authenticate(`Bearer ${key1}`);
      const result2 = auth.authenticate(`Bearer ${key2}`);

      expect(result1.success).toBe(true);
      expect(result1.meta?.name).toBe("key1");

      expect(result2.success).toBe(true);
      expect(result2.meta?.name).toBe("key2");
    });

    it("should validate minimum key length", () => {
      // Add a key first to enable authentication
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });

      const shortKey = "short";
      const result = auth.authenticate(`Bearer ${shortKey}`);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/16/i);
    });
  });

  describe("Authorization Header Parsing", () => {
    beforeEach(() => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
    });

    it("should accept 'Bearer' scheme", () => {
      const result = auth.authenticate("Bearer valid-key-123456789012");
      expect(result.success).toBe(true);
    });

    it("should accept 'Api-Key' scheme", () => {
      const result = auth.authenticate("Api-Key valid-key-123456789012");
      expect(result.success).toBe(true);
    });

    it("should accept lowercase scheme", () => {
      const result = auth.authenticate("bearer valid-key-123456789012");
      expect(result.success).toBe(true);
    });

    it("should reject missing Authorization header", () => {
      const result = auth.authenticate(null);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/missing/i);
    });

    it("should reject invalid header format", () => {
      const result = auth.authenticate("InvalidFormat");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });
  });

  describe("Authentication State", () => {
    it("should detect when authentication is enabled", () => {
      expect(auth.isAuthenticationEnabled()).toBe(false);

      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });

      expect(auth.isAuthenticationEnabled()).toBe(true);
    });

    it("should allow requests when authentication is disabled", () => {
      const result = auth.authenticate(null);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("default");
    });

    it("should list configured keys", () => {
      auth.addKey("key1", "key-one-12345678901234", {
        name: "key1",
        description: "First key",
        active: true,
      });

      auth.addKey("key2", "key-two-12345678901234", {
        name: "key2",
        description: "Second key",
        active: false,
      });

      const keys = auth.listKeys();
      expect(keys).toHaveLength(2);
      expect(keys[0].name).toBe("key1");
      expect(keys[1].name).toBe("key2");
    });

    it("should clear all keys", () => {
      auth.addKey("key1", "key-one-12345678901234", {
        name: "key1",
        active: true,
      });

      expect(auth.isAuthenticationEnabled()).toBe(true);

      auth.clearKeys();

      expect(auth.isAuthenticationEnabled()).toBe(false);
      expect(auth.listKeys()).toHaveLength(0);
    });
  });

  describe("createAuthErrorResponse", () => {
    it("should create properly formatted 401 response", async () => {
      const response = createAuthErrorResponse("Invalid credentials");

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");

      const body = await response.json();
      expect(body.error).toBe("Invalid credentials");
      expect(body.suggestions).toBeDefined();
      expect(Array.isArray(body.suggestions)).toBe(true);
    });

    it("should support custom status codes", async () => {
      const response = createAuthErrorResponse("Forbidden", 403);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toBe("Forbidden");
    });
  });

  describe("getAuth singleton", () => {
    it("should return the same instance", () => {
      const instance1 = getAuth();
      const instance2 = getAuth();

      expect(instance1).toBe(instance2);
    });
  });

  describe("requireAuth middleware", () => {
    it("should authenticate valid API keys", () => {
      // Use getAuth to get/set the singleton
      const auth = getAuth();
      auth.clearKeys();
      const testKey = "requireauth-test-key-1234";
      auth.addKey("test", testKey, {
        name: "test",
        active: true,
      });

      const result = requireAuth(`Bearer ${testKey}`);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("test");

      // Clean up
      auth.clearKeys();
    });

    it("should reject invalid API keys", () => {
      const auth = getAuth();
      auth.clearKeys();
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });

      const result = requireAuth("Bearer invalid-key");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid/i);

      // Clean up
      auth.clearKeys();
    });

    it("should handle missing Authorization header", () => {
      const auth = getAuth();
      auth.clearKeys();
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });

      const result = requireAuth(null);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/missing/i);

      // Clean up
      auth.clearKeys();
    });

    it("should allow requests when no keys are configured", () => {
      const auth = getAuth();
      auth.clearKeys();
      // No keys added, authentication is disabled

      const result = requireAuth(null);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("default");
    });

    it("should use singleton instance", () => {
      const auth = getAuth();
      auth.clearKeys();
      const testKey = "singleton-test-key-123456";
      auth.addKey("singleton", testKey, {
        name: "singleton",
        active: true,
      });

      // requireAuth should use the same singleton instance
      const result = requireAuth(`Bearer ${testKey}`);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("singleton");

      // Clean up
      auth.clearKeys();
    });
  });
});
