# Evidence

- `npx vitest run`: 33/33 tests pass across 8 test files (auth, headers, resource x2, validate,
  ratelimit, sentinel x2).
- `npx tsc -p tsconfig.json --noEmit`: no errors.
- `npm run build`: succeeds, emits `dist/` with declarations.
- Manual API-surface comparison against go-sentinel's README/source confirms 1:1 coverage:
  requireApiKey, secureHeaders, withTimeout, maxBodyBytes, nonEmpty/maxLength/oneOf,
  rateLimit/rateLimitGlobal/MemoryRateLimitStore/apiKeyOrIp, chain.
- Not done: publishing to npm registry (local-only for now, matching dar-ai's own
  local-tarball-first convention), and real deployment testing against Cloudflare Workers/Deno/Bun
  runtimes (only exercised under Node/Vitest this session).
