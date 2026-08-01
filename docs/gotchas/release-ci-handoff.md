# Release, CI & handoff

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- `make agent-handoff` checks `AGENTS.md`, this file, generated-path
  boundaries, and stale package/tool counts.
- **release-please is retired** (2026-07-27) — it anchored on GitHub Releases,
  ignored `.release-please-manifest.json`, and every PR it filed proposed a
  version *below* what was already on npm (last: 0.13.0 -> 0.12.1). Releases are
  cut by hand-bumping and pushing a prefixed `wrapper-v*`/`cli-v*`/`mcp-v*` tag.
  `check-ci-contract.mjs` fails if the workflow returns. The manifest/config
  files stay — `version-consistency` reconciles them. `release.yml` publishes
  only on a tag whose version matches `wrapper/package.json`; that guard is
  load-bearing.
- **`docs/ci-contract.json` is enforced, not decorative** (since 2026-07-28).
  `check-ci-contract.mjs` reads `policyDocument`, `workflows[]`,
  `supportingDocs[]`, `retiredWorkflows[]`, and `actionPinning`; text-presence
  assertions live in the contract, and only structural logic stays in the script.
  Before that it hardcoded everything and never opened the file, so the `ci.yml`
  entry still demanded `name: CI` on Node `["20","22"]` and listed two workflows
  the same script asserted must not exist. `scripts/check-ci-contract.test.mjs`
  pins each of those drifts.
- **Action SHA pinning is contract-governed and coverage is total.**
  `actionPinning.enforcedFor` ∪ `knownUnpinned` must name every file in
  `.github/workflows`, so a new workflow cannot skip pinning by going unmentioned;
  and a `knownUnpinned` entry that becomes fully pinned reds until promoted. Note
  the pin regex matches **both** `uses:` and `- uses:` — matching only the bare
  form (as it did until 2026-07-28) skipped the first step of every job, i.e.
  every `actions/checkout`. `enforcedFor` covers all 8 workflows and
  `knownUnpinned` is empty — the last three gaps (`codeql.yml`, `docs.yml`,
  `sandbox-key-health.yml`, 7 unpinned uses) were closed 2026-07-28 with
  maintainer approval and promoted into `enforcedFor`, so coverage is total.
  Re-adding a `knownUnpinned` entry is a regression that needs a recorded
  openRisk and closureTarget.
- **Every contract must be read by some script.** The
  `contracts-have-a-reading-script` invariant in `check-contract-inventory.mjs`
  fails any non-retired `docs/contract-inventory.json` entry whose `contracts[]`
  no script reads. It matches *any* script, not the entry's own `checker`,
  because several contracts are legitimately read by a delegate.
- The final-readiness receipt make-targets (draft/check/final receipts and the
  goal-status report) were **removed on 2026-05-28**. `make enterprise-audit`
  is what remains; `scripts/check-enterprise-hardening.mjs` no longer has a
  `--final` mode. Don't reinvent them from an old reference — only
  `docs/decisions/0004-sandbox-only-live-proof.md` still uses that
  terminology, deliberately, as a historical record.
