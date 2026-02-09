/**
 * JSON Extraction Utilities
 *
 * Utilities for extracting JSON from mixed log output.
 * When scripts output both logs and JSON, we need to extract
 * the JSON line(s) from the mixed output.
 */

/**
 * Extract the last JSON object from mixed output.
 * This handles cases where scripts log output before the final JSON result.
 *
 * @param output - Mixed stdout containing logs and JSON
 * @returns Parsed JSON object or null if no valid JSON found
 *
 * @example
 * ```ts
 * const output = `Starting job...
 * Processing 5/10
 * {"count":42,"parents":10,"subPages":32,"byStatus":{}}`;
 * const result = extractLastJsonLine(output);
 * // { count: 42, parents: 10, subPages: 32, byStatus: {} }
 * ```
 */
export function extractLastJsonLine(output: string): unknown | null {
  if (!output || typeof output !== "string") {
    return null;
  }

  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  // Find lines that start with '{' (potential JSON objects)
  const jsonLines = lines.filter((line) => line.trim().startsWith("{"));

  if (jsonLines.length === 0) {
    return null;
  }

  // Parse the last JSON line
  const lastJsonLine = jsonLines[jsonLines.length - 1]!.trim();

  try {
    return JSON.parse(lastJsonLine);
  } catch {
    return null;
  }
}

/**
 * Extract all JSON objects from mixed output.
 *
 * @param output - Mixed stdout containing logs and JSON
 * @returns Array of parsed JSON objects
 *
 * @example
 * ```ts
 * const output = `Starting...
 * {"step":1,"total":100}
 * Processing...
 * {"step":2,"total":100}`;
 * const results = extractAllJsonLines(output);
 * // [{ step: 1, total: 100 }, { step: 2, total: 100 }]
 * ```
 */
export function extractAllJsonLines(output: string): unknown[] {
  if (!output || typeof output !== "string") {
    return [];
  }

  const lines = output.split("\n").filter((line) => line.trim().length > 0);
  const results: unknown[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        results.push(JSON.parse(trimmed));
      } catch {
        // Skip invalid JSON
        continue;
      }
    }
  }

  return results;
}

/**
 * Validate that an object has required count result fields.
 *
 * @param obj - Object to validate
 * @returns True if object has all required fields
 */
export function isValidCountResult(obj: unknown): obj is {
  total: number;
  parents: number;
  subPages: number;
  byStatus: Record<string, number>;
} {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const record = obj as Record<string, unknown>;

  return (
    typeof record.total === "number" &&
    typeof record.parents === "number" &&
    typeof record.subPages === "number" &&
    typeof record.byStatus === "object" &&
    record.byStatus !== null
  );
}
