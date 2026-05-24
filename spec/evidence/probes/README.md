# Live probe fixtures

Drop one JSON-per-call file here when capturing live evidence of a
discrepancy. Naming convention:

    <yyyymmdd>-<short-slug>.json

Example: `20260524-expenses-categories-list-page-cap.json`.

Each probe should be the raw response body — no editing, no
redaction except for the workspace ID suffix and any user-identifying
fields. If you redact, add a `_redactions` array at the top of the
file naming what was stripped.

These files are git-ignored as part of `fern/`. Promote anything
canonical into the repo by writing a row into `../discrepancies.md`
and pointing at the probe by relative path.
