/**
 * Server startup and shutdown logic
 */
// eslint-disable-next-line import/no-unresolved
import { serve } from "bun";
import { getAuth } from "./auth";
import { getAudit } from "./audit";
import { handleRequest } from "./request-handler";
import { resetFetchJobLock } from "./fetch-job-lock";
import { isContentRepoWorkingTreeDirty } from "./content-repo";

const PORT = parseInt(process.env.API_PORT || "3001");
const HOST = process.env.API_HOST || "localhost";

// Check if running in test mode
const isTestMode =
  process.env.NODE_ENV === "test" || process.env.API_PORT === "0";

// Start server
const server = serve({
  port: isTestMode ? 0 : PORT, // Use random port in test mode
  hostname: HOST,
  fetch: handleRequest,
});

// Get the actual port (needed for tests where port is 0)
const actualPort = isTestMode ? (server as { port?: number }).port : PORT;

// Clear in-memory fetch lock state on startup.
resetFetchJobLock();

// Log startup information (skip in test mode)
if (!isTestMode) {
  const authEnabled = getAuth().isAuthenticationEnabled();
  console.log(`🚀 Notion Jobs API Server running on http://${HOST}:${PORT}`);
  console.log(
    `\nAuthentication: ${authEnabled ? "enabled" : "disabled (no API keys configured)"}`
  );
  console.log(`Audit logging: enabled (logs: ${getAudit().getLogPath()})`);
  console.log("\nAvailable endpoints:");
  console.log("  GET    /health              - Health check (public)");
  console.log(
    "  GET    /docs                - API documentation (OpenAPI spec) (public)"
  );
  console.log(
    "  GET    /jobs/types          - List available job types (public)"
  );
  console.log(
    "  GET    /jobs                - List all jobs (?status=, ?type= filters) [requires auth]"
  );
  console.log(
    "  POST   /jobs                - Create a new job [requires auth]"
  );
  console.log("  GET    /jobs/:id            - Get job status [requires auth]");
  console.log("  DELETE /jobs/:id            - Cancel a job [requires auth]");

  if (authEnabled) {
    console.log("\n🔐 Authentication is enabled.");
    console.log("   Use: Authorization: Bearer <api-key>");
    console.log(
      `   Configured keys: ${getAuth()
        .listKeys()
        .map((k) => k.name)
        .join(", ")}`
    );
  } else {
    console.log(
      "\n⚠️  Authentication is disabled. Set API_KEY_* environment variables to enable."
    );
  }

  console.log("\nExample: Create a fetch-all job");
  const authExample = authEnabled
    ? '-H "Authorization: Bearer <api-key>" \\'
    : "";
  console.log(`  curl -X POST http://${HOST}:${PORT}/jobs \\`);
  if (authExample) {
    console.log(`    ${authExample}`);
  }
  console.log("    -H 'Content-Type: application/json' \\");
  console.log('    -d \'{"type": "fetch-all"}\'');

  console.log("\nExample: Cancel a job");
  console.log(`  curl -X DELETE http://${HOST}:${PORT}/jobs/{jobId} \\`);
  if (authExample) {
    console.log(`    ${authExample}`);
  }

  console.log("\nExample: Filter jobs by status");
  console.log(`  curl http://${HOST}:${PORT}/jobs?status=running \\`);
  if (authExample) {
    console.log(`    -H "${authExample.replace(" \\", "")}"`);
  }

  void (async () => {
    try {
      const dirty = await isContentRepoWorkingTreeDirty();
      if (dirty) {
        console.warn(
          "⚠️  Content repo working tree is dirty at startup. Use force=true for the next fetch job if cleanup is expected."
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `⚠️  Unable to inspect content repo working tree at startup: ${message}`
      );
    }
  })();
}

// Handle graceful shutdown (only in non-test mode)
if (!isTestMode) {
  process.on("SIGINT", () => {
    console.log("\n\nShutting down gracefully...");
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\nShutting down gracefully...");
    server.stop();
    process.exit(0);
  });
}

export { server, actualPort };
