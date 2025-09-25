import imagemin from "imagemin";
import imageminJpegtran from "imagemin-jpegtran";
import imageminPngquant from "imagemin-pngquant";
import imageminSvgo from "imagemin-svgo";
import imageminWebp from "imagemin-webp";

/**
 * Best-effort sniffing of image format from buffer magic bytes.
 * We keep this minimal to avoid new runtime dependencies.
 */
function detectFormatFromBuffer(
  buf: Buffer
): "jpeg" | "png" | "webp" | "svg" | "gif" | "unknown" {
  if (!buf || buf.length < 12) return "unknown";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "gif";

  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }

  // SVG: textual XML containing "<svg"
  try {
    const head = buf
      .toString("utf8", 0, Math.min(buf.length, 512))
      .toLowerCase();
    if (head.includes("<svg")) return "svg";
  } catch {
    // ignore decoding errors
  }

  return "unknown";
}

/**
 * Compress image buffer without changing its format.
 * - JPEG => jpegtran
 * - PNG  => pngquant
 * - SVG  => svgo
 * - WEBP => webp (re-encode webp only)
 * - GIF/unknown => passthrough (no conversion)
 */
export async function compressImage(inputBuffer: Buffer) {
  try {
    const format = detectFormatFromBuffer(inputBuffer);

    // Choose plugins based on detected format to avoid cross-format conversions.
    let plugins: unknown[] = [];
    switch (format) {
      case "jpeg":
        plugins = [imageminJpegtran()];
        break;
      case "png":
        plugins = [imageminPngquant({ quality: [0.6, 0.8] })];
        break;
      case "svg":
        plugins = [
          imageminSvgo({
            plugins: [{ name: "removeViewBox", active: false }],
          }),
        ];
        break;
      case "webp":
        plugins = [imageminWebp({ quality: 75 })];
        break;
      // For GIF or unknown formats, do not attempt optimization to avoid format changes.
      default:
        return {
          compressedBuffer: inputBuffer,
          originalSize: inputBuffer.length,
          compressedSize: inputBuffer.length,
        };
    }

    const compressedBuffer = await imagemin.buffer(inputBuffer, { plugins });
    return {
      compressedBuffer,
      originalSize: inputBuffer.length,
      compressedSize: compressedBuffer.length,
    };
  } catch (error) {
    console.error("Error compressing image:", error);
    throw error;
  }
}
