// Mirrors the README reference wiring example to guarantee the public API
// surface consumers depend on keeps compiling and behaving as documented.
import { describe, it, expect } from "vitest";
import {
  chain,
  secureHeaders,
  withTimeout,
  maxBodyBytes,
  rateLimitGlobal,
  rateLimit,
  requireApiKey,
} from "../../src/sentinel/index.js";
import type { Handler } from "../../src/types.js";

describe("reference wiring", () => {
  const apiKey = "test-key";
  const app: Handler = async () => new Response(null, { status: 200 });

  const handler = chain(
    secureHeaders(),
    withTimeout(5000),
    maxBodyBytes(1 << 20),
    rateLimitGlobal({ rps: 20, burst: 40 }),
    rateLimit({ rps: 5, burst: 10 }),
    requireApiKey({ validKeys: [apiKey] })
  )(app);

  it("a valid key passes through the full chain", async () => {
    const res = await handler(
      new Request("http://x", { headers: { "X-API-Key": apiKey } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("a missing key is rejected before reaching the app handler", async () => {
    const res = await handler(new Request("http://x"));
    expect(res.status).toBe(401);
  });
});
