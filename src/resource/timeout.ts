// Bounds per-request wall-clock time. TS sibling of go-sentinel's
// resource.WithTimeout.
import type { Handler, Middleware } from "../types.js";

/**
 * Returns middleware that races the handler against a `ms`-millisecond
 * timer and, if the timer wins, responds with 504 Gateway Timeout and a
 * JSON body {"error": "..."}. Protects the caller from slow-loris-style
 * hangs.
 *
 * Unlike Go's `http.TimeoutHandler` (which cancels the handler's
 * `context.Context`, letting well-behaved handlers stop their own work),
 * the Fetch API's `Request` carries no built-in cancellation signal — so
 * a handler that ignores the timeout keeps running in the background even
 * after this middleware has already returned the 504. Handlers that need
 * to observe cancellation should accept an `AbortSignal` of their own and
 * wire it up outside this middleware (e.g. via a request-scoped context
 * object), which is out of scope for a framework-agnostic core library.
 */
export function withTimeout(ms: number): Middleware {
  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);

      const timeoutPromise = new Promise<Response>((resolve) => {
        controller.signal.addEventListener("abort", () => {
          resolve(
            new Response(JSON.stringify({ error: "request timeout" }), {
              status: 504,
              headers: { "Content-Type": "application/json" },
            })
          );
        });
      });

      try {
        return await Promise.race([next(req), timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    };
  };
}
