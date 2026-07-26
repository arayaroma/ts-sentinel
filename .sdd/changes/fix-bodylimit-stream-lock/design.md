Node's locally-constructed `Request` doesn't auto-compute Content-Length the way a real incoming
HTTP request does, which meant the existing unit tests never actually exercised the
Content-Length-present code path (they all silently fell through to the stream-wrapping
fallback, which happened to still work) — masking this bug from the test suite entirely. Fixed
by adding a `requestWithContentLength` test helper that sets the header explicitly, and a new
regression test that reads the *original* request's body independently after the middleware
runs, proving no lock occurred.

Known residual limitation (documented in the function's doc comment): callers that can't forward
a substituted Request downstream (e.g. Astro's `next()`, which always operates on Astro's own
fixed `context.request`) only get the pre-emptive Content-Length check for protection —
chunked/unknown-length body enforcement silently doesn't apply in that specific integration
shape. Full enforcement requires either a framework that lets you swap the Request object, or a
different composition (call `next(limitedReq)` directly rather than through an Astro
`next()`-style closure).
