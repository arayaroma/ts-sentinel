import { describe, it, expect } from "vitest";
import { traceId } from "../../src/traceid/index.js";

const okHandler = async () => new Response(null, { status: 200 });
const notFoundHandler = async () => new Response(null, { status: 429, statusText: "Too Many Requests" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("traceId", () => {
  it("preserves an inbound X-Request-ID verbatim", async () => {
    const mw = traceId();
    const req = new Request("http://x", { headers: { "X-Request-ID": "abc-123" } });
    const res = await mw(okHandler)(req);
    expect(res.headers.get("X-Request-ID")).toBe("abc-123");
  });

  it("accepts an inbound X-Trace-ID as a fallback", async () => {
    const mw = traceId();
    const req = new Request("http://x", { headers: { "X-Trace-ID": "trace-456" } });
    const res = await mw(okHandler)(req);
    expect(res.headers.get("X-Request-ID")).toBe("trace-456");
  });

  it("prefers X-Request-ID over X-Trace-ID when both are present", async () => {
    const mw = traceId();
    const req = new Request("http://x", {
      headers: { "X-Request-ID": "primary", "X-Trace-ID": "secondary" },
    });
    const res = await mw(okHandler)(req);
    expect(res.headers.get("X-Request-ID")).toBe("primary");
  });

  it("generates a UUID when no inbound header is present", async () => {
    const mw = traceId();
    const req = new Request("http://x");
    const res = await mw(okHandler)(req);
    const id = res.headers.get("X-Request-ID");
    expect(id).toMatch(UUID_RE);
  });

  it("forwards the generated ID to the downstream handler", async () => {
    const mw = traceId();
    let seen: string | null = null;
    const capturingHandler = async (req: Request) => {
      seen = req.headers.get("X-Request-ID");
      return new Response(null, { status: 200 });
    };
    const req = new Request("http://x");
    const res = await mw(capturingHandler)(req);
    expect(seen).toMatch(UUID_RE);
    expect(seen).toBe(res.headers.get("X-Request-ID"));
  });

  it("sets the response header on a downstream 429 short-circuit", async () => {
    const mw = traceId();
    const req = new Request("http://x", { headers: { "X-Request-ID": "keep-me" } });
    const res = await mw(notFoundHandler)(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("X-Request-ID")).toBe("keep-me");
  });

  it("honors a custom header name", async () => {
    const mw = traceId({ header: "X-Correlation-ID" });
    const req = new Request("http://x", { headers: { "X-Correlation-ID": "custom-1" } });
    const res = await mw(okHandler)(req);
    expect(res.headers.get("X-Correlation-ID")).toBe("custom-1");
    expect(res.headers.get("X-Request-ID")).toBeNull();
  });

  it("honors a custom generate function", async () => {
    const mw = traceId({ generate: () => "fixed-id" });
    const req = new Request("http://x");
    const res = await mw(okHandler)(req);
    expect(res.headers.get("X-Request-ID")).toBe("fixed-id");
  });
});
