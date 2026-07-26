// Standard HTTP security hardening headers (OWASP A05 Security
// Misconfiguration). TS sibling of go-sentinel's headers package.
import type { Handler, Middleware } from "../types.js";

export interface SecureHeadersConfig {
  /** Overrides the default CSP. Defaults to "default-src 'self'". */
  contentSecurityPolicy?: string;
  /** Overrides the default HSTS value. Defaults to "max-age=63072000; includeSubDomains". */
  strictTransportSecurity?: string;
  /** Overrides X-Frame-Options. Defaults to "DENY". */
  frameOptions?: string;
}

const DEFAULT_CSP = "default-src 'self'";
const DEFAULT_HSTS = "max-age=63072000; includeSubDomains";
const DEFAULT_FRAME_OPTIONS = "DENY";

/**
 * Returns middleware that sets standard hardening headers on every
 * response: X-Content-Type-Options, X-Frame-Options,
 * Content-Security-Policy, and Strict-Transport-Security.
 */
export function secureHeaders(cfg: SecureHeadersConfig = {}): Middleware {
  const csp = cfg.contentSecurityPolicy || DEFAULT_CSP;
  const hsts = cfg.strictTransportSecurity || DEFAULT_HSTS;
  const frameOptions = cfg.frameOptions || DEFAULT_FRAME_OPTIONS;

  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const res = await next(req);
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("X-Frame-Options", frameOptions);
      res.headers.set("Content-Security-Policy", csp);
      res.headers.set("Strict-Transport-Security", hsts);
      return res;
    };
  };
}
