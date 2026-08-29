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

The current final-readiness blocker count is authoritative in `make risk-status-report`.
Neither a source or documentation marker nor a static report can close a future
blocker: only the listed closure gate and its recorded command receipt can do
that.

| ID | Status | Surface | Summary | Closure gate |
|---|---|---|---|---|
| `fern-bare-array-pagination` | `accepted` | SDK generation | Historical Fern CLI bare-array pagination limitation is no longer an active blocker because the required SDK generator is local; wrapper pagination helpers remain the supported public surface. | No closure planned; keep as historical evidence unless the pagination helper surface is intentionally redesigned. |
| `fern-addon-token-type-workaround` | `accepted` | SDK auth | The historical Fern addon-token workaround is retired; local generated auth types now model exactly one token mode. | No closure planned; keep discrepancy evidence and SDK auth tests as regression coverage. |
| `performance-budgets-provisional` | `accepted` | SDK/CLI/MCP package performance | Performance ceilings are calibrated against repeated clean-tree receipts and guarded by make performance-budgets. | No closure planned; budgets are calibrated and guarded by make performance-budgets. |
| `live-tests-sandbox-only` | `accepted` | Live Clockify proof | Live tests intentionally mutate Clockify state and must run only against a sacrificial sandbox workspace. | Keep live proof receipts showing sandbox cleanup; never generalize live gates to customer workspaces. |
| `live-evidence-local-approval-identity` | `accepted` | Live-evidence approval | The approval receipt binds the exact manifest and campaign-receipt hashes, but its `approvedBy` field is a local operator-process attestation rather than cryptographic identity proof. | No local closure is possible. Close only if approval moves to an authenticated remote signature or protected-environment attestation that binds both artifact hashes. |
| `no-default-npm-publish` | `accepted` | Release operations | Packages are published to npm under the unofficial @apet97 scope; publication stays tag-gated CI, so npm publication is not the default path for routine changes. | Only publish after explicit maintainer approval plus perfect-full, pack-smoke, and release/support proof. |
| `legacy-release-workflow-needs-maintainer-decision` | `accepted` | CI/CD release automation | Tag-triggered npm release workflows publish all three packages on prefixed tags (wrapper-v*/cli-v*/mcp-v*); the maintainer reviewed and enabled them (each workflow publishes on a tag whose version matches its package.json). Version bumps are hand-cut, not automated. | Maintainer reviewed release.yml + release-please.yml on 2026-05-28; on 2026-06-28 the maintainer enabled tag-triggered npm publish for all three packages under the unofficial @apet97 scope (CLI/MCP scaffolds flipped from inert to cli-v*/mcp-v* publishers; SDK moved from bare v* to wrapper-v* tags). On 2026-07-27 release-please.yml was retired: it anchored on the 2026-07-14 releases, ignored `.release-please-manifest.json`, and every PR it filed proposed a version *below* what was already published (last: 0.13.0 -> 0.12.1). `check-ci-contract.mjs` now fails if the workflow returns. The tag-vs-version guard remains load-bearing. |
| `generated-core-is-not-product` | `accepted` | OpenAPI/local generation | Generated code is a replaceable lower layer, not the product surface users should depend on directly. | No closure planned; this is a permanent architecture constraint. |
| `webhook-url-guard-no-dns-rebinding` | `accepted` | Webhook safety | The shared offline URL guard rejects non-HTTPS callbacks, embedded credentials, internal hostnames, and non-global or special-purpose IP literals across SDK, CLI, and MCP, but it does not resolve hostnames and therefore cannot defend against DNS rebinding. | No closure planned; this is an accepted limitation of an offline guard. Re-evaluate only if registration gains a request-time host-resolution check. |
| `expense-date-filter-contract` | `accepted` | Expense query contract | Live proof established that the route ignores date bounds; SDK, CLI, and MCP share one bounded client-side filter with warning and continuation metadata. | Closed 2026-07-19 by the sanitized Task 2 live receipt, focused wrapper/CLI/MCP tests, consumer-cast budget, operation-parity drift, and contract gates. |
| `expense-update-file-schema` | `accepted` | Expense update request schema | The canonical and generated multipart update request now keeps `file` optional; scalar updates compile without casts and binary receipt updates retain their file part. | Closed 2026-07-19 by the Task 3 sanitized receipt, upstream OpenAPI drift/tool gates, downstream codegen and multipart tests, cast removal, consumer-cast budget, risk-register, and contract gates. |
| `operation-parity-generated-reachability` | `accepted` | Generated operation parity | All 168 operations are receipt-derived and disposed exactly once: 149 explicitly named + 19 governed operationId-derived, with naming and operation evidence governed separately. | Closed 2026-07-19 by receipt-derived 163/149/14 parity, all-operation dispositions, the canonical fail-closed `operation-coverage` validator and clean-input wiring, `make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison operation-parity operation-parity-drift`, `make risk-register contract-gates`. Re-pinned 2026-08-04/05 to 161/147/14 after quarantining `time-entries.mark-invoiced.bulk-route-404-deferred` and `webhooks.logs.method-is-post-not-get`. Re-pinned again 2026-08-05 to 168/149/19 after ingesting 7 operations missing from every existing source (`approval-requests.balance-assignment.official-spec-surface-add-2026-08-05`). |
| `pre-1.0-public-alias-closure` | `accepted` | SDK and MCP public TypeScript contracts | The approved pre-1.0 aliases are removed with exact replacement mappings and compile-negative public-package proof. | Closed 2026-07-19 by `make compatibility-contract breaking-change-review sdk-public-api contract-gates`, wrapper/CLI/MCP type and test gates, dual-build/package proof. |
| `consumer-request-casts` | `accepted` | CLI and MCP request typing | CLI and MCP request construction measures zero escape-hatch request casts and the bounded symbol/provenance ratchet has two independent approvals. | Closed 2026-07-21 by the 1,463-case `make consumer-cast-budget` proof, `make risk-register contract-gates`, blank-credential `make perfect-fast`, package and audit proof, two independent approvals of the complete Task 7 range. |
| `cross-package-release-proof-asymmetry` | `accepted` | SDK/CLI/MCP release proof | The shared exact-artifact engine prints sha512 tarball digests, each prepublishOnly runs its single-package proof, and the retained Task 13 receipt names all three digests and consumer outputs. | Closed 2026-07-22 by `make perfect-full pack-smoke release-readiness` (make exit 0), `make risk-register` (including `scripts/check-risk-register.readiness.test.mjs`) naming all three tarball digests and consumer outputs. |
| `remote-mutation-proof-pending` | `accepted` | Mutation score proof | The aggregate `all` Mutation workflow run covers wrapper, MCP, and CLI with the exact three report paths and every current global/module floor; the remote-mutation proof risk remains accepted and non-blocking. | Accepted 2026-07-22 after `make mutation-ci` and the aggregate GitHub Actions run/artifact verification. A new release decision that needs a fresh download dispatches and verifies a new aggregate run. |
| `gomcp-catalog-sibling-less-ci` | `accepted` | Operation parity generation | CI has no GOCLMCP sibling checkout, so scripts/generate-operation-parity.mjs falls back to carrying forward the goMcp values already committed in docs/operation-parity.json instead of re-deriving them from the sibling's tool catalog. | No closure planned; this is a permanent architecture constraint of running CI without the sibling repository. Re-evaluate only if the sibling tool catalog becomes fetchable in CI. |
| `migration-notes-not-derived-from-surface-diff` | `accepted` | Release process / migration guide | The MCP 6.0.0 migration guide cites the release's exact published-surface-diff result: no SDK value-export, CLI leaf-command, or MCP tool-name additions or removals, with all 163 MCP tool names retained. It separately identifies the buildServer return-type break and additive package export/binaries that the checker does not model. | Closed 2026-08-24 by the MCP 6.0.0 migration section's direct published-surface-diff citation and the release-proof result for SDK 5.1.1, CLI 5.0.3, and MCP 6.0.0. |

## Operator rule

If a future change adds a workaround, skipped live proof, provisional
threshold, or upstream blocker, add it here in the same change. If an
item is closed, keep a short closure note in the changelog or final
proof receipt before removing it from this register.
