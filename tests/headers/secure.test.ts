import { describe, it, expect } from "vitest";
import { secureHeaders } from "../../src/headers/index.js";

const REQUIRED_HEADERS = [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "Referrer-Policy",
];

describe("secureHeaders", () => {
  it("sets all documented headers by default", async () => {
    const mw = secureHeaders();
    const res = await mw(async () => new Response(null, { status: 200 }))(new Request("http://x"));

    for (const h of REQUIRED_HEADERS) {
      expect(res.headers.get(h)).not.toBeNull();
    }
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toBeNull();
  });

  it("only sets Permissions-Policy when explicitly configured", async () => {
    const mw = secureHeaders({ permissionsPolicy: "geolocation=(), camera=()" });
    const res = await mw(async () => new Response(null, { status: 200 }))(new Request("http://x"));
    expect(res.headers.get("Permissions-Policy")).toBe("geolocation=(), camera=()");
  });

  it("lets a custom CSP override the default", async () => {
    const mw = secureHeaders({ contentSecurityPolicy: "default-src 'none'" });
    const res = await mw(async () => new Response(null, { status: 200 }))(new Request("http://x"));
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
  });

  it("still sets headers on a non-2xx response", async () => {
    const mw = secureHeaders();
    const res = await mw(async () => new Response(null, { status: 404 }))(new Request("http://x"));
    for (const h of REQUIRED_HEADERS) {
      expect(res.headers.get(h)).not.toBeNull();
    }
  });
});
