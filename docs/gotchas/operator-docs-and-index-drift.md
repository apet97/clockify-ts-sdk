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

- `make docs-quality` owns parser-backed Markdown integrity. It scans ordinary
  repository Markdown plus committed `.claude/skills/**` files and checks links,
  images, GitHub heading fragments, numbered `see §N` references, path case,
  repository escapes, and symlink boundaries. `node scripts/check-doc-links.mjs
  --format=json` prints the machine-readable receipt; exit 0 is clean, exit 1
  reports findings, and exit 2 means the scanner itself failed.
- Directory targets are valid when the directory exists; the checker does not
  require an implicit `README.md` or `index.md`. Raw HTML `href` links are not
  Markdown link tokens and are intentionally ignored; use Markdown link syntax
  for governed documentation links.
- Untracked local `.claude` state and `.remember/` are excluded, while committed
  `.claude/skills/**` remains in scope. Links into `docs/api/**` are excluded:
  that is generated TypeDoc output, gitignored and absent on a normal checkout.
  `scripts/check-doc-index.mjs` reuses the same resolver for the required
  `docs/README.md` index membership checks.
