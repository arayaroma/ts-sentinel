# Proposal: Port go-sentinel to TypeScript

User has `go-sentinel` (~/wrkspc/go-sentinel): a standalone, dependency-free Go stdlib-only
`net/http` security middleware module (API key auth, rate limiting, resource bounds, secure
headers, input validation). Wants a TS sibling with the same API surface, for TS projects, so
they end up with two SDKs (Go + TS) covering the same security posture.

Target runtime: Fetch API standard (`Request`/`Response`), not Node/Express-specific — works
natively in Astro middleware (already used in dar-docs-web), Cloudflare Workers, Deno, Bun, and
Node 18+. New repo `arayaroma/ts-sentinel`, package name `ts-sentinel`.

Scope: full module set ported 1:1 in API shape (renamed to camelCase per TS convention):
`requireApiKey`, `rateLimit`/`rateLimitGlobal`, `withTimeout`/`maxBodyBytes`, `secureHeaders`,
`nonEmpty`/`maxLength`/`oneOf`, `chain` + single `sentinel` entry point re-exporting everything.
