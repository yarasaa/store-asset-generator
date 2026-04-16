/**
 * MCP sampling wrapper.
 *
 * Lets tool implementations ask the host (Claude Code) to run an LLM
 * completion on their behalf — using the user's existing Claude Pro/Max
 * subscription. No API key, no billing, no external HTTP call.
 *
 * The Server instance is set once from index.ts and held at module level
 * so handlers don't need to change their signatures.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

let serverRef: Server | null = null;
let samplingProbedResult: boolean | null = null;

export function setServer(server: Server): void {
  serverRef = server;
  samplingProbedResult = null; // reset probe cache on server change
}

export function getServer(): Server {
  if (!serverRef) {
    throw new Error(
      "Sampling server not initialized. Call setServer() from index.ts before using sampling."
    );
  }
  return serverRef;
}

/**
 * Probe whether the connected MCP host supports sampling.
 *
 * Some hosts (notably Claude Code CLI as of early 2026) do not implement
 * the `sampling/createMessage` method and respond with JSON-RPC -32601
 * "Method not found". Other hosts (Claude Desktop, Cursor) support it.
 *
 * Result is cached per-session — we only ask once.
 *
 * Returns true if sampling works, false if the host doesn't support it.
 * Any other error (timeout, network, user rejection) also returns false
 * since the practical effect is the same: we can't use sampling.
 */
export async function probeSampling(): Promise<boolean> {
  if (samplingProbedResult !== null) return samplingProbedResult;
  if (!serverRef) {
    samplingProbedResult = false;
    return false;
  }

  try {
    // Tiny probe: 1-token completion. If the host supports sampling, this
    // returns quickly. If not, we get "Method not found" almost immediately.
    await withTimeout(
      serverRef.createMessage({
        messages: [{ role: "user", content: { type: "text", text: "ping" } }],
        maxTokens: 1,
        systemPrompt: "Reply with a single word.",
        includeContext: "none",
      }),
      10_000
    );
    samplingProbedResult = true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // "Method not found" → host doesn't implement sampling. Cache false.
    // Other errors (rate limit, timeout) also cache false for this session.
    samplingProbedResult = false;
    if (msg.toLowerCase().includes("method not found") || msg.includes("-32601")) {
      console.error("[sampling] Host does not support sampling — switching to bootstrap mode");
    } else {
      console.error(`[sampling] Probe failed: ${msg} — switching to bootstrap mode`);
    }
  }

  return samplingProbedResult;
}

export function isSamplingAvailable(): boolean | null {
  return samplingProbedResult;
}

/** Reset probe cache — exposed for tests. */
export function resetSamplingProbe(): void {
  samplingProbedResult = null;
}

export interface SamplingMessage {
  role: "user" | "assistant";
  content:
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string };
}

export interface SamplingOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  retries?: number;
  /** Model hints forwarded to the client. */
  modelHints?: string[];
}

export interface SamplingResult {
  text: string;
  model: string;
  stopReason?: string;
}

/**
 * Request a completion from the host LLM via MCP sampling.
 *
 * Throws if the client does not support sampling or the user rejects it.
 * Callers should catch and degrade gracefully.
 */
export async function requestCompletion(
  messages: SamplingMessage[],
  opts: SamplingOptions = {}
): Promise<SamplingResult> {
  const server = getServer();
  const maxTokens = opts.maxTokens ?? 4096;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const retries = opts.retries ?? 1;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        server.createMessage({
          messages,
          maxTokens,
          systemPrompt: opts.systemPrompt,
          temperature: opts.temperature,
          modelPreferences: opts.modelHints
            ? { hints: opts.modelHints.map((name) => ({ name })) }
            : undefined,
          includeContext: "none",
        }),
        timeoutMs
      );

      const content = result.content;
      let text = "";
      if (content && typeof content === "object" && "type" in content) {
        if (content.type === "text") {
          text = content.text;
        } else {
          throw new Error(
            `Expected text response from sampling, got ${content.type}`
          );
        }
      } else {
        throw new Error("Sampling returned empty content");
      }

      return {
        text,
        model: result.model ?? "unknown",
        stopReason: result.stopReason,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        // Brief backoff before retry
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw new Error(
    `Sampling failed after ${retries + 1} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

/**
 * Request a completion and parse the response as JSON.
 *
 * Looks for a ```json fenced block first, then falls back to parsing the
 * entire text. Useful for structured outputs like screen selection or
 * metadata copy.
 */
export async function requestJson<T>(
  messages: SamplingMessage[],
  opts: SamplingOptions = {}
): Promise<T> {
  const result = await requestCompletion(messages, opts);
  const text = result.text.trim();

  // Try fenced block first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw new Error(
      `Sampling response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }\nResponse: ${text.slice(0, 500)}`
    );
  }
}

/**
 * Request a completion and extract HTML from the response.
 *
 * Looks for a ```html fenced block first, then falls back to treating the
 * entire response as HTML if it starts with `<!DOCTYPE` or `<html`.
 */
export async function requestHtml(
  messages: SamplingMessage[],
  opts: SamplingOptions = {}
): Promise<string> {
  const result = await requestCompletion(messages, opts);
  const text = result.text.trim();

  const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  if (text.toLowerCase().startsWith("<!doctype") || text.toLowerCase().startsWith("<html")) {
    return text;
  }

  throw new Error(
    `Sampling response did not contain HTML. First 300 chars: ${text.slice(0, 300)}`
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Sampling request timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
