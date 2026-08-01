# Operator docs & docs-index drift

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- `make docs-index-drift` checks `docs/README.md` links and required
  generated surfaces.
- `docs/install-personas.md`, `docs/migration-guide.md`, and
  `docs/dependency-policy.md` are operator-facing hand-written docs.
- `docs/troubleshooting.md` is generated from `docs/error-codes.json`;
  run `make troubleshooting` after error registry changes.
