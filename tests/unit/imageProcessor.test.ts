import { test, expect, describe } from "bun:test";
import { processImage } from "../../scripts/imageProcessor.js";

describe("Image Processor", () => {

  test("should handle SVG images correctly", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" /></svg>';
    const inputBuffer = Buffer.from(svgContent);
    const outputPath = "test-image.svg";

    const result = await processImage(inputBuffer, outputPath);

    // For SVGs, the output buffer should be the same as the input buffer
    expect(result.outputBuffer).toEqual(inputBuffer);
    expect(result.originalSize).toBe(inputBuffer.length);
    expect(result.processedSize).toBe(inputBuffer.length);
  });

  test("should throw an error for unsupported formats", async () => {
    const inputBuffer = Buffer.from("test-image-data");
    const outputPath = "test-image.xyz";

    await expect(processImage(inputBuffer, outputPath)).rejects.toThrow("Unsupported image format: .xyz");
  });
});
