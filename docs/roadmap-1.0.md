# 1.0 Readiness Roadmap

This is the single active roadmap for the 1.0 readiness sequence. It is
planned against TypeScript commit `ec68c61`; the baseline package versions are
SDK `0.12.1`, CLI `0.3.1`, and MCP `0.6.2`. The tracked current-state snapshot
is [`roadmap-1.0-status.json`](./roadmap-1.0-status.json).

## Truth and execution rules

- A docs marker, source marker, generated inventory row, or passing static
  contract alone never proves completion. A task closes only when its exact
  closure command passes and its required receipt or artifact is tracked.
- Mutation execution for this roadmap is GitHub-only. Do not run local Stryker,
  `make mutation`, or any package mutation command while executing this plan.
- This execution creates no tags, publishes no package, creates no release,
  and performs no main-branch integration.
- Task 1 is implemented but awaits two independent approvals. Pending tasks
  have no completion evidence recorded; this roadmap does not treat a local
  task ledger or an ignored agent report as durable proof.
- Task 1 approvals must cover the complete corrected range `ec68c61..HEAD`.
  Resolve `git rev-parse HEAD` immediately before each approval record; an
  approval that names only the initial implementation commit is insufficient.
- Future receipts live under `docs/roadmap-1.0-receipts/` at the exact path
  named below. A planned path is not present evidence: its absence keeps the
  corresponding task pending.

## Dependency sequence

| Task | Depends on | Status | Evidence now | Exact closure command and required artifact | Release-blocking |
|---|---|---|---|---|---|
| 1. Truthful readiness baseline | — | implemented; approvals pending | initial commit `e0f44a40de3059c9c2618f56440c0b428702361c`; `docs/roadmap-1.0-status.json` | `make risk-register risk-status-report release-readiness contract-gates`; `docs/roadmap-1.0-receipts/task-01-approvals.md` records two independent approvals naming the resolved `HEAD` and full `ec68c61..HEAD` range | Yes |
| 2. Expense filter contract | 1 | implemented | sanitized live receipt + shared SDK helper and focused wrapper/CLI/MCP tests | `npm test -w @apet97/clockify-cli-115 -- tests/read-commands-expenses.test.ts && npm test -w @apet97/clockify-mcp-115 -- tests/expenses.test.ts && make operation-parity-drift`; `docs/roadmap-1.0-receipts/task-02-expense-filter.md` | Yes |
| 3. Expense update schema | 2 | implemented | upstream commit `bf8f72814c6fe7044bd78b86b27674ef1eb2a666`; generated type + wire/cast proof in `docs/roadmap-1.0-receipts/task-03-expense-update-schema.md` | `make sdk-codegen-test consumer-cast-budget && npm test -w @apet97/clockify-cli-115 -- tests/read-commands-expenses.test.ts`; `docs/roadmap-1.0-receipts/task-03-expense-update-schema.md` | Yes |
| 4. Typed listForUser workflows | 3 | implemented | generated request/response types, all-page review/fix coverage, cross-page ambiguity proof, and an exact 10,000-entry bound in `docs/roadmap-1.0-receipts/task-04-list-for-user.md` | `npm test -w @apet97/clockify-mcp-115 && make consumer-cast-budget`; `docs/roadmap-1.0-receipts/task-04-list-for-user.md` names `listForUser` coverage | Yes |
| 5. Truthful operation parity | 4 | implemented | 169 receipt-derived dispositions = 155 explicit + 14 governed operationId-derived; all 62 current ledger anchors reviewed, semantic sets independently source/schema-pinned, and a complete 169-row operation-evidence audit; canonical fail-closed coverage validator | `make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison operation-parity operation-parity-drift operation-coverage && make risk-register contract-gates`; `docs/roadmap-1.0-receipts/task-05-generated-reachability.md` | Yes |
| 6. 1.0 breaking-change closure | 5 | implemented | exact three-name migration mapping, compile-negative removal fixtures, typed archive/delete adapter, SDK/CLI/MCP migration, and closure receipt | `make compatibility-contract breaking-change-review sdk-public-api contract-gates`; `docs/roadmap-1.0-receipts/task-06-breaking-change.md` | Yes |
| 7. Zero request-cast ratchet | 6 | complete | bounded symbol/provenance-aware request-boundary validator; CLI 0/MCP 0 casts; empty canonical exceptions; compiler-executed public no-`any` proof; two independent approvals through `a973fa1` | `make consumer-cast-budget risk-register contract-gates`; blank-credential `make perfect-fast`; package/audit proof; `docs/roadmap-1.0-receipts/task-07-zero-cast.md` | No — closed 2026-07-21 |
| 8. Authenticated-host equality | 7 | implemented | fail-closed host-set equality test (hand-written = generated = emitter = per-op hosts = policy) + config-precedence contract anchor; receipt tracked | `npm test -w clockify-sdk-ts-115 && make config-precedence`; `docs/roadmap-1.0-receipts/task-08-authenticated-host.md` | Yes |
| 9. Shared exact-artifact engine | 8 | implemented | engine prints sha512 digests, adds `--package` release-proof modes + MCP stdio smoke + fail-closed arg tests; receipt tracked | `make pack-smoke`; `docs/roadmap-1.0-receipts/task-09-artifact-engine.md` names all package tarballs and consumer commands | Yes |
| 10. Wrapper release-proof adoption | 9 | implemented | prepublishOnly ends with `--package=wrapper` exact-artifact proof; digest + consumer-install output recorded | `npm run prepublishOnly -w clockify-sdk-ts-115`; `docs/roadmap-1.0-receipts/task-10-wrapper-release-proof.md` has the tarball digest and consumer-install output | Yes |
| 11. CLI release-proof adoption | 10 | implemented | prepublishOnly ends with `--package=cli` exact-artifact proof; digest + packed-bin `--version` output recorded | `npm run prepublishOnly -w @apet97/clockify-cli-115`; `docs/roadmap-1.0-receipts/task-11-cli-release-proof.md` has the tarball digest and bin smoke output | Yes |
| 12. MCP release-proof adoption | 11 | implemented | prepublishOnly ends with `--package=mcp` exact-artifact proof; digest + packed-server stdio initialize/tools-list output recorded | `npm run prepublishOnly -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-12-mcp-release-proof.md` has the tarball digest and stdio smoke output | Yes |
| 13. Manual governance receipt | 12 | implemented | closure ran solo with make exit 0; receipt names the SDK/CLI/MCP sha512 digests and consumer outputs; `cross-package-release-proof-asymmetry` closed per its gate | `make perfect-full pack-smoke release-readiness`; `docs/roadmap-1.0-receipts/task-13-exact-artifact.md` names SDK, CLI, and MCP digests | Yes |
| 14. Wrapper authentication mutation configuration | 13 | complete | floor-bearing scope/config equality at `af35cf5`; GitHub run `29890732492` passed at that head; retained `mutation-reports-wrapper-1`; 2/2 independent reviewers approved the corrected frozen range through `cdcc7c4` with no remaining findings | GitHub Actions `Mutation`, target `wrapper`; `docs/roadmap-1.0-receipts/task-14-wrapper-mutation.md` has the run URL, exact retained artifact, and reviewed range | No — closed 2026-07-22 |
| 15. Wrapper replacement mutation configuration | 14 | complete | exact positive-scope/floor equality; `ensure.ts` 94 and `invoice-body.ts` 93 under global 82; GitHub run `29900533134` passed at final implementation head `e65ec4d`; retained `mutation-reports-wrapper-1`; 2/2 independent reviewers approved the corrected frozen range through `ed8baa1` with no remaining findings | GitHub Actions `Mutation`, target `wrapper`; `docs/roadmap-1.0-receipts/task-15-wrapper-replacement-mutation.md` records calibration, final run, retained artifact, and exact reviewed range | No — closed 2026-07-22 |
| 16. MCP safety mutation configuration | 15 | complete | exact MCP source/floor equality; confirmation 86, result 85, tool-risk 90 under global 85; GitHub run `29909385573` passed at final head `56b7cbb`; retained `mutation-reports-mcp-1`; 2/2 independent reviewers approved the corrected frozen range through `a9e0253` with no remaining findings | GitHub Actions `Mutation`, target `mcp`; `docs/roadmap-1.0-receipts/task-16-mcp-mutation.md` records preflight/calibration non-closure, floor ratchet, final run, retained artifact, and exact reviewed range | No — closed 2026-07-22 |
| 17. CLI mutation target | 16 | implemented; GitHub calibration pending | exact CLI scope is `leaf-command.ts`, `resolve-refs.ts`, and `receipt.ts`, with four pinned tests and explicit temporary zero global/module floors; no remote run, measured floor, receipt, or approval is recorded | Controller pushes then dispatches GitHub Actions `Mutation`, target `cli`; the later receipt records its run URL and `mutation-reports-cli-<run_attempt>` | Yes |
| 18. GitHub-only mutation proof | 17 | pending | none recorded | `make mutation-ci`; `docs/roadmap-1.0-receipts/task-18-remote-mutation.md` has run URLs and retained artifacts for every approved target | Yes |
| 19. Aggregate gate deduplication | 18 | pending | none recorded | `make perfect-fast perfect-full`; `docs/roadmap-1.0-receipts/task-19-aggregate-gates.md` | Yes |
| 20. Unique-claim inventory | 19 | pending | none recorded | `make docs-drift docs-quality`; `docs/roadmap-1.0-receipts/task-20-unique-claims.md` | Yes |
| 21. Plan lifecycle | 20 | pending | none recorded | `make agent-tasks agent-handoff`; `docs/roadmap-1.0-receipts/task-21-lifecycle.md` | Yes |
| 22. Webhook delivery diagnosis | 21 | pending | none recorded | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-22-webhook-diagnosis.md` | No — post-baseline workflow scope |
| 23. Workspace-user status administration | 22 | pending | none recorded | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-23-workspace-user.md` | No — post-baseline workflow scope |
| 24. Time-off balance adjustment | 23 | pending | none recorded | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-24-time-off-balance.md` | No — post-baseline workflow scope |
| 25. Scheduling assignment copy | 24 | pending | none recorded | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-25-scheduling-copy.md` | No — post-baseline workflow scope |
| 26. Project membership administration | 25 | pending | none recorded | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-26-project-membership.md` | No — post-baseline workflow scope |
| 27. Experimental entity-change feed | 26 | pending | none recorded | `npm test -w @apet97/clockify-mcp-115`; `docs/roadmap-1.0-receipts/task-27-entity-change-feed.md` | No — experimental scope |

The current open readiness blockers in `docs/risk-register.json` are:

- `remote-mutation-proof-pending`

This list is checked against the canonical open `finalReadinessBlocking` risks.
Use `make risk-status-report` to inspect the
current blocked status and blocker count; `make release-readiness` validates the
release-readiness contract, not a release-ready conclusion.
