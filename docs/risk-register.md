# Risk Register

This file lists known limitations, accepted risks, upstream blockers,
and provisional states for the SDK/CLI/MCP/OpenAPI platform. It is not
a parking lot. Every item needs evidence, mitigation, and a closure
gate.

## Status meanings

| Status | Meaning |
|---|---|
| `open` | Still needs proof or completion work before readiness can be claimed. |
| `provisional` | Implemented enough to guard drift, but thresholds or policy need calibration. |
| `blocked-upstream` | The local workaround is intentional until a generator/API/vendor issue changes. |
| `accepted` | A deliberate product or safety constraint, not a defect. |

## Risks

For a no-network status view, run:

```bash
node scripts/plan.mjs risk-status
node scripts/plan.mjs risk-status --status open
node scripts/plan.mjs risk-status --format json
```

The report is a static operator view over `docs/risk-register.json` plus
file-state signals for performance baselines and temporary
context removal. The performance baseline signal parses
`docs/performance-baseline-latest.json`: a failed latest receipt is reported as `blocking`, and malformed receipt JSON is reported as blocking invalid receipt JSON, not merely as a missing file. Risk register shape is part of readiness: schema version, purpose, typed risk entries, safe repo-relative evidence paths, report-generator metadata, generated-report contract fields, generated file-state signal keys, and generated `fileSignalDetails` keys with non-empty detail strings are all checked before evidence markers are trusted. `make risk-register` also shape-checks the generated report
object for no-network, no-command, and no-env-value posture. It does not run
Git, npm, Docker, Fern, tests, builds, or Clockify API calls, and it is not
proof by itself.

For the open legacy release-workflow risk, run
`node scripts/plan.mjs release-decision --decision all` before any tag,
GitHub release, npm publication, or release workflow change. The planner
does not grant publish permission; it turns the maintainer decision into a
receipt-ready checklist.

For the performance-budget risk, run
`node scripts/plan.mjs performance-calibration` before tightening budgets. The
planner is no-network and does not measure anything; it explains the three
successful receipt requirement and the budget-tightening rule.

Readiness routing treats `open` and `provisional` risk-register entries
as readiness blockers unless the entry explicitly sets
`finalReadinessBlocking: false` for a future decision outside the current
readiness scope. Close blocking entries only through their closure gates before
claiming completion; keep `accepted`, `blocked-upstream`, and explicit
future-decision entries visible unless their policy or upstream condition
changes. The Markdown report prints `Final-readiness blocking: yes/no` per risk
so non-coder operators can see why an item is visible without needing to inspect
the JSON.
It also prints a `Final-readiness risk routing` section with exact blocking risk
IDs and visible non-blocking open/provisional risk IDs, so readiness blockers
and future maintainer decisions cannot blur together. The generated JSON also
includes `riskRoutingSummary.finalReadinessRiskStatus`, plus `Blocking risk count`
/ visible non-blocking risk counts in Markdown, so operators can tell whether
the final-readiness risk layer is blocked without mentally counting individual
risk rows.

The active 1.0 sequence is [`roadmap-1.0.md`](./roadmap-1.0.md). Its four
required open blockers are release-blocking by contract. Neither a source or
documentation marker nor a static report can close one: only the listed closure
gate and its recorded command receipt can do that.

| ID | Status | Surface | Summary | Closure gate |
|---|---|---|---|---|
| `fern-bare-array-pagination` | `accepted` | SDK generation | Historical Fern CLI bare-array pagination limitation is no longer an active blocker because the required SDK generator is local; wrapper pagination helpers remain the supported public surface. | No closure planned; keep as historical evidence unless the pagination helper surface is intentionally redesigned. |
| `fern-addon-token-type-workaround` | `accepted` | SDK auth | The historical Fern addon-token workaround is retired; local generated auth types now model exactly one token mode. | No closure planned; keep discrepancy evidence and SDK auth tests as regression coverage. |
| `performance-budgets-provisional` | `accepted` | SDK/CLI/MCP package performance | Performance ceilings are calibrated against repeated clean-tree receipts and guarded by make performance-budgets. | No closure planned; budgets are calibrated and guarded by make performance-budgets. |
| `live-tests-sandbox-only` | `accepted` | Live Clockify proof | Live tests intentionally mutate Clockify state and must run only against a sacrificial sandbox workspace. | Keep live proof receipts showing sandbox cleanup; never generalize live gates to customer workspaces. |
| `no-default-npm-publish` | `accepted` | Release operations | Packages are published to npm under the unofficial @apet97 scope; publication stays tag-gated CI, so npm publication is not the default path for routine changes. | Only publish after explicit maintainer approval plus perfect-full, pack-smoke, and release/support proof. |
| `legacy-release-workflow-needs-maintainer-decision` | `accepted` | CI/CD release automation | Tag-triggered npm release workflows publish all three packages on prefixed tags (wrapper-v*/cli-v*/mcp-v*); the maintainer reviewed and enabled them (release-please files the wrapper version-bump PR; each workflow publishes on a tag whose version matches its package.json). | Maintainer reviewed release.yml + release-please.yml on 2026-05-28; on 2026-06-28 the maintainer enabled tag-triggered npm publish for all three packages under the unofficial @apet97 scope (CLI/MCP scaffolds flipped from inert to cli-v*/mcp-v* publishers; SDK moved from bare v* to wrapper-v* tags). The tag-vs-version guard remains load-bearing. |
| `generated-core-is-not-product` | `accepted` | OpenAPI/local generation | Generated code is a replaceable lower layer, not the product surface users should depend on directly. | No closure planned; this is a permanent architecture constraint. |
| `webhook-url-guard-no-dns-rebinding` | `accepted` | MCP webhook safety | The offline `clockify_setup_webhook` URL guard rejects non-HTTPS callbacks, embedded credentials, and private/loopback/link-local/CGNAT/metadata IPs, but it resolves nothing, so it cannot defend against DNS rebinding (a hostname that passes the check, then resolves to a private IP at request time). | No closure planned; this is an accepted limitation of an offline guard. Re-evaluate only if the MCP gains a request-time host-resolution check. |
| `expense-date-filter-contract` | `accepted` | Expense query contract | Live proof established that the route ignores date bounds; SDK, CLI, and MCP share one bounded client-side filter with warning and continuation metadata. | Closed 2026-07-19 by the sanitized Task 2 live receipt, focused wrapper/CLI/MCP tests, consumer-cast budget, operation-parity drift, and contract gates. |
| `expense-update-file-schema` | `accepted` | Expense update request schema | The canonical and generated multipart update request now keeps `file` optional; scalar updates compile without casts and binary receipt updates retain their file part. | Closed 2026-07-19 by the Task 3 sanitized receipt, upstream OpenAPI drift/tool gates, downstream codegen and multipart tests, cast removal, consumer-cast budget, risk-register, and contract gates. |
| `operation-parity-generated-reachability` | `accepted` | Generated operation parity | All 169 operations are receipt-derived and disposed exactly once: 155 explicitly named + 14 governed operationId-derived, with naming and operation evidence governed separately. | Closed 2026-07-19 by receipt-derived 169/155/14 parity, all-operation dispositions, the canonical fail-closed `operation-coverage` validator and clean-input wiring, `make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison operation-parity operation-parity-drift`, `make risk-register contract-gates`, and `docs/roadmap-1.0-receipts/task-05-generated-reachability.md`. |
| `pre-1.0-public-alias-closure` | `accepted` | SDK and MCP public TypeScript contracts | The approved pre-1.0 aliases are removed with exact replacement mappings and compile-negative public-package proof. | Closed 2026-07-19 by `make compatibility-contract breaking-change-review sdk-public-api contract-gates`, wrapper/CLI/MCP type and test gates, dual-build/package proof, and `docs/roadmap-1.0-receipts/task-06-breaking-change.md`. |
| `consumer-request-casts` | `accepted` | CLI and MCP request typing | CLI and MCP request construction measures zero escape-hatch request casts and the bounded symbol/provenance ratchet has two independent approvals. | Closed 2026-07-21 by the 1,463-case `make consumer-cast-budget` proof, `make risk-register contract-gates`, blank-credential `make perfect-fast`, package and audit proof, two independent approvals of the complete Task 7 range, and `docs/roadmap-1.0-receipts/task-07-zero-cast.md`. |
| `cross-package-release-proof-asymmetry` | `open` | SDK/CLI/MCP release proof | Pack smoke cleans temporary artifacts, so no shared retained exact-artifact receipt currently proves all three packages. | `make risk-register` (including `scripts/check-risk-register.readiness.test.mjs`), `make perfect-full pack-smoke release-readiness`, and `docs/roadmap-1.0-receipts/task-13-exact-artifact.md` naming all three tarball digests and consumer outputs. |
| `remote-mutation-proof-pending` | `open` | Mutation score proof | The workflow retains reports for 14 days, but no tracked GitHub run URL or artifact record covers the planned 1.0 scope. | `make risk-register` (including `scripts/check-risk-register.readiness.test.mjs`), `make mutation-ci`, and `docs/roadmap-1.0-receipts/task-18-remote-mutation.md` with GitHub Actions Mutation run URLs plus retained mutation-report artifact names for every approved target. |

## Operator rule

If a future change adds a workaround, skipped live proof, provisional
threshold, or upstream blocker, add it here in the same change. If an
item is closed, keep a short closure note in the changelog or final
proof receipt before removing it from this register.
