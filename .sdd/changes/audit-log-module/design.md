# Design

## Files

- `src/auditlog/auditlog.ts` — implementation per spec.md.
- `src/auditlog/index.ts` — re-export (`auditLog`, types).
- `src/sentinel/index.ts` — add `auditLog` to barrel export.
- `package.json` — add `"./auditlog": "./dist/auditlog/index.js"` to `exports`.
- `tests/auditlog/auditlog.test.ts` — table-driven: entry shape correctness, trace_id pickup
  from a prior `traceId()` middleware, each IP mode, sanitization of malicious path/UA (CR/LF
  injection attempt, oversized field), outcome derivation per status code, hash-chain
  correctness across multiple entries (verify `entry_hash` changes if `prev_hash` input would
  differ, verify chain is deterministic given the same inputs), sink error doesn't crash the
  request.
- `README.md` — module table row, reference wiring showing `auditLog` composed after `traceId`
  in the `chain(...)` example (so `trace_id` pickup actually has something to read), a short
  "what this module deliberately does NOT do" section (no persistence, no Merkle checkpoints,
  no retention enforcement — link to the dar-docs research doc's design recommendation section
  for the rationale, since it lives in a private repo not everyone reading README.md may access
  — inline a short summary instead of just a dead link).
- `docs/owasp-coverage.md` — add entry: A09 (Security Logging and Monitoring Failures) — direct
  hit this time, unlike `traceId`'s "supports but isn't itself" framing; also touches A08
  (Software and Data Integrity Failures) via the optional hash-chain tamper-evidence.

## Reference wiring update

```ts
const handler = chain(
  traceId(),
  auditLog({ sink: myLogSink, resolveActor: (req) => getActorFromJwt(req) }),
  secureHeaders(),
  // ...
)(app);
```
`auditLog` right after `traceId` so it can read the trace ID; before `secureHeaders`/rate-limit/
auth so it captures the OUTCOME of those (a 401 from `requireApiKey`, a 429 from `rateLimit`)
rather than being skipped when they short-circuit — same "run early enough to see everything"
principle as `traceId`, but auditLog needs to run *after* the handler chain resolves (it's
response-only), so in `chain`'s outermost-first semantics, `auditLog` wrapping close to the
outside (but after `traceId`) ensures it observes the final response regardless of which inner
middleware produced it.

## Hash-chain implementation sketch

```ts
let prevHash = "";

async function computeEntryHash(entry: Omit<AuditLogEntry, "entry_hash">): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(entry));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
```
Reset semantics: `prevHash` is module-scope and never reset within a process lifetime — a fresh
process (deploy/restart) starts a new chain from `""`, which is a detectable, honest boundary
(document this as "one chain per process lifetime," not a bug).
