# Task 19 — aggregate gate deduplication

## Scope and authority

Task 19 started from
`2a31932b65e2ec94d5b29aac85dd4004b6ec7538`. The production runner now reads
its only command plan from `scripts/lib/verify-plan.mjs`; the generator-config,
generator-comparison, mutation-CI, and aggregate checkers query that plan
structurally. `docs/aggregate-gates-contract.json` is the tracked exact-execution
contract for `perfect-fast`, `perfect-full`, and `contract-gates`.

The initial RED probe found `generator-comparison` and `mutation-ci` twice in
the old `perfect-full` composition: once as Make prerequisites and once in
`verify full`. The first focused test run also failed because the three new
production modules did not yet exist. The final focused suite passed 32 tests,
including removed/reordered/merged generator groups, distinct duplicate paths,
duplicate target definitions, cycles, unknown targets, recursive Make,
workspace package scripts, supported local-mutation spellings, bounds,
standalone full/release proof ownership, and performance ordering.

## Governed execution sequences

Every target below has computed execution count `1` for its aggregate. The
checker retains every invocation path and fails when a second path exists; no
target-name `Set` or exemption list is used.

### `perfect-fast` — 31 targets

```text
official-openapi-drift -> mutation-safety -> mcp-agent-ux -> cli-write-safety -> live-safety -> test-data-lifecycle -> config-precedence -> sdk-public-api -> cli-contract -> mcp-contract -> runtime-support -> diagnostics -> docs-quality -> release-support-contract -> release-readiness -> package-contract -> version-consistency -> changelog-drift -> docs-index-drift -> agent-handoff -> ci-contract -> sdk-codegen-sync -> sdk-codegen -> sdk-codegen-drift -> sdk-codegen-test -> generated-edit-check -> generator-comparison -> mcp-tool-manifest-drift-run -> mcp-write-safety-run -> pack-snapshot-check -> performance-budgets
```

### `perfect-full` — 42 targets

```text
official-openapi-drift -> mutation-safety -> mcp-agent-ux -> cli-write-safety -> live-safety -> test-data-lifecycle -> config-precedence -> sdk-public-api -> cli-contract -> mcp-contract -> runtime-support -> diagnostics -> docs-quality -> release-support-contract -> release-readiness -> package-contract -> version-consistency -> changelog-drift -> docs-index-drift -> agent-handoff -> ci-contract -> sdk-codegen-sync -> sdk-codegen -> sdk-codegen-drift -> sdk-codegen-test -> generated-edit-check -> generator-comparison -> mcp-tool-manifest-drift-run -> mcp-write-safety-run -> pack-snapshot-check -> goclmcp-drift -> ../GOCLMCP::openapi-drift -> ../GOCLMCP::catalog-drift -> ../GOCLMCP::selfinspect-drift -> ../GOCLMCP::raw-allowlist-drift -> spec-sync-drift -> codegen-determinism -> build-determinism -> pack-smoke -> coverage-run -> mutation-ci -> performance-budgets
```

### `contract-gates` — 89 targets

```text
generated-edit-check -> openapi-evidence -> upstream-drift -> official-openapi-drift -> sdk-codegen-sync -> sdk-wrapper-build -> mcp-tool-manifest-drift-run -> mcp-tool-manifest-drift -> operation-parity-drift -> operation-coverage-run -> generator-config -> generator-independence -> generator-comparison -> doc-correctness-anchor -> generator-portability -> package-contract -> examples-contract -> examples-matrix -> snippet-safety -> snippet-method-parity -> snippet-compile -> runtime-support -> env-contract -> config-precedence -> sdk-public-api -> sdk-runtime-contract -> decision-records -> contract-inventory -> workflow-cookbook -> acceptance-scenarios -> naming-taxonomy -> change-impact -> version-policy -> tag-hygiene -> version-consistency -> secret-hygiene -> data-handling -> security-threat-model -> supply-chain -> dependency-boundary -> dependency-license -> compatibility-contract -> breaking-change-review-run -> observability -> diagnostics -> support-bundle -> issue-intake -> release-support-contract -> release-readiness -> ci-contract -> live-safety -> test-data-lifecycle -> risk-register -> user-docs -> docs-quality -> axioms-contract -> agent-handoff -> agent-tasks -> developer-environment -> operator-toolbox -> operator-onboarding -> api-docs -> mcp-contract -> mcp-agent-ux -> mcp-write-safety-run -> cli-contract -> cli-write-safety -> consumer-cast-budget-run -> test-matrix -> mock-contract -> replay-fixtures -> cassettes-run -> fixture-mock-parity -> maintenance-playbook -> mutation-safety -> error-docs-drift -> error-registry -> troubleshooting-drift -> readme-tables-drift -> changelog-drift -> docs-index-drift -> enterprise-audit -> docs-counts -> conformance-drift -> docs-drift -> schema-quality -> product-surface-drift -> openapi-operations-drift -> aggregate-gates
```

## Ownership and safety results

- Duplicate aggregate ownership was removed for `generator-comparison` and
  `mutation-ci`. The canonical plan owns each exactly once.
- Standalone `node scripts/verify.mjs full` and `release` still contain
  `generator-comparison` and `mutation-ci` exactly once.
- Public standalone gates retain their setup dependencies. Aggregate-only
  `*-run` targets provide one execution route for operation coverage,
  breaking-change review, consumer-cast proof, cassettes, MCP manifest drift,
  MCP write safety, and coverage.
- The recursive checker scans reached Make recipes, verify commands, root and
  workspace package scripts, `npm run mutation`, workspace option forms,
  `npx stryker`, `npm exec ... stryker`, and the `mutation` target. It found no
  transitively reachable local mutation command in any governed aggregate.
- `mutation-ci` remains GitHub-wiring-only. No local Stryker or package mutation
  command ran during Task 19.
- `performance-budgets` is fatal, exactly once, and last for fast/full. Live and
  release retain their prior behavior without this ordering law.

## Proof

The required focused commands passed:

- focused plan/generator/aggregate suite: 32/32 tests;
- `make generator-config contract-inventory ci-contract docs-drift docs-quality`;
- final `make contract-gates`: exit `0`, including consumer-cast `1463/1463`,
  the three-package test-matrix contract, generated conformance drift, and the
  aggregate checker;
- `node scripts/repo-doctor.mjs`: 39 pass, 0 warn, 0 fail;
- `git diff --check`.

The closure commands ran serially with blank credentials and load checks before
each authoritative run:

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast
TASK19_PERFECT_FAST_EXIT=0

CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full
TASK19_PERFECT_FULL_EXIT=0
```

`perfect-fast` ended with passing performance measurements of SDK `171ms`, CLI
`208ms`, and MCP `666ms`. The final `perfect-full` ended with SDK `170ms`, CLI
`215ms`, and MCP `696ms`, after `coverage-run` and the GitHub-wiring-only
`mutation-ci` gate. Both kept `performance-budgets` last.

Two stale-layout failures were found and corrected before the authoritative
closure: live-safety's exact environment-forwarding marker, and mutation-CI's
old direct-prerequisite lookup. Neither failure executed local mutation.

The final contract audit also exposed pre-existing baseline drift in
`docs/test-matrix-contract.json`: its three `prepublishOnly` expectations
predated the Task 9-12 `pack-consumer-smoke --package=...` suffixes already
pinned by the package manifests and package contract. Commit `3813e86` aligns
only those three values. The following rerun then required the generated
conformance page to include the newly governed aggregate and remote-mutation
inventory rows. After that refresh, the clean final `make contract-gates` run
exited `0`; these two documentation corrections did not change Task 19 runtime
behavior or execute mutation.

## Approval state

Task 19 is implemented and remains at `0/2` independent approvals. Two fresh
reviewers must approve the complete range
`2a31932b65e2ec94d5b29aac85dd4004b6ec7538..HEAD`, resolving `HEAD` immediately
before review. Task 20 must not start before both approvals are recorded. Task 1
and the roadmap remain open. This receipt authorizes no tag, release,
publication, push, or main-branch integration.
