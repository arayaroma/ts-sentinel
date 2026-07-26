import { describe, it, expect } from "vitest";
import { maxBodyBytes, isBodyLimitError } from "../../src/resource/index.js";

const echoHandler = async (req: Request): Promise<Response> => {
  try {
    const text = await req.text();
    return new Response(text, { status: 200 });
  } catch (err) {
    if (isBodyLimitError(err)) {
      return new Response(null, { status: 413 });
    }
    return new Response(null, { status: 500 });
  }
};

// Node's locally-constructed `Request` does not auto-compute Content-Length
// the way a real incoming HTTP request (or a dispatched fetch()) does, so
// tests exercising the Content-Length-present path set it explicitly to
// faithfully reproduce what a server actually receives.
function requestWithContentLength(body: string): Request {
  return new Request("http://x", {
    method: "POST",
    body,
    headers: { "Content-Length": String(body.length) },
  });
}

describe("maxBodyBytes", () => {
  it("passes an undersized body", async () => {
    const mw = maxBodyBytes(1024);
    const res = await mw(echoHandler)(requestWithContentLength("small payload"));
    expect(res.status).toBe(200);
  });

  it("rejects an oversized body via Content-Length", async () => {
    const mw = maxBodyBytes(10);
    const res = await mw(echoHandler)(requestWithContentLength("x".repeat(100)));
    expect(res.status).toBe(413);
  });

  it("passes a body exactly at the limit", async () => {
    const mw = maxBodyBytes(13);
    const res = await mw(echoHandler)(requestWithContentLength("small payload"));
    expect(res.status).toBe(200);
  });

  it("still enforces the limit via stream read when Content-Length is absent (chunked)", async () => {
    const mw = maxBodyBytes(5);
    const req = new Request("http://x", { method: "POST", body: "y".repeat(50) });
    // This Node-constructed Request has no Content-Length (see helper
    // comment above) — exercises the fallback TransformStream path.
    expect(req.headers.get("content-length")).toBeNull();
    const res = await mw(echoHandler)(req);
    expect(res.status).toBe(413);
  });

  // Regression test: found via pentesting dar-docs-web. A caller that
  // composes maxBodyBytes but (like Astro's `next()`) ignores the request
  // this middleware passes downstream and reads its own *original* request
  // object instead must still be able to read that original request's body.
  // Before the fix, any request with a valid Content-Length under the limit
  // still got its body stream piped through and locked, so a second,
  // independent read of the ORIGINAL request (simulating the caller's own
  // access path) failed with "Body is unusable: Body has already been read".
  it("does not lock the original request's body stream when under the limit", async () => {
    const mw = maxBodyBytes(1024);
    const req = requestWithContentLength("small payload");

    // The middleware must not have touched `req.body` at all in the
    // pass-through case — read it directly here, bypassing whatever it
    // passed to `next`.
    await mw(async () => new Response(null, { status: 200 }))(req);

    const text = await req.text();
    expect(text).toBe("small payload");
  });
});
