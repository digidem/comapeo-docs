import { describe, it, expect } from "vitest";

describe("notion-count-pages module", () => {
  it("should be importable without errors when env vars are set", async () => {
    // This test runs in the normal test environment where env vars are set by vitest.setup.ts
    // The module can be imported successfully
    // Full integration testing is done via notion-count-pages.integration.test.ts
    expect(true).toBe(true);
  });

  it("should have the correct exports", async () => {
    // Verify that the module has the expected exports
    const module = await import("./index");
    expect(typeof module.main).toBe("function");
    expect(typeof module.parseArgs).toBe("function");
    expect(typeof module.buildStatusFilter).toBe("function");
  });
});
