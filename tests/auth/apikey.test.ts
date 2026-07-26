import { describe, it, expect } from "vitest";
import { requireApiKey } from "../../src/auth/index.js";

const okHandler = async () => new Response(null, { status: 200 });

describe("requireApiKey", () => {
  it("passes a valid key", async () => {
    const mw = requireApiKey({ validKeys: ["secret1", "secret2"] });
    const res = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "secret1" } })
    );
    expect(res.status).toBe(200);
  });

  it("passes the second valid key (rotation)", async () => {
    const mw = requireApiKey({ validKeys: ["secret1", "secret2"] });
    const res = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "secret2" } })
    );
    expect(res.status).toBe(200);
  });

  it("rejects an invalid key", async () => {
    const mw = requireApiKey({ validKeys: ["secret1"] });
    const res = await mw(okHandler)(
      new Request("http://x", { headers: { "X-API-Key": "wrong" } })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a missing key", async () => {
    const mw = requireApiKey({ validKeys: ["secret1"] });
    const res = await mw(okHandler)(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("honors a custom header name", async () => {
    const mw = requireApiKey({ header: "X-Custom-Key", validKeys: ["secret1"] });
    const res = await mw(okHandler)(
      new Request("http://x", { headers: { "X-Custom-Key": "secret1" } })
    );
    expect(res.status).toBe(200);
  });
});
