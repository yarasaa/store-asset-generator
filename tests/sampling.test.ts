/**
 * Sampling wrapper — parser tests (no real MCP sampling required).
 *
 * We can't test requestCompletion() end-to-end without an MCP client, but
 * we CAN test the JSON/HTML extraction logic that runs on the response.
 * So we stub the server and call the wrappers with canned responses.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setServer, requestJson, requestHtml } from "../src/utils/sampling.js";

function makeStubServer(response: string) {
  return {
    createMessage: async () => ({
      content: { type: "text", text: response },
      model: "stub-model",
      stopReason: "endTurn",
    }),
  } as any;
}

describe("sampling JSON extraction", () => {
  beforeEach(() => {
    setServer(makeStubServer("") as any);
  });

  it("parses a fenced json block", async () => {
    setServer(
      makeStubServer('Here is the result:\n```json\n{"foo": "bar", "n": 42}\n```\nDone.') as any
    );
    const result = await requestJson<{ foo: string; n: number }>([
      { role: "user", content: { type: "text", text: "test" } },
    ]);
    expect(result.foo).toBe("bar");
    expect(result.n).toBe(42);
  });

  it("parses bare JSON without a fence", async () => {
    setServer(makeStubServer('{"a": 1, "b": [2, 3]}') as any);
    const result = await requestJson<{ a: number; b: number[] }>([
      { role: "user", content: { type: "text", text: "test" } },
    ]);
    expect(result.a).toBe(1);
    expect(result.b).toEqual([2, 3]);
  });

  it("throws on invalid JSON", async () => {
    setServer(makeStubServer("not json at all") as any);
    await expect(
      requestJson([{ role: "user", content: { type: "text", text: "test" } }])
    ).rejects.toThrow(/not valid JSON/);
  });
});

describe("sampling HTML extraction", () => {
  it("extracts html from a fenced html block", async () => {
    const html = "<!DOCTYPE html><html><body>hello</body></html>";
    setServer(makeStubServer("```html\n" + html + "\n```") as any);
    const result = await requestHtml([
      { role: "user", content: { type: "text", text: "test" } },
    ]);
    expect(result).toBe(html);
  });

  it("accepts bare HTML starting with doctype", async () => {
    const html = "<!DOCTYPE html><html><body>bare</body></html>";
    setServer(makeStubServer(html) as any);
    const result = await requestHtml([
      { role: "user", content: { type: "text", text: "test" } },
    ]);
    expect(result).toContain("<body>bare</body>");
  });

  it("throws on non-HTML response", async () => {
    setServer(makeStubServer("just some prose") as any);
    await expect(
      requestHtml([{ role: "user", content: { type: "text", text: "test" } }])
    ).rejects.toThrow(/did not contain HTML/);
  });
});
