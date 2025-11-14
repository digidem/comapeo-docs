import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

type SpawnScenario =
  | { type: "success"; stdout?: Buffer | string }
  | { type: "quality"; stderr?: string }
  | { type: "error"; code?: number; stderr?: string };

const spawnScenarios: SpawnScenario[] = [];
const enqueueSpawnScenario = (scenario: SpawnScenario) =>
  spawnScenarios.push(scenario);

const imageminBufferMock = vi
  .fn()
  .mockImplementation(async (buffer: Buffer) => buffer);
const jpegtranMock = vi.fn(() => ({ name: "jpegtran" }));
const svgoMock = vi.fn(() => ({ name: "svgo" }));
const webpMock = vi.fn(() => ({ name: "webp" }));
const spawnMock = vi.fn(() => createFakeChildProcess(spawnScenarios.shift()));

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
  vi.resetModules();
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

  afterEach(() => {
    vi.resetModules();
  });

  it("exports the expected surface", async () => {
    const module = await import("./imageCompressor");
    expect(typeof module.compressImage).toBe("function");
    expect(module.PngQualityTooLowError).toBeDefined();
  });

  it("skips PNG compression when the buffer is smaller than the configured threshold", async () => {
    const buffer = createPngBuffer(64);
    const { compressImage } = await loadImageCompressor({
      PNGQUANT_MIN_SIZE_BYTES: "1024",
    });

    const result = await compressImage(buffer);

    expect(result.compressedBuffer).toBe(buffer);
    expect(spawnMock).not.toHaveBeenCalled();
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

  it("returns the original buffer when pngquant signals code 99 and fallback retries are disabled", async () => {
    const buffer = createPngBuffer(4096);
    enqueueSpawnScenario({ type: "quality", stderr: "already optimized" });
    const { compressImage } = await loadImageCompressor({
      PNGQUANT_FALLBACK_QUALITY: "",
    });

    const result = await compressImage(buffer);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result.compressedBuffer).toBe(buffer);
    expect(result.compressedSize).toBe(buffer.length);
  });

  it("exposes PngQualityTooLowError with helpful metadata", async () => {
    const { PngQualityTooLowError } = await import("./imageCompressor");
    const error = new PngQualityTooLowError("60-80", "too low");
    expect(error.code).toBe(99);
    expect(error.quality).toBe("60-80");
    expect(error.stderr).toBe("too low");
    expect(error.message).toContain("PNG quality too low");
  });
});
