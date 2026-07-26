import { describe, it, expect } from "vitest";
import { withTimeout } from "../../src/resource/index.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withTimeout", () => {
  it("passes through a fast handler unaffected", async () => {
    const mw = withTimeout(200);
    const res = await mw(async () => new Response(null, { status: 200 }))(new Request("http://x"));
    expect(res.status).toBe(200);
  });

  it("returns 504 when the handler is slower than the timeout", async () => {
    const mw = withTimeout(20);
    const res = await mw(async () => {
      await delay(500);
      return new Response(null, { status: 200 });
    })(new Request("http://x"));

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "request timeout" });
  });
});
