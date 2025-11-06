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
const PNGQUANT_TIMEOUT_RAW = process.env.PNGQUANT_TIMEOUT_MS;
const PNGQUANT_TIMEOUT_MS =
  PNGQUANT_TIMEOUT_RAW && !Number.isNaN(Number(PNGQUANT_TIMEOUT_RAW))
    ? Math.max(Number(PNGQUANT_TIMEOUT_RAW), 1_000)
    : DEFAULT_PNGQUANT_TIMEOUT_MS;

async function compressPngWithTimeout(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "--quality",
      PNGQUANT_QUALITY,
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
        resolve(Buffer.concat(stdoutChunks));
      } else if (code === 99) {
        // Exit code 99 = quality too low (image already well-optimized)
        const stderr = Buffer.concat(stderrChunks).toString().trim();
        reject(new PngQualityTooLowError(PNGQUANT_QUALITY, stderr));
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
