/**
 * Path Filtering Validation Tests
 *
 * These tests validate that the Docker image path filtering configuration
 * matches exactly what the Dockerfile copies into the image.
 *
 * This ensures GitHub Actions workflows only trigger when files that
 * actually affect the Docker image change.
 */

import { describe, it, expect } from "vitest";

// Dockerfile COPY instructions (extracted from Dockerfile)
const DOCKERFILE_COPY_PATTERNS = [
  "package.json", // Line 16, 52
  "bun.lockb*", // Line 16, 52
  "scripts/**", // Line 54
  "docusaurus.config.ts", // Line 56
  "tsconfig.json", // Line 57
  "src/client/**", // Line 59
] as const;

// Additional files that affect Docker builds
const DOCKER_BUILD_CONTROL_FILES = [
  "Dockerfile", // Image definition
  ".dockerignore", // Build context control
] as const;

// Files excluded by .dockerignore (should NOT trigger builds)
const DOCKERIGNORE_EXCLUSIONS = [
  "docs/**",
  "i18n/**",
  "static/images/**",
  ".github/**",
  "context/**",
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "assets/**",
  "test-*.json",
  "test-*.html",
  "*.test.ts",
  "*.spec.ts",
  "scripts/test-docker/**",
  "scripts/test-scaffold/**",
  "scripts/**/__tests__/**",
] as const;

// Combined path filter for GitHub Actions
const RECOMMENDED_PATH_FILTERS = [
  ...DOCKER_BUILD_CONTROL_FILES,
  ...DOCKERFILE_COPY_PATTERNS,
] as const;

type FilePath = string;

/**
 * Check if a file path matches any path filter pattern
 * Uses minimatch-style glob matching for GitHub Actions compatibility
 *
 * GitHub Actions path filtering uses the .gitignore pattern format:
 * - ** matches any number of directories
 * - * matches any characters within a directory (no slash)
 * - ? matches a single character
 */
function matchesPathFilter(
  filePath: FilePath,
  patterns: readonly string[]
): boolean {
  return patterns.some((pattern) => {
    // Handle exact match first
    if (pattern === filePath) {
      return true;
    }

    // Build regex from glob pattern
    const regexString = globToRegex(pattern);
    // eslint-disable-next-line security/detect-non-literal-regexp -- Intentional regex from glob pattern
    const regex = new RegExp(`^${regexString}$`);
    return regex.test(filePath);
  });
}

/**
 * Convert a glob pattern to a regex string
 * Following GitHub Actions / .gitignore pattern rules
 */
function globToRegex(pattern: string): string {
  // Split pattern into segments by /
  const segments = pattern.split("/");

  const regexSegments = segments.map((segment) => {
    if (segment === "**") {
      return ".*";
    }

    // Escape special regex characters except * and ?
    let escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");

    // Handle * wildcard (matches any characters except /)
    escaped = escaped.replace(/\*/g, "[^/]*");

    // Handle ? wildcard (matches single character)
    escaped = escaped.replace(/\?/g, ".");

    return escaped;
  });

  // Join segments with /, allowing ** to match across segments
  let result = regexSegments.join("/");

  // Handle patterns ending with /**/
  if (pattern.endsWith("/**/")) {
    result = result.replace(/\/\.\*\/$/, "/(.*/)?");
  }
  // Handle patterns ending with /**
  else if (pattern.endsWith("/**")) {
    result = result.replace(/\/\.\*$/, "(/.*)?");
  }

  return result;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a file path matches any .dockerignore pattern
 */
function matchesDockerignore(filePath: FilePath): boolean {
  return matchesPathFilter(filePath, DOCKERIGNORE_EXCLUSIONS);
}

describe("Docker Path Filtering Configuration", () => {
  describe("Dockerfile COPY Instructions", () => {
    it("includes package.json in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("package.json");
    });

    it("includes bun.lockb* in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("bun.lockb*");
    });

    it("includes scripts/** in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("scripts/**");
    });

    it("includes src/client/** in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("src/client/**");
    });

    it("includes docusaurus.config.ts in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("docusaurus.config.ts");
    });

    it("includes tsconfig.json in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("tsconfig.json");
    });
  });

  describe("Docker Build Control Files", () => {
    it("includes Dockerfile in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("Dockerfile");
    });

    it("includes .dockerignore in path filters", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain(".dockerignore");
    });
  });

  describe("Path Filter Matching", () => {
    describe("files that SHOULD trigger Docker builds", () => {
      const shouldTrigger: FilePath[] = [
        "Dockerfile",
        ".dockerignore",
        "package.json",
        "bun.lockb",
        "scripts/api-server/index.ts",
        "scripts/notion-fetch/index.ts",
        "scripts/constants.ts",
        "src/client/index.ts",
        "src/client/types.ts",
        "tsconfig.json",
        "docusaurus.config.ts",
      ];

      test.each(shouldTrigger)("%s matches path filter", (filePath) => {
        expect(matchesPathFilter(filePath, RECOMMENDED_PATH_FILTERS)).toBe(
          true
        );
      });
    });

    describe("files that should NOT trigger Docker builds", () => {
      const shouldNotTrigger: FilePath[] = [
        "docs/introduction.md",
        "docs/guide/installation.md",
        "i18n/pt/code.json",
        "i18n/es/docusaurus-theme-classic/footer.json",
        "static/images/logo.png",
        "static/images/screenshots/demo.png",
        ".github/workflows/test.yml",
        ".github/workflows/deploy-pr-preview.yml",
        "context/workflows/notion-commands.md",
        "context/database/overview.md",
        "README.md",
        "CONTRIBUTING.md",
        "CHANGELOG.md",
        "assets/design/",
        "test-results.json",
        "test-results.html",
        // Note: scripts/test-* files ARE included via scripts/** pattern
        // This is intentional for simplicity - see documentation
      ];

      test.each(shouldNotTrigger)(
        "%s does NOT match path filter",
        (filePath) => {
          expect(matchesPathFilter(filePath, RECOMMENDED_PATH_FILTERS)).toBe(
            false
          );
        }
      );
    });
  });

  describe(".dockerignore Exclusions", () => {
    describe("files excluded by .dockerignore", () => {
      const excludedFiles: FilePath[] = [
        "docs/introduction.md",
        "i18n/pt/code.json",
        "static/images/logo.png",
        ".github/workflows/test.yml",
        "context/workflows/notion-commands.md",
        "README.md",
        "CONTRIBUTING.md",
      ];

      test.each(excludedFiles)(
        "%s is excluded by .dockerignore",
        (filePath) => {
          expect(matchesDockerignore(filePath)).toBe(true);
        }
      );
    });

    describe("files NOT excluded by .dockerignore", () => {
      const includedFiles: FilePath[] = [
        "package.json",
        "scripts/api-server/index.ts",
        "src/client/index.ts",
        "tsconfig.json",
        "docusaurus.config.ts",
      ];

      test.each(includedFiles)(
        "%s is NOT excluded by .dockerignore",
        (filePath) => {
          expect(matchesDockerignore(filePath)).toBe(false);
        }
      );
    });
  });

  describe("Wildcard Pattern Behavior", () => {
    it("** matches all directories recursively", () => {
      expect(
        matchesPathFilter("scripts/api-server/index.ts", ["scripts/**"])
      ).toBe(true);
      expect(
        matchesPathFilter("scripts/nested/deeply/file.ts", ["scripts/**"])
      ).toBe(true);
    });

    it("* matches files in current directory only", () => {
      expect(matchesPathFilter("bun.lockb", ["bun.lockb*"])).toBe(true);
      expect(matchesPathFilter("bun.lock", ["bun.lockb*"])).toBe(false);
    });

    it("patterns match specific extensions", () => {
      // GitHub Actions path filters match *.ts anywhere in the path
      expect(matchesPathFilter("docusaurus.config.ts", ["*.ts"])).toBe(true);
      expect(matchesPathFilter("config.ts", ["*.ts"])).toBe(true);
    });
  });

  describe("Path Filter Completeness", () => {
    it("includes all Dockerfile COPY instructions", () => {
      DOCKERFILE_COPY_PATTERNS.forEach((pattern) => {
        expect(RECOMMENDED_PATH_FILTERS).toContain(pattern);
      });
    });

    it("includes all Docker build control files", () => {
      DOCKER_BUILD_CONTROL_FILES.forEach((file) => {
        expect(RECOMMENDED_PATH_FILTERS).toContain(file);
      });
    });

    it("does not include .dockerignore exclusions", () => {
      // Files that are in .dockerignore should not trigger builds
      const excludedExamples: FilePath[] = [
        "docs/introduction.md",
        "static/images/logo.png",
      ];

      excludedExamples.forEach((filePath) => {
        expect(matchesPathFilter(filePath, RECOMMENDED_PATH_FILTERS)).toBe(
          false
        );
      });
    });
  });

  describe("Test Files Handling", () => {
    it("scripts/test-docker/** is in path filters (via scripts/**)", () => {
      // Test files are included via scripts/** wildcard
      expect(
        matchesPathFilter(
          "scripts/test-docker/integration.test.ts",
          RECOMMENDED_PATH_FILTERS
        )
      ).toBe(true);
    });

    it("scripts/test-scaffold/** is in path filters (via scripts/**)", () => {
      expect(
        matchesPathFilter(
          "scripts/test-scaffold/example.test.ts",
          RECOMMENDED_PATH_FILTERS
        )
      ).toBe(true);
    });

    it("scripts/**/__tests__/** is in path filters (via scripts/**)", () => {
      expect(
        matchesPathFilter(
          "scripts/utils/__tests__/util.test.ts",
          RECOMMENDED_PATH_FILTERS
        )
      ).toBe(true);
    });
  });

  describe("Transitive Dependencies", () => {
    it("includes docusaurus.config.ts (imported by src/client)", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("docusaurus.config.ts");
      expect(RECOMMENDED_PATH_FILTERS).toContain("src/client/**");
    });

    it("includes tsconfig.json (TypeScript config)", () => {
      expect(RECOMMENDED_PATH_FILTERS).toContain("tsconfig.json");
    });
  });

  describe("Configuration Files", () => {
    const configFiles = [
      "package.json",
      "bun.lockb",
      "tsconfig.json",
      "docusaurus.config.ts",
    ];

    it("includes all required configuration files", () => {
      configFiles.forEach((file) => {
        expect(matchesPathFilter(file, RECOMMENDED_PATH_FILTERS)).toBe(true);
      });
    });
  });

  describe("Documentation Files Exclusion", () => {
    const docFiles: FilePath[] = [
      "README.md",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "context/workflows/notion-commands.md",
      "context/database/overview.md",
      "API_REVIEW.md",
      "AGENTS.md",
    ];

    it("excludes all documentation files from path filters", () => {
      docFiles.forEach((file) => {
        expect(matchesPathFilter(file, RECOMMENDED_PATH_FILTERS)).toBe(false);
      });
    });
  });

  describe("CI/CD Files Exclusion", () => {
    const ciFiles: FilePath[] = [
      ".github/workflows/test.yml",
      ".github/workflows/deploy-pr-preview.yml",
      ".github/workflows/docker-publish.yml",
      ".github/dependabot.yml",
      "lefthook.yml",
    ];

    it("excludes all CI/CD files from path filters", () => {
      ciFiles.forEach((file) => {
        expect(matchesPathFilter(file, RECOMMENDED_PATH_FILTERS)).toBe(false);
      });
    });
  });
});

/**
 * Utility function for generating GitHub Actions workflow configuration
 * This can be used to automate workflow file generation
 */
export function generateGitHubActionsPathsFilter(): string[] {
  return [
    "Dockerfile",
    ".dockerignore",
    "package.json",
    "bun.lockb*",
    "scripts/**",
    "src/client/**",
    "tsconfig.json",
    "docusaurus.config.ts",
  ];
}

/**
 * Validate a file path against the recommended path filters
 * Useful for pre-commit hooks or CI validation
 */
export function validatePathChange(filePath: FilePath): {
  triggersBuild: boolean;
  reason: string;
} {
  const triggersBuild = matchesPathFilter(filePath, RECOMMENDED_PATH_FILTERS);

  if (triggersBuild) {
    return {
      triggersBuild: true,
      reason: "File is copied into Docker image or affects build process",
    };
  }

  if (matchesDockerignore(filePath)) {
    return {
      triggersBuild: false,
      reason: "File is excluded by .dockerignore (not copied into image)",
    };
  }

  return {
    triggersBuild: false,
    reason: "File is not in path filters (does not affect Docker image)",
  };
}
