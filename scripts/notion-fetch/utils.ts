import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import { compressImage } from "./imageCompressor";
import { withTimeoutFallback } from "./timeoutUtils";

// Re-export sanitize so callers have a single utils entrypoint
export { sanitizeMarkdownContent } from "./contentSanitizer";

// Fail-open toggle: defaults to true unless explicitly set to 'false'
export const SOFT_FAIL: boolean =
  (process.env.IMG_OPTIMIZE_SOFT_FAIL ?? "true").toLowerCase() !== "false";

// Structured warning logger for optimizer failures (includes source url and root cause)
export function warnOptimizationFailure(
  sourceUrl: string,
  filepath: string,
  stage: string,
  err: unknown
) {
  const root =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { message: String(err) };
  console.warn(
    chalk.yellow(
      `[img-optimize:warn] stage=${stage} source=${sourceUrl} target=${filepath} softFail=${SOFT_FAIL} root=${JSON.stringify(root)}`
    )
  );
}

// --- Format detection helpers (keep WEBP as WEBP, avoid cross-format conversion) ---
export type ImgFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "svg"
  | "gif"
  | "avif"
  | "heic"
  | "unknown";

export function detectFormatFromBuffer(buf: Buffer): ImgFormat {
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
  // AVIF/HEIC (ISOBMFF) quick check: "...ftyp" then brand "avif"/"heic"/"heif"/"mif1"
  if (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
    if (brand === "avif" || brand === "avis") return "avif";
    if (
      brand === "heic" ||
      brand === "heif" ||
      brand === "mif1" ||
      brand === "heix" ||
      brand === "hevc" ||
      brand === "hevx"
    )
      return "heic";
  }
  // SVG: textual XML containing "<svg"
  try {
    const head = buf
      .toString("utf8", 0, Math.min(buf.length, 512))
      .toLowerCase();
    if (head.includes("<svg")) return "svg";
  } catch {
    /* ignore */
  }
  return "unknown";
}

export function formatFromContentType(ct?: string): ImgFormat {
  if (!ct) return "unknown";
  const lower = ct.toLowerCase();
  if (lower.includes("image/png")) return "png";
  if (lower.includes("image/jpeg") || lower.includes("image/jpg"))
    return "jpeg";
  if (lower.includes("image/webp")) return "webp";
  if (lower.includes("image/svg")) return "svg";
  if (lower.includes("image/gif")) return "gif";
  if (lower.includes("image/avif")) return "avif";
  if (lower.includes("image/heic") || lower.includes("image/heif"))
    return "heic";
  return "unknown";
}

export function chooseFormat(
  bufferFmt: ImgFormat,
  headerFmt: ImgFormat
): ImgFormat {
  // Prefer buffer magic bytes; fall back to header
  if (bufferFmt !== "unknown") return bufferFmt;
  if (headerFmt !== "unknown") return headerFmt;
  return "unknown";
}

export function extForFormat(fmt: ImgFormat): string {
  switch (fmt) {
    case "jpeg":
      return ".jpg";
    case "png":
      return ".png";
    case "webp":
      return ".webp";
    case "svg":
      return ".svg";
    case "gif":
      return ".gif";
    case "avif":
      return ".avif";
    case "heic":
      return ".heic";
    default:
      return ""; // unknown; let caller decide fallback
  }
}

export function isResizableFormat(fmt: ImgFormat): boolean {
  return fmt === "jpeg" || fmt === "png" || fmt === "webp";
}

// Timeout for overall compression operation (imagemin + all plugins)
// Individual plugins like pngquant have their own timeouts, but this ensures
// the entire compression doesn't hang indefinitely
const COMPRESS_TIMEOUT_MS = 45000; // 45 seconds (longer than pngquant's 30s timeout)

// Helper A: wrap in-memory optimization with fail-open semantics.
// Returns {buffer: Buffer to write, compressedSize: number, usedFallback: boolean}
export async function compressImageWithFallback(
  inputBuffer: Buffer,
  filepath: string,
  sourceUrl: string
): Promise<{ buffer: Buffer; compressedSize: number; usedFallback: boolean }> {
  try {
    // Wrap compression with timeout to prevent indefinite hangs
    // Falls back to original buffer on timeout
    const { compressedBuffer, compressedSize } = await withTimeoutFallback(
      compressImage(inputBuffer),
      COMPRESS_TIMEOUT_MS,
      {
        compressedBuffer: inputBuffer,
        originalSize: inputBuffer.length,
        compressedSize: inputBuffer.length,
      },
      `image compression (${filepath})`
    );
    // If optimizer returns larger or equal size, keep original to avoid regressions.
    if (!compressedBuffer || compressedBuffer.length >= inputBuffer.length) {
      return {
        buffer: inputBuffer,
        compressedSize: inputBuffer.length,
        usedFallback: true,
      };
    }
    return { buffer: compressedBuffer, compressedSize, usedFallback: false };
  } catch (err) {
    if (SOFT_FAIL) {
      warnOptimizationFailure(sourceUrl, filepath, "optimize-buffer", err);
      return {
        buffer: inputBuffer,
        compressedSize: inputBuffer.length,
        usedFallback: true,
      };
    }
    throw err;
  }
}

// Helper B: streaming-like variant using temp files. We always write the original to a temp file first,
// then only swap in the optimized content when it succeeds. On any error, keep the original.
export async function compressImageToFileWithFallback(
  originalBuffer: Buffer,
  optimizedCandidate: Buffer,
  filepath: string,
  sourceUrl: string
): Promise<{ finalSize: number; usedFallback: boolean }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "img-opt-"));
  const base = path.basename(filepath);
  const tmpOriginal = path.join(tmpDir, `orig-${base}`);
  try {
    // Persist the original first so it's never lost.
    fs.writeFileSync(tmpOriginal, originalBuffer);

    // Try optimizing the candidate (already resized) using the in-memory wrapper.
    const { buffer: maybeOptimized, usedFallback } =
      await compressImageWithFallback(optimizedCandidate, filepath, sourceUrl);

    // Only replace final file when optimization actually improved (or at least did not fail).
    // If fallback happened or the optimized is not smaller, keep the original.
    if (!usedFallback && maybeOptimized.length < originalBuffer.length) {
      fs.writeFileSync(filepath, maybeOptimized);
      return { finalSize: maybeOptimized.length, usedFallback: false };
    } else {
      // Write original as-is (unmodified) per fail-open policy
      fs.copyFileSync(tmpOriginal, filepath);
      return { finalSize: originalBuffer.length, usedFallback: true };
    }
  } catch (err) {
    // Any unexpected error: warn (or throw if hard-fail) and keep original
    if (SOFT_FAIL) {
      warnOptimizationFailure(sourceUrl, filepath, "optimize-stream", err);
      fs.copyFileSync(tmpOriginal, filepath);
      return { finalSize: originalBuffer.length, usedFallback: true };
    }
    throw err;
  } finally {
    // Best-effort cleanup; if it fails, ignore (does not affect output).
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}
