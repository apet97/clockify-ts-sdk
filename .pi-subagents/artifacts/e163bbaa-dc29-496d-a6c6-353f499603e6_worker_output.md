## Completed

Adversarial peer review of all five "missing/unledgered surface" findings complete. I re-verified each finding from scratch — fresh spec analysis (corrected spec vs committed official vs live-fetched `official-live.json`) and fresh live probes with `DSAUDITR_`-prefixed resources — and attempted to falsify each per its stated falsification bar. **All five findings are NOT-FALSIFIED.**

- **F1 (totals collection GET):** GET with `start/end/page/page-size` → 200 with `ProjectAssignmentsTotal[]` (2 items, `last-page: false`); default params → 200 (8 items, `last-page: true`). No phantom 404 (code 3000). Corrected spec has only `post:` on that path (programmatic check); live official has GET `getProjectTotals` deprecated:true.
- **F2 (client PUT cascades):** created client→project→task, PUT `/clients/{id}?archive-projects=true&mark-tasks-as-done=true` → 200; project `archived false→true`, task `ACTIVE→DONE`. Both cascades honored. Cleanup verified: 0 DSAUDITR leftovers across 244 clients + 292 projects.
- **F3 (sharedReportsFilter):** on the correct reports host (the corrected spec's own `x-clockify-host`), `CREATED_BY_ME`→200 count 75, `ALL`→200 count 76, `SHARED_WITH_ME`→200 count 1, no-filter→76 — filter honored, not ignored. Bonus finding: invalid `BOGUS` value → 500 (parsed, not ignored). Also documented the wrong-host trap (api.clockify.me → code-3000 phantom signature, which would have been a false falsification).
- **F4 (roles param):** single 200, repeated form 200, comma form 200, `ADMIN` → 400 code 501 with the exact 4-value enum message. Spec modeling claims (corrected array+enum vs official string) verified.
- **F5 (pto host):** `pto.api.clockify.me/api/v1/user` → 200 with key (byte-identical payload to api.clockify.me control), 401 code 1000 without. Host is alive.

## Files Changed
- `/tmp/clockify-openapi-audit/reviews/review-C.md` — full review: per-finding verdicts, 24 timestamped probe records (method, redacted path, status, key body fields), spec-verification results, cleanup evidence, and the required `acceptance-report` JSON block.
- Raw evidence retained at `/tmp/clockify-openapi-audit/review-c-probes/` (body/hdr/code files + `probe-run.log`).

## Notes
- No repo files touched (repo read-only); no API key or workspace ID appears anywhere in outputs (verified 0 matches).
- No DSAUDITR resources remain (final live scan clean).
- One nuance for the parent: F3's out-of-enum filter value produces HTTP 500 rather than a validation 400 — worth a ledger note if the param is re-added. F1 remains MEDIUM severity but the GET is upstream-deprecated, so the maintainer may still legitimately keep it absent; the finding correctly documents the live-but-unledgered surface.