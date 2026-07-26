import { describe, it, expect } from "vitest";
import { rateLimit, rateLimitGlobal, apiKeyOrIp } from "../../src/ratelimit/index.js";

const okHandler = async () => new Response(null, { status: 200 });

describe("rateLimit", () => {
  it("passes under the limit", async () => {
    const mw = rateLimit({ rps: 100, burst: 5 });
    const res = await mw(okHandler)(
      new Request("http://x", { headers: { "X-Forwarded-For": "1.2.3.4" } })
    );
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After once the bucket is empty", async () => {
    const mw = rateLimit({ rps: 1, burst: 1 });
    const req = new Request("http://x", { headers: { "X-Forwarded-For": "5.6.7.8" } });

    const res1 = await mw(okHandler)(req);
    expect(res1.status).toBe(200);

    const res2 = await mw(okHandler)(req);
    expect(res2.status).toBe(429);
    expect(res2.headers.get("Retry-After")).not.toBeNull();
  });

  it("gives distinct keys independent buckets", async () => {
    const mw = rateLimit({ rps: 1, burst: 1 });

    const resA = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "keyA" } })
    );
    expect(resA.status).toBe(200);

    const resB = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "keyB" } })
    );
    expect(resB.status).toBe(200);
  });
});

describe("rateLimitGlobal", () => {
  it("caps aggregate throughput regardless of caller count", async () => {
    const callers = 50;
    const burst = 40;
    const mw = rateLimitGlobal({ rps: 20, burst });

    let accepted = 0;
    for (let i = 0; i < callers; i++) {
      const res = await mw(okHandler)(
        new Request("http://x", { headers: { "X-API-Key": `caller-${i}` } })
      );
      if (res.status === 200) accepted++;
      else expect(res.status).toBe(429);
    }

    expect(accepted).toBe(burst);
    expect(accepted).toBeLessThan(callers);
  });

  it("still shares a single bucket across distinct keys", async () => {
    const mw = rateLimitGlobal({ rps: 1, burst: 1 });

    const res1 = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "keyA" } })
    );
    expect(res1.status).toBe(200);

    const res2 = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "keyB" } })
    );
    expect(res2.status).toBe(429);
  });
});

describe("apiKeyOrIp", () => {
  it("prefers the API key", () => {
    const req = new Request("http://x", {
      headers: { "X-API-Key": "abc", "X-Forwarded-For": "9.9.9.9" },
    });
    expect(apiKeyOrIp(req)).toBe("key:abc");
  });

  it("falls back to X-Forwarded-For", () => {
    const req = new Request("http://x", { headers: { "X-Forwarded-For": "9.9.9.9" } });
    expect(apiKeyOrIp(req)).toBe("ip:9.9.9.9");
  });

  it("falls back to unknown when nothing is present", () => {
    const req = new Request("http://x");
    expect(apiKeyOrIp(req)).toBe("ip:unknown");
  });
});
