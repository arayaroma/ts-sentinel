# Archive

Ported go-sentinel's full middleware set to TypeScript on the Fetch API standard
(Request/Response): requireApiKey, secureHeaders, withTimeout, maxBodyBytes,
nonEmpty/maxLength/oneOf, rateLimit/rateLimitGlobal, chain. 33/33 tests, clean typecheck/build.
New repo arayaroma/ts-sentinel, dar-ai harness installed. Not yet published to npm; not tested
against non-Node Fetch-API runtimes (Workers/Deno/Bun) — API is designed to be portable but only
Node/Vitest exercised it this session.
