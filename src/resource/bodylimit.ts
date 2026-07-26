// Caps request body size. TS sibling of go-sentinel's resource.MaxBodyBytes.
import type { Handler, Middleware } from "../types.js";

/**
 * Returns middleware that caps the request body to `n` bytes.
 *
 * - Content-Length present: pre-emptively rejects with 413 if it exceeds
 *   `n`, otherwise passes the *original, untouched* request through — no
 *   stream wrapping happens in this case (see the inline comment on why).
 * - Content-Length absent (e.g. chunked transfer): wraps the body stream
 *   with a byte-counting TransformStream that errors once `n` bytes have
 *   passed through, so a handler reading the body observes a 413-worthy
 *   failure at read time rather than an unbounded read. Note: if the
 *   caller composing this middleware discards the request this middleware
 *   returns/passes to `next` and reads from its own original request
 *   instead (as some framework integrations must, e.g. Astro's
 *   `next()`), this chunked-body enforcement never actually runs —
 *   only the pre-emptive Content-Length check applies in that case.
 */
export function maxBodyBytes(n: number): Middleware {
  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const declaredLength = req.headers.get("content-length");
      if (declaredLength !== null) {
        // A valid, present Content-Length under the limit is already fully
        // verified — pass the request through completely untouched. Do NOT
        // pipe/reconstruct the body in this case: some callers (this
        // middleware included, when composed generically) only pass the
        // *original* request on to the next handler regardless of what this
        // function returns, so wrapping the stream here would still lock
        // the original request's body out from under that handler, causing
        // "Body is unusable: Body has already been read" even though the
        // request was always within limits.
        if (Number(declaredLength) > n) {
          return tooLargeResponse();
        }
        return next(req);
      }

      if (!req.body) {
        return next(req);
      }

      let seen = 0;
      let exceeded = false;
      const limited = req.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            seen += chunk.byteLength;
            if (seen > n) {
              exceeded = true;
              controller.error(new BodyLimitExceededError(n));
              return;
            }
            controller.enqueue(chunk);
          },
        })
      );

      const limitedReq = new Request(req, { body: limited, duplex: "half" } as RequestInit);

      try {
        return await next(limitedReq);
      } catch (err) {
        if (exceeded || err instanceof BodyLimitExceededError) {
          return tooLargeResponse();
        }
        throw err;
      }
    };
  };
}

/** Thrown into the body stream once maxBodyBytes' limit is exceeded. */
export class BodyLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`request body exceeded ${limit} byte limit`);
    this.name = "BodyLimitExceededError";
  }
}

/**
 * Reports whether err was thrown by a body read after maxBodyBytes' limit
 * was exceeded, so callers reading the body directly can map it to a 413
 * response from within their own handler.
 */
export function isBodyLimitError(err: unknown): err is BodyLimitExceededError {
  return err instanceof BodyLimitExceededError;
}

function tooLargeResponse(): Response {
  return new Response(JSON.stringify({ error: "request body too large" }), {
    status: 413,
    headers: { "Content-Type": "application/json" },
  });
}
