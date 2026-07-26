# Tasks

- [ ] `src/traceid/traceid.ts` — `traceId()` middleware per spec.md
- [ ] `src/traceid/index.ts` — re-export
- [ ] `src/sentinel/index.ts` — add to barrel export
- [ ] `package.json` — add `./traceid` export path
- [ ] `tests/traceid/traceid.test.ts` — table-driven tests (inbound preserved, generated when
      missing, header on success response, header on short-circuited/error response, custom
      config)
- [ ] `README.md` — reference wiring updated, module table row added
- [ ] `docs/owasp-coverage.md` — short A09 note

## Files

- src/traceid/traceid.ts
- src/traceid/index.ts
- src/sentinel/index.ts
