Found via pentesting dar-docs-web (real integration test, not unit tests): `maxBodyBytes`
unconditionally wrapped/piped the request body through a byte-counting TransformStream, even for
requests with a valid Content-Length already under the limit. Any caller that (like Astro's
`next()`) discards the request maxBodyBytes passes downstream and reads its own original request
object instead got "TypeError: Body is unusable: Body has already been read" on every POST with
a body — a live 500 on `/api/auth/sign-in/social`.

Fix: when Content-Length is present and within the limit, pass the request through completely
untouched — no stream wrapping at all, since the header already proves it's safe.
