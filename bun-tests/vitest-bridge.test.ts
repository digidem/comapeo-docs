// @ts-nocheck - Bun types not fully compatible
import { test } from "bun:test";

const COMMAND = ["bunx", "vitest", "run", "--pool=threads"] as const;

function runVitest() {
  const result = Bun.spawnSync({
    cmd: [...COMMAND],
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...Bun.env,
      VITEST_BRIDGED: "1",
    },
  });

  if (result.exitCode !== 0) {
    throw new Error(`Vitest suite failed with exit code ${result.exitCode}`);
  }
}

test(
  "vitest suite",
  () => {
    runVitest();
  },
  // The full Vitest suite can take just under two minutes on this repo, and
  // Bun's own test harness adds enough overhead that 120s is too tight.
  { timeout: 300_000 }
);
