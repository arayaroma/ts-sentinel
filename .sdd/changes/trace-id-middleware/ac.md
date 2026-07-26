# Acceptance Criteria

1. `npm run build && npm test && npm run typecheck` pass with no new failures.
2. Inbound `X-Request-ID` (or `X-Trace-ID`) is preserved verbatim through to the response header.
3. A missing inbound header results in a generated UUID present on both the request seen by
   `next` and the response header.
4. A response short-circuited by a downstream middleware (e.g. a stub 429) still carries the
   trace ID header.
5. `README.md` reference wiring shows `traceId()` first in the chain.
6. `traceId` is importable both from the top-level `sentinel` barrel and from `ts-sentinel/traceid`.
