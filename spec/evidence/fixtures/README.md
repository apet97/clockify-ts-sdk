# Curated fixtures

Where `probes/` holds raw live captures, `fixtures/` holds the
curated/minimized golden shapes the corrected spec asserts. Use
these when:

- a probe is too noisy to read at a glance,
- the same shape is reused across many endpoints,
- you want a stable target the corrected spec's `examples:` block
  can point at without dragging in workspace-specific IDs.

Naming: `<entity>.json` or `<entity>.<variant>.json`. Strip every
ID/UUID/timestamp that isn't load-bearing. Keep one fixture per
file — do not pack arrays of unrelated shapes together.

Committable (only `../probes/*.json` is git-ignored, per `.gitignore`). Every
committed fixture is replayed offline by `make replay-fixtures` and re-scanned
by `make secret-hygiene` + `make data-handling`, so redact real IDs/secrets
first (use the `000000000000000000000NNN` placeholder convention from
`scripts/mock-clockify-server.mjs`). Promote by referencing from
`../discrepancies.md` and `docs/live-probe-ledger.json`.
