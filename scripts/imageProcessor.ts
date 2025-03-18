import sharp from 'sharp';
import path from 'node:path';

export async function processImage(inputBuffer, outputPath, maxWidth = 1280) {
  try {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    let pipeline = image.resize({ width: maxWidth, fit: 'inside', withoutEnlargement: true });

    // Determine output format based on original image
    const ext = path.extname(outputPath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        pipeline = pipeline.jpeg({ quality: 80 });
        break;
      case '.png':
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
      case '.webp':
        pipeline = pipeline.webp({ quality: 80 });
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
