import { describe, it, expect } from "vitest";
import { isUrlExpiringSoon } from "../imageReplacer";

describe("isUrlExpiringSoon", () => {
  const NOW = 1700000000000; // Fixed time for consistent testing
  const ONE_HOUR = 3600;

  // Helper to mock Date.now()
  const withMockedTime = (fn: () => void) => {
    const originalNow = Date.now;
    Date.now = () => NOW;
    try {
      fn();
    } finally {
      Date.now = originalNow;
    }
  };

  it("should return false for non-S3 URLs", () => {
    const url = "https://example.com/image.png";
    expect(isUrlExpiringSoon(url)).toBe(false);
  });

  it("should return false for S3 URLs without expiration params", () => {
    const url = "https://s3.us-west-2.amazonaws.com/bucket/image.png";
    expect(isUrlExpiringSoon(url)).toBe(false);
  });

  describe("X-Amz-Expires + X-Amz-Date", () => {
    it("should return true if expiring soon", () => {
      withMockedTime(() => {
        // Signature time: NOW - 50 mins
        // Expires: 1 hour (3600s)
        // Remaining: 10 mins (600s)
        // Threshold: 15 mins (900s) -> should be true
        // Wait, Date.now() is NOW.
        // X-Amz-Date needs to be formatted as YYYYMMDDTHHMMSSZ

        const date = new Date(NOW - 50 * 60 * 1000);
        // Manually format to UTC YYYYMMDDTHHMMSSZ
        const pad = (n: number) => n.toString().padStart(2, "0");
        const amzDate = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

        const url = `https://s3.amazonaws.com/bucket/obj?X-Amz-Date=${amzDate}&X-Amz-Expires=${ONE_HOUR}`;
        // Expiration time = signature time + 1 hour = NOW - 50min + 60min = NOW + 10min
        // Time left = 10min = 600s
        // Default threshold = 300s (5min) -> should be FALSE (wait, 600s > 300s)

        // Let's use a smaller remaining time
        // Signature time: NOW - 58 mins
        // Remaining: 2 mins (120s)
        // Threshold: 300s -> should be TRUE

        const date2 = new Date(NOW - 58 * 60 * 1000);
        const amzDate2 = `${date2.getUTCFullYear()}${pad(date2.getUTCMonth() + 1)}${pad(date2.getUTCDate())}T${pad(date2.getUTCHours())}${pad(date2.getUTCMinutes())}${pad(date2.getUTCSeconds())}Z`;
        const url2 = `https://s3.amazonaws.com/bucket/obj?X-Amz-Date=${amzDate2}&X-Amz-Expires=${ONE_HOUR}`;

        expect(isUrlExpiringSoon(url2)).toBe(true);
      });
    });

    it("should return false if plenty of time left", () => {
      withMockedTime(() => {
        // Signature time: NOW (fresh)
        // Expires: 1 hour
        // Time left: 60 mins
        // Threshold: 5 mins -> FALSE

        const date = new Date(NOW);
        const pad = (n: number) => n.toString().padStart(2, "0");
        const amzDate = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

        const url = `https://s3.amazonaws.com/bucket/obj?X-Amz-Date=${amzDate}&X-Amz-Expires=${ONE_HOUR}`;
        expect(isUrlExpiringSoon(url)).toBe(false);
      });
    });
  });

  describe("Expires (Unix Timestamp)", () => {
    it("should return true if expiring soon", () => {
      withMockedTime(() => {
        // Expires in 2 mins
        const expires = Math.floor(NOW / 1000) + 120;
        // Use a URL structure that matches SECURE_NOTION_STATIC_S3_REGEX
        const url = `https://s3.us-west-2.amazonaws.com/secure.notion-static.com/obj?Expires=${expires}`;
        expect(isUrlExpiringSoon(url)).toBe(true);
      });
    });

    it("should return false if plenty of time left", () => {
      withMockedTime(() => {
        // Expires in 1 hour
        const expires = Math.floor(NOW / 1000) + 3600;
        const url = `https://s3.us-west-2.amazonaws.com/secure.notion-static.com/obj?Expires=${expires}`;
        expect(isUrlExpiringSoon(url)).toBe(false);
      });
    });
  });
});
