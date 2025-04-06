# Testing in Comapeo Docs

This directory contains tests for the Comapeo Docs project.

## Unit Tests

Unit tests are located in the `tests/unit` directory. These tests focus on testing individual functions and components in isolation, without relying on external services like the Notion API or file system.

To run the unit tests:

```bash
bun test
```

or

```bash
bun test tests/unit
```

To run the tests in watch mode (automatically re-run when files change):

```bash
bun test:watch
```

## Test Structure

- **Unit Tests**: Focus on testing individual functions in isolation
  - `markdownToNotion.test.ts`: Tests for the Markdown to Notion converter
  - `generateBlocks.mock.test.ts`: Tests for the core functionality of the `generateBlocks` function using a mock implementation

## Mocking Strategy

In the unit tests, we use two different approaches to mocking:

1. **Direct Mocking**: For `markdownToNotion.test.ts`, we use Bun's mocking capabilities to directly mock external dependencies like the Notion client.

2. **Mock Implementation**: For `generateBlocks.mock.test.ts`, we use a completely isolated mock implementation of the `generateBlocks` function that mimics its behavior without making any external API calls.

This approach allows us to test the core logic of our functions without relying on external services, making the tests more reliable and faster to run.

## Best Practices

1. **Write Unit Tests First**: Always start with unit tests that focus on testing the core logic
2. **Mock External Dependencies**: Use mocks to isolate your tests from external dependencies
3. **Handle Errors Gracefully**: Make sure your code handles errors gracefully, especially when interacting with external services
4. **Test Edge Cases**: Make sure to test edge cases like empty inputs, error conditions, etc.
5. **Keep Tests Fast**: Unit tests should be fast to run to encourage frequent testing
6. **Use Mock Implementations**: For complex functions with many external dependencies, consider using a mock implementation that mimics the behavior of the function without making actual API calls
