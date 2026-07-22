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
`verify full`. The first implementation closed that overlap, but two frozen
range reviews rejected it at head `38a17a1` because external Makefiles were
opaque, package-script and shell wrappers could hide Make or mutation, npm
aliases were incomplete, governed targets were not required to be phony, and
three public proof targets could race their setup under `make -j`. Those
reviews count as `0/2` approvals.

Repair commit `81eb004` added a directory-aware Makefile provider for the root
and `../GOCLMCP`, one bounded command walker shared by Make recipes, canonical
verify commands, and recursively invoked package scripts, official npm
`run-script`/`exec`/`x`/`npx` and direct Stryker detection, fail-closed shell
indirection, phony enforcement, and setup-then-recursive-run public gates. It
also removed the last duplicate-check exemption by reducing release MCPB proof
to its single transitive `mcpb-smoke` root. The final focused bundle passed
82/82 tests, including adversarial external traversal, policy, missing-file,
cycle, duplicate, command, npm-alias, mutation, phony, setup-order, and bound
fixtures. Two reviews of the repaired range through `60e128b` still rejected
it: the contracts CI checkout has no sibling but the checker required the live
`../GOCLMCP/Makefile`; combined shell flags, parenthesized commands, and direct
Make executable paths bypassed traversal; and npm global workspace/prefix
options plus direct test aliases were parsed positionally. Those reviews also
count as `0/2`, leaving the approval total unchanged.

Second repair commit `177e0dc` made the exact relevant GOCLMCP target subset a
committed, source-derived fallback. A clean single-repository checkout walks
that fallback; a sibling checkout walks the live Makefile only after comparing
every reached target's prerequisites, full recipe, and `.PHONY` state to the
fallback. Missing, malformed, extra, incomplete, duplicate, or drifted fallback
graphs fail closed. The same repair normalizes Make/shell executable basenames,
rejects shell command-string and parenthesized indirection, and replaces npm
positional searches with one bounded global-option/subcommand parser covering
workspace names/paths, package-directory prefixes, run aliases, test aliases,
and exec aliases. The existing single-repository CI workflow was not changed.

The subsequent review round through `e343b41` still rejected Task 19. Parsed
command positions could not prove that every raw Make marker was accounted,
Stryker detection remained launcher-specific, npm `exec`/`x` payloads stopped
before the shared walker, npm `-C` was not modeled, and a present sibling with
a missing Makefile incorrectly fell back. That round also leaves the approval
total at `0/2`.

Third repair commit `f282173` moved those aliases into source-wide invariants.
Every reached recipe, verify command representation, and recursive package
script lexically inventories standalone Make markers; executable or dynamically
evaluated markers must become successfully parsed recursive visits, while the
inert quoted `run make <target>` recovery diagnostics already present in the
source-derived GOCLMCP recipes are classified explicitly. Every reached raw
source containing a Stryker executable marker fails before launcher
interpretation. npm `exec`/`x` payloads recurse through the same bounded walker,
`npx -c`/`--call` fail closed, and npm `-C`/`-C=` resolve through the exact
package-directory policy used by `--prefix`. The production checker now stats
the sibling directory before its Makefile: only a genuinely absent directory
may use the committed fallback; a present missing, unreadable, non-file, or
malformed Makefile fails closed. No workflow file changed.

Two final hardening commits closed the remaining reviewed command-construction
boundaries. `b350824` rejects dynamically assembled Make executables and
quote/glob-obscured Stryker paths while bounding raw marker accounting.
`17d6c55` rejects reached Node/Python code-evaluation flags, non-static
`npx`/`npm exec` tool arguments, and oversized Makefile, definition,
prerequisite, verify-plan, package-script, and source-accounting inputs before
materialization. Their TDD additions were observed RED in 11 and 9 cases,
respectively; the final focused evaluator/external-checker suite passed
120/120 and the broader focused authority bundle passed 129/129.

## Governed execution sequences

Every target below has computed execution count `1` for its aggregate. The
checker retains every invocation path and fails when a second path exists; no
target-name `Set` or exemption list is used.

### `perfect-fast` — 31 targets

```text
official-openapi-drift -> mutation-safety -> mcp-agent-ux -> cli-write-safety -> live-safety -> test-data-lifecycle -> config-precedence -> sdk-public-api -> cli-contract -> mcp-contract -> runtime-support -> diagnostics -> docs-quality -> release-support-contract -> release-readiness -> package-contract -> version-consistency -> changelog-drift -> docs-index-drift -> agent-handoff -> ci-contract -> sdk-codegen-sync -> sdk-codegen -> sdk-codegen-drift -> sdk-codegen-test -> generated-edit-check -> generator-comparison -> mcp-tool-manifest-drift-run -> mcp-write-safety-run -> pack-snapshot-check -> performance-budgets
```

### `perfect-full` — 45 targets

```text
official-openapi-drift -> mutation-safety -> mcp-agent-ux -> cli-write-safety -> live-safety -> test-data-lifecycle -> config-precedence -> sdk-public-api -> cli-contract -> mcp-contract -> runtime-support -> diagnostics -> docs-quality -> release-support-contract -> release-readiness -> package-contract -> version-consistency -> changelog-drift -> docs-index-drift -> agent-handoff -> ci-contract -> sdk-codegen-sync -> sdk-codegen -> sdk-codegen-drift -> sdk-codegen-test -> generated-edit-check -> generator-comparison -> mcp-tool-manifest-drift-run -> mcp-write-safety-run -> pack-snapshot-check -> goclmcp-drift -> ../GOCLMCP::openapi-drift -> ../GOCLMCP::gen-openapi -> ../GOCLMCP::catalog-drift -> ../GOCLMCP::gen-tool-catalog -> ../GOCLMCP::selfinspect-drift -> ../GOCLMCP::raw-allowlist-drift -> ../GOCLMCP::gen-raw-allowlist -> spec-sync-drift -> codegen-determinism -> build-determinism -> pack-smoke -> coverage-run -> mutation-ci -> performance-budgets
```

### `contract-gates` — 89 targets

```text
generated-edit-check -> openapi-evidence -> upstream-drift -> official-openapi-drift -> sdk-codegen-sync -> sdk-wrapper-build -> mcp-tool-manifest-drift -> mcp-tool-manifest-drift-run -> operation-parity-drift -> operation-coverage-run -> generator-config -> generator-independence -> generator-comparison -> doc-correctness-anchor -> generator-portability -> package-contract -> examples-contract -> examples-matrix -> snippet-safety -> snippet-method-parity -> snippet-compile -> runtime-support -> env-contract -> config-precedence -> sdk-public-api -> sdk-runtime-contract -> decision-records -> contract-inventory -> workflow-cookbook -> acceptance-scenarios -> naming-taxonomy -> change-impact -> version-policy -> tag-hygiene -> version-consistency -> secret-hygiene -> data-handling -> security-threat-model -> supply-chain -> dependency-boundary -> dependency-license -> compatibility-contract -> breaking-change-review-run -> observability -> diagnostics -> support-bundle -> issue-intake -> release-support-contract -> release-readiness -> ci-contract -> live-safety -> test-data-lifecycle -> risk-register -> user-docs -> docs-quality -> axioms-contract -> agent-handoff -> agent-tasks -> developer-environment -> operator-toolbox -> operator-onboarding -> api-docs -> mcp-contract -> mcp-agent-ux -> mcp-write-safety-run -> cli-contract -> cli-write-safety -> consumer-cast-budget-run -> test-matrix -> mock-contract -> replay-fixtures -> cassettes-run -> fixture-mock-parity -> maintenance-playbook -> mutation-safety -> error-docs-drift -> error-registry -> troubleshooting-drift -> readme-tables-drift -> changelog-drift -> docs-index-drift -> enterprise-audit -> docs-counts -> conformance-drift -> docs-drift -> schema-quality -> product-surface-drift -> openapi-operations-drift -> aggregate-gates
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
  workspace package scripts, root and allowed external Makefiles,
  `npm run`/`run-script` workspace and prefix forms (`--prefix` and `-C`),
  direct `test`/`t`/`tst`, recursive `npm exec`/`x` payloads, `npx`, `command
  make`, Make/gmake executable paths and variables, and the `mutation` target.
  Raw Make markers, source-wide Stryker markers, `npx -c`/`--call`, combined
  shell command-string options such as `-lc`/`-ec`, parenthesized command
  groups, unknown/ambiguous/out-of-policy npm selectors, missing package
  scripts, missing/drifted fallback graphs, cycles, and every explicit
  traversal bound fail closed. It found no transitively reachable local
  mutation command in any governed aggregate.
- `docs/aggregate-gates-goclmcp.Makefile` is an active fallback, not narrative
  evidence: `check-aggregate-gates.mjs` supplies it only when the sibling
  directory is absent and validates it target-by-target against the live
  sibling whenever present and readable. Present missing, non-file, unreadable,
  or malformed sibling Makefiles fail instead of falling back. The fallback
  contains only the seven recursively reached targets; unrelated GOCLMCP
  Makefile text is outside its contract.
- Every reached root or external target is phony. `pack-snapshot-check` and
  `spec-sync-drift` are now explicitly declared phony.
- `mcp-tool-manifest-drift`, `mcp-write-safety`, and `coverage` keep setup as a
  prerequisite and invoke the proof target recursively from their recipe, so
  public `make -j` cannot race proof against setup.
- `mutation-ci` remains GitHub-wiring-only. No local Stryker or package mutation
  command ran during Task 19.
- `performance-budgets` is fatal, exactly once, and last for fast/full. Live and
  release retain their prior behavior without this ordering law.

## Proof

The final reviewed head was
`17d6c55e896620d4240e374f8c8653739a341d7a`. At that head:

- `make contract-gates` exited `0`, including consumer-cast `1463/1463`, CLI
  and MCP request casts `0/0`, enterprise audit `92`, and exact aggregate
  counts `31/45/89`;
- blank-credential `make perfect-fast` exited `0` with SDK `177ms`, CLI
  `205ms`, and MCP `597ms`;
- the subsequent blank-credential `make perfect-full` exited `0` with SDK
  `154ms`, CLI `189ms`, and MCP `653ms`, coverage floors green, and all 89
  GitHub-wiring-only mutation proof tests green; and
- no local Stryker or package mutation command ran.

The final third-repair commands passed:

- TDD RED: 71/88 passed and 17 failed at the new raw-source, launcher,
  npm-prefix, and external-state boundaries before implementation;
- focused evaluator/checker suite after implementation: 92/92 tests;
- broader plan/generator/aggregate/write-safety suite: 131/131 tests;
- production aggregate checker with the live sibling: exact `31/45/89` target
  sequences and exit `0`;
- production checker fixtures: clean absent sibling succeeds; present missing,
  malformed, and non-file sibling Makefiles reject;
- `make aggregate-gates generator-config contract-inventory ci-contract
  enterprise-audit docs-drift docs-quality`, plus operation-coverage and MCP
  write-safety checkers;
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

The third-repair `perfect-fast` ended with passing performance measurements of
SDK `151ms`, CLI `173ms`, and MCP `563ms`. The third-repair `perfect-full`
ended with SDK `148ms`, CLI `172ms`, and MCP `594ms`, after `coverage-run` and
the GitHub-wiring-only
`mutation-ci` gate. Both kept `performance-budgets` last.

During the first repair, an earlier fast attempt reached every
functional/package gate but
ended red when unrelated machine load pushed MCP startup to `1251ms` against
the `1200ms` budget. Solo retries under the same contention were also red.
No threshold changed: execution paused until a genuine idle window, a solo
budget probe passed at SDK `171ms`, CLI `210ms`, MCP `738ms`, and the complete
blank-credential fast/full closures above then passed.

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

The repair reruns also caught and corrected three stale structural contracts:
operation coverage and MCP write safety still pinned the unsafe sibling-run
prerequisite layout, while the enterprise audit named superseded helper
symbols. Their updated contracts now require the setup-then-recursive-run
shape and the shared directory-aware walker. None of these corrections ran
local mutation.

## Approval state

Two independent reviewers returned **APPROVE** for both specification
compliance and code quality over the frozen range
`2a31932b65e2ec94d5b29aac85dd4004b6ec7538..17d6c55e896620d4240e374f8c8653739a341d7a`.

## Post-Task-20 governed extension

Task 20 later added `unique-claim-inventory` exactly once to `perfect-fast`,
`perfect-full`, and `contract-gates`. The current canonical sequences are
therefore 32, 46, and 90 targets. `make aggregate-gates` passed against those
updated sequences with no local mutation command. The historical 31/45/89
measurements above remain the exact proof at the original reviewed Task 19
head.
Task 19 is complete at `2/2` approvals with no remaining review findings. This
closeout commit is evidence-only and is not part of the substantive reviewed
implementation range. Task 20 may start; Task 1 and the roadmap remain open.
This receipt authorizes no tag, release, publication, push, or main-branch
integration.
