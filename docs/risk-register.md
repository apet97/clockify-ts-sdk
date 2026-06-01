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

| ID | Status | Surface | Summary | Closure gate |
|---|---|---|---|---|
| `fern-bare-array-pagination` | `accepted` | SDK generation | Historical Fern CLI bare-array pagination limitation is no longer an active blocker because the required SDK generator is local; wrapper pagination helpers remain the supported public surface. | No closure planned; keep as historical evidence unless the pagination helper surface is intentionally redesigned. |
| `fern-addon-token-type-workaround` | `accepted` | SDK auth | The historical Fern addon-token workaround is retired; local generated auth types now model exactly one token mode. | No closure planned; keep discrepancy evidence and SDK auth tests as regression coverage. |
| `performance-budgets-provisional` | `accepted` | SDK/CLI/MCP package performance | Performance ceilings are calibrated against repeated clean-tree receipts and guarded by make performance-budgets. | No closure planned; budgets are calibrated and guarded by make performance-budgets. |
| `live-tests-sandbox-only` | `accepted` | Live Clockify proof | Live tests intentionally mutate Clockify state and must run only against a sacrificial sandbox workspace. | Keep live proof receipts showing sandbox cleanup; never generalize live gates to customer workspaces. |
| `no-default-npm-publish` | `accepted` | Release operations | Packages are packable but npm publication is not the default path. | Only publish after explicit maintainer approval plus perfect-full, pack-smoke, and release/support proof. |
| `legacy-release-workflow-needs-maintainer-decision` | `accepted` | CI/CD release automation | A legacy tag-triggered npm release workflow exists; the maintainer reviewed it and accepted the current shape (release-please files the version-bump PR; release.yml publishes on a tag whose version matches wrapper/package.json). | Maintainer reviewed release.yml + release-please.yml on 2026-05-28 and accepted the current shape; the legacy aspect of the workflow is its tag-triggered single-package publish design, which the maintainer has chosen to keep. |
| `generated-core-is-not-product` | `accepted` | OpenAPI/local generation | Generated code is a replaceable lower layer, not the product surface users should depend on directly. | No closure planned; this is a permanent architecture constraint. |
| `webhook-url-guard-no-dns-rebinding` | `accepted` | MCP webhook safety | The offline `clockify_setup_webhook` URL guard rejects non-HTTPS callbacks, embedded credentials, and private/loopback/link-local/CGNAT/metadata IPs, but it resolves nothing, so it cannot defend against DNS rebinding (a hostname that passes the check, then resolves to a private IP at request time). | No closure planned; this is an accepted limitation of an offline guard. Re-evaluate only if the MCP gains a request-time host-resolution check. |

## Operator rule

If a future change adds a workaround, skipped live proof, provisional
threshold, or upstream blocker, add it here in the same change. If an
item is closed, keep a short closure note in the changelog or final
proof receipt before removing it from this register.
