// Caps request body size. TS sibling of go-sentinel's resource.MaxBodyBytes.
import type { Handler, Middleware } from "../types.js";

/**
 * Returns middleware that caps the request body to `n` bytes. Pre-emptively
 * rejects requests whose declared Content-Length already exceeds n with 413
 * Request Entity Too Large. For requests with an unknown/absent
 * Content-Length (e.g. chunked transfer), wraps the body stream with a
 * byte-counting TransformStream that errors once n bytes have passed
 * through, so a handler reading the body observes the same 413-worthy
 * failure at read time rather than an unbounded read.
 */
export function maxBodyBytes(n: number): Middleware {
  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const declaredLength = req.headers.get("content-length");
      if (declaredLength !== null && Number(declaredLength) > n) {
        return tooLargeResponse();
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
