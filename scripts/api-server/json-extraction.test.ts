/**
 * JSON Extraction Unit Tests
 *
 * Tests for extracting JSON from mixed log output.
 * This ensures that the count-pages job output can be correctly
 * parsed even when mixed with other log output.
 */

import { describe, it, expect } from "vitest";
import {
  extractLastJsonLine,
  extractAllJsonLines,
  isValidCountResult,
} from "./json-extraction";

describe("JSON Extraction - extractLastJsonLine", () => {
  describe("Basic extraction", () => {
    it("should extract JSON from clean output", () => {
      const output = '{"count":42,"parents":10,"subPages":32}';
      const result = extractLastJsonLine(output);

      expect(result).toBeDefined();
      expect(result).toEqual({ count: 42, parents: 10, subPages: 32 });
    });

    it("should extract JSON from mixed output", () => {
      const output = `Starting job...
Processing 5/10
{"count":42,"parents":10,"subPages":32,"byStatus":{"Ready":5,"Draft":3}}`;

      const result = extractLastJsonLine(output);

      expect(result).toBeDefined();
      expect(result).toEqual({
        count: 42,
        parents: 10,
        subPages: 32,
        byStatus: { Ready: 5, Draft: 3 },
      });
    });

    it("should extract the last JSON when multiple exist", () => {
      const output = `{"step":1}
{"step":2}
{"final":true}`;

      const result = extractLastJsonLine(output);

      expect(result).toEqual({ final: true });
    });
  });

  describe("Edge cases", () => {
    it("should return null for empty string", () => {
      const result = extractLastJsonLine("");
      expect(result).toBeNull();
    });

    it("should return null for non-JSON output", () => {
      const output = "Just some logs\nNo JSON here\n";
      const result = extractLastJsonLine(output);
      expect(result).toBeNull();
    });

    it("should return null for undefined input", () => {
      // @ts-expect-error - Testing undefined input
      const result = extractLastJsonLine(undefined);
      expect(result).toBeNull();
    });

    it("should handle whitespace-only output", () => {
      const output = "   \n\n  \n   ";
      const result = extractLastJsonLine(output);
      expect(result).toBeNull();
    });

    it("should return null when last line is malformed JSON", () => {
      const output = `Valid log
{"valid":true}
{invalid json}`;

      const result = extractLastJsonLine(output);

      // Should return null since the last "JSON-like" line is malformed
      expect(result).toBeNull();
    });
  });

  describe("Real-world count-pages scenarios", () => {
    it("should extract count result from typical job output", () => {
      const output = `🔍 Fetching pages from Notion...
📊 Processing pages...
📄 Total: 50 pages
{"total":50,"parents":20,"subPages":30,"byStatus":{"Ready to publish":15,"Draft":10,"In Review":25}}`;

      const result = extractLastJsonLine(output);

      expect(result).toBeDefined();
      expect(result).toEqual({
        total: 50,
        parents: 20,
        subPages: 30,
        byStatus: { "Ready to publish": 15, Draft: 10, "In Review": 25 },
      });
    });

    it("should handle debug output from sortAndExpandNotionData", () => {
      const output = `🔍 [DEBUG] applyFetchAllTransform called:
  - Input pages: 100
  - maxPages: undefined
📋 Page Inventory:
  - Parent pages: 25
📊 Status Summary:
  - Ready to publish: 15
{"total":25,"parents":25,"subPages":0,"byStatus":{"Ready to publish":15,"Draft":10}}`;

      const result = extractLastJsonLine(output);

      expect(result).toEqual({
        total: 25,
        parents: 25,
        subPages: 0,
        byStatus: { "Ready to publish": 15, Draft: 10 },
      });
    });

    it("should extract JSON with special characters in status names", () => {
      const output = `Processing...
{"total":10,"parents":5,"subPages":5,"byStatus":{"Ready to publish":3,"In Progress":2,"Not Started":5}}`;

      const result = extractLastJsonLine(output);

      expect(result).toEqual({
        total: 10,
        parents: 5,
        subPages: 5,
        byStatus: { "Ready to publish": 3, "In Progress": 2, "Not Started": 5 },
      });
    });

    it("should handle empty byStatus object", () => {
      const output = `No pages found
{"total":0,"parents":0,"subPages":0,"byStatus":{}}`;

      const result = extractLastJsonLine(output);

      expect(result).toEqual({
        total: 0,
        parents: 0,
        subPages: 0,
        byStatus: {},
      });
    });
  });
});

describe("JSON Extraction - extractAllJsonLines", () => {
  describe("Multiple JSON extraction", () => {
    it("should extract all JSON objects", () => {
      const output = `{"step":1}
{"step":2}
{"step":3}`;

      const results = extractAllJsonLines(output);

      expect(results).toHaveLength(3);
      expect(results).toEqual([{ step: 1 }, { step: 2 }, { step: 3 }]);
    });

    it("should extract mixed objects and arrays", () => {
      const output = `{"count":10}
[1,2,3]
{"items":["a","b"]}`;

      const results = extractAllJsonLines(output);

      expect(results).toHaveLength(3);
      expect(results).toEqual([
        { count: 10 },
        [1, 2, 3],
        { items: ["a", "b"] },
      ]);
    });

    it("should skip non-JSON lines", () => {
      const output = `Starting...
{"first":true}
Processing...
{"second":true}
Done!`;

      const results = extractAllJsonLines(output);

      expect(results).toHaveLength(2);
      expect(results).toEqual([{ first: true }, { second: true }]);
    });
  });

  describe("Edge cases", () => {
    it("should return empty array for empty input", () => {
      const results = extractAllJsonLines("");
      expect(results).toEqual([]);
    });

    it("should return empty array for null input", () => {
      // @ts-expect-error - Testing null input
      const results = extractAllJsonLines(null);
      expect(results).toEqual([]);
    });

    it("should handle input with only non-JSON lines", () => {
      const output = "Just logs\nNo JSON\nHere";
      const results = extractAllJsonLines(output);
      expect(results).toEqual([]);
    });
  });
});

describe("JSON Extraction - isValidCountResult", () => {
  describe("Valid count results", () => {
    it("should accept valid count result", () => {
      const result = {
        total: 50,
        parents: 20,
        subPages: 30,
        byStatus: { Ready: 10, Draft: 40 },
      };

      expect(isValidCountResult(result)).toBe(true);
    });

    it("should accept result with empty byStatus", () => {
      const result = {
        total: 0,
        parents: 0,
        subPages: 0,
        byStatus: {},
      };

      expect(isValidCountResult(result)).toBe(true);
    });

    it("should accept result with all zero values", () => {
      const result = {
        total: 0,
        parents: 0,
        subPages: 0,
        byStatus: {},
      };

      expect(isValidCountResult(result)).toBe(true);
    });
  });

  describe("Invalid count results", () => {
    it("should reject null", () => {
      expect(isValidCountResult(null)).toBe(false);
    });

    it("should reject undefined", () => {
      expect(isValidCountResult(undefined)).toBe(false);
    });

    it("should reject non-object types", () => {
      expect(isValidCountResult("string")).toBe(false);
      expect(isValidCountResult(123)).toBe(false);
      expect(isValidCountResult([])).toBe(false);
    });

    it("should reject object missing total field", () => {
      const result = {
        parents: 10,
        subPages: 5,
        byStatus: {},
      };

      expect(isValidCountResult(result)).toBe(false);
    });

    it("should reject object missing parents field", () => {
      const result = {
        total: 15,
        subPages: 5,
        byStatus: {},
      };

      expect(isValidCountResult(result)).toBe(false);
    });

    it("should reject object missing subPages field", () => {
      const result = {
        total: 15,
        parents: 10,
        byStatus: {},
      };

      expect(isValidCountResult(result)).toBe(false);
    });

    it("should reject object missing byStatus field", () => {
      const result = {
        total: 15,
        parents: 10,
        subPages: 5,
      };

      expect(isValidCountResult(result)).toBe(false);
    });

    it("should reject object with wrong field types", () => {
      expect(
        isValidCountResult({
          total: "not a number",
          parents: 10,
          subPages: 5,
          byStatus: {},
        })
      ).toBe(false);

      expect(
        isValidCountResult({
          total: 15,
          parents: null,
          subPages: 5,
          byStatus: {},
        })
      ).toBe(false);

      expect(
        isValidCountResult({
          total: 15,
          parents: 10,
          subPages: 5,
          byStatus: "not an object",
        })
      ).toBe(false);
    });
  });
});

describe("JSON Extraction - Integration scenarios", () => {
  describe("Full workflow tests", () => {
    it("should extract and validate a complete count result", () => {
      const jobOutput = `🔍 [DEBUG] applyFetchAllTransform called:
  - Input pages: 100
📋 Page Inventory:
  - Parent pages: 25
📊 Status Summary:
  - Ready to publish: 15
  - Draft: 10
{"total":25,"parents":25,"subPages":0,"byStatus":{"Ready to publish":15,"Draft":10}}`;

      const extracted = extractLastJsonLine(jobOutput);
      expect(extracted).toBeDefined();

      expect(isValidCountResult(extracted)).toBe(true);

      if (isValidCountResult(extracted)) {
        expect(extracted.total).toBe(25);
        expect(extracted.parents).toBe(25);
        expect(extracted.byStatus["Ready to publish"]).toBe(15);
      }
    });

    it("should handle multiple job outputs and find the last one", () => {
      const jobOutput = `{"step":"fetch","progress":0.5}
{"step":"process","progress":0.8}
{"total":100,"parents":40,"subPages":60,"byStatus":{"Done":100}}`;

      const extracted = extractLastJsonLine(jobOutput);
      expect(isValidCountResult(extracted)).toBe(true);

      if (isValidCountResult(extracted)) {
        expect(extracted.total).toBe(100);
      }
    });

    it("should handle graceful degradation when JSON is malformed", () => {
      const jobOutput = `Some log output
{invalid json}
{"total":5,"parents":5,"subPages":0,"byStatus":{}}`;

      const extracted = extractLastJsonLine(jobOutput);
      expect(isValidCountResult(extracted)).toBe(true);

      if (isValidCountResult(extracted)) {
        expect(extracted.total).toBe(5);
      }
    });

    it("should return null and not throw on completely invalid output", () => {
      const invalidOutputs = ["", "just text", "{malformed", "[]{}", "\n\n\n"];

      for (const output of invalidOutputs) {
        expect(() => extractLastJsonLine(output)).not.toThrow();
        const result = extractLastJsonLine(output);
        expect(result === null || typeof result === "object").toBe(true);
      }
    });
  });
});
