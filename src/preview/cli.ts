#!/usr/bin/env node
/**
 * store-asset-generator-preview — local visual editor for generated store assets.
 *
 * Usage:
 *   store-asset-generator-preview [dir]
 *   store-asset-generator-preview ./store-assets
 *   store-asset-generator-preview --port 4000 ./store-assets
 */

import { startPreviewServer } from "./server.js";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv: string[]): { dir: string; port: number; open: boolean } {
  let dir = "./store-assets";
  let port = 4321;
  let open = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      port = parseInt(argv[++i] ?? "4321", 10);
    } else if (arg === "--no-open") {
      open = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      dir = arg;
    }
  }

  return { dir: resolve(dir), port, open };
}

function printHelp(): void {
  console.log(`store-asset-generator-preview — visual editor for generated store assets

Usage:
  store-asset-generator-preview [dir] [options]

Arguments:
  dir              Path to the store-assets directory (default: ./store-assets)

Options:
  --port, -p N     Port to listen on (default: 4321)
  --no-open        Don't auto-open in browser
  --help, -h       Show this help

Examples:
  store-asset-generator-preview ./store-assets
  store-asset-generator-preview ./store-assets --port 4000
  store-asset-generator-preview /path/to/my-app/store-assets
`);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Silently ignore — user can open manually
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  try {
    const server = await startPreviewServer({
      assetsDir: args.dir,
      port: args.port,
    });

    if (args.open) {
      openBrowser(server.url);
    }

    console.error(`\nPress Ctrl+C to stop`);

    // Keep process alive
    process.on("SIGINT", () => {
      console.error("\nShutting down…");
      server.close();
      process.exit(0);
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
