/**
 * Type declarations for Bun module
 * This file provides minimal type definitions for Bun-specific APIs used in tests
 */

declare module "bun" {
  export interface Server {
    fetch(req: Request): Response | Promise<Response>;
    close(): void;
    stop(): void;
  }

  export interface ServeOptions {
    fetch(req: Request): Response | Promise<Response>;
    port?: number;
    hostname?: string;
  }

  export function serve(options: ServeOptions): Server;

  export interface ShellResult {
    stdout: Buffer | string;
    stderr: Buffer | string;
    exitCode: number;
    quiet(): ShellResult;
    text(): Promise<string>;
    toString(): string;
  }

  export const $: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => ShellResult;
}
