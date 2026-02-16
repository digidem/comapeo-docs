/**
 * Bun API Server for triggering Notion jobs
 *
 * Entry point for the API server.
 *
 * Features:
 * - API key authentication for protected endpoints
 * - Comprehensive request audit logging
 * - Input validation and error handling
 * - Job management and execution
 */

// Start the server and export for testing
export { server, actualPort } from "./server";
