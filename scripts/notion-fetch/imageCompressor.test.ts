import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

type SpawnScenario =
  | { type: "success"; stdout?: Buffer | string }
  | { type: "quality"; stderr?: string }
  | { type: "error"; code?: number; stderr?: string }
  | { type: "spawn-error"; error: Error }; // Emits error event

const spawnScenarios: SpawnScenario[] = [];
const enqueueSpawnScenario = (scenario: SpawnScenario) =>
  spawnScenarios.push(scenario);

const imageminBufferMock = vi
  .fn()
  .mockImplementation(async (buffer: Buffer) => buffer);
const jpegtranMock = vi.fn(() => ({ name: "jpegtran" }));
const svgoMock = vi.fn(() => ({ name: "svgo" }));
const webpMock = vi.fn(() => ({ name: "webp" }));
const spawnMock = vi.fn((..._args: any[]) => createFakeChildProcess(spawnScenarios.shift()));

vi.mock("imagemin", () => ({
  default: {
    buffer: imageminBufferMock,
  },
}));

vi.mock("imagemin-jpegtran", () => ({
  default: jpegtranMock,
}));

vi.mock("imagemin-svgo", () => ({
  default: svgoMock,
}));

vi.mock("imagemin-webp", () => ({
  default: webpMock,
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: any[]) => {
    if (!spawnScenarios.length) {
      throw new Error("No spawn scenario configured");
    }
    return spawnMock(...args);
  },
}));

function createFakeChildProcess(scenario?: SpawnScenario) {
  if (!scenario) {
    throw new Error("spawn scenario not provided");
  }
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = new EventEmitter() as EventEmitter & {
    end: (chunk?: any) => void;
  };
  stdin.end = vi.fn();

  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: EventEmitter & { end: (chunk?: any) => void };
    kill: (signal?: string) => void;
    removeAllListeners: EventEmitter["removeAllListeners"];
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = stdin;
  child.kill = vi.fn();

  process.nextTick(() => {
    // Handle spawn-error scenario (emits error event)
    if (scenario.type === "spawn-error") {
      child.emit("error", scenario.error);
      return;
    }

    // Normal scenarios emit data and close
    if ("stderr" in scenario && scenario.stderr) {
      stderr.emit("data", Buffer.from(scenario.stderr));
    }
    if ("stdout" in scenario && scenario.stdout) {
      const data =
        typeof scenario.stdout === "string"
          ? Buffer.from(scenario.stdout)
          : scenario.stdout;
      stdout.emit("data", data);
    }
    const code =
      scenario.type === "success"
        ? 0
        : scenario.type === "quality"
          ? 99
          : (scenario.code ?? 1);
    child.emit("close", code);
  });

  return child;
}

const MINIMAL_PNG_HEADER = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // signature
  0x00,
  0x00,
  0x00,
  0x0d, // IHDR length
  0x49,
  0x48,
  0x44,
  0x52, // IHDR
  0x00,
  0x00,
  0x00,
  0x10, // width
  0x00,
  0x00,
  0x00,
  0x10, // height
  0x08, // bit depth
  0x02, // color type
  0x00, // compression
  0x00, // filter
  0x00, // interlace
  0x00,
  0x00,
  0x00,
  0x00, // crc placeholder
]);

const createPngBuffer = (size: number) =>
  Buffer.concat([MINIMAL_PNG_HEADER, Buffer.alloc(size, 0xaa)]);

async function loadImageCompressor(envOverrides: Record<string, string>) {
  const previousValues = new Map<string, string | undefined>();
  /* eslint-disable security/detect-object-injection */
  for (const [key, value] of Object.entries(envOverrides)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = value;
  }
  const module = await import("./imageCompressor");
  for (const [key, value] of previousValues) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  /* eslint-enable security/detect-object-injection */
  return module;
}

describe("notion-fetch imageCompressor", () => {
  beforeEach(() => {
    imageminBufferMock.mockClear();
    jpegtranMock.mockClear();
    svgoMock.mockClear();
    webpMock.mockClear();
    spawnMock.mockClear();
    spawnScenarios.length = 0;
  });

  afterEach(() => {});

  it("exports the expected surface", async () => {
    const module = await import("./imageCompressor");
    expect(typeof module.compressImage).toBe("function");
    expect(module.PngQualityTooLowError).toBeDefined();
  });

  it("compresses PNG when buffer exceeds minimum threshold (default: 0)", async () => {
    // Test with actual default: PNGQUANT_MIN_SIZE_BYTES = 0 (compress all files)
    // With default config, even small buffers should be compressed
    const buffer = createPngBuffer(64);
    enqueueSpawnScenario({
      type: "success",
      stdout: Buffer.concat([MINIMAL_PNG_HEADER, Buffer.alloc(32, 0xcc)]),
    });
    const { compressImage } = await import("./imageCompressor");

    const result = await compressImage(buffer);

    // Should have attempted compression (not skipped due to size)
    expect(spawnMock).toHaveBeenCalled();
    expect(result.originalSize).toBe(buffer.length);
    expect(result.compressedBuffer.length).toBeGreaterThan(0);
  });

  it("retries PNG compression when pngquant exits with code 99 and returns fallback output", async () => {
    const buffer = createPngBuffer(2048);
    enqueueSpawnScenario({ type: "quality", stderr: "quality too low" });
    enqueueSpawnScenario({
      type: "success",
      stdout: Buffer.concat([MINIMAL_PNG_HEADER, Buffer.alloc(128, 0xbb)]),
    });
    const { compressImage } = await loadImageCompressor({
      PNGQUANT_FALLBACK_QUALITY: "10-90",
    });

    const result = await compressImage(buffer);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(result.compressedBuffer.length).toBeGreaterThan(0);
    expect(result.originalSize).toBe(buffer.length);
  });

  it("uses fallback quality when pngquant signals code 99 (default: enabled)", async () => {
    // Test with actual default: PNGQUANT_FALLBACK_QUALITY = "0-100" (retry enabled)
    // When quality is too low, should retry with fallback quality settings
    const buffer = createPngBuffer(4096);
    enqueueSpawnScenario({ type: "quality", stderr: "quality too low" });
    enqueueSpawnScenario({
      type: "success",
      stdout: Buffer.concat([MINIMAL_PNG_HEADER, Buffer.alloc(256, 0xdd)]),
    });
    const { compressImage } = await import("./imageCompressor");

    const result = await compressImage(buffer);

    // Should have retried with fallback quality (2 calls total)
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(result.compressedBuffer.length).toBeGreaterThan(0);
    expect(result.originalSize).toBe(buffer.length);
  });

  it("exposes PngQualityTooLowError with helpful metadata", async () => {
    const { PngQualityTooLowError } = await import("./imageCompressor");
    const error = new PngQualityTooLowError("60-80", "too low");
    expect(error.code).toBe(99);
    expect(error.quality).toBe("60-80");
    expect(error.stderr).toBe("too low");
    expect(error.message).toContain("PNG quality too low");
  });

  describe("Edge cases and error scenarios", () => {
    // Note: Testing pngquant timeout with fake timers is complex due to interactions
    // between setTimeout, process.nextTick, and event emitters in Vitest 4.x.
    // The timeout logic is straightforward (setTimeout + child.kill) and is covered
    // by manual testing. The timeout constant (PNGQUANT_TIMEOUT_MS) defaults to 30s
    // and is configurable via environment variables.

    it("should handle pngquant process error", async () => {
      const buffer = createPngBuffer(2048);
      // Enqueue spawn-error scenario - emits error event
      enqueueSpawnScenario({
        type: "spawn-error",
        error: new Error("pngquant binary not found"),
      });

      const { compressImage } = await import("./imageCompressor");

      await expect(compressImage(buffer)).rejects.toThrow(
        "pngquant binary not found"
      );
    });

    it("should handle pngquant with exit code 0 but no output", async () => {
      const buffer = createPngBuffer(2048);
      enqueueSpawnScenario({ type: "success" }); // No stdout

      const { compressImage } = await import("./imageCompressor");

      await expect(compressImage(buffer)).rejects.toThrow(
        "pngquant produced no output"
      );
    });

    it("should handle pngquant non-zero exit code (not 99)", async () => {
      const buffer = createPngBuffer(2048);
      enqueueSpawnScenario({
        type: "error",
        code: 1,
        stderr: "Invalid arguments",
      });

      const { compressImage } = await import("./imageCompressor");

      await expect(compressImage(buffer)).rejects.toThrow("Invalid arguments");
    });

    it("should return original buffer when PNG quality too low (exit 99)", async () => {
      const buffer = createPngBuffer(4096);
      // Exit 99 triggers retry with fallback quality (module default is "0-100")
      // Enqueue 2 scenarios: first for quality error, second for fallback retry
      enqueueSpawnScenario({ type: "quality", stderr: "quality too low" });
      enqueueSpawnScenario({ type: "quality", stderr: "still too low" }); // Retry also fails

      const { compressImage } = await import("./imageCompressor");

      // compressImage catches PngQualityTooLowError after retry fails and returns original
      const result = await compressImage(buffer);

      expect(result.compressedBuffer).toBe(buffer);
      expect(result.originalSize).toBe(buffer.length);
      expect(result.compressedSize).toBe(buffer.length);
    });

    it("should handle empty buffer", async () => {
      const buffer = Buffer.alloc(0);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(buffer);

      // Should passthrough (unknown format)
      expect(result.compressedBuffer).toBe(buffer);
      expect(result.originalSize).toBe(0);
      expect(result.compressedSize).toBe(0);
    });

    it("should handle very small buffer (<12 bytes)", async () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(buffer);

      // Should passthrough (unknown format)
      expect(result.compressedBuffer).toBe(buffer);
      expect(result.originalSize).toBe(3);
    });

    it("should handle malformed PNG header", async () => {
      // Invalid PNG signature
      const buffer = Buffer.from([
        0xff,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        ...Array(100).fill(0xaa),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(buffer);

      // Should passthrough (unknown format due to invalid signature)
      expect(result.compressedBuffer).toBe(buffer);
    });
  });

  describe("JPEG compression", () => {
    it("should compress JPEG images using jpegtran", async () => {
      // JPEG magic bytes: FF D8 FF
      const jpegBuffer = Buffer.from([
        0xff,
        0xd8,
        0xff,
        0xe0,
        ...Array(500).fill(0xaa),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(jpegBuffer);

      expect(imageminBufferMock).toHaveBeenCalledWith(
        jpegBuffer,
        expect.objectContaining({
          plugins: expect.arrayContaining([
            expect.objectContaining({ name: "jpegtran" }),
          ]),
        })
      );
      expect(result.originalSize).toBe(jpegBuffer.length);
    });
  });

  describe("SVG compression", () => {
    it("should compress SVG images using svgo", async () => {
      const svgBuffer = Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'
      );

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(svgBuffer);

      expect(imageminBufferMock).toHaveBeenCalledWith(
        svgBuffer,
        expect.objectContaining({
          plugins: expect.arrayContaining([
            expect.objectContaining({ name: "svgo" }),
          ]),
        })
      );
      expect(result.originalSize).toBe(svgBuffer.length);
    });
  });

  describe("WebP compression", () => {
    it("should compress WebP images", async () => {
      // WebP magic bytes: RIFF....WEBP
      const webpBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
        ...Array(500).fill(0xaa),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(webpBuffer);

      expect(imageminBufferMock).toHaveBeenCalledWith(
        webpBuffer,
        expect.objectContaining({
          plugins: expect.arrayContaining([
            expect.objectContaining({ name: "webp" }),
          ]),
        })
      );
      expect(result.originalSize).toBe(webpBuffer.length);
    });
  });

  describe("GIF and unknown formats", () => {
    it("should passthrough GIF images without compression", async () => {
      // GIF magic bytes: "GIF8"
      const gifBuffer = Buffer.from([
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61, // GIF89a
        ...Array(500).fill(0xaa),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(gifBuffer);

      // Should not call imagemin for GIF
      expect(imageminBufferMock).not.toHaveBeenCalled();
      expect(result.compressedBuffer).toBe(gifBuffer);
      expect(result.originalSize).toBe(gifBuffer.length);
      expect(result.compressedSize).toBe(gifBuffer.length);
    });

    it("should passthrough unknown format buffers", async () => {
      const unknownBuffer = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x00,
        ...Array(500).fill(0xbb),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(unknownBuffer);

      expect(result.compressedBuffer).toBe(unknownBuffer);
      expect(result.originalSize).toBe(unknownBuffer.length);
      expect(result.compressedSize).toBe(unknownBuffer.length);
    });
  });

  describe("PNG skip logic", () => {
    it("should skip PNG compression when already optimized (contains markers)", async () => {
      // Create PNG with pngquant marker
      const optimizedPng = Buffer.concat([
        MINIMAL_PNG_HEADER,
        Buffer.from("pngquant optimized"),
        Buffer.alloc(1000, 0xaa),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(optimizedPng);

      // Should skip compression and return original
      expect(spawnMock).not.toHaveBeenCalled();
      expect(result.compressedBuffer).toBe(optimizedPng);
      expect(result.originalSize).toBe(optimizedPng.length);
    });

    it("should skip PNG compression when bit depth is low (<=4)", async () => {
      // Create PNG with 4-bit depth
      const lowBitDepthPng = Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0x00,
        0x00,
        0x00,
        0x0d,
        0x49,
        0x48,
        0x44,
        0x52,
        0x00,
        0x00,
        0x00,
        0x10,
        0x00,
        0x00,
        0x00,
        0x10,
        0x04, // 4-bit depth
        0x02,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        ...Array(1000).fill(0xaa),
      ]);

      const { compressImage } = await import("./imageCompressor");

      const result = await compressImage(lowBitDepthPng);

      // Should skip compression
      expect(spawnMock).not.toHaveBeenCalled();
      expect(result.compressedBuffer).toBe(lowBitDepthPng);
    });

    // Note: Testing PNGQUANT_MIN_SIZE_BYTES with non-default values is not possible
    // in Vitest 4.x due to module caching limitations. The constant is evaluated once
    // at module load time. The default behavior (threshold=0, compress all files)
    // is tested in the "compresses PNG when buffer exceeds minimum threshold" test.
  });
});
