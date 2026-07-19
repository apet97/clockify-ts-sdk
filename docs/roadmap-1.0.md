# 1.0 Readiness Roadmap

This is the single active roadmap for the 1.0 readiness sequence. It is
planned against TypeScript commit `ec68c61`; the baseline package versions are
SDK `0.12.1`, CLI `0.3.1`, and MCP `0.6.2`.

## Truth and execution rules

- A docs marker, source marker, generated inventory row, or passing static
  contract alone never proves completion. A task closes only when its exact
  closure gate passes and its command receipt is recorded.
- Mutation execution for this roadmap is GitHub-only. Do not run local Stryker,
  `make mutation`, or any package mutation command while executing this plan.
- This execution creates no tags, publishes no package, creates no release,
  and performs no main-branch integration.
- Status is intentionally conservative: Tasks 2-27 remain pending until their
  own focused proof, closure gate, and independent approvals exist.

## Dependency sequence

| Task | Depends on | Status | Evidence now | Exact closure gate | Release-blocking |
|---|---|---|---|---|---|
| 1. Truthful readiness baseline | — | complete after this task's recorded gates | `.superpowers/sdd/task-1-report.md`, `docs/risk-register.json` | `make risk-register risk-status-report release-readiness contract-gates` | Yes |
| 2. Expense filter contract | 1 | pending | `expense-date-filter-contract` | Task 2 focused proof; `make operation-parity-drift contract-gates` | Yes |
| 3. Expense update schema | 2 | pending | `expense-update-file-schema` | Task 3 focused proof; `make sdk-codegen-test consumer-cast-budget contract-gates` | Yes |
| 4. Typed listForUser workflows | 3 | pending | `.superpowers/sdd/progress.md` Task 4 | Task 4 focused proof; `npm test -w @apet97/clockify-mcp-115` and `make contract-gates` | Yes |
| 5. Truthful operation parity | 4 | pending | `operation-parity-generated-reachability` | Task 5 focused proof; `make sdk-codegen-drift operation-parity-drift contract-gates` | Yes |
| 6. 1.0 breaking-change closure | 5 | pending | `.superpowers/sdd/progress.md` Task 6 | Task 6 focused proof; `make breaking-change-review contract-gates` | Yes |
| 7. Zero request-cast ratchet | 6 | pending | `consumer-request-casts` | Task 7 focused proof; `make consumer-cast-budget contract-gates` | Yes |
| 8. Authenticated-host equality | 7 | pending | `.superpowers/sdd/progress.md` Task 8 | Task 8 focused proof; `make contract-gates` | Yes |
| 9. Shared exact-artifact engine | 8 | pending | `.superpowers/sdd/progress.md` Task 9 | Task 9 focused proof; `make pack-smoke contract-gates` | Yes |
| 10. Wrapper release-proof adoption | 9 | pending | `cross-package-release-proof-asymmetry` | Task 10 focused proof; `npm run prepublishOnly -w clockify-sdk-ts-115` | Yes |
| 11. CLI release-proof adoption | 10 | pending | `cross-package-release-proof-asymmetry` | Task 11 focused proof; `npm run prepublishOnly -w @apet97/clockify-cli-115` | Yes |
| 12. MCP release-proof adoption | 11 | pending | `cross-package-release-proof-asymmetry` | Task 12 focused proof; `npm run prepublishOnly -w @apet97/clockify-mcp-115` | Yes |
| 13. Manual governance receipt | 12 | pending | `cross-package-release-proof-asymmetry` | Task 13 focused proof; `make perfect-full pack-smoke release-readiness` | Yes |
| 14. Wrapper authentication mutation configuration | 13 | pending | `remote-mutation-proof-pending` | Task 14 focused proof; GitHub Actions `Mutation` workflow, target `wrapper` | Yes |
| 15. Wrapper replacement mutation configuration | 14 | pending | `remote-mutation-proof-pending` | Task 15 focused proof; GitHub Actions `Mutation` workflow, target `wrapper` | Yes |
| 16. MCP safety mutation configuration | 15 | pending | `remote-mutation-proof-pending` | Task 16 focused proof; GitHub Actions `Mutation` workflow, target `mcp` | Yes |
| 17. CLI mutation target | 16 | pending | `remote-mutation-proof-pending` | Task 17 focused proof; GitHub Actions `Mutation` workflow, approved CLI target | Yes |
| 18. GitHub-only mutation proof | 17 | pending | `remote-mutation-proof-pending` | Successful GitHub Actions `Mutation` receipt for every approved target; `make mutation-ci` | Yes |
| 19. Aggregate gate deduplication | 18 | pending | `.superpowers/sdd/progress.md` Task 19 | Task 19 focused proof; `make perfect-fast perfect-full` | Yes |
| 20. Unique-claim inventory | 19 | pending | `.superpowers/sdd/progress.md` Task 20 | Task 20 focused proof; `make docs-drift docs-quality contract-gates` | Yes |
| 21. Plan lifecycle | 20 | pending | `.superpowers/sdd/progress.md` Task 21 | Task 21 focused proof; `make agent-tasks agent-handoff contract-gates` | Yes |
| 22. Webhook delivery diagnosis | 21 | pending | `.superpowers/sdd/progress.md` Task 22 | Task 22 focused proof; `npm test -w @apet97/clockify-mcp-115` | No — post-baseline workflow scope |
| 23. Workspace-user status administration | 22 | pending | `.superpowers/sdd/progress.md` Task 23 | Task 23 focused proof; `npm test -w @apet97/clockify-mcp-115` | No — post-baseline workflow scope |
| 24. Time-off balance adjustment | 23 | pending | `.superpowers/sdd/progress.md` Task 24 | Task 24 focused proof; `npm test -w @apet97/clockify-mcp-115` | No — post-baseline workflow scope |
| 25. Scheduling assignment copy | 24 | pending | `.superpowers/sdd/progress.md` Task 25 | Task 25 focused proof; `npm test -w @apet97/clockify-mcp-115` | No — post-baseline workflow scope |
| 26. Project membership administration | 25 | pending | `.superpowers/sdd/progress.md` Task 26 | Task 26 focused proof; `npm test -w @apet97/clockify-mcp-115` | No — post-baseline workflow scope |
| 27. Experimental entity-change feed | 26 | pending | `.superpowers/sdd/progress.md` Task 27 | Task 27 focused proof; `npm test -w @apet97/clockify-mcp-115` | No — experimental scope |

The six open readiness blockers in `docs/risk-register.json` are the current
release-blocking baseline: `expense-date-filter-contract`,
`expense-update-file-schema`, `operation-parity-generated-reachability`,
`consumer-request-casts`, `cross-package-release-proof-asymmetry`, and
`remote-mutation-proof-pending`. `make release-readiness` must continue to
report the readiness-risk layer as blocked while any of these remains open.
