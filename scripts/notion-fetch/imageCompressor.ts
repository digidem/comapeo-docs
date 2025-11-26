import imagemin from "imagemin";
import imageminJpegtran from "imagemin-jpegtran";
import imageminSvgo from "imagemin-svgo";
import imageminWebp from "imagemin-webp";
import { spawn } from "node:child_process";
import pngquantBin from "pngquant-bin";

/**
 * Custom error for pngquant exit code 99 (quality too low)
 * This indicates the image cannot be compressed within the requested quality range,
 * typically because it's already well-optimized.
 */
export class PngQualityTooLowError extends Error {
  code = 99;
  quality: string;
  stderr: string;

  constructor(quality: string, stderr: string) {
    super(
      `PNG quality too low with settings ${quality}. Image may already be optimized.${stderr ? ` Details: ${stderr}` : ""}`
    );
    this.name = "PngQualityTooLowError";
    this.quality = quality;
    this.stderr = stderr;
  }
}

const DEFAULT_PNGQUANT_TIMEOUT_MS = 30_000;
const PNGQUANT_SPEED = process.env.PNGQUANT_SPEED ?? "3";
const PNGQUANT_QUALITY =
  process.env.PNGQUANT_QUALITY ??
  (process.env.PNGQUANT_MIN_QUALITY && process.env.PNGQUANT_MAX_QUALITY
    ? `${process.env.PNGQUANT_MIN_QUALITY}-${process.env.PNGQUANT_MAX_QUALITY}`
    : "60-80");

// Fallback quality when primary quality fails (exit code 99)
// Set to empty string to disable fallback retry
const PNGQUANT_FALLBACK_QUALITY =
  process.env.PNGQUANT_FALLBACK_QUALITY ?? "0-100";

// Enable verbose logging for compression details
const PNGQUANT_VERBOSE = process.env.PNGQUANT_VERBOSE?.toLowerCase() === "true";

// Minimum file size to attempt compression (bytes)
// Files smaller than this will skip compression to save time
// Default: 0 (no minimum, compress all files)
const PNGQUANT_MIN_SIZE_BYTES = Number.parseInt(
  process.env.PNGQUANT_MIN_SIZE_BYTES ?? "0",
  10
);

const PNGQUANT_TIMEOUT_RAW = process.env.PNGQUANT_TIMEOUT_MS;
const PNGQUANT_TIMEOUT_MS =
  PNGQUANT_TIMEOUT_RAW && !Number.isNaN(Number(PNGQUANT_TIMEOUT_RAW))
    ? Math.max(Number(PNGQUANT_TIMEOUT_RAW), 1_000)
    : DEFAULT_PNGQUANT_TIMEOUT_MS;

/**
 * Check if PNG buffer contains optimization markers indicating it's already optimized
 */
function hasOptimizationMarkers(buffer: Buffer): boolean {
  const markers = [
    "pngquant", // pngquant optimizer
    "OptiPNG", // OptiPNG optimizer
    "ImageOptim", // ImageOptim
    "TinyPNG", // TinyPNG service
    "pngcrush", // pngcrush optimizer
  ];

  // Convert buffer to string for searching (check first 4KB for performance)
  const header = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));

  return markers.some((marker) => header.includes(marker));
}

/**
 * Detect PNG bit depth from IHDR chunk
 * Returns bit depth (1, 2, 4, 8, 16) or null if not found
 */
function detectPngBitDepth(buffer: Buffer): number | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 30) return null;
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return null;
  }

  // IHDR chunk starts at byte 8
  // Chunk structure: 4 bytes length, 4 bytes type, N bytes data, 4 bytes CRC
  // IHDR type: 49 48 44 52 ("IHDR")
  if (
    buffer[12] === 0x49 &&
    buffer[13] === 0x48 &&
    buffer[14] === 0x44 &&
    buffer[15] === 0x52
  ) {
    // Bit depth is at offset 24 (8 + 4 + 4 + 4 + 4)
    // Width (4 bytes) + Height (4 bytes) + Bit depth (1 byte)
    return buffer[24];
  }

  return null;
}

/**
 * Determine if PNG should skip compression based on heuristics
 * Returns reason string if should skip, null if should attempt compression
 */
function shouldSkipPngCompression(buffer: Buffer): string | null {
  // Check file size threshold
  if (PNGQUANT_MIN_SIZE_BYTES > 0 && buffer.length < PNGQUANT_MIN_SIZE_BYTES) {
    return `file too small (${buffer.length} bytes < ${PNGQUANT_MIN_SIZE_BYTES} bytes threshold)`;
  }

  // Check for optimization markers
  if (hasOptimizationMarkers(buffer)) {
    return "already optimized (contains optimizer markers)";
  }

  // Check bit depth - low bit depth images are typically already optimized
  const bitDepth = detectPngBitDepth(buffer);
  if (bitDepth !== null && bitDepth <= 4) {
    return `already optimized (low bit depth: ${bitDepth}-bit)`;
  }

  return null; // Should attempt compression
}

async function compressPngWithTimeout(
  buffer: Buffer,
  quality: string = PNGQUANT_QUALITY,
  isRetry: boolean = false
): Promise<Buffer> {
  if (PNGQUANT_VERBOSE) {
    console.debug(
      `[pngquant] Attempting compression with quality ${quality}${isRetry ? " (retry)" : ""}`
    );
  }

  return new Promise((resolve, reject) => {
    const args = [
      "--quality",
      quality,
      "--speed",
      PNGQUANT_SPEED,
      "--strip",
      "-",
    ];

    const child = spawn(pngquantBin, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let finished = false;

    const cleanup = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.stdin.removeAllListeners();
      if (error) {
        reject(error);
      }
    };

    const timeoutId = setTimeout(() => {
      child.kill("SIGKILL");
      const timeoutError = new Error(
        `pngquant timed out after ${PNGQUANT_TIMEOUT_MS}ms`
      );
      cleanup(timeoutError);
    }, PNGQUANT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      cleanup(error instanceof Error ? error : new Error(String(error)));
    });

    child.stdin.on("error", (error) => {
      cleanup(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      if (code === 0) {
        if (stdoutChunks.length === 0) {
          const message =
            Buffer.concat(stderrChunks).toString().trim() ||
            "pngquant produced no output";
          reject(new Error(message));
          return;
        }
        if (PNGQUANT_VERBOSE) {
          console.debug(
            `[pngquant] Compression succeeded with quality ${quality}`
          );
        }
        resolve(Buffer.concat(stdoutChunks));
      } else if (code === 99) {
        // Exit code 99 = quality too low (image already well-optimized)
        const stderr = Buffer.concat(stderrChunks).toString().trim();

        // Retry with fallback quality if not already retried and fallback is configured
        if (!isRetry && PNGQUANT_FALLBACK_QUALITY) {
          if (PNGQUANT_VERBOSE) {
            console.debug(
              `[pngquant] Quality too low (exit 99), retrying with fallback quality ${PNGQUANT_FALLBACK_QUALITY}`
            );
          }

          // Retry once with more lenient quality settings
          compressPngWithTimeout(buffer, PNGQUANT_FALLBACK_QUALITY, true)
            .then(resolve)
            .catch(reject);
        } else {
          // No retry configured or already retried - reject with quality error
          reject(new PngQualityTooLowError(quality, stderr));
        }
      } else {
        const stderr = Buffer.concat(stderrChunks).toString().trim();
        reject(
          new Error(stderr || `pngquant exited with code ${code ?? "unknown"}`)
        );
      }
    });

    child.stdin.end(buffer);
  });
}

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
 * - PNG  => pngquant (with enforced timeout + kill guard)
 * - SVG  => svgo
 * - WEBP => webp (re-encode webp only)
 * - GIF/unknown => passthrough (no conversion)
 */
export async function compressImage(inputBuffer: Buffer) {
  const format = detectFormatFromBuffer(inputBuffer);

  try {
    // Choose plugins based on detected format to avoid cross-format conversions.
    switch (format) {
      case "jpeg": {
        const compressedBuffer = await imagemin.buffer(inputBuffer, {
          plugins: [imageminJpegtran()],
        });
        return {
          compressedBuffer,
          originalSize: inputBuffer.length,
          compressedSize: compressedBuffer.length,
        };
      }
      case "png": {
        // Check if we should skip compression based on heuristics
        const skipReason = shouldSkipPngCompression(inputBuffer);
        if (skipReason) {
          if (PNGQUANT_VERBOSE) {
            console.debug(`[pngquant] Skipping compression: ${skipReason}`);
          }
          return {
            compressedBuffer: inputBuffer,
            originalSize: inputBuffer.length,
            compressedSize: inputBuffer.length,
          };
        }

        const compressedBuffer = await compressPngWithTimeout(inputBuffer);
        return {
          compressedBuffer,
          originalSize: inputBuffer.length,
          compressedSize: compressedBuffer.length,
        };
      }
      case "svg": {
        const compressedBuffer = await imagemin.buffer(inputBuffer, {
          plugins: [
            imageminSvgo({
              plugins: [{ name: "removeViewBox", active: false }],
            }),
          ],
        });
        return {
          compressedBuffer,
          originalSize: inputBuffer.length,
          compressedSize: compressedBuffer.length,
        };
      }
      case "webp": {
        const compressedBuffer = await imagemin.buffer(inputBuffer, {
          plugins: [imageminWebp({ quality: 75 })],
        });
        return {
          compressedBuffer,
          originalSize: inputBuffer.length,
          compressedSize: compressedBuffer.length,
        };
      }
      // For GIF or unknown formats, do not attempt optimization to avoid format changes.
      default:
        return {
          compressedBuffer: inputBuffer,
          originalSize: inputBuffer.length,
          compressedSize: inputBuffer.length,
        };
    }
  } catch (error) {
    // Special handling for PNG quality errors (exit code 99)
    // These are not real errors - the image is just already well-optimized
    if (error instanceof PngQualityTooLowError && format === "png") {
      // Return original image without logging error (not a failure)
      return {
        compressedBuffer: inputBuffer,
        originalSize: inputBuffer.length,
        compressedSize: inputBuffer.length,
      };
    }

    // For other errors, re-throw to be handled by fallback logic in utils.ts
    // Don't log here to avoid double logging (utils.ts will log with full context)
    throw error;
  }
}
