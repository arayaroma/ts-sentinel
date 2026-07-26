# Spec

## Header

Canonical header: `X-Request-ID` (more widely recognized/used by proxies, CDNs, and log
aggregators than `X-Trace-ID`; `X-Trace-ID` is used as an alias-accept on read only, not written).

## `traceId()` middleware

```ts
export interface TraceIdConfig {
  /** Header to read/write. Defaults to "X-Request-ID". */
  header?: string;
  /** ID generator. Defaults to crypto.randomUUID(). */
  generate?: () => string;
}

export function traceId(cfg: TraceIdConfig = {}): Middleware {
  const header = cfg.header ?? "X-Request-ID";
  const generate = cfg.generate ?? (() => crypto.randomUUID());
  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const id = req.headers.get(header) || req.headers.get("X-Trace-ID") || generate();
      const forwardedReq = new Request(req, { headers: new Headers(req.headers) });
      forwardedReq.headers.set(header, id);
      const res = await next(forwardedReq);
      const outHeaders = new Headers(res.headers);
      outHeaders.set(header, id);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
    };
  };
}
```

- Accepts an inbound `X-Request-ID` or `X-Trace-ID` if the caller already set one (trust the
  caller's ID for correlation across services — a security-conscious caller could spoof it, but
  trace IDs are a debugging aid, not an auth mechanism, so this is an accepted tradeoff, same as
  most trace-id middleware in the ecosystem).
- Generates via `crypto.randomUUID()` (available in the Fetch API/Web Crypto surface this library
  already targets — Node 18+, Cloudflare Workers, Deno, Bun all support it — no new dependency).
- Always writes the response header, even if `next` throws — wrap in try/finally so an error path
  still gets a trace ID attached before the error propagates or is caught by an outer handler (a
  thrown error means no `Response` exists yet to attach a header to; document this limitation:
  the trace ID is guaranteed on any `Response` this middleware sees, not retroactively injectable
  into an exception object).
- Position: must run outermost in `chain(...)`, before `secureHeaders()` isn't required, but
  before `rateLimit()`/`requireApiKey()` so their short-circuit responses (429/401) still carry
  the trace ID — update the README's reference wiring to show `traceId()` first.

## Reading the trace ID back in application code

Since the ID is set as a request header before calling `next`, application code (the final
handler) reads it the same way any header is read: `req.headers.get("X-Request-ID")`. No
additional helper export is strictly needed given Fetch API `Request` is already the read
mechanism — document this in the README rather than adding a redundant `getTraceId(req)` wrapper
(avoid API surface bloat for a one-liner).

## Acceptance

See `ac.md`.
