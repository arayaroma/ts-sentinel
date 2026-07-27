# Evidence

`npm run build && npm test && npm run typecheck` — all pass. 10 test files, 67 tests (23 new in
`tests/auditlog/auditlog.test.ts`). All 7 acceptance criteria in ac.md individually verified
(entry shape, trace_id pickup via a real composed `traceId()` middleware, all 3 IP modes, CR/LF/
oversized-field sanitization asserted on actual entry values, hash-chain proven as a genuine
content function via tamper-detection test rather than a hardcoded hash string, sink error
isolation for both throwing and rejecting sinks, outcome derivation per status bucket).

## Implementation note (chain() ordering interaction)

`chain()`'s outermost-first semantics mean `chain(traceId(), auditLog())` nests `auditLog`
*inside* `traceId`'s call frame, so `traceId`'s response-header write happens after `auditLog`
already returned. Fixed by having `auditLog` read `X-Request-ID` from the response first (per
spec's literal wording), falling back to the request header (which `traceId` does set before
calling inward) — verified end-to-end with a real composed `traceId()` middleware in the test,
not a faked header. Documented in the code.

## Data-corruption gotcha (development-time only, not shipped)

An em-dash character corrupted UTF-8 bytes in an early draft of the control-character regex,
silently breaking grep/Edit string matching on the whole file — fixed via a byte-level rewrite,
confirmed clean UTF-8 before finishing. Worth remembering for future sessions: if grep/Edit
mysteriously fail to match a string that's visibly present, check for encoding corruption before
assuming a logic bug.
