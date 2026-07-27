# Acceptance Criteria

1. `npm run build && npm test && npm run typecheck` pass.
2. Entry shape matches spec.md exactly; `trace_id` is picked up when `traceId()` ran earlier in
   the chain, omitted (not fabricated) otherwise.
3. All three IP modes (`full`/`truncated`/`hashed`) produce distinct, correctly-transformed
   values from the same input IP.
4. A path/user-agent containing CR/LF or exceeding `maxFieldLength` is sanitized before the
   entry is built — verified by asserting the entry's fields contain no control characters and
   respect the length cap, not just that the sink didn't crash.
5. Hash chain: two consecutive entries have `entry_hash`(1) feeding into `prev_hash`(2); changing
   any field of entry 1 changes `entry_hash`(1) and therefore would break verification against
   entry 2 (test this by asserting the hash is a pure function of entry content + prev_hash, not
   by asserting a hardcoded hash value).
6. A throwing `sink` does not propagate to/crash the wrapped request — the response the caller
   receives is unaffected by a sink failure.
7. Outcome derivation matches spec.md's status-code mapping for at least one case per bucket
   (success/denied/failure).
