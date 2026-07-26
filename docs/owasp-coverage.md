# OWASP Top 10 (2021) Coverage

How ts-sentinel maps to each OWASP Top 10 2021 category: a shipped
middleware, a documented caller responsibility, or explicitly out of
scope. Mirrors go-sentinel's coverage doc, TS naming.

| # | Category | Coverage |
|---|----------|----------|
| A01 | Broken Access Control | Caller responsibility. `requireApiKey` authenticates the caller but authorization (which keys/identities may access which resources) is application-specific routing logic outside ts-sentinel's scope. |
| A02 | Cryptographic Failures | Out of scope for v1. ts-sentinel does not handle data at rest or transport termination (TLS is the platform's job — Vercel/Cloudflare/etc); `secureHeaders`' `Strict-Transport-Security` header does enforce HTTPS on the client side once TLS is present. |
| A03 | Injection | `validate` module (`nonEmpty`, `maxLength`, `oneOf`) reduces malformed-input surface at the handler boundary. Caller responsibility for the rest: use parameterized queries — ts-sentinel does not touch persistence. |
| A04 | Insecure Design | Caller responsibility (architecture-level, not a middleware concern). This document and the reference wiring in the README are the design guidance ts-sentinel offers. |
| A05 | Security Misconfiguration | `secureHeaders` (nosniff, frame options, CSP, HSTS). `maxBodyBytes` and `withTimeout` guard against resource-exhaustion misconfiguration. |
| A06 | Vulnerable and Outdated Components | Out of scope for v1's runtime, but structurally addressed: ts-sentinel has zero runtime dependencies (Fetch API only), so it never introduces third-party CVEs into a consuming service. Caller responsibility to keep their own dependencies patched (`npm audit`). |
| A07 | Identification and Authentication Failures | `requireApiKey` — constant-time key comparison (timing-attack resistant), fails closed on missing/invalid keys, supports multi-key rotation. |
| A08 | Software and Data Integrity Failures | Out of scope for v1 — no deserialization or CI/CD supply-chain surface inside this module. |
| A09 | Security Logging and Monitoring Failures | Partially addressed: `traceId` isn't a mitigation by itself (no logging middleware shipped yet), but it propagates a request-correlation ID across the whole middleware chain and echoes it on the response — including short-circuited 401/429/413s — so caller-side logs for a single request can be correlated end to end. Caller responsibility: actually log rejections, keyed by this ID. |
| A10 | Server-Side Request Forgery (SSRF) | Out of scope — ts-sentinel never makes outbound requests on the application's behalf. Caller responsibility for any outbound HTTP calls the service itself makes. |

## Notes

- "Caller responsibility" items are intentionally not middleware: they
  require application/business-logic context (which query, which route,
  which outbound call) that a generic library can't supply safely.
- "Out of scope" items are flagged rather than silently omitted, so
  adopters know a shipped `requireApiKey`/`rateLimit`/`secureHeaders` stack
  is not a complete security program by itself.
