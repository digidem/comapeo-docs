/**
 * CORS Middleware Tests
 *
 * Tests CORS behavior for:
 * - Allow-all mode (ALLOWED_ORIGINS unset)
 * - Allowed origins
 * - Disallowed origins
 * - No Origin header (same-origin requests)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  clearAllowedOriginsCache,
} from "./middleware/cors";

function expectStandardCorsHeaders(
  headers: Record<string, string> | Headers,
  expectedOrigin: string
): void {
  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    if (name === "Access-Control-Allow-Origin") {
      return headers["Access-Control-Allow-Origin"] ?? null;
    }
    if (name === "Access-Control-Allow-Methods") {
      return headers["Access-Control-Allow-Methods"] ?? null;
    }
    if (name === "Access-Control-Allow-Headers") {
      return headers["Access-Control-Allow-Headers"] ?? null;
    }
    return null;
  };

  expect(getHeader("Access-Control-Allow-Origin")).toBe(expectedOrigin);
  expect(getHeader("Access-Control-Allow-Methods")).toBe(
    "GET, POST, DELETE, OPTIONS"
  );
  expect(getHeader("Access-Control-Allow-Headers")).toBe(
    "Content-Type, Authorization"
  );
}

describe("CORS Middleware", () => {
  const ORIGINAL_ENV = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    // Reset ALLOWED_ORIGINS to original value after each test
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ENV;
    }
    // Clear the cache so changes to process.env take effect
    clearAllowedOriginsCache();
  });

  describe("Allow-all mode (ALLOWED_ORIGINS unset)", () => {
    beforeEach(() => {
      delete process.env.ALLOWED_ORIGINS;
    });

    it("should allow all origins with wildcard", () => {
      const headers = getCorsHeaders("https://example.com");
      expectStandardCorsHeaders(headers, "*");
    });

    it("should handle requests without Origin header", () => {
      const headers = getCorsHeaders(null);
      expectStandardCorsHeaders(headers, "*");
      expect(headers).not.toHaveProperty("Vary");
    });

    it("should not include Vary header in allow-all mode", () => {
      const headers = getCorsHeaders("https://example.com");
      expect(headers).not.toHaveProperty("Vary");
    });

    it("should handle preflight requests", () => {
      const response = handleCorsPreflightRequest("https://example.com");
      expect(response.status).toBe(204);
      expectStandardCorsHeaders(response.headers, "*");
      expect(response.headers.get("Vary")).toBeNull();
    });
  });

  describe("Restricted mode (ALLOWED_ORIGINS set)", () => {
    beforeEach(() => {
      process.env.ALLOWED_ORIGINS = "https://example.com,https://test.com";
    });

    describe("Allowed origins", () => {
      it("should echo back allowed origin", () => {
        const headers = getCorsHeaders("https://example.com");
        expectStandardCorsHeaders(headers, "https://example.com");
      });

      it("should handle multiple allowed origins", () => {
        const headers1 = getCorsHeaders("https://example.com");
        const headers2 = getCorsHeaders("https://test.com");

        expect(headers1["Access-Control-Allow-Origin"]).toBe(
          "https://example.com"
        );
        expect(headers2["Access-Control-Allow-Origin"]).toBe(
          "https://test.com"
        );
      });

      it("should include Vary: Origin header", () => {
        const headers = getCorsHeaders("https://example.com");
        expect(headers["Vary"]).toBe("Origin");
      });

      it("should handle preflight for allowed origins", () => {
        const response = handleCorsPreflightRequest("https://test.com");
        expect(response.status).toBe(204);
        expectStandardCorsHeaders(response.headers, "https://test.com");
        expect(response.headers.get("Vary")).toBe("Origin");
      });
    });

    describe("Disallowed origins", () => {
      it("should return empty headers for disallowed origin", () => {
        const headers = getCorsHeaders("https://evil.com");
        expect(headers).toEqual({});
      });

      it("should return empty headers for origin not in list", () => {
        const headers = getCorsHeaders("https://not-in-list.com");
        expect(headers).toEqual({});
      });

      it("should handle preflight for disallowed origins", () => {
        const response = handleCorsPreflightRequest("https://evil.com");
        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
        expect(response.headers.get("Vary")).toBeNull();
      });
    });

    describe("No Origin header (same-origin requests)", () => {
      it("should allow requests without Origin header", () => {
        const headers = getCorsHeaders(null);
        expectStandardCorsHeaders(headers, "*");
      });

      it("should not include Vary header for same-origin requests", () => {
        const headers = getCorsHeaders(null);
        expect(headers).not.toHaveProperty("Vary");
      });
    });
  });

  describe("Edge cases", () => {
    beforeEach(() => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
    });

    it("should handle origins with trailing spaces", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com, https://test.com ";
      const headers = getCorsHeaders("https://test.com");
      expect(headers["Access-Control-Allow-Origin"]).toBe("https://test.com");
    });

    it("should handle empty string in ALLOWED_ORIGINS", () => {
      process.env.ALLOWED_ORIGINS = "";
      const headers = getCorsHeaders("https://example.com");
      // Empty string is treated as allow-all mode
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should handle exact origin matching", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      const headers1 = getCorsHeaders("https://example.com");
      const headers2 = getCorsHeaders("https://example.com:443");
      const headers3 = getCorsHeaders("http://example.com");

      expect(headers1["Access-Control-Allow-Origin"]).toBe(
        "https://example.com"
      );
      expect(headers2).toEqual({});
      expect(headers3).toEqual({});
    });
  });

  describe("Standard CORS headers", () => {
    it("should always include standard CORS methods", () => {
      delete process.env.ALLOWED_ORIGINS;
      const headers = getCorsHeaders("https://example.com");
      expectStandardCorsHeaders(headers, "*");
      expect(headers).not.toHaveProperty("Vary");
    });

    it("should always include standard CORS headers", () => {
      delete process.env.ALLOWED_ORIGINS;
      const headers = getCorsHeaders("https://example.com");
      expectStandardCorsHeaders(headers, "*");
      expect(headers).not.toHaveProperty("Vary");
    });
  });
});
