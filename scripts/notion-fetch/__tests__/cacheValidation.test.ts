
import { describe, it, expect, vi, beforeEach } from "vitest";
import { containsExpiringUrls } from "../cacheLoaders";
import { isUrlExpiringSoon } from "../imageReplacer";

// Mock the module
vi.mock("../imageReplacer", () => ({
    isUrlExpiringSoon: vi.fn(),
    // Add other exports if needed by imports in cacheLoaders, 
    // but looking at cacheLoaders, it only imports isUrlExpiringSoon.
}));

describe("containsExpiringUrls", () => {
    beforeEach(() => {
        vi.mocked(isUrlExpiringSoon).mockReset();
        vi.mocked(isUrlExpiringSoon).mockImplementation((url) => url === "EXPIRING_URL");
    });

    it("should return false for null/undefined", () => {
        expect(containsExpiringUrls(null)).toBe(false);
        expect(containsExpiringUrls(undefined)).toBe(false);
    });

    it("should return true for simple expiring string", () => {
        expect(containsExpiringUrls("EXPIRING_URL")).toBe(true);
    });

    it("should return false for safe string", () => {
        expect(containsExpiringUrls("SAFE_URL")).toBe(false);
    });

    it("should find expiring URL in array", () => {
        expect(containsExpiringUrls(["SAFE", "EXPIRING_URL"])).toBe(true);
    });

    it("should find expiring URL in object", () => {
        expect(containsExpiringUrls({ key: "EXPIRING_URL" })).toBe(true);
    });

    it("should find expiring URL in nested structure", () => {
        const data = {
            level1: {
                level2: [
                    {
                        target: "EXPIRING_URL"
                    }
                ]
            }
        };
        expect(containsExpiringUrls(data)).toBe(true);
    });

    it("should handle circular references safely", () => {
        const a: any = { val: "SAFE" };
        const b: any = { val: "SAFE", ref: a };
        a.ref = b;

        expect(containsExpiringUrls(a)).toBe(false);

        // If we introduce expiry in circular ref
        a.val = "EXPIRING_URL";
        expect(containsExpiringUrls(b)).toBe(true);
    });
});
