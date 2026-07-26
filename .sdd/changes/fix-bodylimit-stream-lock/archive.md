Fixed a real 500 bug found via pentesting: maxBodyBytes locked the request body stream even for
safe, Content-Length-verified requests, breaking any downstream consumer (like Astro's next())
that reads its own original request independently.
