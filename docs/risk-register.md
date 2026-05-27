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
node scripts/risk-status-report.mjs
node scripts/risk-status-report.mjs --status open
node scripts/risk-status-report.mjs --format json
```

The report is a static operator view over `docs/risk-register.json` plus
file-state signals for final proof, performance baselines, and temporary
context removal. The final proof receipt signal reports a failed draft receipt
as `blocking` when it still contains failed command output or placeholders,
not merely as a present file. The performance baseline signal parses
`docs/performance-baseline-latest.json`: a failed latest receipt is reported as `blocking`, and malformed receipt JSON is reported as blocking invalid receipt JSON, not merely as a missing file. The final receipt live-status signal preserves `completed`, `failed`, and `deferred` from the final proof manifest, so attempted live proof failure is not collapsed into a missing or deferred state. Risk register shape is part of readiness: schema version, purpose, typed risk entries, safe repo-relative evidence paths, report-generator metadata, generated-report contract fields, generated file-state signal keys, and generated `fileSignalDetails` keys with non-empty detail strings, including final live-status recovery, are all checked before evidence markers are trusted. `make risk-register` also shape-checks the generated report
object for no-network, no-command, and no-env-value posture. It does not run
Git, npm, Docker, Fern, tests, builds, or Clockify API calls, and it is not
proof by itself.

For the open legacy release-workflow risk, run
`node scripts/release-decision-plan.mjs --decision all` before any tag,
GitHub release, npm publication, or release workflow change. The planner
does not grant publish permission; it turns the maintainer decision into a
receipt-ready checklist.

For the provisional performance-budget risk, run
`node scripts/performance-calibration-plan.mjs` before final proof. The
planner is no-network and does not measure anything; it explains the three
successful receipt requirement and the budget-tightening rule.

For the open final-proof risk, run `make enterprise-goal-status` first. It is no-network and not proof, but it lists the current final-proof blockers plus the draft receipt, receipt-check, and final-acceptance commands. The final receipt must also include a `make axioms-contract` proof block alongside the aggregate gates.

Final receipt acceptance treats `open` and `provisional` risk-register entries
as readiness blockers unless the entry explicitly sets
`finalReadinessBlocking: false` for a future decision outside the current final
proof scope. Close blocking entries only through their closure gates before
claiming final completion; keep `accepted`, `blocked-upstream`, and explicit
future-decision entries visible unless their policy or upstream condition
changes. The Markdown report prints `Final-readiness blocking: yes/no` per risk
so non-coder operators can see why an item is visible without needing to inspect
the JSON.
It also prints a `Final-readiness risk routing` section with exact blocking risk
IDs and visible non-blocking open/provisional risk IDs, so final-proof blockers
and future maintainer decisions cannot blur together. The generated JSON also
includes `riskRoutingSummary.finalReadinessRiskStatus`, plus `Blocking risk count`
/ visible non-blocking risk counts in Markdown, so operators can tell whether
the final-readiness risk layer is blocked without mentally counting individual
risk rows.

| ID | Status | Surface | Summary | Closure gate |
|---|---|---|---|---|
| `fern-bare-array-pagination` | `blocked-upstream` | SDK generation | Fern CLI currently rejects bare-array response pagination metadata, so wrapper pagination helpers remain the supported public pagination surface. | Re-test on Fern CLI/generator bump, remove the workaround only after generated pagination passes wrapper tests and pack smoke. |
| `fern-addon-token-type-workaround` | `blocked-upstream` | SDK auth | Fern types apiKey and addonToken as both required even though Clockify accepts exactly one token mode. | Remove the cast only after Fern emits mutually-exclusive auth types and SDK auth tests pass. |
| `performance-budgets-provisional` | `provisional` | SDK/CLI/MCP package performance | Performance ceilings are intentionally provisional until repeated receipts establish current clean-tree baselines. | Set docs/performance-budgets.json calibrationPolicy.status to calibrated and pass make final-proof-receipt-check. |
| `final-proof-pending` | `open` | Release/readiness proof | The hardening objective is not complete until the final proof receipt is filled from command output, the temporary context file is removed, and make final-proof-final passes. | Run the final proof draft flow, fill docs/final-proof-receipt.md, remove the temporary context file, and pass make final-proof-final. |
| `live-tests-sandbox-only` | `accepted` | Live Clockify proof | Live tests intentionally mutate Clockify state and must run only against a sacrificial sandbox workspace. | Keep live proof receipts showing sandbox cleanup; never generalize live gates to customer workspaces. |
| `no-default-npm-publish` | `accepted` | Release operations | Packages are packable but npm publication is not the default path. | Only publish after explicit maintainer approval plus perfect-full, pack-smoke, and release/support proof. |
| `legacy-release-workflow-needs-maintainer-decision` | `open` | CI/CD release automation | A legacy tag-triggered npm release workflow still exists, but this hardening goal must not change CI/CD, auth, provenance, or release triggers without explicit maintainer approval. | Explicit maintainer approval plus a dedicated release-workflow update/review that aligns package names, smoke install commands, provenance, and support policy. |
| `generated-core-is-not-product` | `accepted` | OpenAPI/Fern generation | Generated code is a replaceable lower layer, not the product surface users should depend on directly. | No closure planned; this is a permanent architecture constraint. |

## Operator rule

If a future change adds a workaround, skipped live proof, provisional
threshold, or upstream blocker, add it here in the same change. If an
item is closed, keep a short closure note in the changelog or final
proof receipt before removing it from this register.
