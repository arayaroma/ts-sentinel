// Request-correlation ID middleware (supports OWASP A09: Security Logging
// and Monitoring Failures — not a mitigation itself, but gives every log
// line across the middleware chain a correlatable ID). Extracts an inbound
// X-Request-ID (or X-Trace-ID as a read-only alias) if present, otherwise
// generates a UUID v4 via the Fetch API's crypto.randomUUID(). The ID is
// forwarded to `next` as a request header and echoed back on the response
// header, including on short-circuited responses (e.g. a 429 from
// rateLimit()) — this middleware should run outermost in chain(...).
import type { Handler, Middleware } from "../types.js";

export interface TraceIdConfig {
  /** Header to read/write. Defaults to "X-Request-ID". */
  header?: string;
  /** ID generator. Defaults to crypto.randomUUID(). */
  generate?: () => string;
}

/**
 * Returns middleware that propagates a request-correlation ID: preserves an
 * inbound X-Request-ID/X-Trace-ID or generates one, forwards it to `next` on
 * the request, and always sets it on the outgoing response header — even
 * when `next` returns an error response (e.g. 429/401 from a downstream
 * middleware).
 *
 * Limitation: if `next` throws rather than returning a Response, there is no
 * Response object to attach the header to; the trace ID is guaranteed on any
 * Response this middleware sees, not retroactively injectable into a thrown
 * error. Callers wanting the ID in error logs should read it off the
 * forwarded request (`req.headers.get(header)`) before rethrowing/catching.
 */
export function traceId(cfg: TraceIdConfig = {}): Middleware {
  const header = cfg.header ?? "X-Request-ID";
  const generate = cfg.generate ?? (() => crypto.randomUUID());

  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const id = req.headers.get(header) || req.headers.get("X-Trace-ID") || generate();

      const forwardedHeaders = new Headers(req.headers);
      forwardedHeaders.set(header, id);
      const forwardedReq = new Request(req, { headers: forwardedHeaders });

      const res = await next(forwardedReq);
      const outHeaders = new Headers(res.headers);
      outHeaders.set(header, id);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      });
    };
  };
}
