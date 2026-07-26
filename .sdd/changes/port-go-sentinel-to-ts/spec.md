# Spec

Faithful 1:1 port of go-sentinel's public API, module-for-module, adapted only where the
Fetch API model genuinely differs from `net/http`:

| go-sentinel | ts-sentinel | Notes |
|---|---|---|
| `auth.RequireAPIKey` | `auth.requireApiKey` | Constant-time compare via manual XOR loop over `TextEncoder` bytes (no Node-only `crypto.timingSafeEqual`, keeping zero runtime deps). |
| `headers.SecureHeaders` | `headers.secureHeaders` | Same 4 headers, same defaults. |
| `resource.WithTimeout` | `resource.withTimeout` | `Promise.race` against a timer instead of context cancellation — Fetch `Request` has no cancellation signal; documented as a known divergence. |
| `resource.MaxBodyBytes` | `resource.maxBodyBytes` | Pre-emptive Content-Length check + TransformStream byte-counter for unknown-length bodies. |
| `validate.NonEmpty/MaxLength/OneOf` | `validate.nonEmpty/maxLength/oneOf` | Same semantics, returns `ValidationError | null` instead of Go's `error`. |
| `ratelimit.RateLimit`/`RateLimitGlobal`/`Store`/`MemoryStore`/`APIKeyOrIP` | `ratelimit.rateLimit`/`rateLimitGlobal`/`RateLimitStore`/`MemoryRateLimitStore`/`apiKeyOrIp` | Same token-bucket algorithm. IP fallback reads `X-Forwarded-For`/`X-Real-IP` (Fetch `Request` has no `RemoteAddr`). |
| `sentinel.Chain` + re-exports | `sentinel.chain` + re-exports | Same outermost-first composition semantics. |

## Acceptance criteria
- [ ] Every go-sentinel middleware has a corresponding ts-sentinel export with matching behavior
- [ ] `npm test` passes (Vitest, exercised against real `Request`/`Response`)
- [ ] `npm run typecheck` and `npm run build` succeed with no errors
- [ ] README documents the reference wiring + explicit "Differences from go-sentinel" section
- [ ] `docs/owasp-coverage.md` ported with TS naming
