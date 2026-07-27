// Structured, tamper-evident audit-log middleware: emits one AuditLogEntry
// per request at response time (status code known), distinct from
// `traceId` (correlation only, no persistence/tamper-evidence). This
// module never persists on its own — the consumer supplies a `sink` and
// wires it to console/file/remote storage as needed, keeping ts-sentinel
// dependency-free. Design rationale: NIST SP 800-92, OWASP Logging
// Vocabulary/Cheat Sheet, PCI-DSS Req.10, Schneier-Kelsey hash-chaining,
// GDPR IP-retention guidance.
import type { Handler, Middleware } from "../types.js";

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
  /**
   * Derives actor identity from the request. Defaults to always
   * `{id: null, type: "anonymous"}` — since only the consuming app knows its
   * auth scheme, THIS MUST BE SUPPLIED for actor identity to be meaningful.
   * Without it, every entry's `actor` field is a constant, uninformative
   * placeholder — not a real audit trail of who did what.
   */
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

const DEFAULT_ACTOR: Actor = { id: null, type: "anonymous" };

/** Module-scope hash-chain state: one chain per process lifetime (see README). */
let prevHash = "";

/**
 * Returns middleware that emits one structured `AuditLogEntry` per request
 * via `config.sink`, at response time (after the wrapped handler resolves,
 * since the status code isn't known beforehand). Unlike `traceId`/
 * `secureHeaders`, which act symmetrically on the way in and out, this
 * module is response-only: it does not mutate the request.
 *
 * `trace_id` is read off the response's `X-Request-ID` header if a prior
 * `traceId()` middleware set one; omitted (never fabricated) otherwise.
 *
 * Sink errors (throw or rejected promise) are caught and logged via
 * `console.error` — they never propagate to, or alter, the HTTP response
 * the caller receives.
 */
export function auditLog(config: AuditLogConfig): Middleware {
  const ipMode = config.ipMode ?? "truncated";
  const stripQuery = config.stripQuery ?? true;
  const maxFieldLength = config.maxFieldLength ?? 512;
  const tamperEvident = config.tamperEvident ?? false;
  const resolveActor = config.resolveActor ?? (() => DEFAULT_ACTOR);

  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const res = await next(req);

      try {
        const entry = await buildEntry(req, res, {
          ipMode,
          stripQuery,
          maxFieldLength,
          resolveActor,
        });

        if (tamperEvident) {
          const { entry_hash, ...withoutHash } = entry;
          void entry_hash;
          const chained: Omit<AuditLogEntry, "entry_hash"> = {
            ...withoutHash,
            prev_hash: prevHash,
          };
          const hash = await computeEntryHash(chained);
          entry.prev_hash = prevHash;
          entry.entry_hash = hash;
          prevHash = hash;
        }

        await config.sink(entry);
      } catch (err) {
        console.error("auditLog: sink failed", err);
      }

      return res;
    };
  };
}

interface BuildOpts {
  ipMode: IpMode;
  stripQuery: boolean;
  maxFieldLength: number;
  resolveActor: (req: Request) => Actor | Promise<Actor>;
}

async function buildEntry(req: Request, res: Response, opts: BuildOpts): Promise<AuditLogEntry> {
  const url = new URL(req.url);
  const rawPath = opts.stripQuery ? url.pathname : url.pathname + url.search;
  const path = sanitizeField(rawPath, opts.maxFieldLength);

  const rawUserAgent = req.headers.get("User-Agent") ?? "";
  const userAgent = sanitizeField(rawUserAgent, opts.maxFieldLength);

  const rawIp = extractIp(req);
  const sourceIp = await applyIpMode(rawIp, opts.ipMode);

  const actor = await opts.resolveActor(req);

  const entry: AuditLogEntry = {
    schema_version: "1.0",
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor,
    http: {
      method: req.method,
      path,
      status_code: res.status,
    },
    network: {
      source_ip: sourceIp,
      user_agent: userAgent,
    },
    outcome: deriveOutcome(res.status),
  };

  // Prefer the response header (the documented contract: traceId() echoes
  // the ID onto the outgoing response). Fall back to the request header:
  // under this repo's chain() semantics (first-listed = outermost),
  // `chain(traceId(), auditLog())` nests auditLog *inside* traceId, so
  // traceId's own response-header write happens only after auditLog's
  // handler has already returned — but traceId forwards the same ID onto
  // the request *before* calling into auditLog, so it's reliably visible
  // there too. Never fabricate one if neither is present.
  const traceIdValue = res.headers.get("X-Request-ID") ?? req.headers.get("X-Request-ID");
  if (traceIdValue) {
    entry.trace_id = traceIdValue;
  }

  return entry;
}

/**
 * Derives the client IP the same way `ratelimit`'s `apiKeyOrIp` does
 * (X-Forwarded-For first entry, then X-Real-IP, falling back to
 * "unknown") — intentionally a small duplication rather than a shared
 * helper: the two modules have subtly different needs (this one never
 * considers an API key), and factoring a 5-line function out would create
 * an awkward cross-module dependency for no real reuse benefit.
 */
function extractIp(req: Request): string {
  const forwardedFor = req.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = req.headers.get("X-Real-IP");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

async function applyIpMode(ip: string, mode: IpMode): Promise<string> {
  if (ip === "unknown") {
    return ip;
  }
  switch (mode) {
    case "full":
      return ip;
    case "truncated":
      return truncateIp(ip);
    case "hashed":
      return hashIp(ip);
  }
}

/**
 * Pseudonymizes an IP address by zeroing the last IPv4 octet or the last 80
 * bits (5 groups) of IPv6 — standard truncation pattern for GDPR-informed
 * logging defaults. Falls back to returning the input unchanged if it
 * doesn't parse as a recognizable IPv4/IPv6 literal.
 */
function truncateIp(ip: string): string {
  const ipv4Parts = ip.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d{1,3}$/.test(p))) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.0`;
  }
  if (ip.includes(":")) {
    const groups = ip.split(":");
    // Zero last 5 groups (80 bits), keep the first 3.
    const kept = groups.slice(0, 3);
    while (kept.length < 8) {
      kept.push("0");
    }
    return kept.join(":");
  }
  return ip;
}

/**
 * SHA-256 hash of the raw IP via Web Crypto (`crypto.subtle.digest`) — the
 * runtime this library already targets, no new dependency. One-way, but
 * NOT anonymization in the GDPR sense (a hash of a bounded input space is
 * trivially reversible by dictionary/rainbow-table attack); this mode is
 * documented as pseudonymization, not anonymization.
 */
async function hashIp(ip: string): Promise<string> {
  return sha256Hex(ip);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Strips control characters (CR/LF and other C0/C1 control codes) from a
 * field to prevent log-injection (OWASP), then caps its length to
 * `maxLength`. Must run before the entry object is built, not after.
 */
function sanitizeField(value: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped;
}

/** status < 400 -> success; 401/403 -> denied; other >= 400 -> failure. */
function deriveOutcome(status: number): "success" | "failure" | "denied" {
  if (status < 400) {
    return "success";
  }
  if (status === 401 || status === 403) {
    return "denied";
  }
  return "failure";
}

async function computeEntryHash(entry: Omit<AuditLogEntry, "entry_hash">): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(entry));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
