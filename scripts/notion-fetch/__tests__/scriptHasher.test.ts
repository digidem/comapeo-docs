import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import {
  computeScriptHash,
  isScriptHashChanged,
  formatScriptHashSummary,
  CRITICAL_SCRIPT_FILES,
} from "../scriptHasher";

describe("scriptHasher", () => {
  describe("CRITICAL_SCRIPT_FILES", () => {
    it("should contain expected critical files", () => {
      expect(CRITICAL_SCRIPT_FILES).toContain(
        "scripts/notion-fetch/generateBlocks.ts"
      );
      expect(CRITICAL_SCRIPT_FILES).toContain("scripts/constants.ts");
      expect(CRITICAL_SCRIPT_FILES).toContain(
        "scripts/notion-fetch/imageReplacer.ts"
      );
    });

    it("should have reasonable number of files", () => {
      expect(CRITICAL_SCRIPT_FILES.length).toBeGreaterThan(15);
      expect(CRITICAL_SCRIPT_FILES.length).toBeLessThan(50);
    });
  });

  describe("computeScriptHash", () => {
    it("should compute hash from available files", async () => {
      const result = await computeScriptHash();

      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(64); // SHA256 hex length
      expect(result.filesHashed).toBeGreaterThan(0);
    });

    it("should produce deterministic hash", async () => {
      const result1 = await computeScriptHash();
      const result2 = await computeScriptHash();

      expect(result1.hash).toBe(result2.hash);
    });

    it("should track missing files", async () => {
      // Some files might be missing if not all exist
      const result = await computeScriptHash();

      expect(result.missingFiles).toBeDefined();
      expect(Array.isArray(result.missingFiles)).toBe(true);
    });
  });

  describe("isScriptHashChanged", () => {
    it("should return true when cached hash is undefined", () => {
      expect(isScriptHashChanged("abc123", undefined)).toBe(true);
    });

    it("should return true when hashes differ", () => {
      expect(isScriptHashChanged("abc123", "def456")).toBe(true);
    });

    it("should return false when hashes match", () => {
      expect(isScriptHashChanged("abc123", "abc123")).toBe(false);
    });
  });

  describe("formatScriptHashSummary", () => {
    it("should format summary correctly", () => {
      const result = {
        hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        filesHashed: 25,
        missingFiles: [],
      };

      const summary = formatScriptHashSummary(result);

      expect(summary).toContain("Script hash: abcdef123456...");
      expect(summary).toContain("Files hashed: 25/");
    });

    it("should include missing files if any", () => {
      const result = {
        hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        filesHashed: 23,
        missingFiles: ["scripts/missing.ts", "scripts/notfound.ts"],
      };

      const summary = formatScriptHashSummary(result);

      expect(summary).toContain("Missing files:");
      expect(summary).toContain("scripts/missing.ts");
      expect(summary).toContain("scripts/notfound.ts");
    });
  });
});
