# ts-sentinel

A standalone, dependency-free (Fetch API only — `Request`/`Response`, no
Node-only APIs) TypeScript module providing baseline HTTP security
middleware: API key auth, rate limiting, resource bounds, and secure
headers — plus a small input-validation package. TS sibling of
[go-sentinel](https://github.com/arayaroma/go-sentinel), same design, same
API shape, ported to the standard `Request`/`Response` model so it works
anywhere that implements the Fetch API: Astro middleware, Cloudflare
Workers, Deno, Bun, and Node 18+.

## Install

```bash
npm install ts-sentinel
```

## What's included

| Module | Middleware / helper | Purpose |
|---|---|---|
| `traceid` | `traceId` | Request-correlation ID, propagated across the middleware chain and echoed on the response. |
| `auditlog` | `auditLog` | Structured, tamper-evident who/what/when/how audit trail per request, emitted to a pluggable `sink`. OWASP A09. |
| `auth` | `requireApiKey` | Constant-time API key check, multi-key rotation. OWASP A07. |
| `ratelimit` | `rateLimit`, `rateLimitGlobal` | Token-bucket rate limiting — per-key/IP (`rateLimit`) and a single shared aggregate cap independent of caller identity (`rateLimitGlobal`). |
| `resource` | `withTimeout`, `maxBodyBytes` | Per-request timeout and body-size cap. |
| `headers` | `secureHeaders` | Standard hardening headers. OWASP A05. |
| `validate` | `nonEmpty`, `maxLength`, `oneOf` | Handler-boundary input validation. OWASP A03 surface reduction. |
| `sentinel` | `chain`, re-exports of the above | Single import point for consumers. |

Every middleware has the shape `(next: Handler) => Handler`, where
`Handler = (req: Request) => Response | Promise<Response>` — the Fetch API
equivalent of Go's `func(http.Handler) http.Handler`. It composes with any
framework built on the standard Request/Response, no router forced.

See [`docs/owasp-coverage.md`](docs/owasp-coverage.md) for how each OWASP
Top 10 (2021) category is covered.

## Reference wiring

This is the exact pattern a consumer service wires up. It's also exercised
as a compiling example below and as `tests/sentinel/reference-wiring.test.ts`
in this module's own test suite.

```ts
import {
  chain,
  traceId,
  auditLog,
  secureHeaders,
  withTimeout,
  maxBodyBytes,
  rateLimitGlobal,
  rateLimit,
  requireApiKey,
} from "ts-sentinel";

const apiKey = "replace-with-your-secret"; // load from env/secret manager in prod

const app = async (req: Request): Promise<Response> => new Response("ok");

const handler = chain(
  traceId(),
  auditLog({ sink: async (entry) => console.log(JSON.stringify(entry)) }),
  secureHeaders(),
  withTimeout(5000),
  maxBodyBytes(1 << 20), // 1MB
  rateLimitGlobal({ rps: 20, burst: 40 }),
  rateLimit({ rps: 5, burst: 10 }),
  requireApiKey({ validKeys: [apiKey] })
)(app);

// Astro middleware:
// export const onRequest = defineMiddleware((ctx, next) => handler(ctx.request));
//
// Cloudflare Workers:
// export default { fetch: handler };
```

`chain` applies middleware in the order listed: `traceId` runs first
(outermost) so the ID it generates/preserves lands on every response —
including short-circuited 429/401s from `rateLimit`/`requireApiKey` further
down the chain — `requireApiKey` runs last (closest to your handler).

`auditLog` is listed right after `traceId` for two reasons: it needs the
trace ID `traceId` set on the request/response to correlate its own entry,
and — being response-only (it runs the rest of the chain first, then builds
the entry from the final response) — placing it early in the list means it
still observes the *final* outcome of everything below it: a 429 from
`rateLimit`, a 401 from `requireApiKey`, or a 200 from your handler are all
captured, rather than the audit trail silently missing whichever middleware
short-circuited the request.

### What `auditLog` deliberately does not do

- **No persistence.** `auditLog` never writes to disk, a database, or a
  remote log service itself — it hands a structured `AuditLogEntry` to the
  `sink` you supply, and you wire that to console/file/remote storage. This
  keeps ts-sentinel dependency-free and lets you reuse whatever logging
  infrastructure you already have.
- **No Merkle-tree checkpoints.** Tamper-evidence in v1 is a linear
  Schneier-Kelsey hash chain (`tamperEvident: true` — each entry's
  `entry_hash` folds in the previous entry's hash), which is enough to
  detect any modification or reordering of a single instance's log stream.
  Merkle-tree checkpointing (as used by Certificate Transparency, for
  independently-verifiable audit proofs across many logs) is a higher-
  assurance mechanism deferred until a real consumer need emerges. Note
  also that the hash chain is module-scope, per-process state: a restart
  starts a fresh chain from an empty `prev_hash`, which is a detectable,
  honest boundary rather than a bug.
- **No retention enforcement.** `auditLog` emits entries; how long they're
  kept, when they're purged, and how access to them is controlled is the
  sink/storage layer's responsibility, not this module's.

This design follows research on audit-log design covering NIST SP 800-92,
the OWASP Logging Vocabulary Cheat Sheet, PCI-DSS Req.10, Schneier-Kelsey
hash-chaining, and GDPR IP-retention guidance (informing the `truncated`
default for `ipMode`).

### Rate limit chain ordering: global before per-key

Put `rateLimitGlobal` *before* the per-key `rateLimit` in the chain, as in
the reference wiring above. `rateLimitGlobal` enforces a single shared
token bucket across *all* callers regardless of identity, closing the gap
where a distributed caller spreads requests across many API keys/IPs — each
individually under the per-key limit, but summing to a large aggregate.
Rejecting the flood at the global layer first also avoids spending per-key
bookkeeping cycles on requests that are going to be rejected anyway. The
per-key `rateLimit` still runs afterward to stop a single caller from
hogging the global budget.

## Differences from go-sentinel

The Fetch API's `Request` has no built-in remote-address field the way
Go's `http.Request.RemoteAddr` does, so `apiKeyOrIp`'s IP fallback reads
`X-Forwarded-For`/`X-Real-IP` instead — set by the runtime/platform
(Vercel, Cloudflare, etc.), not by this library.

`withTimeout` races the handler against a timer rather than cancelling it
outright: Fetch `Request` carries no cancellation signal the way Go's
`context.Context` does, so a handler that ignores the timeout keeps running
in the background even after the 504 has already been returned. See the
doc comment on `withTimeout` for details.

## Testing

Every middleware has table-driven tests under Vitest, exercised directly
against `Request`/`Response`:

```bash
npm test
npm run typecheck
npm run build
```

## Non-goals

- Not a framework or router.
- Not a billing/alerting dashboard.
- Not user/session identity management — scope is API-key-style service
  auth.
