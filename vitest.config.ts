import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Test file patterns
    include: ["scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],

    // Environment configuration
    environment: "node",
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "coverage/**",
        "dist/**",
        "**/node_modules/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/test-scaffold/**",
      ],
      thresholds: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },

    // Test timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter configuration
    reporters: ["verbose", "json", "html"],
    outputFile: {
      json: "./test-results.json",
      html: "./test-results.html",
    },

    // Mock configuration
    clearMocks: true,
    restoreMocks: true,

    // Retry configuration for flaky tests
    retry: 2,
  },

  // Path resolution
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./scripts"),
    },
  },
});
