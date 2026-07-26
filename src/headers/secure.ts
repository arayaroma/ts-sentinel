// Standard HTTP security hardening headers (OWASP A05 Security
// Misconfiguration). TS sibling of go-sentinel's headers package, extended
// with two headers go-sentinel doesn't set (Referrer-Policy,
// Permissions-Policy) since a real consumer (dar-docs-web) needed them and
// they're cheap, broadly-applicable additions.
import type { Handler, Middleware } from "../types.js";

export interface SecureHeadersConfig {
  /** Overrides the default CSP. Defaults to "default-src 'self'". */
  contentSecurityPolicy?: string;
  /** Overrides the default HSTS value. Defaults to "max-age=63072000; includeSubDomains". */
  strictTransportSecurity?: string;
  /** Overrides X-Frame-Options. Defaults to "DENY". */
  frameOptions?: string;
  /** Overrides Referrer-Policy. Defaults to "strict-origin-when-cross-origin". */
  referrerPolicy?: string;
  /**
   * Sets Permissions-Policy. Not set at all unless provided — there's no
   * safe universal default (which features to restrict is app-specific).
   */
  permissionsPolicy?: string;
}

const DEFAULT_CSP = "default-src 'self'";
const DEFAULT_HSTS = "max-age=63072000; includeSubDomains";
const DEFAULT_FRAME_OPTIONS = "DENY";
const DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin";

/**
 * Returns middleware that sets standard hardening headers on every
 * response: X-Content-Type-Options, X-Frame-Options,
 * Content-Security-Policy, Strict-Transport-Security, Referrer-Policy, and
 * (only if configured) Permissions-Policy.
 */
export function secureHeaders(cfg: SecureHeadersConfig = {}): Middleware {
  const csp = cfg.contentSecurityPolicy || DEFAULT_CSP;
  const hsts = cfg.strictTransportSecurity || DEFAULT_HSTS;
  const frameOptions = cfg.frameOptions || DEFAULT_FRAME_OPTIONS;
  const referrerPolicy = cfg.referrerPolicy || DEFAULT_REFERRER_POLICY;

  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const res = await next(req);
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("X-Frame-Options", frameOptions);
      res.headers.set("Content-Security-Policy", csp);
      res.headers.set("Strict-Transport-Security", hsts);
      res.headers.set("Referrer-Policy", referrerPolicy);
      if (cfg.permissionsPolicy) {
        res.headers.set("Permissions-Policy", cfg.permissionsPolicy);
      }
      return res;
    };
  };
}
