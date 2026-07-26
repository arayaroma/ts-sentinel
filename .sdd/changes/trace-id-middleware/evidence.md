# Evidence

`npm run build && npm test && npm run typecheck` — all pass. 9 test files, 44 tests (8 new in
`tests/traceid/traceid.test.ts`): inbound `X-Request-ID` preserved, `X-Trace-ID` fallback +
precedence, generated UUID when missing, forwarded to downstream handler, header survives a
429 short-circuit, custom `header`/`generate` config honored.

## Deviation from spec (documented, accepted)

spec.md suggested try/finally for the thrown-error case; since a thrown error means no `Response`
exists yet to attach a header to, there's nothing for try/finally to mutate — implementation kept
as straight async/await with the limitation documented in the doc comment instead of a no-op
try/finally.
