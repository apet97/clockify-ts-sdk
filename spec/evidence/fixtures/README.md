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

Git-ignored. Promote by referencing from `../discrepancies.md`.
