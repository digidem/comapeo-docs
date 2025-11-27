/**
 * Tests for Expired URL Detection (Phase 2)
 *
 * Tests the isExpiredUrlError() helper function that detects
 * when a 403 error is specifically due to an expired Notion image URL.
 */

import { describe, it, expect } from "vitest";
import { isExpiredUrlError } from "../imageProcessing";

describe("Expired URL Detection", () => {
  describe("isExpiredUrlError()", () => {
    it("should return true for 403 with SignatureDoesNotMatch", () => {
      const error = {
        response: {
          status: 403,
          data: "SignatureDoesNotMatch: The request signature we calculated does not match the signature you provided",
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should return true for 403 with Request has expired", () => {
      const error = {
        response: {
          status: 403,
          data: "Request has expired",
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should return true for 403 with expired in message", () => {
      const error = {
        response: {
          status: 403,
          data: "The URL has expired",
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should return true for 403 with Signature expired", () => {
      const error = {
        response: {
          status: 403,
          data: "Signature expired: 20251127T120000Z is now earlier than 20251127T130000Z",
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should return true for expired in error message", () => {
      const error = {
        message: "Request failed: URL expired",
        response: {
          status: 403,
          data: "",
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should return true for signature in error message", () => {
      const error = {
        message: "signature validation failed",
        response: {
          status: 403,
          data: "",
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should return false for 403 without expiration indicators", () => {
      const error = {
        response: {
          status: 403,
          data: "Access Denied",
        },
      };

      expect(isExpiredUrlError(error)).toBe(false);
    });

    it("should return false for 404 error", () => {
      const error = {
        response: {
          status: 404,
          data: "Not Found",
        },
      };

      expect(isExpiredUrlError(error)).toBe(false);
    });

    it("should return false for 500 error", () => {
      const error = {
        response: {
          status: 500,
          data: "Internal Server Error",
        },
      };

      expect(isExpiredUrlError(error)).toBe(false);
    });

    it("should return false for network errors without status", () => {
      const error = {
        message: "Network Error",
        code: "ECONNREFUSED",
      };

      expect(isExpiredUrlError(error)).toBe(false);
    });

    it("should handle error with no response", () => {
      const error = {
        message: "Something went wrong",
      };

      expect(isExpiredUrlError(error)).toBe(false);
    });

    it("should handle null/undefined error", () => {
      expect(isExpiredUrlError(null)).toBe(false);
      expect(isExpiredUrlError(undefined)).toBe(false);
    });

    it("should handle error with object response data", () => {
      const error = {
        response: {
          status: 403,
          data: {
            error: "SignatureDoesNotMatch",
            message: "The signature does not match",
          },
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should be case-insensitive for expiration indicators", () => {
      const error1 = {
        response: {
          status: 403,
          data: "SIGNATUREDOESNOTMATCH",
        },
      };

      const error2 = {
        response: {
          status: 403,
          data: "request has EXPIRED",
        },
      };

      expect(isExpiredUrlError(error1)).toBe(true);
      expect(isExpiredUrlError(error2)).toBe(true);
    });
  });

  describe("Real-world AWS S3 Error Formats", () => {
    it("should detect AWS S3 SignatureDoesNotMatch XML response", () => {
      const error = {
        response: {
          status: 403,
          data: `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>SignatureDoesNotMatch</Code>
  <Message>The request signature we calculated does not match the signature you provided.</Message>
  <RequestId>ABC123</RequestId>
</Error>`,
        },
      };

      expect(isExpiredUrlError(error)).toBe(true);
    });

    it("should detect AWS S3 RequestTimeTooSkewed error", () => {
      const error = {
        response: {
          status: 403,
          data: `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>RequestTimeTooSkewed</Code>
  <Message>The difference between the request time and the server's time is too large.</Message>
</Error>`,
        },
      };

      // This should be false as it's not an expiration issue
      expect(isExpiredUrlError(error)).toBe(false);
    });

    it("should detect AWS S3 AccessDenied without expiration", () => {
      const error = {
        response: {
          status: 403,
          data: `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied</Message>
</Error>`,
        },
      };

      expect(isExpiredUrlError(error)).toBe(false);
    });
  });
});
