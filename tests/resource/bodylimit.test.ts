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

describe("maxBodyBytes", () => {
  it("passes an undersized body", async () => {
    const mw = maxBodyBytes(1024);
    const req = new Request("http://x", { method: "POST", body: "small payload" });
    const res = await mw(echoHandler)(req);
    expect(res.status).toBe(200);
  });

  it("rejects an oversized body via Content-Length", async () => {
    const mw = maxBodyBytes(10);
    const req = new Request("http://x", { method: "POST", body: "x".repeat(100) });
    const res = await mw(echoHandler)(req);
    expect(res.status).toBe(413);
  });

  it("passes a body exactly at the limit", async () => {
    const mw = maxBodyBytes(13);
    const req = new Request("http://x", { method: "POST", body: "small payload" });
    const res = await mw(echoHandler)(req);
    expect(res.status).toBe(200);
  });
});
