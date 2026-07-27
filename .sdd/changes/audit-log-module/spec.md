# Spec

## Types

```ts
export type ActorType = "user" | "service" | "anonymous";

export interface Actor {
  id: string | null;
  type: ActorType;
}

export interface AuditLogEntry {
  schema_version: "1.0";
  event_id: string;
  timestamp: string; // RFC3339
  trace_id?: string;
  actor: Actor;
  http: {
    method: string;
    path: string; // query stripped by default
    status_code: number;
  };
  network: {
    source_ip: string;
    user_agent: string;
  };
  outcome: "success" | "failure" | "denied";
  detail?: string;
  prev_hash?: string;
  entry_hash?: string;
}

export type IpMode = "full" | "truncated" | "hashed";

export interface AuditLogConfig {
  /** Emits the finished entry. Required — this module never persists on its own. */
  sink: (entry: AuditLogEntry) => void | Promise<void>;
  /** Derives actor identity from the request. Defaults to always `{id: null, type: "anonymous"}`
   *  — only the consuming app knows its auth scheme, so this MUST be supplied for actor
   *  identity to be meaningful; documented prominently in README, not a silent no-op trap. */
  resolveActor?: (req: Request) => Actor | Promise<Actor>;
  /** Defaults to "truncated" (GDPR-informed default per research). */
  ipMode?: IpMode;
  /** Enables Schneier-Kelsey hash-chaining (prev_hash/entry_hash). Default false. */
  tamperEvident?: boolean;
  /** Strip query string from url.path. Default true. */
  stripQuery?: boolean;
  /** Maximum length for sanitized path/user-agent fields before truncation. Default 512. */
  maxFieldLength?: number;
}
```

## `auditLog(config)` middleware

- Runs the wrapped handler first (needs the response status code), THEN builds and emits the
  entry — unlike `traceId`/`secureHeaders` which act on the way in/out symmetrically, this
  module is response-only (no request mutation).
- `trace_id`: read from the response headers if `traceId()` middleware ran earlier in the chain
  (checks `X-Request-ID` on the response — since `traceId` echoes it there); omit the field if
  absent, don't fabricate one (this module doesn't generate trace IDs, that's `traceId`'s job).
- `network.source_ip`: derive via the same `X-Forwarded-For`-first, fallback-"unknown" logic as
  `ratelimit`'s `apiKeyOrIp` (don't duplicate a third IP-extraction implementation — factor a
  shared internal helper if that keeps both modules' behavior consistent, or accept minor
  duplication if extracting a shared helper would create an awkward cross-module dependency;
  use judgment, document the choice).
- IP mode application: `full` = as extracted; `truncated` = zero out the last octet (IPv4) or
  last 80 bits (IPv6) — standard "truncate for pseudonymization" pattern the research doc cites;
  `hashed` = SHA-256 of the raw IP (one-way, not reversible, but not GDPR-exempt per the research
  doc — document that distinction, don't oversell it as "anonymized").
- Sanitization: strip `\r`/`\n`/other control characters from `path` and `user_agent` before
  building the entry (log-injection prevention per OWASP), then cap to `maxFieldLength`.
- `outcome` default derivation: status < 400 → `success`; 401/403 → `denied`; other >= 400 →
  `failure`. Overridable by the consumer (deferred to a later version if needed — v1 uses the
  default derivation only, keep scope tight).
- Hash chain (`tamperEvient: true`): module-scope `let prevHash = ""` (per-process state,
  documented limitation). `entry_hash = sha256(JSON.stringify({...entryWithoutHashes, prev_hash}))`.
  Uses Web Crypto's `crypto.subtle.digest` (already the runtime this library targets, no new
  dependency — same rationale as `traceId`'s `crypto.randomUUID()`).
- Errors in `sink()` must not crash the request — wrap in try/catch, swallow with a
  `console.error` fallback (documented behavior, not silent).

## Acceptance

See `ac.md`.
