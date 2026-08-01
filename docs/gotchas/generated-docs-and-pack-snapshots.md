# Generated docs, pack snapshots & their make-targets

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- `wrapper/.packsnapshot`, `cli/.packsnapshot`, and `mcp/.packsnapshot`
  must be the sorted `npm pack --dry-run --json` file lists. Run
  `make pack-snapshot-check` before push when package contents or CI
  pack steps change.
- **Never hand-edit a generated doc — regenerate it.** Which file is generated
  by which target is not repeated here: AGENTS.md §4's gate table and the
  `Regenerate` column of `docs/README.md` own that mapping, and each has a
  matching `*-drift` gate that reds when the checked-in copy is stale. The ones
  you will hit most are `make product-surface`, `make readme-tables`,
  `make error-docs`, `make troubleshooting`, `make openapi-operations`, and
  `make operation-parity`.
- `docs/README.md`'s *Generated truth surfaces* table mixes both kinds despite
  its heading. The `Regenerate` column is authoritative: a command means
  machine-written (never hand-edit), `edit intentionally` means a hand-maintained
  contract you SHOULD edit alongside its checker and test.
