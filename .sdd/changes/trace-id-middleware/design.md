# Design

## Files

- `src/traceid/traceid.ts` — implementation per spec.md.
- `src/traceid/index.ts` — re-export (`export { traceId } from "./traceid.js"; export type { TraceIdConfig } from "./traceid.js";`), mirrors `src/ratelimit/index.ts`'s pattern.
- `src/sentinel/index.ts` — add `traceId` to the barrel re-export (check current contents first,
  add alongside `secureHeaders`, `rateLimit`, etc.).
- `package.json` — add `"./traceid": "./dist/traceid/index.js"` to `exports`.
- `tests/traceid/traceid.test.ts` — table-driven tests matching the style of
  `tests/ratelimit/ratelimit.test.ts` (or whichever existing test file is closest — check
  `tests/` structure first): inbound ID preserved, missing ID generates one, response header set
  on success, response header set on a short-circuited response from a downstream middleware
  (compose `traceId()` with a stub 429-returning handler to verify), custom `header`/`generate`
  config honored.
- `README.md` — update reference wiring to put `traceId()` first in the `chain(...)` call; add a
  row to the module table (`traceid` | `traceId` | Request-correlation ID, propagated across the
  middleware chain and echoed on the response.).
- `docs/owasp-coverage.md` — add a short note: trace ID isn't an OWASP category itself but
  supports incident-response/forensics (A09: Security Logging and Monitoring Failures) by giving
  every log line a correlatable ID.

## Reference wiring update

```ts
const handler = chain(
  traceId(),
  secureHeaders(),
  withTimeout(5000),
  maxBodyBytes(1 << 20),
  rateLimitGlobal({ rps: 20, burst: 40 }),
  rateLimit({ rps: 5, burst: 10 }),
  requireApiKey({ validKeys: [apiKey] })
)(app);
```
