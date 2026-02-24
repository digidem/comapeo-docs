/**
 * Module Extraction Unit Tests
 *
 * Focused unit tests for data extraction functions across modules.
 * Tests the core extraction logic in isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ApiKeyAuth } from "./auth";
import { AuditLogger } from "./audit";

describe("Module Extraction - extractClientIp (audit module)", () => {
  let audit: AuditLogger;

  beforeEach(() => {
    // Clear any existing instance
    AuditLogger["instance"] = undefined;
    audit = new AuditLogger({
      logDir: ".test-audit-data",
      logFile: "test.log",
    });
  });

  const extractClientIp = (headers: Headers): string => {
    // Access the private method via test helper
    // This is testing the internal logic by creating entries and checking the IP
    const req = new Request("http://localhost:3001/test", { headers });
    const authResult = {
      success: true,
      meta: { name: "test", active: true, createdAt: new Date() },
    };
    const entry = audit.createEntry(req, authResult);
    return entry.clientIp;
  };

  describe("x-forwarded-for header", () => {
    it("should extract first IP from x-forwarded-for with single IP", () => {
      const headers = new Headers({ "x-forwarded-for": "192.168.1.100" });
      expect(extractClientIp(headers)).toBe("192.168.1.100");
    });

    it("should extract first IP from x-forwarded-for with multiple IPs", () => {
      const headers = new Headers({
        "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3",
      });
      expect(extractClientIp(headers)).toBe("10.0.0.1");
    });

    it("should trim whitespace from x-forwarded-for IPs", () => {
      const headers = new Headers({
        "x-forwarded-for": "  192.168.1.100  ,  10.0.0.1  ",
      });
      expect(extractClientIp(headers)).toBe("192.168.1.100");
    });

    it("should handle x-forwarded-for with port numbers", () => {
      const headers = new Headers({ "x-forwarded-for": "192.168.1.100:8080" });
      expect(extractClientIp(headers)).toBe("192.168.1.100:8080");
    });
  });

  describe("x-real-ip header", () => {
    it("should extract IP from x-real-ip header", () => {
      const headers = new Headers({ "x-real-ip": "10.0.0.50" });
      expect(extractClientIp(headers)).toBe("10.0.0.50");
    });

    it("should prefer x-forwarded-for over x-real-ip", () => {
      const headers = new Headers({
        "x-forwarded-for": "192.168.1.100",
        "x-real-ip": "10.0.0.50",
      });
      expect(extractClientIp(headers)).toBe("192.168.1.100");
    });
  });

  describe("cf-connecting-ip header", () => {
    it("should extract IP from cf-connecting-ip header", () => {
      const headers = new Headers({ "cf-connecting-ip": "203.0.113.1" });
      expect(extractClientIp(headers)).toBe("203.0.113.1");
    });

    it("should prefer x-forwarded-for over cf-connecting-ip", () => {
      const headers = new Headers({
        "x-forwarded-for": "192.168.1.100",
        "cf-connecting-ip": "203.0.113.1",
      });
      expect(extractClientIp(headers)).toBe("192.168.1.100");
    });

    it("should prefer x-real-ip over cf-connecting-ip", () => {
      const headers = new Headers({
        "x-real-ip": "10.0.0.50",
        "cf-connecting-ip": "203.0.113.1",
      });
      expect(extractClientIp(headers)).toBe("10.0.0.50");
    });
  });

  describe("no IP headers present", () => {
    it("should return 'unknown' when no IP headers are present", () => {
      const headers = new Headers({});
      expect(extractClientIp(headers)).toBe("unknown");
    });

    it("should return 'unknown' with only other headers", () => {
      const headers = new Headers({
        "user-agent": "test",
        "content-type": "application/json",
      });
      expect(extractClientIp(headers)).toBe("unknown");
    });
  });

  describe("IPv6 addresses", () => {
    it("should handle IPv6 addresses in x-forwarded-for", () => {
      const headers = new Headers({ "x-forwarded-for": "2001:db8::1" });
      expect(extractClientIp(headers)).toBe("2001:db8::1");
    });

    it("should handle IPv6 addresses in x-real-ip", () => {
      const headers = new Headers({ "x-real-ip": "fe80::1" });
      expect(extractClientIp(headers)).toBe("fe80::1");
    });
  });
});

describe("Module Extraction - extractKeyFromHeader (auth module)", () => {
  let auth: ApiKeyAuth;

  beforeEach(() => {
    ApiKeyAuth.resetInstance();
    auth = ApiKeyAuth.getInstance();
  });

  const extractKeyFromHeader = (header: string): string | null => {
    // Test the extraction logic by checking if auth succeeds or fails with format errors
    const result = auth.authenticate(header);
    if (result.error?.includes("Invalid Authorization header format")) {
      return null;
    }
    if (result.error?.includes("Missing Authorization header")) {
      return null;
    }
    // If it's any other error (like invalid key), the extraction succeeded
    return result.success || result.error?.includes("Invalid API key")
      ? "extracted"
      : null;
  };

  describe("Bearer scheme", () => {
    it("should extract key from 'Bearer <key>' format", () => {
      // Add a test key first
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
      const result = auth.authenticate("Bearer valid-key-123456789012");
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("test");
    });

    it("should accept lowercase 'bearer'", () => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
      const result = auth.authenticate("bearer valid-key-123456789012");
      expect(result.success).toBe(true);
    });

    it("should accept mixed case 'BeArEr'", () => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
      const result = auth.authenticate("BeArEr valid-key-123456789012");
      expect(result.success).toBe(true);
    });
  });

  describe("Api-Key scheme", () => {
    it("should extract key from 'Api-Key <key>' format", () => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
      const result = auth.authenticate("Api-Key valid-key-123456789012");
      expect(result.success).toBe(true);
    });

    it("should accept lowercase 'api-key'", () => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
      const result = auth.authenticate("api-key valid-key-123456789012");
      expect(result.success).toBe(true);
    });

    it("should accept mixed case 'ApI-kEy'", () => {
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
      const result = auth.authenticate("ApI-kEy valid-key-123456789012");
      expect(result.success).toBe(true);
    });
  });

  describe("invalid formats", () => {
    beforeEach(() => {
      // Add a key to enable authentication
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
      });
    });

    it("should reject missing Authorization header", () => {
      const result = auth.authenticate(null);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing Authorization header");
    });

    it("should reject single token without scheme", () => {
      const result = auth.authenticate("just-a-key");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });

    it("should reject more than two parts", () => {
      const result = auth.authenticate("Bearer key extra");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });

    it("should reject invalid scheme", () => {
      const result = auth.authenticate("InvalidScheme key");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });

    it("should reject empty scheme", () => {
      const result = auth.authenticate(" key");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });

    it("should reject empty key (format error before length check)", () => {
      const result = auth.authenticate("Bearer ");
      // Empty key after "Bearer " results in format error since split(" ") won't return 2 parts
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });
  });

  describe("key value extraction", () => {
    beforeEach(() => {
      auth.addKey("test", "test-key-with-dashes-123", {
        name: "test",
        active: true,
      });
    });

    it("should extract key with special characters", () => {
      const result = auth.authenticate("Bearer test-key-with-dashes-123");
      expect(result.success).toBe(true);
    });

    it("should extract key with underscores", () => {
      auth.addKey("test2", "test_key_with_underscores", {
        name: "test2",
        active: true,
      });
      const result = auth.authenticate("Bearer test_key_with_underscores");
      expect(result.success).toBe(true);
    });

    it("should extract key with dots", () => {
      auth.addKey("test3", "test.key.with.dots", {
        name: "test3",
        active: true,
      });
      const result = auth.authenticate("Bearer test.key.with.dots");
      expect(result.success).toBe(true);
    });
  });
});
