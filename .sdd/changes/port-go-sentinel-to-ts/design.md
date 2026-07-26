# Design

Shared middleware contract in `src/types.ts`:
`Handler = (req: Request) => Response | Promise<Response>`,
`Middleware = (next: Handler) => Handler` — the Fetch API equivalent of Go's
`func(http.Handler) http.Handler`, reused by every module instead of each module hand-rolling its
own function type.

Module layout mirrors go-sentinel exactly: `src/{auth,ratelimit,resource,headers,validate,sentinel}/`,
each with an `index.ts` barrel export, `sentinel/index.ts` re-exporting everything as the single
entry point (`sentinel/chain.ts` holds `chain()` itself, separate from the barrel for testability).

`package.json` exports map exposes both the single entry point (`ts-sentinel`) and per-module
subpaths (`ts-sentinel/auth`, etc.) mirroring Go's per-package import paths.

Two intentional divergences from go-sentinel, both documented in the README's "Differences from
go-sentinel" section:
1. `withTimeout` races instead of cancelling (no Fetch-API equivalent to `context.Context`).
2. `apiKeyOrIp`'s IP fallback reads forwarded headers instead of a `RemoteAddr` field that Fetch
   `Request` doesn't have.

TDD note: given the scope (6 modules ported from an already-designed, already-tested reference
implementation), tests were written immediately alongside each port rather than strictly
red-green per function — the Go test suite already validates the intended behavior; the TS tests
verify the port preserves it.
