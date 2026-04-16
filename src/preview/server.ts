/**
 * Preview UI — local HTTP server for editing store assets after generation.
 *
 * Uses only Node built-ins (http, fs) — no express, no framework, no extra
 * dependencies. Run via the `store-asset-generator-preview` bin command.
 *
 *   $ npx store-asset-generator-preview ./store-assets
 *
 * Serves:
 *   GET  /                      → ui.html
 *   GET  /api/config            → config.json
 *   POST /api/config            → update config.json
 *   GET  /api/mockups           → list of mockup files
 *   GET  /mockups/:relative     → stream a mockup PNG
 *   POST /api/regenerate        → re-render a mockup with new HTML/params
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, resolve, relative, extname, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PreviewServerOptions {
  assetsDir: string;
  port?: number;
}

export async function startPreviewServer(
  options: PreviewServerOptions
): Promise<{ port: number; url: string; close: () => void }> {
  const assetsDir = resolve(options.assetsDir);
  const port = options.port ?? 4321;

  // Ensure assets directory exists
  try {
    await stat(assetsDir);
  } catch {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }

  const uiPath = await resolveUiPath();

  const server = createServer((req, res) => {
    handleRequest(req, res, assetsDir, uiPath).catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: msg });
    });
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.error(`Preview UI running at ${url}`);
      console.error(`Serving assets from ${assetsDir}`);
      resolvePromise({
        port,
        url,
        close: () => server.close(),
      });
    });
  });
}

async function resolveUiPath(): Promise<string> {
  // Built: dist/preview/server.js → ui.html is at dist/preview/ui.html
  const builtPath = join(__dirname, "ui.html");
  try {
    await stat(builtPath);
    return builtPath;
  } catch {}
  // Dev: fall back to src/preview/ui.html
  const devPath = resolve(__dirname, "..", "..", "src", "preview", "ui.html");
  await stat(devPath);
  return devPath;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  assetsDir: string,
  uiPath: string
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  // Serve UI
  if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    const html = await readFile(uiPath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // GET /api/config
  if (method === "GET" && pathname === "/api/config") {
    const configPath = join(assetsDir, "config.json");
    try {
      const content = await readFile(configPath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(content);
    } catch {
      sendJson(res, 200, { empty: true, message: "No config.json yet" });
    }
    return;
  }

  // POST /api/config
  if (method === "POST" && pathname === "/api/config") {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    const configPath = join(assetsDir, "config.json");
    await writeFile(configPath, JSON.stringify(parsed, null, 2), "utf-8");
    sendJson(res, 200, { saved: true });
    return;
  }

  // GET /api/mockups — list all PNGs under mockups/
  if (method === "GET" && pathname === "/api/mockups") {
    const mockupsRoot = join(assetsDir, "mockups");
    const files = await listFilesRecursive(mockupsRoot);
    const list = files
      .filter((f) => extname(f).toLowerCase() === ".png")
      .map((f) => ({
        path: f,
        rel: relative(mockupsRoot, f),
        name: basename(f),
        url: `/mockups/${relative(mockupsRoot, f).split("/").map(encodeURIComponent).join("/")}`,
      }));
    sendJson(res, 200, { count: list.length, mockups: list });
    return;
  }

  // GET /api/metadata
  if (method === "GET" && pathname === "/api/metadata") {
    const metadataPath = join(assetsDir, "metadata", "copy.json");
    try {
      const content = await readFile(metadataPath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(content);
    } catch {
      sendJson(res, 200, { empty: true });
    }
    return;
  }

  // POST /api/metadata
  if (method === "POST" && pathname === "/api/metadata") {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    const metadataDir = join(assetsDir, "metadata");
    const metadataPath = join(metadataDir, "copy.json");
    await writeFile(metadataPath, JSON.stringify(parsed, null, 2), "utf-8");
    sendJson(res, 200, { saved: true });
    return;
  }

  // GET /mockups/:rel → stream PNG
  if (method === "GET" && pathname.startsWith("/mockups/")) {
    const rel = decodeURIComponent(pathname.replace(/^\/mockups\//, ""));
    // Prevent path traversal
    const fullPath = resolve(join(assetsDir, "mockups", rel));
    if (!fullPath.startsWith(resolve(join(assetsDir, "mockups")))) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    try {
      const buffer = await readFile(fullPath);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      });
      res.end(buffer);
    } catch {
      sendJson(res, 404, { error: "Not found" });
    }
    return;
  }

  // POST /api/regenerate — re-render a mockup with new HTML
  if (method === "POST" && pathname === "/api/regenerate") {
    const body = await readBody(req);
    const { html, output_path, width, height, screenshot_path } = JSON.parse(body);
    if (!html || !output_path) {
      sendJson(res, 400, { error: "html and output_path required" });
      return;
    }
    // Dynamic import to avoid loading puppeteer unless actually used
    const { generateMockup } = await import("../tools/mockup.js");
    const result = await generateMockup({
      mode: "render",
      html,
      output_path,
      width: width ?? 1290,
      height: height ?? 2796,
      screenshot_path,
    });
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: `Unknown route: ${method} ${pathname}` });
}

// ── Helpers ──

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await listFilesRecursive(full)));
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  } catch {
    // Directory doesn't exist yet
  }
  return out;
}
