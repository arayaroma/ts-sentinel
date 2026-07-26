// API-key based authentication middleware (OWASP A07 Identification/
// Authentication Failures). TS sibling of go-sentinel's auth package.
import type { Handler, Middleware } from "../types.js";

export interface ApiKeyConfig {
  /** Header carrying the API key. Defaults to "X-API-Key". */
  header?: string;
  /** Set of keys accepted as valid. Multiple keys allow zero-downtime rotation. */
  validKeys: string[];
}

const DEFAULT_HEADER = "X-API-Key";

/**
 * Returns middleware that rejects requests whose API key (read from
 * cfg.header, or X-API-Key by default) does not match one of
 * cfg.validKeys. Comparison is constant-time to avoid timing attacks.
 * Missing or mismatching keys fail closed with 401 and a JSON body
 * {"error": "..."}.
 */
export function requireApiKey(cfg: ApiKeyConfig): Middleware {
  const header = cfg.header || DEFAULT_HEADER;

  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const key = req.headers.get(header);
      if (!key || !isValidKey(key, cfg.validKeys)) {
        return unauthorizedResponse();
      }
      return next(req);
    };
  };
}

function isValidKey(key: string, validKeys: string[]): boolean {
  let found = false;
  for (const valid of validKeys) {
    // Always compare against every configured key (not short-circuiting on
    // match) to keep timing independent of which key, if any, matches.
    if (constantTimeEqual(key, valid)) {
      found = true;
    }
  }
  return found;
}

/**
 * Constant-time string comparison using the Web Crypto API's subtle digest,
 * available in every Fetch-API-standard runtime this library targets (no
 * Node-only `crypto.timingSafeEqual` dependency, matching go-sentinel's
 * stdlib-only, zero-dependency ethos).
 */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  // Different lengths are never equal, but still walk a same-length dummy
  // comparison so this branch alone doesn't leak length via timing beyond
  // what's already observable from the request itself.
  const maxLen = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i++) {
    const byteA = i < bufA.length ? bufA[i] : 0;
    const byteB = i < bufB.length ? bufB[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
