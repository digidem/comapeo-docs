import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { installTestNotionEnv, createMockNotionPage } from "../../test-utils";

vi.mock("sharp", () => {
  const createPipeline = () => {
    const pipeline: any = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      png: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from("")),
      toFile: vi.fn(async () => ({ size: 1000 })),
      metadata: vi.fn(async () => ({
        width: 100,
        height: 100,
        format: "jpeg",
      })),
    };
    return pipeline;
  };
  return {
    default: vi.fn(() => createPipeline()),
  };
});

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../../notionClient", () => ({
  n2m: {
    pageToMarkdown: vi.fn(),
    toMarkdownString: vi.fn(),
  },
  enhancedNotion: {
    blocksChildrenList: vi.fn(() =>
      Promise.resolve({
        results: [],
        has_more: false,
        next_cursor: null,
      })
    ),
  },
}));

vi.mock("../../fetchNotionData", () => ({
  fetchNotionBlocks: vi.fn().mockResolvedValue([]),
}));

vi.mock("../emojiProcessor", () => ({
  EmojiProcessor: {
    processBlockEmojis: vi.fn().mockResolvedValue({
      emojiMap: new Map(),
      totalSaved: 0,
    }),
    applyEmojiMappings: vi.fn((content) => content),
    processPageEmojis: vi.fn((pageId, content) =>
      Promise.resolve({
        content: content || "",
        totalSaved: 0,
        processedCount: 0,
      })
    ),
  },
}));

vi.mock("../spinnerManager", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
    })),
    remove: vi.fn(),
    stopAll: vi.fn(),
  },
}));

vi.mock("../imageProcessor", () => ({
  processImage: vi.fn(),
}));

vi.mock("../utils", () => ({
  sanitizeMarkdownContent: vi.fn((content) => content),
  compressImageToFileWithFallback: vi.fn().mockResolvedValue({
    finalSize: 512,
    usedFallback: false,
  }),
  detectFormatFromBuffer: vi.fn(() => "jpeg"),
  formatFromContentType: vi.fn(() => "jpeg"),
  chooseFormat: vi.fn(() => "jpeg"),
  extForFormat: vi.fn(() => ".jpg"),
  isResizableFormat: vi.fn(() => true),
}));

vi.mock("node:fs", () => {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  const ensureDir = (dirPath: string) => {
    if (dirPath) {
      directories.add(dirPath);
    }
  };

  const api = {
    mkdirSync: vi.fn((dirPath: string) => {
      ensureDir(dirPath);
    }),
    writeFileSync: vi.fn((filePath: string, content: string | Buffer) => {
      const value = typeof content === "string" ? content : content.toString();
      files.set(filePath, value);
      const dirPath = filePath?.includes("/")
        ? filePath.slice(0, filePath.lastIndexOf("/"))
        : "";
      ensureDir(dirPath);
    }),
    readFileSync: vi.fn((filePath: string) => {
      if (files.has(filePath)) {
        return files.get(filePath);
      }
      if (filePath.endsWith("code.json")) {
        return "{}";
      }
      return "";
    }),
    existsSync: vi.fn((target: string) => {
      return files.has(target) || directories.has(target);
    }),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
    renameSync: vi.fn((from: string, to: string) => {
      if (files.has(from)) {
        files.set(to, files.get(from) ?? "");
        files.delete(from);
      }
    }),
    unlinkSync: vi.fn((target: string) => {
      files.delete(target);
    }),
    __reset: () => {
      files.clear();
      directories.clear();
    },
  };

  return {
    default: api,
  };
});

vi.mock("../../../docusaurus.config", () => ({
  default: {
    i18n: {
      locales: ["en", "pt", "es"],
      defaultLocale: "en",
    },
  },
}));

describe("Retry loop behavior", () => {
  let restoreEnv: () => void;
  let n2m: any;
  let processAndReplaceImages: Mock;
  let validateAndFixRemainingImages: Mock;

  beforeEach(async () => {
    vi.resetModules();
    restoreEnv = installTestNotionEnv();
    vi.clearAllMocks();

    const notionClient = await import("../../notionClient");
    n2m = notionClient.n2m;

    const imageReplacer = await import("../imageReplacer");
    processAndReplaceImages = vi.spyOn(
      imageReplacer,
      "processAndReplaceImages"
    ) as unknown as Mock;
    validateAndFixRemainingImages = vi.spyOn(
      imageReplacer,
      "validateAndFixRemainingImages"
    ) as unknown as Mock;

    const fs = (await import("node:fs")).default as any;
    fs.__reset?.();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  const getGenerateBlocks = () => import("../generateBlocks");

  it("retries image processing without re-fetching markdown", async () => {
    const { generateBlocks } = await getGenerateBlocks();
    const page = createMockNotionPage({ title: "Retry Test" });
    const progressCallback = vi.fn();

    const initialContent =
      "# Title\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";
    const partiallyFixedContent =
      "# Title\n\n![s3-still-there](https://prod-files-secure.s3.us-west-2.amazonaws.com/image2.png?X-Amz-Algorithm=AWS4-HMAC-SHA256)";
    const sanitizedContent = "# Title\n\n![local](/images/sanitized.png)";

    n2m.pageToMarkdown.mockResolvedValue([]);
    n2m.toMarkdownString.mockReturnValue({ parent: initialContent });

    const attemptResults = [
      {
        markdown: partiallyFixedContent, // First attempt makes some progress
        stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
      },
      {
        markdown: sanitizedContent, // Second attempt succeeds
        stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
      },
    ];

    processAndReplaceImages.mockImplementation(
      async () =>
        attemptResults.shift() ?? attemptResults[attemptResults.length - 1]
    );
    validateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );

    await generateBlocks([page], progressCallback);

    expect(n2m.pageToMarkdown).toHaveBeenCalledTimes(1);
    expect(processAndReplaceImages).toHaveBeenCalledTimes(2);
    expect(validateAndFixRemainingImages).toHaveBeenCalledTimes(2);

    const fs = (await import("node:fs")).default as any;
    const writeCall = fs.writeFileSync.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
    );
    expect(writeCall?.[1]).toContain("/images/sanitized.png");
  });

  it("runs post-write validation when S3 URLs persist", async () => {
    const { generateBlocks } = await getGenerateBlocks();
    const page = createMockNotionPage({ title: "Unfixable Page" });
    const progressCallback = vi.fn();

    const stuckContent =
      "# Title\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?X-Amz-Expires=1)";

    n2m.pageToMarkdown.mockResolvedValue([]);
    n2m.toMarkdownString.mockReturnValue({ parent: stuckContent });

    processAndReplaceImages.mockImplementation(async () => ({
      markdown: stuckContent,
      stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
    }));
    validateAndFixRemainingImages.mockImplementation(
      async (content) => content
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateBlocks([page], progressCallback);

    const fs = (await import("node:fs")).default as any;
    const markdownPathCall = fs.readFileSync.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
    );
    expect(markdownPathCall).toBeTruthy();
    const postWriteWarning = warnSpy.mock.calls.some(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("⚠️  Post-write validation detected")
    );
    expect(postWriteWarning).toBe(true);

    warnSpy.mockRestore();
  });

  it("stops after max retries when no progress is made", async () => {
    const { generateBlocks } = await getGenerateBlocks();
    const page = createMockNotionPage({ title: "Maxed Out" });

    const stuckContent =
      "# Title\n\n![s3](https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?X-Amz-Expires=1)";

    n2m.pageToMarkdown.mockResolvedValue([]);
    n2m.toMarkdownString.mockReturnValue({ parent: stuckContent });

    processAndReplaceImages.mockResolvedValue({
      markdown: stuckContent,
      stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
    });
    validateAndFixRemainingImages.mockResolvedValue(stuckContent);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateBlocks([page]);

    expect(processAndReplaceImages).toHaveBeenCalledTimes(1);
    expect(
      warnSpy.mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          (call[0].includes("still reference expiring URLs after") ||
            call[0].includes("No progress made in retry"))
      )
    ).toBe(true);

    warnSpy.mockRestore();
  });
});
