import chalk from "chalk";
import type { Ora } from "ora";

let isShuttingDown = false;
let isInitialized = false;
let activeSpinners: Ora[] = [];

function removeSpinner(spinner: Ora) {
  activeSpinners = activeSpinners.filter((active) => active !== spinner);
}

export function trackSpinner(spinner: Ora): () => void {
  activeSpinners.push(spinner);
  return () => removeSpinner(spinner);
}

async function cleanupResources() {
  console.log(chalk.yellow("\n🧹 Cleaning up resources..."));

  for (const spinner of activeSpinners) {
    if (spinner.isSpinning) {
      spinner.stop();
    }
  }
  activeSpinners = [];

  if (global.gc) {
    global.gc();
  }

  await new Promise((resolve) => setImmediate(resolve));
}

export async function gracefulShutdown(exitCode: number = 0, signal?: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(
    chalk.yellow(
      `\n${signal ? `Received ${signal}, ` : ""}Shutting down gracefully...`
    )
  );

  try {
    await cleanupResources();
    console.log(chalk.green("✅ Cleanup completed"));
  } catch (error) {
    console.error(chalk.red("❌ Error during cleanup:"), error);
  }

  if (process.env.NODE_ENV !== "test") {
    process.exit(exitCode);
  }
}

export function initializeGracefulShutdownHandlers() {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  process.on("SIGINT", () => {
    if (process.env.NODE_ENV !== "test") {
      void gracefulShutdown(130, "SIGINT");
    }
  });

  process.on("SIGTERM", () => {
    if (process.env.NODE_ENV !== "test") {
      void gracefulShutdown(143, "SIGTERM");
    }
  });

  process.on("uncaughtException", (error) => {
    console.error(chalk.red("❌ Uncaught exception:"), error);
    if (process.env.NODE_ENV !== "test") {
      void gracefulShutdown(1);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error(
      chalk.red("❌ Unhandled rejection at:"),
      promise,
      "reason:",
      reason
    );
    if (process.env.NODE_ENV !== "test") {
      void gracefulShutdown(1);
    }
  });
}
