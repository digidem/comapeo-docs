import sharp from "sharp";
import path from "node:path";
import { withTimeout } from "./timeoutUtils";

// Sharp can hang on corrupted or oversized images - timeout after 30 seconds
const SHARP_TIMEOUT_MS = 30000;

export async function processImage(inputBuffer, outputPath, maxWidth = 1280) {
  try {
    const image = sharp(inputBuffer);

    let pipeline = image.resize({
      width: maxWidth,
      fit: "inside",
      withoutEnlargement: true,
    });

    // Determine output format based on original image
    const ext = path.extname(outputPath).toLowerCase();
    switch (ext) {
      case ".jpg":
      case ".jpeg":
        pipeline = pipeline.jpeg({ quality: 80 });
        break;
      case ".png":
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
      case ".webp":
        pipeline = pipeline.webp({ quality: 80 });
        break;
      // SVG doesn't need processing
      case ".svg":
        return {
          outputBuffer: inputBuffer,
          originalSize: inputBuffer.length,
          processedSize: inputBuffer.length,
        };
      default:
        throw new Error(`Unsupported image format: ${ext}`);
    }

    // Wrap sharp processing with timeout to prevent indefinite hangs
    const outputBuffer = await withTimeout(
      pipeline.toBuffer(),
      SHARP_TIMEOUT_MS,
      `sharp image processing (${ext})`
    );

    return {
      outputBuffer,
      originalSize: inputBuffer.length,
      processedSize: outputBuffer.length,
    };
  } catch (error) {
    console.error("Error processing image:", error);
    throw error;
  }
}
