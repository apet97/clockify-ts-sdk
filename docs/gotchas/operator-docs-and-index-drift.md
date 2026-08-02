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

- `make doc-integrity` reports markdown cross-references that do not resolve:
  relative links whose target file is missing, and `see §N` references to a
  section the file does not have. It is a **reporting** script, deliberately
  not wired into `contract-gates` / `perfect-fast` / `perfect-full`. Baseline
  on 2026-08-02 was 224 files, 405 links, 2 section refs, **0 findings** — so
  any finding is a regression. Links into `docs/api/**` are excluded: that is
  generated typedoc output, gitignored and absent on a normal checkout.
  `scripts/check-doc-index.mjs` covers `docs/README.md` only; this covers the
  other 223 files.
