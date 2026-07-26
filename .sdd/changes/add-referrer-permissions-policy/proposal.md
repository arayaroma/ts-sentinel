Add Referrer-Policy (default "strict-origin-when-cross-origin") and optional Permissions-Policy
to `secureHeaders`, needed to fully replace dar-docs-web's hand-rolled security-headers.ts with
ts-sentinel — that file set 6 headers, ts-sentinel only had 4.
