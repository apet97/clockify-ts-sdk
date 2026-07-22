# 1.0 Readiness Roadmap

This is the single active roadmap for the 1.0 readiness sequence. It is
planned against TypeScript commit `ec68c61`; the baseline package versions are
SDK `0.12.1`, CLI `0.3.1`, and MCP `0.6.2`. The tracked current-state snapshot
is [`roadmap-1.0-status.json`](./roadmap-1.0-status.json). All task states and
transitions use the closed lifecycle in
[`plan-lifecycle-policy.md`](./plan-lifecycle-policy.md).

## Truth and execution rules

- A docs marker, source marker, generated inventory row, or passing static
  contract alone never proves completion. A task closes only when its exact
  closure command passes and its required receipt or artifact is tracked.
- Mutation execution for this roadmap is GitHub-only. Do not run local Stryker,
  `make mutation`, or any package mutation command while executing this plan.
- This execution creates no tags, publishes no package, creates no release,
  and performs no main-branch integration.
- `implemented` means implementation exists while named evidence or approval is
  open; `evidence_captured` means the exact closure command succeeded and the
  tracked receipt exists while acceptance remains open. Neither means
  `complete`. Pending tasks have no task closure evidence.
- Task 1 is implemented at 0/2 approvals. It is a final release/acceptance
  blocker, not an execution prerequisite: Tasks 2+ may be implemented and
  evidence-captured while its approval waits for the final frozen branch.
- Task 1 reviewers approve the resolved pre-close head and complete range
  `ec68c61..<pre-close-HEAD>`. The subsequent closeout commit is strictly
  evidence-only and records symbolic `SELF`; the checker resolves it to Git
  `HEAD`, requires its parent to be the reviewed head, and derives its path
  allowlist from the Git diff. An approval that names only
  `e0f44a40de3059c9c2618f56440c0b428702361c`, a stale head, a partial range,
  or fewer than two reviewers is insufficient. Any later substantive commit
  invalidates approval; an evidence-only correction states whether reviewed
  evidence changed.
- Future receipts live under `docs/roadmap-1.0-receipts/` at the exact path
  named below. A planned path is not present evidence: its absence keeps the
  corresponding task pending.

## Dependency sequence

| Task | Depends on | Status | Evidence now | Exact closure command and required artifact | Release-blocking |
|---|---|---|---|---|---|
| 1. Truthful readiness baseline | — | implemented (0/2 approvals) | initial commit `e0f44a40de3059c9c2618f56440c0b428702361c`; no approval receipt yet | `make risk-register risk-status-report release-readiness contract-gates`; `docs/roadmap-1.0-receipts/task-01-approvals.md` records two independent approvals naming the resolved pre-close head and full `ec68c61..<pre-close-HEAD>` range plus the evidence-only closeout | Yes |
| 2. Expense filter contract | 1 (final acceptance only) | complete | sanitized live receipt + shared SDK helper and focused wrapper/CLI/MCP tests; 2/2 independent reviewers approved through `0f96f44` | `npm test -w @apet97/clockify-cli-115 -- tests/read-commands-expenses.test.ts && npm test -w @apet97/clockify-mcp-115 -- tests/expenses.test.ts && make operation-parity-drift`; `docs/roadmap-1.0-receipts/task-02-expense-filter.md` | Yes — closed 2026-07-22 |
| 3. Expense update schema | 2 | complete | upstream commit `bf8f72814c6fe7044bd78b86b27674ef1eb2a666`; generated type + wire/cast proof; 2/2 reviewers approved the upstream and downstream ranges through `af5cbdc` | `make sdk-codegen-test consumer-cast-budget && npm test -w @apet97/clockify-cli-115 -- tests/read-commands-expenses.test.ts`; `docs/roadmap-1.0-receipts/task-03-expense-update-schema.md` | Yes — closed 2026-07-22 |
| 4. Typed listForUser workflows | 3 | complete | generated request/response types, all-page review/fix coverage, cross-page ambiguity proof, exact 10,000-entry bound, and 2/2 approvals through `68df03e` | `npm test -w @apet97/clockify-mcp-115 && make consumer-cast-budget`; `docs/roadmap-1.0-receipts/task-04-list-for-user.md` names `listForUser` coverage | Yes — closed 2026-07-22 |
| 5. Truthful operation parity | 4 | complete | 169 receipt-derived dispositions = 155 explicit + 14 governed operationId-derived; all 62 current ledger anchors reviewed, semantic sets source/schema-pinned, complete 169-row audit, fail-closed validator, and 2/2 approvals through `fb1c184` | `make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison operation-parity operation-parity-drift operation-coverage && make risk-register contract-gates`; `docs/roadmap-1.0-receipts/task-05-generated-reachability.md` | Yes — closed 2026-07-22 |
| 6. 1.0 breaking-change closure | 5 | complete | exact three-name migration mapping, compile-negative removal fixtures, typed archive/delete adapter, SDK/CLI/MCP migration, closure receipt, and 2/2 approvals through `5485a65` | `make compatibility-contract breaking-change-review sdk-public-api contract-gates`; `docs/roadmap-1.0-receipts/task-06-breaking-change.md` | Yes — closed 2026-07-22 |
| 7. Zero request-cast ratchet | 6 | complete | bounded symbol/provenance-aware request-boundary validator; CLI 0/MCP 0 casts; empty canonical exceptions; compiler-executed public no-`any` proof; two independent approvals through `a973fa1` | `make consumer-cast-budget risk-register contract-gates`; blank-credential `make perfect-fast`; package/audit proof; `docs/roadmap-1.0-receipts/task-07-zero-cast.md` | No — closed 2026-07-21 |
| 8. Authenticated-host equality | 7 | complete | fail-closed host-set equality test (hand-written = generated = emitter = per-op hosts = policy), config-precedence anchor, and 2/2 independent approvals through `00c53c9` | `npm test -w clockify-sdk-ts-115 && make config-precedence`; `docs/roadmap-1.0-receipts/task-08-authenticated-host.md` | Yes — closed 2026-07-22 |
| 9. Shared exact-artifact engine | 8 | complete | engine prints sha512 digests, adds `--package` release-proof modes + MCP stdio smoke + fail-closed arg tests; 2/2 reviewers approved the implementation through `29fed6b` and provenance correction through `6634f3d` | `make pack-smoke`; `docs/roadmap-1.0-receipts/task-09-artifact-engine.md` names all package tarballs and consumer commands | Yes — closed 2026-07-22 |
| 10. Wrapper release-proof adoption | 9 | complete | prepublishOnly ends with `--package=wrapper` exact-artifact proof; digest + consumer-install output recorded; 2/2 reviewers approved implementation and corrected provenance | `npm run prepublishOnly -w clockify-sdk-ts-115`; `docs/roadmap-1.0-receipts/task-10-wrapper-release-proof.md` has the tarball digest and consumer-install output | Yes — closed 2026-07-22 |
| 11. CLI release-proof adoption | 10 | complete | prepublishOnly ends with `--package=cli` exact-artifact proof; digest + packed-bin `--version` output recorded; 2/2 reviewers approved implementation and corrected provenance | `npm run prepublishOnly -w @apet97/clockify-cli-115`; `docs/roadmap-1.0-receipts/task-11-cli-release-proof.md` has the tarball digest and bin smoke output | Yes — closed 2026-07-22 |
| 12. MCP release-proof adoption | 11 | complete | prepublishOnly ends with `--package=mcp` exact-artifact proof; digest + packed-server stdio initialize/tools-list output recorded; 2/2 reviewers approved implementation and corrected provenance | `npm run prepublishOnly -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-12-mcp-release-proof.md` has the tarball digest and stdio smoke output | Yes — closed 2026-07-22 |
| 13. Manual governance receipt | 12 | complete | closure ran solo with make exit 0; receipt names SDK/CLI/MCP sha512 digests and consumer outputs; risk closed per its gate; 2/2 reviewers approved through `dd9a0c5` | `make perfect-full pack-smoke release-readiness`; `docs/roadmap-1.0-receipts/task-13-exact-artifact.md` names SDK, CLI, and MCP digests | Yes — closed 2026-07-22 |
| 14. Wrapper authentication mutation configuration | 13 | complete | floor-bearing scope/config equality at `af35cf5`; GitHub run `29890732492` passed at that head; retained `mutation-reports-wrapper-1`; 2/2 independent reviewers approved the corrected frozen range through `cdcc7c4` with no remaining findings | GitHub Actions `Mutation`, target `wrapper`; `docs/roadmap-1.0-receipts/task-14-wrapper-mutation.md` has the run URL, exact retained artifact, and reviewed range | No — closed 2026-07-22 |
| 15. Wrapper replacement mutation configuration | 14 | complete | exact positive-scope/floor equality; `ensure.ts` 94 and `invoice-body.ts` 93 under global 82; GitHub run `29900533134` passed at final implementation head `e65ec4d`; retained `mutation-reports-wrapper-1`; 2/2 independent reviewers approved the corrected frozen range through `ed8baa1` with no remaining findings | GitHub Actions `Mutation`, target `wrapper`; `docs/roadmap-1.0-receipts/task-15-wrapper-replacement-mutation.md` records calibration, final run, retained artifact, and exact reviewed range | No — closed 2026-07-22 |
| 16. MCP safety mutation configuration | 15 | complete | exact MCP source/floor equality; confirmation 86, result 85, tool-risk 90 under global 85; GitHub run `29909385573` passed at final head `56b7cbb`; retained `mutation-reports-mcp-1`; 2/2 independent reviewers approved the corrected frozen range through `a9e0253` with no remaining findings | GitHub Actions `Mutation`, target `mcp`; `docs/roadmap-1.0-receipts/task-16-mcp-mutation.md` records preflight/calibration non-closure, floor ratchet, final run, retained artifact, and exact reviewed range | No — closed 2026-07-22 |
| 17. CLI mutation target | 16 | complete | exact CLI scope is `leaf-command.ts`, `resolve-refs.ts`, and `receipt.ts`, with global floor 96 and module floors 95/95/100; final GitHub run `29913220026` passed at floor-bearing head `9dfc3bf` and retained `mutation-reports-cli-1`; 2/2 independent reviewers approved the corrected frozen range through `3fdf279` with no remaining findings | `docs/roadmap-1.0-receipts/task-17-cli-mutation.md` records calibration/post-test non-authority, the final run, retained artifact, and exact reviewed range | No — closed 2026-07-22 |
| 18. GitHub-only mutation proof | 17 | complete | aggregate GitHub run `29914969280` at proof commit `1f3e4de98ebd6445dde5280c23ce825f0719cfb3` passed for `target=all`; two independent reviewers approved the frozen Task 18 range through `f6e86cc`; `remote-mutation-proof-pending` remains accepted | `make mutation-ci risk-register risk-status-report release-readiness`; `docs/roadmap-1.0-receipts/task-18-remote-mutation.md` and `docs/remote-mutation-proof-contract.json` | No — proof accepted; Task 18 closed 2026-07-22 |
| 19. Aggregate gate deduplication | 18 | complete | canonical bounded Make/Stryker/shell/npm graph checker; current exact execution counts fast 32, full 46, contract 90 after Task 20 added unique-claim inventory exactly once; blank-credential fast/full exits 0; no local Stryker; two independent reviewers approved the frozen implementation range through `17d6c55` | serial blank-credential `make perfect-fast`, then `make perfect-full`; `docs/roadmap-1.0-receipts/task-19-aggregate-gates.md` | No — closed 2026-07-22 |
| 20. Unique-claim inventory | 19 | complete | exact 50-claim projection (27 roadmap, 13 risk, 6 workflow, 4 readiness); two independent reviewers approved the frozen range through `2550b4a` | `make docs-drift docs-quality`; `docs/roadmap-1.0-receipts/task-20-unique-claims.md` | No — closed 2026-07-22 |
| 21. Plan lifecycle | 20 | complete | lifecycle policy/contract, fail-closed validator fixtures, indexed execution packet, exact closure exit 0, and two independent approvals over the frozen range through `13481e7` | `make agent-tasks agent-handoff`; `docs/roadmap-1.0-receipts/task-21-lifecycle.md` | No — closed 2026-07-22 |
| 22. Webhook delivery diagnosis | 21 | complete | read-only SDK status/latest-log projection with response-body redaction; deterministic MCP proof and 2/2 independent approvals over the corrected frozen range through `6fb273b`; live sandbox read probe not run | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-22-webhook-diagnosis.md` | No — closed 2026-07-22 |
| 23. Workspace-user status administration | 22 | complete | privileged `clockify_users_set_status` with verified ID/name/email resolution, exact stored preview, hard self-deactivation block, direct generated request, deterministic MCP proof, and 2/2 independent approvals through `aa82bf2` | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-23-workspace-user.md` | No — closed 2026-07-22 |
| 24. Time-off balance adjustment | 23 | complete | guarded `clockify_time_off_balances_update` with policy plus verified ID/name/email user resolution, replacement-only `value`, exact stored preview, void-safe redacted receipt, deterministic MCP proof, 2/2 approvals through `444b0d2`, and no live entitlement mutation | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-24-time-off-balance.md` | No — closed 2026-07-22 |
| 25. Scheduling assignment copy | 24 | complete | guarded `clockify_scheduling_copy` with verified target-user resolution, exact stored preview, direct generated request, lossless array response, honest empty-result warning, deterministic MCP proof, 2/2 approvals through `d89a0d3`, and no live schedule mutation | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-25-scheduling-copy.md` | No — closed 2026-07-22 |
| 26. Project membership administration | 25 | complete | read-only membership projection plus privileged strict-input exact-preview replacement with verified user/group resolution, direct generated requests, update-specific guard/recovery proof, 2/2 approvals through `691ab45`, and no live project mutation | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-26-project-membership.md` | No — closed 2026-07-22 |
| 27. Experimental entity-change feed | 26 | complete | one strict read tool routes the required change type to exactly one generated experimental endpoint, preserves each generated response shape, and carries deterministic MCP/count/parity proof without a live call; 2/2 independent reviewers approved the frozen range through `b0ec918` | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-27-entity-change-feed.md` | No — experimental scope; closed 2026-07-22 |

The current open readiness blockers in `docs/risk-register.json` are:

There are currently none. The accepted remote-mutation proof remains visible as
a non-blocking risk. Tasks 21 through 27 are complete at 2/2 approvals.
Historical approval closeouts and Task 1 remain open.
Use `make risk-status-report` to inspect the current clear blocker count;
`make release-readiness` validates the contract, not a release-ready conclusion.
