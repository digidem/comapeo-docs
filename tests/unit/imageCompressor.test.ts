import { test, expect, describe } from "bun:test";
import { compressImage } from "../../scripts/imageCompressor.js";

describe.skip("Image Compressor", () => {

  test("should handle errors gracefully", async () => {
    // Create an invalid image buffer that will cause an error
    const inputBuffer = Buffer.from("invalid-image-data");

    // The function should return the original buffer when an error occurs
    const result = await compressImage(inputBuffer);

    // Verify that the result is the original buffer
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toBe(inputBuffer);
  });

  test("should return a buffer", async () => {
    // Create a simple SVG image buffer (which won't be compressed but will be processed)
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4" /></svg>';
    const inputBuffer = Buffer.from(svgContent);

    const result = await compressImage(inputBuffer);

    // Verify that the result is a buffer
    expect(Buffer.isBuffer(result)).toBe(true);
  });
});
