import { describe, it, expect, beforeEach, vi } from "vitest";
import { auditLog } from "../../src/auditlog/index.js";
import type { AuditLogEntry } from "../../src/auditlog/index.js";
import { traceId } from "../../src/traceid/index.js";

const okHandler = async () => new Response(null, { status: 200 });
const deniedHandler = async () => new Response(null, { status: 403 });
const unauthorizedHandler = async () => new Response(null, { status: 401 });
const serverErrorHandler = async () => new Response(null, { status: 500 });

function collectSink() {
  const entries: AuditLogEntry[] = [];
  const sink = async (entry: AuditLogEntry) => {
    entries.push(entry);
  };
  return { entries, sink };
}

describe("auditLog", () => {
  it("produces an entry matching the spec shape", async () => {
    const { entries, sink } = collectSink();
    const mw = auditLog({ sink });
    const req = new Request("http://x/api/widgets?foo=bar", {
      headers: { "User-Agent": "test-agent/1.0" },
    });
    await mw(okHandler)(req);

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.schema_version).toBe("1.0");
    expect(entry.event_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(() => new Date(entry.timestamp).toISOString()).not.toThrow();
    expect(entry.actor).toEqual({ id: null, type: "anonymous" });
    expect(entry.http.method).toBe("GET");
    expect(entry.http.path).toBe("/api/widgets"); // query stripped by default
    expect(entry.http.status_code).toBe(200);
    expect(entry.network.user_agent).toBe("test-agent/1.0");
    expect(entry.outcome).toBe("success");
    expect(entry.trace_id).toBeUndefined();
  });

  it("keeps the query string when stripQuery is false", async () => {
    const { entries, sink } = collectSink();
    const mw = auditLog({ sink, stripQuery: false });
    const req = new Request("http://x/api/widgets?foo=bar");
    await mw(okHandler)(req);
    expect(entries[0]!.http.path).toBe("/api/widgets?foo=bar");
  });

  it("uses a custom resolveActor callback", async () => {
    const { entries, sink } = collectSink();
    const mw = auditLog({
      sink,
      resolveActor: async (req) => ({ id: req.headers.get("X-User-Id"), type: "user" }),
    });
    const req = new Request("http://x/", { headers: { "X-User-Id": "u-42" } });
    await mw(okHandler)(req);
    expect(entries[0]!.actor).toEqual({ id: "u-42", type: "user" });
  });

  describe("trace_id pickup", () => {
    it("picks up the trace ID set by a prior traceId() middleware", async () => {
      const { entries, sink } = collectSink();
      const combined = (next: any) => traceId()(auditLog({ sink })(next));
      const req = new Request("http://x/", { headers: { "X-Request-ID": "trace-abc" } });
      const res = await combined(okHandler)(req);

      expect(res.headers.get("X-Request-ID")).toBe("trace-abc");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.trace_id).toBe("trace-abc");
    });

    it("omits trace_id (does not fabricate one) when no traceId() ran", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      const req = new Request("http://x/");
      await mw(okHandler)(req);
      expect(entries[0]!.trace_id).toBeUndefined();
      expect("trace_id" in entries[0]!).toBe(false);
    });
  });

  describe("IP modes", () => {
    it("full mode returns the extracted IP unchanged", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, ipMode: "full" });
      const req = new Request("http://x/", { headers: { "X-Forwarded-For": "203.0.113.42" } });
      await mw(okHandler)(req);
      expect(entries[0]!.network.source_ip).toBe("203.0.113.42");
    });

    it("truncated mode zeroes the last IPv4 octet", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, ipMode: "truncated" });
      const req = new Request("http://x/", { headers: { "X-Forwarded-For": "203.0.113.42" } });
      await mw(okHandler)(req);
      expect(entries[0]!.network.source_ip).toBe("203.0.113.0");
    });

    it("truncated mode zeroes the last 80 bits of IPv6", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, ipMode: "truncated" });
      const req = new Request("http://x/", {
        headers: { "X-Forwarded-For": "2001:0db8:85a3:0000:0000:8a2e:0370:7334" },
      });
      await mw(okHandler)(req);
      expect(entries[0]!.network.source_ip).toBe("2001:0db8:85a3:0:0:0:0:0");
    });

    it("hashed mode returns a SHA-256 hex digest distinct from the raw IP", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, ipMode: "hashed" });
      const req = new Request("http://x/", { headers: { "X-Forwarded-For": "203.0.113.42" } });
      await mw(okHandler)(req);
      const hashed = entries[0]!.network.source_ip;
      expect(hashed).toMatch(/^[0-9a-f]{64}$/);
      expect(hashed).not.toBe("203.0.113.42");
    });

    it("all three modes produce distinct values from the same input IP", async () => {
      const ip = "198.51.100.7";
      const results: Record<string, string> = {};
      for (const mode of ["full", "truncated", "hashed"] as const) {
        const { entries, sink } = collectSink();
        const mw = auditLog({ sink, ipMode: mode });
        const req = new Request("http://x/", { headers: { "X-Forwarded-For": ip } });
        await mw(okHandler)(req);
        results[mode] = entries[0]!.network.source_ip;
      }
      const values = Object.values(results);
      expect(new Set(values).size).toBe(3);
    });

    it("falls back to 'unknown' when no IP header is present, in every mode", async () => {
      for (const mode of ["full", "truncated", "hashed"] as const) {
        const { entries, sink } = collectSink();
        const mw = auditLog({ sink, ipMode: mode });
        const req = new Request("http://x/");
        await mw(okHandler)(req);
        expect(entries[0]!.network.source_ip).toBe("unknown");
      }
    });
  });

  describe("sanitization", () => {
    it("strips CR/LF injection attempts from the path", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      const req = new Request("http://x/api/widgets%0d%0aInjected-Header:evil");
      await mw(okHandler)(req);
      const path = entries[0]!.http.path;
      expect(path).not.toMatch(/[\r\n]/);
      expect(path).not.toContain("\r");
      expect(path).not.toContain("\n");
    });

    it("strips control characters from an explicitly crafted user-agent", async () => {
      // Fetch's Headers implementation itself rejects literal CR/LF in a
      // header value (ByteString restriction), so a real CRLF-injection
      // attempt can't even reach this middleware via User-Agent in this
      // runtime — but other control characters (e.g. ESC) are accepted by
      // Headers and must still be stripped by the sanitizer as defense in
      // depth for runtimes that are less strict.
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      const req = new Request("http://x/", {
        headers: { "User-Agent": "evil-agent\x1bX-Injected: true" },
      });
      await mw(okHandler)(req);
      const ua = entries[0]!.network.user_agent;
      expect(ua).not.toMatch(/[\x00-\x1F\x7F-\x9F]/);
      expect(ua).toBe("evil-agentX-Injected: true");
    });

    it("caps an oversized user-agent to maxFieldLength", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, maxFieldLength: 20 });
      const req = new Request("http://x/", {
        headers: { "User-Agent": "a".repeat(1000) },
      });
      await mw(okHandler)(req);
      expect(entries[0]!.network.user_agent).toHaveLength(20);
      expect(entries[0]!.network.user_agent).toBe("a".repeat(20));
    });

    it("caps an oversized path to maxFieldLength", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, maxFieldLength: 10 });
      const req = new Request("http://x/" + "p".repeat(1000));
      await mw(okHandler)(req);
      expect(entries[0]!.http.path.length).toBeLessThanOrEqual(10);
    });
  });

  describe("outcome derivation", () => {
    it("maps status < 400 to success", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      await mw(okHandler)(new Request("http://x/"));
      expect(entries[0]!.outcome).toBe("success");
    });

    it("maps 401 to denied", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      await mw(unauthorizedHandler)(new Request("http://x/"));
      expect(entries[0]!.outcome).toBe("denied");
    });

    it("maps 403 to denied", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      await mw(deniedHandler)(new Request("http://x/"));
      expect(entries[0]!.outcome).toBe("denied");
    });

    it("maps other >= 400 statuses to failure", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      await mw(serverErrorHandler)(new Request("http://x/"));
      expect(entries[0]!.outcome).toBe("failure");
    });
  });

  describe("hash chaining", () => {
    it("links entry_hash(1) into prev_hash(2), and hash is a pure function of content", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink, tamperEvident: true });

      await mw(okHandler)(new Request("http://x/first"));
      await mw(okHandler)(new Request("http://x/second"));

      expect(entries).toHaveLength(2);
      const [first, second] = entries as [AuditLogEntry, AuditLogEntry];

      expect(first.entry_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(second.entry_hash).toMatch(/^[0-9a-f]{64}$/);
      // Chain linkage: entry 2's prev_hash is entry 1's entry_hash.
      expect(second.prev_hash).toBe(first.entry_hash);

      // Hash is a pure function of content: recomputing the hash of entry 1
      // (minus its own entry_hash) with the same prev_hash must reproduce
      // the same value...
      const recompute = async (entry: AuditLogEntry) => {
        const { entry_hash, ...withoutHash } = entry;
        void entry_hash;
        const data = new TextEncoder().encode(JSON.stringify(withoutHash));
        const digest = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      };
      expect(await recompute(first)).toBe(first.entry_hash);

      // ...but changing any field of entry 1 changes its hash, which would
      // break verification against entry 2's stored prev_hash.
      const tampered = { ...first, http: { ...first.http, path: "/tampered" } };
      expect(await recompute(tampered)).not.toBe(first.entry_hash);
    });

    it("does not set prev_hash/entry_hash when tamperEvident is false (default)", async () => {
      const { entries, sink } = collectSink();
      const mw = auditLog({ sink });
      await mw(okHandler)(new Request("http://x/"));
      expect(entries[0]!.entry_hash).toBeUndefined();
      expect(entries[0]!.prev_hash).toBeUndefined();
    });
  });

  describe("sink failure isolation", () => {
    it("a throwing sink does not affect the response the caller receives", async () => {
      const throwingSink = vi.fn(() => {
        throw new Error("sink exploded");
      });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mw = auditLog({ sink: throwingSink });

      const res = await mw(okHandler)(new Request("http://x/"));

      expect(res.status).toBe(200);
      expect(throwingSink).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("a rejecting async sink does not affect the response the caller receives", async () => {
      const rejectingSink = vi.fn(async () => {
        throw new Error("async sink exploded");
      });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mw = auditLog({ sink: rejectingSink });

      const res = await mw(okHandler)(new Request("http://x/"));

      expect(res.status).toBe(200);
      expect(rejectingSink).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
