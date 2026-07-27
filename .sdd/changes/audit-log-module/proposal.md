# Proposal: auditLog module

## Problem

Design research (saved to dar-docs:
`research/dar-money-mind/audit-log-research.md` — NIST SP 800-92, OWASP Logging
Vocabulary/Logging Cheat Sheets, PCI-DSS Req.10, CIS Control 8, Schneier-Kelsey hash-chaining,
Merkle-tree/Certificate Transparency, AWS CloudTrail, OpenTelemetry HTTP semconv,
django-auditlog, GDPR IP/retention guidance) informs a new sentinel module: a structured,
tamper-evident, who/what/when/how audit trail per request — distinct from ts-sentinel's existing
`traceId` (correlation only, no persistence/tamper-evidence) and from generic application logs.

## Goal

Add `auditLog` middleware to ts-sentinel (canonical Fetch-API implementation; `go-sentinel` and
`nest-sentinel` get parallel ports as follow-up changes in their own repos once this design is
validated here).

## Scope

- Emits one structured `AuditLogEntry` per request at response time (status code known),
  matching the schema from the research doc's design recommendation: `schema_version`,
  `event_id` (uuid), `timestamp`, `trace_id` (reuses ts-sentinel's own `traceId` value if present
  on the request, so the two modules compose for free), `actor` (`{id, type}` —
  `id`/`type` supplied by the consumer via a `resolveActor(req)` callback, since only the app
  knows its auth scheme), `http` (`request.method`, `url.path` — query stripped by default,
  `response.status_code`), `network` (`source_ip`, `user_agent` — both sanitized against log
  injection and IP-mode-configurable), `outcome` (`success|failure|denied`, derived from status
  code by default, overridable), `prev_hash`/`entry_hash` (Schneier-Kelsey hash chain, optional).
- Pluggable `sink(entry) => void | Promise<void>` — this module does NOT persist/ship logs
  itself (no file/DB/remote-log dependency, keeps ts-sentinel dependency-free); the consumer
  wires the sink to console/file/remote as needed.
- IP handling modes: `full | truncated | hashed` (default `truncated` — GDPR-informed default
  per research doc, not "log full IP forever").
- Log-injection sanitization on `url.path`/`user_agent` (strip control chars, cap length) —
  directly reuses the research doc's OWASP-sourced requirement.
- Redaction: never includes request/response bodies or auth headers by default (opt-in
  per-route field allowlist deferred to a later version if a real need emerges — start
  conservative).
- Hash-chaining is opt-in (`tamperEvident: boolean`, default `false`) — adds one SHA-256 per
  entry when enabled, module-scope `prevHash` state (documented limitation: per-process only,
  not distributed-safe across multiple instances without a shared external anchor — out of scope
  for v1, matches the research doc's "start with hash-chaining, Merkle checkpoints later" staging).

## Out of scope (v1)

- Merkle-tree checkpoint mode (research doc's "higher assurance" option) — defer until there's a
  real consumer need; hash-chaining alone satisfies the tamper-evidence requirement for a single-
  instance deployment, which is what ts-sentinel's actual current consumers (ateambuilders,
  dar-money-mind) run.
- Built-in persistence/storage adapters (file, S3, Postgres, etc.) — sink-based, BYO storage,
  consistent with ts-sentinel's zero-dependency ethos.
- Retention enforcement — the module emits entries; retention/deletion policy is the sink/storage
  layer's responsibility, not this module's (documented in README, not silently ignored).
- go-sentinel/nest-sentinel ports — separate follow-up changes once this design proves out.

## Why this shape

Mirrors `traceId`'s already-proven shape (middleware, config object, README reference-wiring
update, `docs/owasp-coverage.md` entry) and composes with it directly (audit entries carry the
same `trace_id`). The sink-based design keeps ts-sentinel dependency-free while still being
genuinely useful — matches how `secureHeaders`/`rateLimit`/etc. are all "policy + hook,
no infrastructure" already.
