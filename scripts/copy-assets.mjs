#!/usr/bin/env node
/**
 * Post-build: copy non-TS assets (prompts, preview UI) from src/ to dist/.
 * tsc only compiles .ts files; .md and .html need to be copied manually.
 */

import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const copies = [
  { src: "src/prompts", dest: "dist/prompts" },
  { src: "src/preview/ui.html", dest: "dist/preview/ui.html" },
];

for (const { src, dest } of copies) {
  const srcPath = resolve(root, src);
  const destPath = resolve(root, dest);

  if (!existsSync(srcPath)) {
    console.log(`[copy-assets] skip (missing): ${src}`);
    continue;
  }

  await mkdir(dirname(destPath), { recursive: true });
  await cp(srcPath, destPath, { recursive: true, force: true });
  console.log(`[copy-assets] ${src} -> ${dest}`);
}
