# Tasks

- [x] Project scaffold: package.json, tsconfig.json, vitest.config.ts, .gitignore
- [x] `src/types.ts` — shared Handler/Middleware contract
- [x] `src/auth/apikey.ts` — requireApiKey (constant-time compare)
- [x] `src/headers/secure.ts` — secureHeaders
- [x] `src/resource/timeout.ts` — withTimeout
- [x] `src/resource/bodylimit.ts` — maxBodyBytes
- [x] `src/validate/validate.ts` — nonEmpty/maxLength/oneOf
- [x] `src/ratelimit/ratelimit.ts` — rateLimit/rateLimitGlobal/MemoryRateLimitStore/apiKeyOrIp
- [x] `src/sentinel/chain.ts` + `src/sentinel/index.ts` — chain + re-exports
- [x] README.md + docs/owasp-coverage.md (ported from go-sentinel)
- [x] Tests for every module (33 tests total)
- [x] GitHub repo `arayaroma/ts-sentinel` created, dar-ai harness installed

## Files
- src/auth/apikey.ts
- src/headers/secure.ts
- src/resource/timeout.ts
- src/resource/bodylimit.ts
- src/validate/validate.ts
- src/ratelimit/ratelimit.ts
- src/sentinel/chain.ts

`src/types.ts` also touched (shared Handler/Middleware type aliases) — pure type declarations, no
runtime behavior, excluded from the test-gate list (same reasoning as `env.d.ts` in
dar-docs-web's auth work).
