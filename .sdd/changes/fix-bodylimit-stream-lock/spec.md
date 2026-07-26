# Spec

- Content-Length present and ≤ limit: `next(req)` called with the original request, untouched.
- Content-Length present and > limit: 413, as before.
- Content-Length absent: TransformStream byte-counting path, unchanged — still locks the body
  (unavoidable, this is the only way to bound an unknown-length stream), documented as a known
  limitation for callers (like Astro middleware) that can't forward a substituted Request.

## Acceptance criteria
- [x] A request with Content-Length under the limit can have its body read independently by the
      caller AFTER maxBodyBytes has run (proves no stream lock occurred)
- [x] Oversized-by-Content-Length still rejected with 413
- [x] Chunked/unknown-length still enforced via the stream path
