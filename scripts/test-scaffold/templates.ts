import { extractMetadata } from "./utils";

interface TemplateOptions {
  scriptName: string;
  scriptPath: string;
  template: string;
  scriptContent: string;
}

export function generateTestBoilerplate(options: TemplateOptions): string {
  const { scriptName, scriptPath, template, scriptContent } = options;

  // Extract metadata from the script
  const metadata = extractMetadata(scriptContent);

  switch (template) {
    case "integration":
      return generateIntegrationTemplate(scriptName, scriptPath, metadata);
    case "default":
    default:
      return generateDefaultTemplate(scriptName, scriptPath, metadata);
  }
}

function generateDefaultTemplate(
  scriptName: string,
  scriptPath: string,
  metadata: ReturnType<typeof extractMetadata>
): string {
  const hasNotionImport = metadata.imports.some(
    (imp) => imp.includes("notion") || imp.includes("Notion")
  );

  const hasFileSystemImport = metadata.usesFileSystem;

  let mockSection = "";

  if (hasNotionImport) {
    mockSection += `
// Mock external dependencies
vi.mock('../notionClient', () => ({
  default: {
    pages: {
      retrieve: vi.fn(),
      update: vi.fn()
    },
    blocks: {
      children: {
        list: vi.fn()
      }
    }
  }
}));
`;
  }

  if (hasFileSystemImport) {
    mockSection += `
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn()
}));
`;
  }

  return `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as scriptModule from '${scriptPath}';
${mockSection}
describe('${scriptName}', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
  });

  it('should run without errors', () => {
    // This basic test ensures the module can be imported
    expect(scriptModule).toBeDefined();
  });

  /**
   * TODO: Implement the following test cases
   * 
   * AI-Generated Test Case Suggestions:
   * (Run \`bun run ai:suggest-tests ${scriptPath}.ts\` to generate)
   * 
   * 1. Test with valid input parameters
   * 2. Test error handling for invalid inputs
   * 3. Test edge cases and boundary conditions
   * 4. Test async operations and promise handling
   * 5. Test integration with external dependencies
   */
${generateTestSuggestions(metadata)}
});
`;
}

function generateIntegrationTemplate(
  scriptName: string,
  scriptPath: string,
  metadata: ReturnType<typeof extractMetadata>
): string {
  return `import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as scriptModule from '${scriptPath}';

describe('${scriptName} - Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Store original environment
    originalEnv = { ...process.env };
    // Set test environment variables
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should handle API interactions correctly', async () => {
    // Integration test placeholder
    expect(true).toBe(true);
  });

  /**
   * Integration Test Checklist:
   * [ ] Test with real API endpoints (test environment)
   * [ ] Test timeout scenarios
   * [ ] Test retry logic
   * [ ] Test rate limiting
   * [ ] Test connection failures
   */
${generateIntegrationTestSuggestions(metadata)}
});
`;
}

function generateTestSuggestions(
  metadata: ReturnType<typeof extractMetadata>
): string {
  const suggestions: string[] = [];

  // Add function-specific tests
  if (metadata.functions.length > 0) {
    metadata.functions.forEach((func) => {
      suggestions.push(`
  it.todo('should test ${func} function with valid inputs');
  it.todo('should test ${func} function with invalid inputs');`);
    });
  }

  // Add class-specific tests
  if (metadata.classes.length > 0) {
    metadata.classes.forEach((cls) => {
      suggestions.push(`
  it.todo('should instantiate ${cls} class correctly');
  it.todo('should test ${cls} class methods');`);
    });
  }

  // Add async-specific tests
  if (metadata.hasAsync) {
    suggestions.push(`
  it.todo('should handle async operations correctly');
  it.todo('should handle promise rejections');`);
  }

  // Add file system tests
  if (metadata.usesFileSystem) {
    suggestions.push(`
  it.todo('should handle file read/write operations');
  it.todo('should handle file system errors');`);
  }

  // Add network tests
  if (metadata.usesNetwork) {
    suggestions.push(`
  it.todo('should handle network requests');
  it.todo('should handle network failures');`);
  }

  return suggestions.join("");
}

function generateIntegrationTestSuggestions(
  metadata: ReturnType<typeof extractMetadata>
): string {
  const suggestions: string[] = [];

  if (metadata.usesNetwork) {
    suggestions.push(`
  it.todo('should handle real API responses');
  it.todo('should respect rate limits');
  it.todo('should retry on transient failures');`);
  }

  if (metadata.usesFileSystem) {
    suggestions.push(`
  it.todo('should create and clean up test files');
  it.todo('should handle concurrent file operations');`);
  }

  return suggestions.join("");
}
