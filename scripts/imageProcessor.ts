import sharp from 'sharp';
import path from 'node:path';
import { IMAGE_MAX_WIDTH, JPEG_QUALITY, PNG_COMPRESSION_LEVEL, WEBP_QUALITY } from './constants.js';

export async function processImage(inputBuffer, outputPath, maxWidth = IMAGE_MAX_WIDTH) {
  try {
    const image = sharp(inputBuffer);
    let pipeline = image.resize({ width: maxWidth, fit: 'inside', withoutEnlargement: true });

    // Determine output format based on original image
    const ext = path.extname(outputPath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        pipeline = pipeline.jpeg({ quality: JPEG_QUALITY });
        break;
      case '.png':
        pipeline = pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL });
        break;
      case '.webp':
        pipeline = pipeline.webp({ quality: WEBP_QUALITY });
        break;
      // SVG doesn't need processing
      case '.svg':
        return { outputBuffer: inputBuffer, originalSize: inputBuffer.length, processedSize: inputBuffer.length };
      default:
        throw new Error(`Unsupported image format: ${ext}`);
    }

    const outputBuffer = await pipeline.toBuffer();
    return { outputBuffer, originalSize: inputBuffer.length, processedSize: outputBuffer.length };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}
