# Spec

- `secureHeaders` sets `Referrer-Policy` on every response (default "strict-origin-when-cross-origin", overridable).
- `secureHeaders` sets `Permissions-Policy` only when `cfg.permissionsPolicy` is explicitly provided — no safe universal default.

## Acceptance criteria
- [x] Default config sets Referrer-Policy, does not set Permissions-Policy
- [x] Explicit permissionsPolicy config sets the header
