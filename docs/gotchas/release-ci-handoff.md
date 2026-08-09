# Release, CI & handoff

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- `make agent-handoff` checks `AGENTS.md`, this file, generated-path
  boundaries, and stale package/tool counts.
- **A red release run usually means the publish worked.** All three 2.0.0 runs
  ended `failure` on `registry_propagation_timeout` — npm accepted the publish
  and the workflow's own verification query 404'd before the registry caught
  up. The receipt says so in as many words: "publish succeeded but registry
  propagation timed out; publication remains pending and must not be retried
  blindly." Query npm before reacting; never re-tag on this signal.
- **Tag the SDK first.** Both consumers declare a `clockify-sdk-ts-115` peer
  range matching the SDK major, so `cli-v*` and `mcp-v*` must follow
  `wrapper-v*` on the registry.
- **`changelog-drift` is stricter in CI than locally.** CI compares the whole
  push range against a base ref; the local run compares a clean tree with no
  base ref. A commit that only *deletes* a package file passes locally and reds
  in CI. Check the range, not just the working tree, before pushing.
- **release-please is retired** (2026-07-27) — it anchored on GitHub Releases,
  ignored `.release-please-manifest.json`, and every PR it filed proposed a
  version *below* what was already on npm (last: 0.13.0 -> 0.12.1). Releases are
  cut by hand-bumping and pushing a prefixed `wrapper-v*`/`cli-v*`/`mcp-v*` tag.
  `check-ci-contract.mjs` fails if the workflow returns. The manifest/config
  files stay — `version-consistency` reconciles them. `release.yml` publishes
  only on a tag whose version matches `wrapper/package.json`; that guard is
  load-bearing.
- **The 1.0 inventory check is retired (2026-08-09).**
  `docs/one-point-zero-surface-inventory.json` stays as read-only campaign
  evidence, but `make release-readiness` no longer re-validates it, so a
  release-workflow edit no longer requires a regeneration commit. See
  `docs/roadmap-1.0-receipts/governance-gate-retirement.md`.
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
