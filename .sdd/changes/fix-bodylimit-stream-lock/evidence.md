36/36 tests pass (2 new), typecheck/build clean. Root cause confirmed live against dar-docs-web's
dev server: POST /api/auth/sign-in/social returned 500 "Body is unusable: Body has already been
read" before the fix.
