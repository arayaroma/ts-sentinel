# Proposal: trace-id middleware

## Problem

Neither `ts-sentinel` nor `go-sentinel` currently propagate a request-correlation ID. A design
doc (`dar-docs/security/sentinel/architecture-and-threat-model.md`) already sketches this as
part of the request pipeline — extract or generate a trace ID at the perimeter, inject it into
the request context, echo it on the response, so logs across the middleware chain and the
consuming handler can be correlated for one request.

## Goal

Add a `traceId` middleware to both sibling libraries (same design, same API shape, per each
repo's stated goal), mirroring the existing `rateLimit`/`secureHeaders` middleware shape.

## Scope

- Extract `X-Request-ID` (or `X-Trace-ID`, pick one canonical header — spec.md decides) from the
  incoming request if present; generate a new one (UUID v4, no external dependency — Node's
  `crypto.randomUUID()` / Go's nothing-needed via a tiny inline generator or `crypto/rand`) if
  absent.
- Make the trace ID available to downstream handlers: TS via a header on the (possibly cloned)
  outgoing `Request` the middleware passes to `next`; Go via `context.Context` (the idiomatic
  mechanism, avoids header-mutation-of-inbound-request weirdness).
- Echo the trace ID back on the response header, including on early-exit responses from other
  middleware in the chain (e.g. a 429 from `rateLimit` should still carry the trace ID) — this
  means `traceId` should run first/outermost in a typical `chain(...)` call, same position
  `secureHeaders` currently occupies in the reference wiring.
- Export a small helper to read the trace ID back out (from context in Go; from the request in
  TS) for use in application-level logging.

## Out of scope

- Structured logging / log-shipping integration — this middleware only produces and propagates
  the ID, doesn't wire up a logger.
- Distributed tracing (OpenTelemetry spans etc.) — a trace ID string is not a trace span; that's
  a much larger, separate concern.

## Why this shape

Matches both repos' existing pattern: pure middleware function `(next: Handler) => Handler` (TS)
/ `func(http.Handler) http.Handler` (Go), own module/package, re-exported from the top-level
`sentinel`/`chain` entry point, documented in each repo's README reference-wiring section and
`docs/owasp-coverage.md` (trace ID isn't itself an OWASP mitigation, but supports incident
response/forensics for the other categories already covered — worth a short mention).
