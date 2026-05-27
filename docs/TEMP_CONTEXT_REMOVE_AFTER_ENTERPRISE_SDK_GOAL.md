# Temporary Context: Enterprise SDK Polish Goal

Remove this file after the enterprise SDK/CLI/MCP polish goal is fully implemented, verified, and summarized in permanent docs.

## User objective

Implement the ruthless SDK/CLI/MCP/OpenAPI hardening list: axioms, one-command gates, product-surface metadata, generated-doc drift reduction, packed-consumer proof, mock/replay foundation, shared error/recovery direction, and remaining enterprise-quality backlog.

## Current first batch

- Added root `Makefile` targets for `perfect-fast`, `perfect-full`, `perfect-live`, product surface drift, generated edit guard, packed consumer smoke, and mock Clockify server.
- Added `docs/axioms.md` as the repo's SDK/CLI/MCP product axioms.
- Added `docs/quality-gates.md` as the non-coder command map.
- Added `scripts/generate-product-surface.mjs` plus generated `docs/product-surface.json` and `docs/product-surface.md`.
- Added `scripts/check-no-generated-edits.mjs` to guard `spec/corrected`, `output/ts-sdk`, and `wrapper/src`.
- Added `scripts/pack-consumer-smoke.mjs` to install packed SDK/CLI/MCP tarballs in temp projects.
- Added `scripts/mock-clockify-server.mjs` as the deterministic mock API foundation.
- Added `docs/error-codes.json`, `docs/error-codes.md`, and `scripts/generate-error-docs.mjs` as the shared recovery vocabulary foundation.
- Added `docs/openapi-operations.json`, `docs/openapi-operations.md`, and `scripts/generate-openapi-operations.mjs` as the operation inventory foundation.
- Added `docs/operation-parity.json`, `docs/operation-parity.md`, and `scripts/generate-operation-parity.mjs` for best-effort OpenAPI/SDK/TS-MCP/GOCLMCP parity.
- Added `docs/openapi-evidence-policy.md`, `docs/openapi-evidence-contract.json`, `scripts/check-openapi-evidence.mjs`, and `make openapi-evidence` to guard the manual discrepancy/evidence ledger.
- Made `scripts/mock-clockify-server.mjs` importable and added mock-backed SDK, CLI, and MCP tests.
- Added `CLOCKIFY_BASE_URL` support to the CLI and TS MCP so deterministic mock/replay tests do not need live credentials.
- Generated package-local `error-codes.ts` modules from `docs/error-codes.json` and wired CLI JSON errors plus MCP recovery envelopes to the registry.
- Re-exported SDK error-code helpers through `clockify-sdk-ts-115/errors` and the package root; updated the dual-build smoke expected public surface from 38 to 46 names.
- Added SDK runtime error classification through `classifyClockifyError()` and `getStableErrorCode()`.
- Added `mcp/src/output-schema.ts`, installed a default MCP result output schema for every registered TS MCP tool, and added a server regression test for advertised output schemas.
- Added generated README table metadata and tooling: `docs/cli-commands.json`, `docs/mcp-tools.json`, and `scripts/update-readme-tables.mjs`.
- Added CLI exit-code/JSON error contract tests and changed commander usage errors to return documented exit code `2`.
- Added `clk115 completion [zsh|bash|fish]` shell completion generation with tests.
- Added `docs/performance-budgets.json` and `scripts/check-performance-budgets.mjs` for built artifact size/startup budgets.
- Added `scripts/check-changelog-entry.mjs`, created `cli/CHANGELOG.md`, and added package changelog entries for this hardening work.
- Added curated parity overrides in `docs/operation-parity-overrides.json` and updated `scripts/generate-operation-parity.mjs` to mark curated joins.
- Added `scripts/lint-openapi-contract.mjs` and `scripts/check-generator-independence.mjs`.
- Added `scripts/check-generator-comparison.mjs` to compare corrected OpenAPI SDK stamps against generated TypeScript client methods.
- Added `docs/README.md` plus `scripts/check-doc-index.mjs` for documentation navigation/link drift.
- Added `docs/install-personas.md`, `docs/migration-guide.md`, and `docs/dependency-policy.md`.
- Added generated `docs/troubleshooting.md` plus `scripts/generate-troubleshooting.mjs`.
- Added `docs/superpowers/plans/2026-05-26-enterprise-sdk-hardening.md` for the remaining implementation sequence.
- Added MCP-discoverable guide resources plus the `clockify-workflow-plan` prompt.
- Added performance-budget calibration metadata plus `make performance-receipt` for recording current size/startup receipts.
- Added `docs/enterprise-hardening-audit.json`, `scripts/check-enterprise-hardening.mjs`, and `make enterprise-audit` to map each requested hardening area to concrete artifact evidence.
- Added `docs/final-proof-runbook.md`, `docs/final-proof-receipt.template.md`, and `make enterprise-audit-final` so the temporary context file can be removed without breaking final audit.
- Added `scripts/check-final-proof-receipt.mjs` and `make final-proof-receipt-check` so an empty copied receipt template cannot pass final audit.
- Added `docs/final-proof-receipt-manifest.json` and wired `scripts/check-final-proof-receipt.mjs` to consume it so final proof receipt requirements are machine-readable instead of hidden in checker code.
- Wired `scripts/run-final-proof.mjs` to read `docs/final-proof-receipt-manifest.json` as well, keeping the final proof runner and checker on the same receipt contract.
- Tightened final proof completion semantics so runner-generated `NOT COMPLETE:` placeholders and final-audit placeholders are forbidden by the manifest and status reporter.
- Made `scripts/run-final-proof.mjs` explicitly draft-only for the final `make enterprise-audit-final` output because that command validates the finished receipt and cannot honestly be embedded by the same runner pass.
- Split the final proof command surface into `make final-proof-draft` for draft receipt generation, `make final-proof` as a back-compatible draft alias, and `make final-proof-final` for final receipt validation plus final artifact audit.
- Replaced stale completion guidance in operator, onboarding, handoff, risk, release-readiness, maintenance, and plan surfaces so final acceptance points to `make final-proof-final` instead of ambiguous `make final-proof` or raw `make enterprise-audit-final`.
- Updated decision-record and change-impact final-proof references so future policy checks also point operators to `make final-proof-final` for final acceptance.
- Separated `scripts/run-final-proof.mjs` command failures from draft blockers so expected final-audit/manual cleanup work is explicit without being confused with package or proof command failures.
- Added `docs/final-proof-command-contract.json`, `scripts/check-final-proof-command-contract.mjs`, and `make final-proof-command-contract` to guard the `final-proof-draft` / `final-proof-final` split against future ambiguous `make final-proof` guidance.
- Tightened `scripts/check-final-proof-command-contract.mjs` so the ambiguous `make final-proof` scan does not falsely catch valid hyphenated targets such as `make final-proof-receipt-check`.
- Updated `scripts/enterprise-goal-status.mjs` so the no-network goal status explicitly distinguishes `make final-proof-draft` receipt generation from `make final-proof-final` acceptance.
- Tightened the final proof receipt rules: budgets must be marked `tightened`; draft live proof may be `completed` or `deferred` with a concrete reason, but final acceptance requires `Live proof status: completed`.
- Added `scripts/run-final-proof.mjs` plus `LIVE=1 make final-proof-draft` / `DEFER_LIVE_REASON="..." make final-proof-draft` to run the proof sequence and write a draft `docs/final-proof-receipt.md` from real command output.
- Added `scripts/enterprise-goal-status.mjs` and `make enterprise-goal-status` so operators can print a no-network status report of remaining final-proof, performance, temporary-context, and risk-register signals without running proof gates.
- Final proof now requires `docs/performance-budgets.json` `calibrationPolicy.status` to become `calibrated` after budget tightening.
- Added `docs/package-contract.json`, `scripts/check-package-contract.mjs`, and `make package-contract` to snapshot SDK/CLI/MCP public manifest contract.
- Replaced stale unsuffixed SDK package example imports/docs with the `-115` package name.
- Added `docs/examples-contract.json`, `scripts/check-examples-contract.mjs`, and `make examples-contract` to keep runnable examples catalogued, public-package-only, and secret-safe.
- Added `docs/snippet-safety-policy.md`, `docs/snippet-safety-contract.json`, `scripts/check-snippet-safety.mjs`, and `make snippet-safety` to keep SDK/CLI/MCP README and cookbook snippets copy-paste-safe.
- Aligned CLI/MCP package Node engines to `>=20` to match the SDK runtime floor.
- Added `docs/runtime-support.json`, `scripts/check-runtime-support.mjs`, and `make runtime-support` to guard package engine/docs drift.
- Added `docs/env-contract.json`, `scripts/check-env-contract.mjs`, and `make env-contract` to guard SDK/CLI/MCP env/config docs and mock base URL safety.
- Replaced the brittle raw-regex `docs-drift` scan with `scripts/check-docs-drift.mjs`, including intentional allowlists for migration and contract metadata while scanning hand-written wrapper SDK docs/examples.
- Added `docs/sdk-public-api.json`, `scripts/check-sdk-public-api.mjs`, and `make sdk-public-api` to govern SDK root symbols and package subpaths.
- Extended `docs/sdk-public-api.json` and `scripts/check-sdk-public-api.mjs` to govern suffixed package self-reference aliases and stale hand-written wrapper package markers.
- Added `docs/sdk-runtime-policy.md`, `docs/sdk-runtime-contract.json`, `scripts/check-sdk-runtime-contract.mjs`, and `make sdk-runtime-contract` to guard durable hand-written SDK runtime seams around the Fern-generated core.
- Added `docs/workflow-cookbook.md`, `docs/workflow-cookbook-contract.json`, `scripts/check-workflow-cookbook.mjs`, and `make workflow-cookbook` to make common user jobs obvious across SDK, CLI, MCP, product-surface metadata, and safety contracts.
- Added `scripts/workflow-plan.mjs` and `make workflow-plan` so operators can print no-network SDK/CLI/MCP plans for time tracking, work package setup, business/admin workflows, demo cleanup, and recovery without reading the whole cookbook.
- Added `docs/decision-records-policy.md`, `docs/decision-records-contract.json`, `docs/decisions/*.md`, `scripts/check-decision-records.mjs`, and `make decision-records` to preserve durable rationale for source-of-truth, generated-core, publish, live-proof, and final-proof decisions.
- Added `docs/contract-inventory-policy.md`, `docs/contract-inventory.json`, `scripts/check-contract-inventory.mjs`, and `make contract-inventory` to keep enterprise contract docs, checker scripts, Make targets, quality gates, and audit evidence wired together.
- Added `scripts/contract-inventory-report.mjs` and `make contract-inventory-report` so operators can print a no-network report of contract entries, checker ownership, perfect-gate coverage, audit IDs, and missing-file signals.
- Added `docs/change-impact-policy.md`, `docs/change-impact-contract.json`, `scripts/check-change-impact.mjs`, and `make change-impact` to map common change scopes to required gates, docs, changelog posture, and proof receipts.
- Added `scripts/change-impact-plan.mjs` and `make change-impact-plan` so operators can print no-network proof plans from the change-impact matrix by scope or changed path without manually reading the full JSON contract.
- Added a `0.1.0` CLI changelog anchor.
- Added `docs/version-policy.json`, `scripts/check-version-policy.mjs`, and `make version-policy` to keep package versions, changelogs, generated product surface, and install examples aligned.
- Added `docs/secret-hygiene.json`, `scripts/check-secret-hygiene.mjs`, and `make secret-hygiene` for local source/docs token-shape scanning.
- Added `docs/data-handling-policy.md`, `docs/data-handling-contract.json`, `scripts/check-data-handling.mjs`, and `make data-handling` to govern workspace data, personal data, commercial records, webhook payloads, raw live evidence, and redacted support receipts.
- Added `docs/supply-chain-policy.md`, `docs/supply-chain-contract.json`, `scripts/check-supply-chain.mjs`, and `make supply-chain` to guard package license, provenance, tarball, and publish-safety posture.
- Added `docs/dependency-boundary.json`, `scripts/check-dependency-boundary.mjs`, and `make dependency-boundary` to guard package runtime deps and SDK peer/dev boundaries.
- Added `docs/compatibility-policy.md`, `docs/compatibility-contract.json`, `scripts/check-compatibility-contract.mjs`, and `make compatibility-contract` to guard SDK/CLI/MCP/OpenAPI compatibility and deprecation rules.
- Added `docs/receipts-policy.md`, `docs/receipts-contract.json`, `scripts/check-receipts-contract.mjs`, and `make receipts-contract` to guard SDK request correlation, response metadata, CLI JSON errors, and MCP structured envelopes.
- Added `docs/release-support-policy.md`, refreshed `SECURITY.md`, and added `docs/release-support-contract.json`, `scripts/check-release-support-contract.mjs`, and `make release-support-contract` to guard release/support/security docs.
- Added `docs/ci-policy.md`, `docs/ci-contract.json`, `scripts/check-ci-contract.mjs`, and `make ci-contract` to guard GitHub workflow posture without changing CI/CD behavior.
- Added `docs/live-tests.md`, `docs/live-safety-contract.json`, `scripts/check-live-safety.mjs`, and `make live-safety` to guard sandbox-only live proof, cleanup prefixes, deferral rules, and mock alternatives.
- Added `docs/risk-register.json`, `docs/risk-register.md`, `scripts/check-risk-register.mjs`, and `make risk-register` to keep known limitations, provisional states, accepted risks, and closure gates explicit.
- Added `scripts/risk-status-report.mjs` and `make risk-status-report` so operators can print a no-network summary of open/provisional risks, closure gates, and final-proof file-state signals from the risk register.
- Added `docs/user-docs-policy.md`, `docs/user-docs-contract.json`, `scripts/check-user-docs.mjs`, and `make user-docs` to guard root/package/operator README and onboarding documentation parity.
- Added `docs/agent-handoff-policy.md`, `docs/agent-handoff-contract.json`, `scripts/check-agent-handoff.mjs`, and `make agent-handoff` to guard AGENTS/CLAUDE guidance, temporary context lifecycle, generated-path rules, and stale-count markers.
- Added `docs/developer-environment-policy.md`, `docs/developer-environment-contract.json`, `scripts/check-developer-environment.mjs`, and `make developer-environment` to guard local Node/npm/Fern/Docker/GOCLMCP bootstrap rules.
- Added `scripts/repo-doctor.mjs` and `make repo-doctor` as a no-network, read-only JSON repo-shape doctor for non-coder setup triage across Node floor, package-local manifests/lockfiles/scripts, Fern pins, generated directories, and `../GOCLMCP` sibling presence.
- Added `docs/api-docs-policy.md`, `docs/api-docs-contract.json`, `scripts/check-api-docs.mjs`, and `make api-docs` to guard TypeDoc, generated SDK resource docs, sync wiring, Pages workflow, and docs package identity.
- Added `docs/mcp-contract.json`, `scripts/check-mcp-contract.mjs`, and `make mcp-contract` to align TS MCP tool counts, resources, prompts, output schema, README, and server tests.
- Added `docs/cli-contract.json`, `scripts/check-cli-contract.mjs`, and `make cli-contract` to align CLI command metadata, README, globals, completion shells, binaries, and exit-code tests.
- Added `docs/test-matrix-contract.json`, `scripts/check-test-matrix-contract.mjs`, and `make test-matrix` to guard SDK/CLI/MCP package scripts and required test-file structure.
- Added `docs/generator-config-contract.json`, `scripts/check-generator-config.mjs`, and `make generator-config` to guard Fern CLI/generator pins, active corrected OpenAPI snapshot, and output paths.
- Added `docs/mock-clockify-contract.json`, `scripts/check-mock-clockify-contract.mjs`, and `make mock-contract` to guard deterministic mock Clockify routes and SDK/CLI/MCP mock-backed tests.
- Added `docs/generator-portability-plan.md`, `docs/generator-portability-contract.json`, `scripts/check-generator-portability.mjs`, and `make generator-portability` to enforce no-paid-generator, local-regeneration, and vendor-exit boundaries.
- Added `docs/mcp-write-safety-policy.md`, `docs/mcp-write-safety-contract.json`, `scripts/check-mcp-write-safety.mjs`, and `make mcp-write-safety` to guard MCP destructive-write confirmations, hints, and receipts.
- Added `docs/cli-write-safety-policy.md`, `docs/cli-write-safety-contract.json`, `scripts/check-cli-write-safety.mjs`, and `make cli-write-safety` to guard CLI write/delete determinism, explicit targets, and receipts.
- Added `docs/security-threat-model.md`, `docs/security-threat-model-contract.json`, `scripts/check-security-threat-model.mjs`, and `make security-threat-model` to map SDK/CLI/MCP/OpenAPI risk surfaces to mitigations and proof gates.
- Added `docs/receipt-examples.md`, `docs/receipt-examples-contract.json`, `scripts/check-receipt-examples.mjs`, and `make receipt-examples` to freeze golden SDK/CLI/MCP success and recovery receipt examples.
- Added `docs/support-runbook.md`, `docs/support-bundle-contract.json`, `scripts/check-support-bundle.mjs`, and `make support-bundle` to define safe diagnostic bundles, redaction rules, and escalation evidence for SDK/CLI/MCP/OpenAPI issues.
- Added `scripts/create-support-bundle.mjs` and tightened `docs/support-bundle-contract.json` / `scripts/check-support-bundle.mjs` so operators can generate a no-network, metadata-only, redacted support bundle without collecting env values, tokens, workspace IDs, raw logs, probe captures, browser cookies, shell history, or `.env` files.
- Added `docs/release-readiness-checklist.md`, `docs/release-readiness-contract.json`, `scripts/check-release-readiness.mjs`, and `make release-readiness` to define the evidence required before release, handoff, tag, or final readiness claims.
- Added `scripts/release-readiness-report.mjs` and `make release-readiness-report` as a no-network preflight report that lists required final proof commands and current file-state signals without pretending to be release proof.
- Added `docs/maintenance-playbook.md`, `docs/maintenance-playbook-contract.json`, `scripts/check-maintenance-playbook.mjs`, and `make maintenance-playbook` to define maintainer cadence, dependency update, generator bump, API drift response, release rehearsal, rollback, and maintenance receipt rules.
- Added `docs/mutation-safety-policy.md`, `docs/mutation-safety-contract.json`, `scripts/check-mutation-safety.mjs`, and `make mutation-safety` to define cross-surface retry, mutation, idempotency, CLI write, MCP confirmation, receipt, and ambiguous-failure recovery rules.
- Tightened `docs/api-docs-contract.json` and `scripts/check-api-docs.mjs` with generated TypeDoc HTML identity checks so stale `docs/api` titles/npm links are caught when the generated directory exists.
- Added `docs/examples-matrix.md`, `docs/examples-matrix-contract.json`, `scripts/check-examples-matrix.mjs`, and `make examples-matrix` so SDK examples, CLI commands, MCP workflows, mock/live boundaries, mutation safety, and receipts stay aligned as a product surface.
- Added `scripts/examples-plan.mjs` and `make examples-plan` so operators can print no-network SDK/CLI/MCP example plans with safety boundaries and proof hints without reading the whole examples matrix.
- Added `docs/config-precedence-policy.md`, `docs/config-precedence-contract.json`, `scripts/check-config-precedence.mjs`, and `make config-precedence` to freeze SDK explicit/env auth order, CLI flag/env/rc order, MCP env-only startup, and base URL override safety.
- Added `docs/naming-taxonomy-policy.md`, `docs/naming-taxonomy-contract.json`, `scripts/check-naming-taxonomy.mjs`, and `make naming-taxonomy` to enforce one Clockify vocabulary across SDK methods, CLI commands, MCP tools, docs, examples, and OpenAPI parity.
- Added `docs/operation-coverage-policy.md`, `docs/operation-coverage-contract.json`, `scripts/check-operation-coverage.mjs`, and `make operation-coverage` to guard no-regression OpenAPI/SDK/TS-MCP/GOCLMCP/curated-parity coverage thresholds.
- Added `docs/observability-policy.md`, `docs/observability-contract.json`, `scripts/check-observability-contract.mjs`, and `make observability` to govern request IDs, telemetry hooks, response metadata, CLI/MCP receipts, redaction, and safe support bundles.
- Added `docs/acceptance-scenarios.md`, `docs/acceptance-scenarios-contract.json`, `scripts/check-acceptance-scenarios.mjs`, and `make acceptance-scenarios` to govern SDK/CLI/MCP end-to-end user journeys, proof mode, receipts, cleanup, and OpenAPI truth coverage.
- Added `scripts/acceptance-plan.mjs` and `make acceptance-plan` so operators can print no-network proof plans for SDK/CLI/MCP acceptance scenarios, required evidence, escalation type, and cleanup expectations.
- Added `docs/breaking-change-review-policy.md`, `docs/breaking-change-review-contract.json`, `scripts/check-breaking-change-review.mjs`, and `make breaking-change-review` to prevent silent SDK/CLI/MCP/OpenAPI/package breakage without replacement-first migration, changelog, acceptance, and proof evidence.
- Added `docs/docs-quality-policy.md`, `docs/docs-quality-contract.json`, `scripts/check-docs-quality.mjs`, and `make docs-quality` to enforce evidence-first documentation, exact package names, generated truth-surface references, safe snippets, and no unsupported readiness or marketing claims.
- Added `docs/issue-intake-policy.md`, `docs/issue-intake-contract.json`, `scripts/check-issue-intake.mjs`, and `make issue-intake` to govern bug, feature, PR, support, and security intake with multi-surface evidence, sanitized receipts, proof attempted, mock/live boundaries, and private security routing.
- Tightened GitHub bug report and PR templates so intake now asks for generated support-bundle evidence when useful and requires diagnostics/support-bundle impact review for SDK `clockifyDiagnostics()`, CLI `clk115 doctor`, MCP `clockify://mcp/doctor`, and `scripts/create-support-bundle.mjs`.
- Added `docs/operator-onboarding.md`, `docs/operator-onboarding-contract.json`, `scripts/check-operator-onboarding.mjs`, and `make operator-onboarding` to govern non-coder bootstrap, SDK/CLI/MCP persona selection, package-local setup, mock/live boundaries, stop conditions, and readiness levels.
- Added `docs/operator-toolbox.md`, `docs/operator-toolbox-contract.json`, `scripts/check-operator-toolbox.mjs`, and `make operator-toolbox` to keep all no-network operator helper commands discoverable and clearly separated from proof gates.
- Added `scripts/onboarding-plan.mjs` and `make onboarding-plan` so non-coder operators can print static SDK/CLI/MCP/mock/live/full/support plans with first reads, safe-start commands, proof gates, and stop conditions without running Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
- Added `scripts/maintenance-plan.mjs` and `make maintenance-plan` so maintainers can print no-network weekly, monthly, dependency, generator, drift, release, and rollback upkeep plans with proof targets and stop conditions.
- Added `scripts/release-decision-plan.mjs` and `make release-decision-plan` so maintainers can choose local tarball, tag-only, npm-via-CI, or legacy-workflow retirement paths without changing CI/CD or granting publish permission.
- Added `scripts/performance-calibration-plan.mjs` and `make performance-calibration-plan` so maintainers can close the provisional performance-budget blocker through `calibrationPolicy.requiredSuccessfulRuns` receipts, tightened ceilings, and final proof markers without guessing.
- Added explicit enterprise-audit and contract-inventory evidence for the operator toolbox, release decision planner, and performance calibration planner so no-network helper surfaces are visible in the final hardening proof map.
- Added `docs/dependency-license-policy.md`, `docs/dependency-license-contract.json`, `scripts/check-dependency-license.mjs`, and `make dependency-license` to govern runtime dependency licenses, purpose map, package manifest drift, and forbidden dependency additions.
- Added `docs/upstream-drift-policy.md`, `docs/upstream-drift-contract.json`, `scripts/check-upstream-drift.mjs`, and `make upstream-drift` to govern Clockify/API/Fern/GOCLMCP drift detection, classification, evidence, regeneration, reconciliation, and proof.
- Added `docs/test-data-lifecycle-policy.md`, `docs/test-data-lifecycle-contract.json`, `scripts/check-test-data-lifecycle.mjs`, and `make test-data-lifecycle` to govern live sandbox prefixes, create/delete pairing, cleanup scans, leftover counts, and sanitized cleanup receipts.
- Added `docs/schema-quality-policy.md`, `docs/schema-quality-contract.json`, `scripts/check-schema-quality.mjs`, and `make schema-quality` to govern OpenAPI component schemas, enums, loose objects, request/response models, evidence ledger ties, and generated TypeScript ergonomics.
- Added `docs/mcp-agent-ux-policy.md`, `docs/mcp-agent-ux-contract.json`, `scripts/check-mcp-agent-ux.mjs`, and `make mcp-agent-ux`; tightened `mcp/src/server.ts` instructions so agents are guided toward status-first, workflow-first, dry-run, structured receipt, and recovery behavior.

## Do not forget

- Do not edit `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**` by hand.
- Do not change release auth, npm publish behavior, or CI/CD settings unless the user explicitly asks.
- Do not run live tests unless the env is known to be a sacrificial sandbox.
- Do not mark the goal complete until every item from the user's requested list has evidence.

- Added `clk115 doctor` local diagnostics with tests, completions, README table metadata, changelog coverage, and product-surface wiring so non-coders can inspect CLI readiness without contacting Clockify.

- Added the TS MCP `clockify://mcp/doctor` resource, updated MCP contract/tests/README/product-surface wiring, and corrected stale MCP agent UX contract workflow tool names.

- Added SDK `clockifyDiagnostics()` no-network readiness helper with public subpath, tests, README/changelog, SDK public API/runtime/package contracts, dual-build smoke wiring, and product-surface metadata.

- Added `docs/diagnostics-policy.md`, `docs/diagnostics-contract.json`, `scripts/check-diagnostics-contract.mjs`, and `make diagnostics` to govern SDK `clockifyDiagnostics()`, CLI `doctor`, and MCP `clockify://mcp/doctor` as one no-network/redacted diagnostics surface.

- Tightened SDK `clockifyDiagnostics()` source attribution so workspace IDs and base URL overrides distinguish explicit input, env fallback, defaults, and unavailable values; added tests and diagnostics contract markers.

- Added `docs/quickstart-receipt.md`, `docs/quickstart-receipt-contract.json`, `scripts/check-quickstart-receipt.mjs`, and `make quickstart-receipt` to give non-coders/future agents a diagnostics-first SDK/CLI/MCP receipt path before mock or live proof.
- Updated `scripts/enterprise-goal-status.mjs` so the no-network status output exposes `final-proof-draft`, `final-proof-receipt-check`, and `final-proof-final` as first-class operator commands.
- Updated `docs/operator-toolbox.md` and `docs/operator-toolbox-contract.json` so non-coder operators see `make enterprise-goal-status` plus the draft receipt, receipt check, and final acceptance command split.
- Updated `docs/enterprise-hardening-audit.json` and `docs/README.md` so the operator toolbox and command index evidence also cover the active-goal status command split.
- Updated `docs/final-proof-command-contract.json` so the final-proof command split is now guarded in `docs/operator-toolbox.md` and `docs/README.md`, not only the runbook/risk/readiness surfaces.
- Updated `docs/enterprise-hardening-audit.json` final-proof evidence so enterprise audit also expects the final-proof command contract to cover the operator toolbox and docs index.
- Added `docs/enterprise-goal-status-contract.json`, `scripts/check-enterprise-goal-status-contract.mjs`, and `make enterprise-goal-status-contract` so the no-network active-goal status report is governed by the same contract/audit/doc-index pattern as the rest of the enterprise surfaces.
- Fixed the enterprise-audit marker for `docs/enterprise-goal-status-contract.json` so it matches the raw JSON text for `network: \"none\"`.
- Tightened `docs/enterprise-goal-status-contract.json` and `scripts/check-enterprise-goal-status-contract.mjs` with forbidden markers for child-process execution, env reads, Clockify credentials, and common Git/npm/Fern/Docker command strings.
- Tightened the enterprise-goal-status contract to require both `markdown` and `json` output modes plus the corresponding `renderMarkdown(report)` and `JSON.stringify(report, null, 2)` implementation markers.
- Updated the `final-proof-pending` risk so its mitigation/evidence includes `scripts/enterprise-goal-status.mjs`, `docs/enterprise-goal-status-contract.json`, and `make enterprise-goal-status` as the safe no-network preflight before final proof.
- Updated release-readiness checklist/report/contract/audit evidence so `make enterprise-goal-status` is a required no-network preflight before release/final-readiness proof, distinct from proof commands.
- Added `make final-proof-preflight` to print the active-goal status report and release-readiness report together, and wired it into Make help, quality gates, docs index, final-proof runbook, release-readiness checklist/contract, operator toolbox/contract, and enterprise-audit evidence.
- Added `docs/final-proof-preflight-contract.json`, `scripts/check-final-proof-preflight-contract.mjs`, and `make final-proof-preflight-contract` so the combined preflight target is machine-checked as no-network, report-only, and proof-free.
- Aligned `scripts/release-readiness-report.mjs`, `docs/release-readiness-checklist.md`, `docs/release-readiness-contract.json`, and enterprise-audit evidence so `make final-proof-preflight` is the user-facing preflight command while still documenting that it includes `make enterprise-goal-status`.
- Tightened `docs/final-proof-preflight-contract.json` so it also checks `scripts/release-readiness-report.mjs` advertises `make final-proof-preflight` while retaining the `enterprise-goal-status` relationship.
- Updated `docs/final-proof-receipt-manifest.json`, `docs/final-proof-receipt.template.md`, and `scripts/run-final-proof.mjs` so final receipts now require and draft-capture `make final-proof-preflight` before artifact/proof gates.
- Updated `docs/final-proof-command-contract.json` and enterprise-audit evidence so the final-proof command split also guards `final-proof-preflight` as the required no-network step before draft/final proof commands.
- Tightened `docs/final-proof-preflight-contract.json` and `scripts/check-final-proof-preflight-contract.mjs` so the contract also proves `scripts/run-final-proof.mjs` captures `make final-proof-preflight` as the `No-network preflight` section before proof gates.
- Updated the `final-proof` entry in `docs/change-impact-contract.json` so future final-proof edits require `final-proof-preflight`, `final-proof-preflight-contract`, `final-proof-command-contract`, `final-proof-draft`, receipt checking, final acceptance, and the manifest/contract docs that now define the lifecycle.
- Added ordered final-proof receipt sections in `docs/final-proof-receipt-manifest.json` and taught `scripts/check-final-proof-receipt.mjs` to enforce that `## No-network preflight` appears before artifact/proof/live/cleanup sections.
- Added section-specific final-proof receipt command requirements in `docs/final-proof-receipt-manifest.json` and taught `scripts/check-final-proof-receipt.mjs` to reject receipts where a required command appears only in the wrong section.
- Added section-level success requirements in `docs/final-proof-receipt-manifest.json` and taught `scripts/check-final-proof-receipt.mjs` to require explicit pass/success wording in artifact audit, local proof, performance, full proof, and final cleanup sections instead of accepting one success word anywhere.
- Tightened `docs/final-proof-receipt-manifest.json` so `## No-network preflight` must also contain explicit pass/success wording before a final receipt can pass.
- Tightened live-proof deferral validation with `deferredRequiredMarkers` so a receipt marked `Live proof status: deferred` must include explicit `NOT RUN` evidence in the live proof section in addition to a concrete deferral reason.
- Tightened live cleanup receipt validation with `cleanupReceiptMarker`, `completedCleanupForbiddenMarkers`, `deferredCleanupRequiredMarkers`, and a forbidden `PASTE CLEANUP RECEIPT HERE` placeholder so completed live proof cannot pass with copied/deferred cleanup text and deferred live proof must explicitly say no live objects were created by this proof runner.
- Tightened completed live proof cleanup validation so final receipts must include the `mcp/scripts/assert-clean-prefixes.mjs` JSON cleanup receipt with `prefixes`, `"total": 0`, and `leftovers`, not merely a generic pass/ok line.
- Tightened the no-network enterprise-goal and release-readiness reports so `final-proof-receipt-filled` stays false until the receipt has the required live cleanup proof markers and final live completion requirements.
- Added completed-live failure-pattern bans so a final receipt cannot mark live proof completed while the same section still contains `Result: failed` or a non-zero runner exit status.
- Tightened `scripts/run-final-proof.mjs` so `LIVE=1` extracts the `mcp/scripts/assert-clean-prefixes.mjs` JSON cleanup receipt from `make perfect-live`, stores only that JSON under `Sandbox cleanup receipt:`, and fails the draft if the cleanup JSON is missing or reports nonzero leftovers.
- Aligned `scripts/release-readiness-report.mjs` with the final receipt manifest so `final-proof-receipt-filled` requires `make enterprise-audit-final` evidence and no placeholders, instead of expecting the receipt to contain its own `make final-proof-receipt-check` output.
- Tightened completed live cleanup proof again with `completedCleanupRequiredPrefixes`, so the checker and runner require the known prefix ledger (`sdk-test-`, `mcp-sandbox-`, `mcp-workflow-`, `mcp-log-`, `mcp-fix-`, `DEMO-`) rather than accepting any unrelated JSON object with `"total": 0`.
- Updated `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` to read `completedCleanupRequiredPrefixes` from the final proof manifest, so their no-network `live-cleanup-proof` signal uses the same prefix ledger as the final receipt checker and runner.
- Refined `scripts/run-final-proof.mjs` cleanup extraction so it searches for cleanup JSON with the full required prefix ledger and reports `missingPrefixes`, instead of accepting the first structurally similar JSON object in `make perfect-live` output.
- Tightened `scripts/check-final-proof-receipt.mjs` so completed live cleanup markers are checked only inside the first fenced block after `Sandbox cleanup receipt:`, preventing explanatory template text from satisfying cleanup proof requirements.
- Tightened `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` the same way: their `live-cleanup-proof` signal now inspects the first fenced cleanup block after `Sandbox cleanup receipt:` instead of the full receipt text.
- Tightened `scripts/check-final-proof-receipt.mjs` again so completed live cleanup proof must parse as JSON with a `prefixes` array, numeric `total: 0`, and a `leftovers` object, rather than only matching text patterns.
- Tightened final receipt checking with `mustBeAbsentOnDisk`, so `make final-proof-receipt-check` fails if `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` still exists even when the receipt text claims it was removed.
- Aligned `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` with `mustBeAbsentOnDisk`, so their `final-proof-receipt-filled` signal stays false while the temporary context file still exists.
- Tightened final performance proof validation so `make final-proof-receipt-check` reads `calibrationPolicy.requiredSuccessfulRuns` from `docs/performance-budgets.json` and requires that many performance receipt headings, passed results, and zero exit statuses before accepting `Budget status: tightened`.
- Aligned `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` with the performance proof rule, adding a `performance-proof` signal and keeping `final-proof-receipt-filled` false until the receipt contains the required successful performance runs.
- Tightened `scripts/run-final-proof.mjs` so `--performance-runs` cannot be lower than `docs/performance-budgets.json` `calibrationPolicy.requiredSuccessfulRuns`; the draft runner now refuses under-evidenced final proof receipts before running gates.
- Removed the hard-coded final-proof runner default of three performance runs; when `--performance-runs` is omitted, `scripts/run-final-proof.mjs` now defaults to `calibrationPolicy.requiredSuccessfulRuns`.
- Updated `scripts/run-final-proof.mjs` usage output and the command/audit contracts so operator-facing help now says `--performance-runs=<count>` defaults to `docs/performance-budgets.json` `requiredSuccessfulRuns`, not a stale hard-coded `3`.
- Tightened final receipt success-section validation with `successSectionFailureForbiddenPatterns`, so required success sections cannot pass while still containing `Result: failed` or non-zero exit-status markers.
- Aligned `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` with `successSectionFailureForbiddenPatterns`; both reports now expose `final-proof-failure-markers` and keep `final-proof-receipt-filled` false when failure markers remain.
- Set `final-proof-failure-markers` status to `blocking` when failure markers are present, and taught the release-readiness report blocking-signal logic to treat `blocking` as not ready.
- Tightened final residual-risk handling with `manifest.residualRisk`: completed receipts must say `Residual risk status: none` plus `No remaining risks after final proof.`; draft receipts may use `Residual risk status: carried` with `Owner:`, `Reason:`, and `Closure gate:` details. The final-proof runner now emits that structured residual-risk section automatically.
- Aligned `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` with `manifest.residualRisk`; both reports now expose `residual-risk-decision` and keep `final-proof-receipt-filled` false until the final receipt explicitly records `none` or structured `carried` residual risk.
- Added `noneForbiddenPatterns` to residual-risk validation so a receipt cannot claim `Residual risk status: none` while still listing `Owner:`, `Reason:`, or `Closure gate:` carried-risk lines.
- Aligned `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` with `noneForbiddenPatterns`, so their `residual-risk-decision` signal matches the final receipt checker for contradictory `none` receipts.
- Tightened residual-risk final acceptance with `finalRequiredStatus: none`; `carried` remains a structured draft state, but `make final-proof-receipt-check` and the no-network status/readiness reports now treat carried residual risk as blocking final completion.
- Adjusted residual-risk validation so `carried` receipts are still checked for `Owner:`, `Reason:`, and `Closure gate:` details before being rejected as non-final; this keeps draft receipts useful while preserving `none` as the only final state.
- Tightened live-proof final acceptance with `liveProof.finalRequiredStatus: completed`; deferred live proof remains a structured draft state and the final-proof runner now records live deferral as a draft blocker, but final receipt checking and the no-network status/readiness reports treat deferred live proof as blocking completion.
- Adjusted live-proof validation so `deferred` receipts are still checked for concrete deferral reason and no-live-objects cleanup markers before being rejected as non-final; draft blockers now remain actionable instead of collapsing to only the final-status error.
- Clarified the `live-proof-final-status` report detail in `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` so deferred live proof is described as a draft blocker that still needs a deferral reason and no-live-objects cleanup marker.
- Extended `docs/final-proof-command-contract.json` with `requiredReceiptContracts` and taught `scripts/check-final-proof-command-contract.mjs` to enforce the final receipt manifest/checker/status-report invariants for final live status, final residual-risk status, performance proof, cleanup JSON, failure-marker bans, and temporary context removal.
- Updated Make help, `docs/quality-gates.md`, and `docs/README.md` so `make final-proof-command-contract` is described as guarding both final proof command split and final receipt acceptance invariants, matching the new `requiredReceiptContracts` behavior.
- Added `printSuggestedNextActions` to `scripts/check-final-proof-receipt.mjs`, so failed final receipt checks still print exact failures but also give non-coder operators concise next actions for placeholders, performance proof, live cleanup proof, residual risk, failed command output, section ordering, and temporary context cleanup.
- Tightened `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` operator guidance so remaining/next work now names specific final blockers such as missing performance proof, deferred live proof, missing cleanup JSON, carried residual risk, failure markers, and blocking file-state signals.
- Tightened final acceptance against `docs/risk-register.json`: `make final-proof-receipt-check`, `scripts/enterprise-goal-status.mjs`, and `scripts/release-readiness-report.mjs` now treat `open` and `provisional` risk-register entries as final-readiness blockers via `risk-register-final-status`, so `Residual risk status: none` cannot contradict the machine-readable risk register.
- Updated `docs/risk-register.md` to state that final receipt acceptance treats `open` and `provisional` entries as readiness blockers, while `accepted` and `blocked-upstream` entries remain visible non-final blockers unless their condition changes.
- Refined risk-register final-readiness blocking with `finalReadinessBlocking`: final proof checker/status/readiness/risk reports still block on `open` and `provisional` entries by default, but the legacy release-workflow maintainer decision is marked `finalReadinessBlocking: false` because changing CI/CD/release triggers is outside this hardening goal without explicit approval.
- Tightened `scripts/check-risk-register.mjs` so optional `finalReadinessBlocking` must be boolean when present, preventing fuzzy non-blocking risk metadata.
- Updated `scripts/risk-status-report.mjs` markdown output to show `Final-readiness blocking: yes/no` for each risk, so operators can see why an open future-decision risk is visible but not final-blocking.
- Added the `Final-readiness blocking` report label to the risk-register generator contract and enterprise hardening audit evidence, so future edits must preserve the non-coder operator cue.
- Normalized stale `clockify-sdk-ts` references in `wrapper/CHANGELOG.md` to `clockify-sdk-ts-115`, matching the package name contract and avoiding user-facing copy/paste drift.
- Tightened stale package-name regression guards: `scripts/check-docs-drift.mjs` now scans `wrapper/CHANGELOG.md`, `docs/docs-quality-policy.md` treats changelogs as user-facing migration docs, and `docs/user-docs-contract.json` has an `sdk-changelog` entry with old-package forbidden markers.
- Added `wrapper/CHANGELOG.md` / `sdk-changelog` to the docs-quality contract and enterprise hardening audit evidence, so changelog package-name correctness is covered by the same audit fabric as README/doc surfaces.
- Made changelog drift guards uniform across packages: `scripts/check-docs-drift.mjs` now scans `cli/CHANGELOG.md`, and the user-docs/docs-quality contracts plus enterprise audit now include `cli-changelog` and `mcp-changelog` surfaces.
- Refined final-proof status wording: `enterprise-goal-status` and `release-readiness-report` now say final acceptance requires no `final-blocking open/provisional` risk-register entries, so intentionally visible non-blocking future decisions are not described as closure blockers.
- Tightened publish last-resort gates: `cli/package.json` and `mcp/package.json` `prepublishOnly` now run `type-check`, tests, and build instead of build-only. `docs/package-contract.json` and `scripts/check-package-contract.mjs` now enforce exact required script values, and `docs/supply-chain-policy.md` documents that prepublish gates should not merely emit JS.
- Updated `docs/supply-chain-contract.json` and enterprise audit supply-chain evidence to require the new `type-check/test/build proof` policy text and `requiredScripts` package-contract support.
- Aligned structural package-script guards: `docs/test-matrix-contract.json` and `docs/developer-environment-contract.json` now include `requiredScriptValues` for `prepublishOnly`, and their checkers enforce exact commands so package-contract, test-matrix, and developer-environment all agree on last-resort publish gates.
- Updated `docs/developer-environment-policy.md` and `docs/quality-gates.md` so operators see that exact `prepublishOnly` command shape is part of environment/test/supply-chain readiness, not incidental package metadata.
- Updated `docs/developer-environment-contract.json` policy markers and enterprise audit evidence for developer-environment/test-matrix so `requiredScriptValues` and exact `prepublishOnly` command-shape enforcement are covered by the top-level hardening audit.
- Tightened SDK publish last-resort gate too: `wrapper/package.json` `prepublishOnly` now includes `npm test` between type-check and clean/build/smoke, matching the documented SDK proof surface. The package/test-matrix/developer-environment contracts were updated to the new exact command, and `scripts/repo-doctor.mjs` now checks exact `prepublishOnly` command shapes for all three packages.
- Updated product-surface generation to expose each package's exact `prepublishOnly` command as a `prepublishOnly` JSON field and `Last-resort publish gate` markdown column, with enterprise audit evidence covering the new generated surface.
- Fixed and tightened version/release policy checks: `scripts/check-version-policy.mjs` now supports the object-shaped `docs/product-surface.json.packages` surface and checks product-surface `package`, `version`, and `prepublishOnly` against the real manifests. `docs/release-support-contract.json` / `scripts/check-release-support-contract.mjs` now require package-contract markers for `requiredScripts` and `prepublishOnly`.
- Added package prepublish-gate metadata to safe support bundles: `scripts/create-support-bundle.mjs` now includes `prepublishOnly` per package, `docs/support-runbook.md` includes a `Prepublish gate` escalation field, and the support-bundle contract/audit/quality-gates docs require that metadata.
- Aligned observability policy/contract/audit with support-bundle prepublish metadata, so support observability now explicitly includes sanitized package prepublish-gate context.
- Updated `docs/README.md` index rows for support-runbook, support-bundle contract, supply-chain, and support-bundle gates so the prepublish-gate metadata is discoverable from the documentation index.
- Made support bundle runtime/package-manager metadata truthful: `scripts/create-support-bundle.mjs` now includes per-package lockfile metadata (`lockfileVersion` and `packageCount`) without running npm, and `docs/support-runbook.md` no longer implies the bundle captures npm version automatically. Support-bundle and observability contracts/audit evidence now require `Package-lock` metadata.
- Added a support-bundle lockfile summary boundary: `docs/support-bundle-contract.json` now defines allowed lockfile summary fields and forbidden raw lockfile/dependency fields, while `scripts/check-support-bundle.mjs` enforces that the generator does not include dependency names, resolved tarball URLs, integrity hashes, or `node_modules` entries.
- Extended the lockfile-summary boundary into data-handling and security: `docs/data-handling-policy.md` now treats package-lock metadata as summary-only, and `docs/security-threat-model.md` adds a support-bundle package metadata risk surface. Their contracts and enterprise audit evidence require those markers.
- Strengthened support-bundle checking beyond source-text scans: `scripts/create-support-bundle.mjs` now exports `buildBundle()`, and `scripts/check-support-bundle.mjs` builds the no-network bundle in memory to assert package count, required package fields, and the allowed-only lockfile summary shape from `docs/support-bundle-contract.json`.
- Strengthened generated support-bundle redaction checks: `docs/support-bundle-contract.json` now declares `environmentShapeFalseFields` and `redactionFalseFields`, and `scripts/check-support-bundle.mjs` asserts the in-memory bundle has `network: "none"`, an empty `commandsExecuted`, and false values for env/secret/workspace/raw-log/raw-probe/raw-payload/cookie/history/dotenv capture fields.
- Updated `docs/support-runbook.md`, `docs/quality-gates.md`, and `docs/README.md` so operators can see that `make support-bundle` checks the generated packet shape, redaction flags, and summary-only package-lock metadata.
- Strengthened developer-environment checking beyond source-text scans: `scripts/repo-doctor.mjs` now exports `buildReport()`, and `scripts/check-developer-environment.mjs` builds the no-network report in memory to assert `network: none`, empty `commandsExecuted`, false env/secret/workspace capture flags, and required check IDs for root/package/Fern/GOCLMCP/package-script coverage.
- Updated `docs/developer-environment-policy.md`, `docs/quality-gates.md`, `docs/README.md`, and enterprise audit evidence so operators can see that `make developer-environment` checks the generated repo-doctor report shape, not only source text.
- Strengthened final-proof preflight/status checking beyond source-text scans: `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` now export `buildReport()` helpers, and their contract checkers build the no-network reports in memory to assert `network: none`, empty `commandsExecuted`, false env capture, not-complete/not-ready status, required final-proof command IDs, and required blocker signals.
- Tightened the combined final-proof preflight contract so `make final-proof-preflight-contract` also validates the generated enterprise-goal and release-readiness report shapes, not only the Make target text.
- Updated enterprise hardening audit and change-impact routing so release-readiness/final-proof edits now include generated report-shape contracts, report scripts, and the right contract targets in future proof planning.
- Made generated report-script ownership first-class in the contract inventory: `docs/contract-inventory.json` now lists report scripts for release-readiness, enterprise-goal-status, and final-proof-preflight contracts; the checker verifies report paths exist; and the no-network inventory report surfaces report ownership plus `withReports` counts.
- Updated the operator toolbox wording/contract so non-coder operators can see contract inventory reports include generated report-script ownership, not only checker and perfect-gate coverage.
- Tightened operator-toolbox ownership: `scripts/check-operator-toolbox.mjs` now verifies every no-network toolbox helper is owned by `docs/contract-inventory.json`, with repo-doctor and support-bundle helper ownership listed explicitly.
- Tightened contract-inventory reporting: `scripts/contract-inventory-report.mjs` now publishes toolbox helper ownership, and `scripts/check-contract-inventory.mjs` asserts every toolbox helper has an inventory owner with no missing-owner list.
- Tightened operator help drift: `make operator-toolbox` help now says it checks inventory ownership, and `scripts/check-operator-toolbox.mjs` enforces that Make help marker from `docs/operator-toolbox-contract.json`.
- Clarified inventory report wording: entry-owned helper scripts now render under `helpers:` instead of the narrower `reports:` label.
- Normalized toolbox ownership wording from narrow `report-script ownership` to `report/helper ownership`, and taught the operator-toolbox checker to enforce inventory-ownership markers in the docs index and quality-gates docs.
- Tightened operator-toolbox helper command coverage: every helper script now maps to an exact documented operator command in `docs/operator-toolbox-contract.json`, and `scripts/check-operator-toolbox.mjs` enforces the one-to-one coverage.
- Extended contract-inventory reporting to publish toolbox helper command coverage beside helper ownership, and updated `scripts/check-contract-inventory.mjs` to require zero missing documented helper commands.
- Tightened toolbox command coverage reporting again: `scripts/contract-inventory-report.mjs` now surfaces extra or duplicate helper command mappings, and the inventory contract requires both lists to stay empty.
- Tightened `make operator-toolbox` directly too: `scripts/check-operator-toolbox.mjs` now fails duplicate helper command coverage entries and requires explicit no-extra/no-duplicate invariants in `docs/operator-toolbox-contract.json`.
- Tightened operator-toolbox list integrity: `scripts/check-operator-toolbox.mjs` now enforces unique helper scripts, required owned scripts, required targets, and supporting docs via explicit `listInvariants`.
- Added `operator-toolbox` to change-impact routing so edits to toolbox helpers, inventory ownership, docs index rows, or related checker/report files require `operator-toolbox`, `contract-inventory`, `change-impact`, docs drift, and enterprise audit gates.
- Tightened change-impact scope retention: `docs/change-impact-contract.json` now has top-level `requiredScopeIds`, and `scripts/check-change-impact.mjs` fails if the `operator-toolbox` scope disappears.
- Tightened change-impact path routing: `docs/change-impact-contract.json` now probes representative operator-toolbox and contract-inventory helper paths, and `scripts/check-change-impact.mjs` requires those paths to map to the `operator-toolbox` scope.
- Tightened change-impact path coverage: `docs/change-impact-contract.json` now requires every changed path in the `operator-toolbox` scope to map back to that scope, enforced by `scripts/check-change-impact.mjs`.
- Tightened change-impact scope obligations: `docs/change-impact-contract.json` now pins required `operator-toolbox` targets/docs/paths, and `scripts/check-change-impact.mjs` fails if the scope keeps its name but drops its proof obligations.
- Tightened change-impact matrix integrity: `scripts/check-change-impact.mjs` now enforces unique scope ids, required scope ids, path probes, coverage expectations, scope-requirement expectations, and per-scope changed paths/targets/docs via explicit `matrixInvariants`.
- Tightened contract-inventory list integrity: `scripts/check-contract-inventory.mjs` now enforces unique inventory entry ids/targets plus per-entry helper, policy, contract, and audit lists via explicit `inventoryInvariants`.
- Extended contract-inventory reporting with `inventoryInvariantStatus`, so the no-network report now exposes inventory invariant coverage and duplicate entry/list failures instead of leaving uniqueness only inside checker code.
- Extended contract-inventory reporting with `requiredDocCoverage`, so the no-network report now exposes any `docs/*-contract.json` or `docs/*-policy.md` file missing from `docs/contract-inventory.json`.
- Extended contract-inventory reporting with `docsIndexCoverage`, so the no-network report now exposes missing `docs/README.md` links for inventoried policy/contract docs.
- Strengthened `make contract-inventory` beyond source-text scans: it now imports `buildReport()` from `scripts/contract-inventory-report.mjs` and asserts the generated report shape is no-network, command-free, env-free, and includes the report-owning entries.
- Strengthened risk-status checking beyond source-text scans: `scripts/risk-status-report.mjs` now exports `buildReport()`, and `scripts/check-risk-register.mjs` builds the no-network report in memory to assert no-network/no-command/no-env shape, required count keys, final-proof/performance file signals, and final-readiness risk IDs.
- Wired the risk-status report into the contract inventory, operator toolbox, and enterprise audit so the generated report-shape check is discoverable from the top-level hardening map.
- Strengthened release decision planning beyond source-text scans: `scripts/release-decision-plan.mjs` now exports `buildReport()`, and `scripts/check-release-readiness.mjs` validates the generated no-network decision packet has no publish/CI-CD permission, preserves local tarball as the only default-safe path, and requires maintainer approval for tag/npm/workflow changes.
- Strengthened performance calibration planning: `scripts/performance-calibration-plan.mjs` now reads `docs/performance-budgets.json` instead of hard-coding the required receipt count, exports `buildReport()`, and `scripts/check-performance-budgets.mjs` validates the generated no-network plan shape against `calibrationPolicy` before measuring built artifacts.
- Strengthened operator onboarding planning beyond source-text scans: `scripts/onboarding-plan.mjs` now exports `buildPlan()`, and `scripts/check-operator-onboarding.mjs` validates the generated all-goals plan for no-network/no-command/no-env/no-secret/no-workspace-ID posture plus required SDK/CLI/MCP/mock/live/full/support goal IDs and non-empty first-read/safe-start/proof/stop arrays.
- Updated operator toolbox wording/contract so the onboarding helper is discoverable as a shape-checked Markdown/JSON plan.
- Strengthened workflow planning beyond source-text scans: `scripts/workflow-plan.mjs` now exports `buildPlan()`, and `scripts/check-workflow-cookbook.mjs` validates the generated all-workflows plan for no-network/no-command/no-env posture plus required workflow IDs and non-empty SDK/CLI/MCP/safety arrays.
- Strengthened acceptance scenario planning beyond source-text scans: `scripts/acceptance-plan.mjs` now exports `buildPlan()`, and `scripts/check-acceptance-scenarios.mjs` validates the generated all-scenarios plan for no-network/no-command/no-env posture plus required scenario IDs and non-empty SDK/CLI/MCP/evidence/escalation/cleanup fields.
- Strengthened examples planning beyond source-text scans: `scripts/examples-plan.mjs` now exports `buildPlan()`, and `scripts/check-examples-matrix.mjs` validates the generated all-examples plan for no-network/no-command/no-env posture plus required example IDs and non-empty SDK/CLI/MCP/safety/proof fields.
- Strengthened change-impact planning beyond source-text scans: `scripts/change-impact-plan.mjs` now exports `buildPlan()`, and `scripts/check-change-impact.mjs` validates the generated default plan for no-network/no-command/no-env posture plus required docs-and-contracts, final-proof, and release-readiness scopes with non-empty required targets/docs/notes.
- Strengthened maintenance planning beyond source-text scans: `scripts/maintenance-plan.mjs` now exports `buildReport()`, and `scripts/check-maintenance-playbook.mjs` validates the generated all-cadences plan for no-network/no-command/no-env posture plus required weekly/monthly/dependency/generator/drift/release/rollback cadence IDs and non-empty safe-start/proof/docs/receipt/stop-condition arrays.

## Remaining high-impact work

1. Run `make performance-receipt` after package builds, then tighten the provisional ceilings after `calibrationPolicy.requiredSuccessfulRuns` successful baseline receipts.
2. Run `make enterprise-audit` as the artifact-level completion check before the full gate stack.
3. Fill `docs/final-proof-receipt.md` from the template after real command evidence exists.
4. Run `make final-proof-receipt-check`.
5. Remove this temporary context file and run `make final-proof-final`.

- Added contract-inventory report/checker coverage for `docs/quality-gates.md` rows, including generated report counts, required empty missing-target list, policy text, and enterprise-audit evidence markers so missing `make <target>` rows are visible before final proof.

- Tightened risk-status report routing so `readinessBlockingRiskIds` and `nonBlockingOpenOrProvisionalRiskIds` are generated, shape-checked, documented, and audited; open/provisional final blockers can no longer blur with visible future maintainer decisions.

- Added latest performance receipt readiness to `scripts/performance-calibration-plan.mjs`: it now inspects the configured receipt path without running commands, reports missing/invalid/failed/passed status, and the performance budget checker/contract/audit require that `latestReceipt` shape.

- Tightened final-proof receipt acceptance so every final success section must include machine-checkable `Exit status: 0` and `Result: passed` evidence; manifest, checker, runbook, template, final-proof command contract, and enterprise audit now preserve that invariant.

- Added `docs/final-proof-receipt.template.md` to the final-proof command contract and enterprise-audit evidence so the operator template must preserve manifest linkage, placeholder safety, and the `Exit status: 0` / `Result: passed` success-evidence rule.

- Aligned no-network final-readiness reports with final receipt `successSectionRequiredPatterns`: `enterprise-goal-status` and `release-readiness-report` now require every success section to include `Exit status: 0` and `Result: passed` before reporting the receipt as filled/ready, with contracts and enterprise-audit markers updated.

- Extended `docs/final-proof-command-contract.json` so its required status/readiness report markers include `finalReceiptHasRequiredSuccessSectionEvidence`, `success-section-evidence`, `successSectionRequiredPatterns`, and `readReceiptSection`; enterprise-audit evidence now expects those top-level final-proof command-contract markers too.

- Tightened `docs/final-proof-preflight-contract.json` so both generated preflight reports must expose `final-proof-failure-markers` and `success-section-evidence`; enterprise-audit evidence now expects those combined-preflight signals too.

- Added final-proof runbook success-evidence wording to `docs/final-proof-command-contract.json` and enterprise-audit evidence, so the runbook must keep the `Exit status: 0` / `Result: passed` rule alongside the template and checker.

- Tightened `docs/change-impact-contract.json` final-proof routing: added explicit final-proof scope requirement expectations, required `docs/final-proof-receipt.template.md`, and updated notes so future final-proof edits must preserve receipt template guidance and success-section evidence invariants.

- Added final receipt success-evidence guidance to operator onboarding: the full-readiness path and generated onboarding plan now require every final success section to include `Exit status: 0` and `Result: passed`; the onboarding contract and enterprise audit preserve those markers.

- Fixed final-proof draft performance-run default drift: `Makefile` now passes `--performance-runs` only when `PERFORMANCE_RUNS` is explicitly set, letting `scripts/run-final-proof.mjs` default to `docs/performance-budgets.json` `requiredSuccessfulRuns`; `docs/final-proof-command-contract.json` and checker now forbid the stale `PERFORMANCE_RUNS:-3` default.

- Removed stale hard-coded performance receipt-count guidance: `scripts/performance-calibration-plan.mjs`, `docs/final-proof-runbook.md`, `docs/performance-budgets.json`, and `docs/risk-register.json` now route receipt counts through `calibrationPolicy.requiredSuccessfulRuns`; `scripts/check-performance-budgets.mjs` asserts the generated calibration plan emits exactly that many `make performance-receipt` commands.

- Removed the hidden `?? 3` fallback from `scripts/performance-calibration-plan.mjs`; missing or invalid `calibrationPolicy.requiredSuccessfulRuns` now surfaces as a plan blocker, and `docs/performance-budgets.json` / `scripts/check-performance-budgets.mjs` require a positive policy-owned count.

- Updated `make final-proof-draft` usage text so operators see `PERFORMANCE_RUNS=<count>` is optional and omitted values use `docs/performance-budgets.json` `requiredSuccessfulRuns`; `docs/final-proof-command-contract.json` and enterprise-audit evidence now guard that message.

- Renamed the performance calibration receipt step from `record-three-receipts` to `record-required-receipts` in `scripts/performance-calibration-plan.mjs` and `docs/performance-budgets.json`, keeping the step identity aligned with `calibrationPolicy.requiredSuccessfulRuns` rather than a fixed count.

- Removed the hidden `?? 1` fallback from `scripts/run-final-proof.mjs`; final-proof draft now fails if `docs/performance-budgets.json` lacks a positive `calibrationPolicy.requiredSuccessfulRuns`. `docs/final-proof-command-contract.json` and `scripts/check-final-proof-command-contract.mjs` now support script-level forbidden markers to keep that fallback from returning.
- Added explicit performance-required-runs-policy blocking signals to enterprise goal status and release readiness reports so missing/invalid docs/performance-budgets.json calibrationPolicy.requiredSuccessfulRuns is visible before final proof.
- Made docs/final-proof-receipt.template.md use docs/performance-budgets.json calibrationPolicy.requiredSuccessfulRuns instead of a fixed three performance receipts, and extended final-proof-command-contract checking to enforce receipt-contract mustNotContain markers.
- Clarified docs/final-proof-runbook.md that the receipt template uses ### Receipt N and operators must duplicate it until successful performance receipts match calibrationPolicy.requiredSuccessfulRuns; added final-proof-command-contract and audit markers for that guidance.
- Replaced raw text searches for calibrated performance budgets in release-readiness and risk-status reports with parsed performanceBudgets.calibrationPolicy.status checks, and added contract/audit markers so reports cannot be fooled by incidental text.
- Added parsed final-receipt budget-status checks to enterprise-goal-status and release-readiness reports. Reports now require Budget status: tightened inside the Performance receipts section via final-receipt-budget-status instead of accepting a whole-file substring.
- Added final-audit-command-evidence to enterprise-goal-status and release-readiness reports so make enterprise-audit-final must appear in the manifest-declared Temporary context cleanup section, not merely anywhere in docs/final-proof-receipt.md.
- Tightened live proof status handling in enterprise-goal-status, release-readiness-report, and risk-status-report so final live completion, draft deferral status, and deferred cleanup markers are read from the manifest-declared Live sandbox proof section instead of whole-file substring searches.
- Tightened scripts/check-final-proof-receipt.mjs so live proof status and live deferral reason are read from the manifest-declared Live sandbox proof section, not from the full receipt; added final-proof-command-contract and enterprise audit markers.
- Removed the whole-receipt successPattern.test(text) fallback from scripts/check-final-proof-receipt.mjs. Final proof success wording is now section-scoped through manifest.successSections, and final-proof-command-contract forbids restoring the global success wording fallback.
- Added completedSuccessRequiredPatterns to docs/final-proof-receipt-manifest.json and made scripts/check-final-proof-receipt.mjs require Exit status: 0 and Result: passed inside completed live proof sections, replacing soft completedPassPattern proof for live completion.
- Removed fuzzy successPattern and completedPassPattern proof fields from docs/final-proof-receipt-manifest.json and removed the checker section-level successPattern dependency. Final proof now relies on explicit manifest.successSectionRequiredPatterns and completedSuccessRequiredPatterns; final-proof-command-contract forbids restoring the fuzzy success wording fields/checks.
- Tightened scripts/check-final-proof-receipt.mjs so Budget status is read from the manifest-declared Performance receipts section via readListField(performanceSection, manifest.budget.field), and final-proof-command-contract forbids returning to readListField(text, manifest.budget.field).
- Tightened temporary context removal proof in scripts/check-final-proof-receipt.mjs: docs/final-proof-receipt-manifest.json now declares the Temporary context cleanup section, the checker requires the removed path under that section, and it rejects the temporary context path outside the removal receipt section.
- Added completedSectionForbiddenMarkers to docs/final-proof-receipt-manifest.json and enforced them in scripts/check-final-proof-receipt.mjs so completed live proof rejects NOT RUN / cleanup placeholders anywhere in the Live sandbox proof section, not only inside cleanup JSON.
- Replaced global requiredCommands receipt matching in scripts/check-final-proof-receipt.mjs with sectionScopedCommands manifest consistency checks. Receipt command evidence remains enforced by commandSections/readReceiptSection, and final-proof-command-contract now forbids restoring if (!text.includes(command)) global checks.
- Hardened scripts/check-final-proof-receipt.mjs manifest command consistency: requiredCommands and commandSections must now match bidirectionally. The checker fails if a required command lacks a section or if a command section lists a command outside requiredCommands; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs manifest section consistency: requiredSections and orderedSections must now match bidirectionally. The checker fails if a required section is missing from orderedSections or an ordered section is not listed in requiredSections; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs manifest section ownership: successSections and commandSections must now reference requiredSections. The checker fails if either list points at a section outside the required/ordered receipt section set; contract/audit markers added.
- Added assertUnique duplicate detection to scripts/check-final-proof-receipt.mjs for manifest.requiredSections, orderedSections, successSections, requiredCommands, commandSections[].section, and commandSections[].commands so duplicated proof sections/commands cannot make final receipt validation ambiguous; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs command-section manifest shape: every commandSections entry must now have a non-empty section name and at least one command before consistency/receipt checks run; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs manifest list shape with assertNonEmptyStrings for requiredSections, orderedSections, successSections, requiredCommands, and commandSections[].commands so blank/non-string proof sections or commands fail explicitly; contract/audit markers added.
- Added assertRegexPatterns to scripts/check-final-proof-receipt.mjs so manifest regex rule lists are non-empty strings and compile before use. It now validates success/failure section patterns, budget receipt regexes, and completed live-proof regexes; contract/audit markers added.
- Added assertNonEmptyString scalar manifest validation in scripts/check-final-proof-receipt.mjs for budget, liveProof, temporaryContextRemoval, and residualRisk fields so blank/missing parser fields fail clearly before receipt proof checks; contract/audit markers added.
- Added marker/list validation to scripts/check-final-proof-receipt.mjs for forbiddenPlaceholders, liveProof cleanup prefixes/forbidden/deferred markers, and residualRisk regex/marker lists. The checker now rejects blank/duplicate manifest marker lists and invalid residual-risk regex patterns before proof checks; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs status manifest consistency: liveProof.allowedStatuses and residualRisk.allowedStatuses must be unique, and each finalRequiredStatus must be present in its allowedStatuses list; contract/audit markers added.
- Added manifest control-field validation to scripts/check-final-proof-receipt.mjs: assertNonEmptyArray, assertPositiveInteger, and assertBoolean now guard liveProof.minDeferralReasonLength, temporaryContextRemoval.mustBeAbsentOnDisk, and riskRegister routing fields before final receipt proof logic uses them; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs top-level manifest validation: receiptPath, budgetPath, riskRegisterPath, temporaryContextPath, and schemaVersion are now explicit checks, with readJsonFile used so invalid budget/risk JSON paths report checker failures instead of crashing; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs manifestRelativePath so top-level receiptPath, budgetPath, and riskRegisterPath must be repo-relative paths without absolute paths or parent traversal; contract/audit markers added.
- Hardened scripts/check-final-proof-receipt.mjs temporary-context path invariants: manifest.temporaryContextPath and manifest.temporaryContextRemoval.pathPattern now both go through manifestRelativePath, must match exactly, and receipt removal checks use the normalized removal path; contract/audit markers added.
- Moved top-level manifest.schemaVersion and temporary-context path consistency checks in scripts/check-final-proof-receipt.mjs before the receipt existence branch, so a missing docs/final-proof-receipt.md no longer hides those manifest failures; contract/audit markers added.
- Moved top-level final proof manifest schema/temporary-context path validation before the final receipt existence branch in scripts/check-final-proof-receipt.mjs so missing docs/final-proof-receipt.md cannot hide broken manifest metadata; contract/audit markers added.
- Moved all manifest-only structural validation in scripts/check-final-proof-receipt.mjs before the final receipt existence branch, so missing docs/final-proof-receipt.md cannot mask malformed manifest fields, lists, command-section routing, regex patterns, status controls, or risk-register metadata; final-proof command/audit markers now require that invariant.
- Hardened scripts/check-final-proof-command-contract.mjs so the final-proof command contract validates its own schema version, marker lists, duplicate paths, and repo-relative path boundaries before scanning docs/scripts; final-proof contract and enterprise audit now require those self-checking invariants.
- Hardened scripts/check-enterprise-hardening.mjs so the enterprise hardening audit validates its own schema version, purpose, unique requirement IDs, evidence paths, marker lists, safe repo-relative paths, and temporary/final receipt paths before trusting the evidence map; final-proof audit evidence now includes the audit checker self-invariants.
- Hardened scripts/check-contract-inventory.mjs so the contract inventory validates schema version, purpose, safe repo-relative paths, typed entry/report-generator lists, optional booleans, non-negative report minimums, and object-shaped entries before trusting inventory wiring; docs/contract-inventory.json now names those invariants and enterprise audit evidence requires the checker markers.
- Extended the contract inventory report with structuralInvariants / Structural shape invariants so no-network operator output distinguishes schema/path/typed-list/report-generator guards from duplicate-list checks; contract inventory JSON, policy text, checker assertions, and enterprise audit evidence now require that reporting surface.
- Extended scripts/contract-inventory-report.mjs with inventoryShapeStatus plus an Inventory shape status markdown section for schema issues, unsafe paths, typed-list issues, boolean mistakes, minimum-count mistakes, and invalid entry shapes; scripts/check-contract-inventory.mjs now asserts the clean shape-status lists and the inventory contract/policy/audit require the new report surface.
- Hardened scripts/check-operator-toolbox.mjs so the operator toolbox contract validates schema version, purpose, safe repo-relative paths, typed helper/ownership/supporting-doc lists, helper command coverage objects, and supporting doc marker objects before trusting the toolbox JSON; docs/operator-toolbox-contract.json, docs/operator-toolbox.md, and enterprise audit evidence now require those self-checking invariants and surface Inventory shape status for the contract inventory helper.
- Hardened scripts/check-release-readiness.mjs so the release-readiness contract validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, typed target/doc/evidence lists, generated report contracts, decision planner contracts, and supporting evidence objects before trusting readiness metadata; docs/release-readiness-contract.json and enterprise audit evidence now require those self-checking invariants.
- Hardened scripts/check-enterprise-goal-status-contract.mjs so the enterprise-goal-status contract validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, typed status-script markers, generated-report expectations, final-proof command metadata, and doc marker objects before trusting status metadata; docs/enterprise-goal-status-contract.json and enterprise audit evidence now require those self-checking invariants.
- Hardened scripts/check-final-proof-preflight-contract.mjs so the final-proof preflight contract validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, typed Makefile/doc/runner/supporting-contract lists, and generated-report expectations before trusting preflight metadata; docs/final-proof-preflight-contract.json and enterprise audit evidence now require those self-checking invariants.
- Hardened scripts/check-performance-budgets.mjs so docs/performance-budgets.json validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, typed calibration policy, typed calibration-plan contract, file-size budget entries, timing budget entries, and receipt-path overrides before running measurement smoke commands; the checker now stops before measurements when budget policy is malformed, and enterprise audit evidence requires those markers.
- Hardened scripts/check-risk-register.mjs so docs/risk-register.json validates schema version, purpose, explicit contractInvariants, typed risk entries, safe repo-relative evidence paths, typed report-generator metadata, and generated risk-status report contract fields before trusting risk evidence; docs/risk-register.md and enterprise audit evidence now require that shape boundary.
- Hardened scripts/check-support-bundle.mjs so docs/support-bundle-contract.json validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, typed runbook/generator/lockfile/generated-bundle/supporting-evidence contracts, and duplicate marker lists before trusting support-bundle redaction metadata; enterprise audit evidence now requires those self-checking markers.
- Hardened scripts/check-developer-environment.mjs so docs/developer-environment-contract.json validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, root no-workspace boundaries, repo-doctor generated-report metadata, package script contracts, Fern paths, and supporting-doc marker objects before trusting environment metadata; the policy and enterprise audit evidence now require those shape checks.
- Hardened scripts/check-change-impact.mjs so docs/change-impact-contract.json validates schema version, purpose, explicit contractInvariants, safe repo-relative file paths for actual docs/scripts, typed generated-plan metadata, typed matrix invariants, typed path-probe expectations, typed scope requirement expectations, and scope entries before trusting change-impact routing; docs/change-impact-policy.md now distinguishes path patterns such as ../GOCLMCP/** from real file paths, and enterprise audit evidence requires the new shape boundary.
- Hardened scripts/check-secret-hygiene.mjs so docs/secret-hygiene.json validates schema version, purpose, explicit contractInvariants, scan extensions, safe repo-relative ignored/doc paths, pattern object shape, regex validity, and required-doc marker lists before compiling token regexes or walking files; enterprise audit evidence now requires those self-checking markers.
- Hardened scripts/check-data-handling.mjs so docs/data-handling-contract.json validates schema version, purpose, explicit contractInvariants, safe repo-relative paths, typed policy markers, typed data-class markers, typed required-doc paths, and typed supporting-evidence marker lists before trusting privacy/data-handling evidence; docs/data-handling-policy.md and enterprise audit evidence now require that shape boundary.
- Hardened `scripts/check-supply-chain.mjs` so `docs/supply-chain-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative manifest/license/supporting paths, typed package entries, `publishConfig` expectations, pack-file allow/deny lists, policy markers, and supporting-contract markers before trusting package publish-safety metadata; supply-chain policy and enterprise audit evidence now require that shape boundary.
- Hardened `scripts/check-package-contract.mjs` so `docs/package-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe package manifest paths, typed package contract entries, pack-file lists, bin/export key lists, required script maps, and publish-safety booleans before reading SDK/CLI/MCP manifests; audit evidence now covers the package-contract shape boundary.
- Hardened `scripts/check-dependency-boundary.mjs` so `docs/dependency-boundary.json` validates schema version, purpose, explicit `contractInvariants`, safe package manifest paths, explicit safe source roots, typed package dependency contracts, runtime dependency lists, peer/dev dependency maps, forbidden runtime dependencies, and forbidden import markers before reading manifests or scanning sources; audit evidence now covers the dependency-boundary shape boundary.
- Added `docs/pack-consumer-smoke-contract.json` and hardened `scripts/pack-consumer-smoke.mjs` so `make pack-smoke` validates schema version, purpose, explicit `contractInvariants`, safe package directories, required SDK/CLI/MCP package ids, typed consumer install contracts, required script markers, and the `KEEP_CLOCKIFY_PACK_SMOKE_TEMP` cleanup override before running `npm pack`/consumer installs; docs index, contract inventory, and enterprise audit evidence now register the pack-smoke contract.
- Hardened `scripts/check-dependency-license.mjs` so `docs/dependency-license-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe manifest/evidence paths, policy/supporting marker contracts, typed package license ledger entries, typed runtime dependency ledger entries, license allow/deny lists, and Make/docs/inventory/audit wiring before trusting manifests or docs as license-readiness proof; dependency-license policy and enterprise audit evidence now require the shape boundary.
- Tightened the newly hardened supply-chain, package-contract, dependency-boundary, and dependency-license checkers to fail fast immediately after contract-shape validation errors, before opening package manifests, scanning source roots, or trusting policy/supporting evidence.
- Hardened `scripts/check-compatibility-contract.mjs` so `docs/compatibility-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative compatibility evidence paths, typed policy marker contracts, typed SDK/CLI/MCP/OpenAPI surface path marker lists, required Make targets, docs-index entries, and forbidden policy markers before reading compatibility policy, changelogs, migration docs, generated reports, or surface contracts; compatibility policy and enterprise audit evidence now require that breaking-change safety shape boundary.
- Hardened `scripts/check-breaking-change-review.mjs` so `docs/breaking-change-review-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative review evidence paths, typed policy marker contracts, typed public-surface evidence, typed migration/changelog evidence, required Make targets, and Make/docs/inventory/audit wiring before reading public SDK/CLI/MCP/OpenAPI/package evidence; breaking-change review policy and enterprise audit evidence now require that public-surface safety shape boundary.
- Hardened `scripts/check-receipts-contract.mjs` so `docs/receipts-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative receipt evidence paths, typed policy marker contracts, typed SDK/CLI/MCP receipt evidence, typed supporting-contract evidence, required Make targets, and docs-index entries before reading SDK/CLI/MCP receipt implementation files or supporting contracts; receipts policy and enterprise audit evidence now require that observability-readiness shape boundary.
- Hardened `scripts/check-observability-contract.mjs` so `docs/observability-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative observability evidence paths, typed policy marker contracts, typed SDK/CLI/MCP/support observability evidence, and Make/docs/inventory/audit wiring before reading request-correlation, telemetry, receipt, or support-bundle evidence; observability policy and enterprise audit evidence now require that support-readiness shape boundary.
- Hardened `scripts/check-diagnostics-contract.mjs` so `docs/diagnostics-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative diagnostics evidence paths, typed policy marker contracts, typed SDK/CLI/MCP/product-surface diagnostic surface file markers, forbidden secret pattern lists, and Make/docs/audit wiring before reading diagnostics implementation, product-surface, docs-index, or audit evidence; also moved failure tracking before contract load so missing contract files report cleanly. Diagnostics policy and enterprise audit evidence now require that local-readiness shape boundary.
- Hardened `scripts/check-quickstart-receipt.mjs` so `docs/quickstart-receipt-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative quickstart/supporting evidence paths, typed quickstart document marker lists, typed supporting-surface marker lists, and Make/docs/audit wiring before reading quickstart receipt or supporting diagnostics/live/mock/product-surface evidence; also moved failure tracking before contract load so missing contract files report cleanly. Quickstart receipt and enterprise audit evidence now require that operator-readiness shape boundary.
- Hardened `scripts/check-receipt-examples.mjs` so `docs/receipt-examples-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative receipt-example/supporting evidence paths, typed golden receipt examples, required docs, supporting evidence, required targets, and Make/docs/inventory/audit wiring before reading receipt examples or supporting runtime evidence; also moved failure tracking before contract load and switched root resolution to the script directory. Receipt examples doc and enterprise audit evidence now require that output-shape safety boundary.
- Hardened `scripts/check-issue-intake.mjs` so `docs/issue-intake-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative GitHub template/support/security evidence paths, typed policy marker contracts, typed issue/feature/PR template markers, typed supporting-evidence markers, and Make/docs/inventory/audit wiring before reading intake templates or support evidence. Issue-intake policy and enterprise audit evidence now require that supportability safety boundary.
- Hardened `scripts/check-release-support-contract.mjs` so `docs/release-support-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative release/security/package-contract paths, typed policy/security marker contracts, typed security regex deny-list entries, typed package-contract references, required Make targets, docs-index entries, and Make/quality-gate/inventory/audit wiring before reading release policy, `SECURITY.md`, or package contract evidence. Release-support policy and enterprise audit evidence now require that publish-readiness safety boundary.
- Hardened `scripts/check-live-safety.mjs` so `docs/live-safety-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative live-safety evidence paths, typed live policy/gate/cleanup/final-proof/risk marker contracts, typed MCP cleanup script expectations, docs-index entries, and Make/quality-gate/inventory/audit wiring before reading live proof, cleanup, deferral, mock-alternative, risk, or docs-index evidence. Live-test policy and enterprise audit evidence now require that sandbox safety boundary.
- Hardened `scripts/check-test-data-lifecycle.mjs` so `docs/test-data-lifecycle-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative test-data evidence paths, typed policy marker contracts, typed prefix ledger, typed cleanup script markers, typed live-test/supporting evidence, required Make targets, and Make/docs/inventory/audit wiring before reading prefix, cleanup, live-test, support, or final-proof evidence. Test-data lifecycle policy and enterprise audit evidence now require that cleanup safety boundary.
- Hardened `scripts/check-mutation-safety.mjs` so `docs/mutation-safety-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative mutation-safety evidence paths, typed policy marker contracts, required targets/docs, mutation classes, supporting evidence, and Make/docs/inventory/audit wiring before reading retry, write-safety, confirmation, receipt, live-safety, or support evidence; also moved failure tracking before contract load and switched root resolution to the script directory. Mutation-safety policy and enterprise audit evidence now require that write-safety boundary.
- Hardened `scripts/check-mock-clockify-contract.mjs` so `docs/mock-clockify-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative mock server/test/docs evidence paths, typed server exports, typed route/header contracts, typed SDK/CLI/MCP mock-test evidence, typed docs evidence, and Make/quality-gate/docs/inventory/audit wiring before reading the mock server or mock-backed tests. `docs/mock-clockify-contract.json`, `docs/quality-gates.md`, and enterprise audit evidence now require that deterministic mock/replay safety boundary.
- Hardened `scripts/check-cli-write-safety.mjs` so `docs/cli-write-safety-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative CLI write evidence paths, typed required-file evidence, typed write-command evidence, forbidden policy markers, and Make/docs/inventory/audit wiring before reading CLI README or command source. CLI write-safety policy and enterprise audit evidence now require that deterministic operator-safety boundary.
- Hardened `scripts/check-mcp-write-safety.mjs` so `docs/mcp-write-safety-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative MCP write evidence paths, destructive-tool threshold, high-risk/idempotent workflow tool lists, required-file evidence, workflow/confirmation marker contracts, forbidden policy markers, and Make/docs/inventory/audit wiring before reading MCP README/resources/prompts/output schema/workflow registrations or discovering destructive tools. MCP write-safety policy and enterprise audit evidence now require that agent write-safety boundary.
- Hardened `scripts/check-cli-contract.mjs` so `docs/cli-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative CLI contract paths, metadata reference, expected command surface, exit codes, source evidence, and Make/docs/quality-gate/inventory/audit wiring before reading command metadata, CLI README, completion source, or tests. CLI contract JSON and enterprise audit evidence now require that public command-surface shape boundary.
- Hardened `scripts/check-mcp-contract.mjs` so `docs/mcp-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative MCP contract paths, tool metadata reference, expected tool/resource/prompt/output-schema surface, source evidence, and Make/docs/quality-gate/inventory/audit wiring before reading MCP tool metadata, resources, prompts, output schema, README, or server tests. MCP contract JSON and enterprise audit evidence now require that public MCP discoverability shape boundary.
- Hardened `scripts/check-mcp-agent-ux.mjs` so `docs/mcp-agent-ux-contract.json` validates schema version, purpose, explicit `contractInvariants`, safe repo-relative MCP agent UX paths, typed tool metadata reference, expected tool summary, UX marker checks, and Make/docs/quality-gate/inventory/audit wiring before reading MCP instructions/resources/prompts/result/output-schema/README/write-safety docs or generated tool metadata. MCP agent UX policy and enterprise audit evidence now require that agent usability safety boundary.
- Hardened `scripts/check-api-docs.mjs` so the API documentation contract validates schema, safe evidence paths, TypeDoc/package/resource-doc expectations, optional generated HTML checks, and Make/docs/inventory/audit wiring before reading downstream docs.
- Hardened `scripts/check-user-docs.mjs` so the user documentation contract validates schema, safe evidence paths, unique document ids/paths, marker lists, supporting contract entries, and Make/docs/inventory/audit wiring before scanning user-facing docs.
- Hardened `scripts/check-docs-quality.mjs` so the documentation-quality contract validates schema, safe evidence paths, unique doc ids/paths, generated truth surfaces, scan paths, unsupported-claim regexes, and Make/docs/inventory/audit wiring before scanning product docs.
- Hardened `scripts/check-agent-handoff.mjs` so the agent-handoff contract validates schema, safe guidance paths, guidance/supporting check entries, stale-marker scan paths, forbidden marker lists, and Make/docs/inventory/audit wiring before scanning handoff docs.
- Hardened `scripts/check-test-matrix-contract.mjs` so the test-matrix contract validates schema, package manifest/test path safety, required script maps, root gate targets, and Make/docs/inventory/audit wiring before reading package manifests or test files.
- Hardened `scripts/check-maintenance-playbook.mjs` so the maintenance contract validates schema, safe evidence paths, planner/generated-report expectations, required docs/targets, procedures, supporting evidence, and Make/docs/inventory/audit wiring before reading maintenance evidence.
- Hardened `scripts/check-operator-onboarding.mjs` so the onboarding contract validates schema, safe evidence paths, supporting docs, plan-generator expectations, required Make targets, and Make/docs/inventory/audit wiring before reading onboarding evidence or building the static plan.
- Hardened `scripts/check-ci-contract.mjs` so the CI contract validates schema, safe workflow/supporting-doc evidence paths, marker lists, and Make/docs/inventory/audit wiring before reading `.github/workflows/**`; no workflow behavior was changed.
- Hardened `scripts/check-acceptance-scenarios.mjs` so the acceptance-scenarios contract validates schema, safe evidence paths, planner/generated-plan expectations, scenario ids/markers, supporting evidence, and Make/docs/inventory/audit wiring before reading scenario evidence or building the static plan.
- Hardened `scripts/check-config-precedence.mjs` so the configuration-precedence contract validates schema, safe evidence paths, required docs/targets, SDK/CLI/MCP surface entries, supporting evidence, and Make/docs/inventory/audit wiring before reading precedence evidence.
- Hardened `scripts/check-env-contract.mjs` so the env/config contract validates schema, variable entry shape, secret booleans, safe evidence paths, safety-marker lists, and Make/docs/inventory/audit wiring before reading environment evidence.
- Hardened `scripts/check-examples-contract.mjs` so the examples contract validates schema, safe inventory paths, example lists, forbidden marker/import-prefix lists, secret regexes, supporting contracts, and Make/docs/inventory/audit wiring before scanning runnable SDK examples.
- Hardened `scripts/check-generator-config.mjs` so the generator-config contract validates schema, safe repo evidence paths, Fern config pins, intentional Fern-relative OpenAPI/output paths, required docs, and Make/docs/inventory/audit wiring before reading Fern config evidence.
- Hardened `scripts/check-generator-portability.mjs` so the no-paid-generator/vendor-exit contract validates schema, safe evidence paths, portability plan shape, required targets/docs, boundary ids/markers, supporting evidence, and Make/docs/inventory/audit wiring before scanning portability evidence.
- Promoted `scripts/check-generator-comparison.mjs` to a first-class contract-backed gate with `docs/generator-comparison-contract.json`; the checker now validates schema, safe evidence paths, generated-root candidates, client scan regex, stamped-operation/generated-method thresholds, and Make/docs/inventory/audit wiring before comparing OpenAPI SDK stamps to generated TypeScript methods.
- Promoted `scripts/check-generator-independence.mjs` to a first-class contract-backed gate with `docs/generator-independence-contract.json`; the checker now validates schema, safe evidence paths, wrapper export/file boundaries, CLI/MCP SDK package dependency boundaries, generated-internal import scan rules, product-surface source policy, and Make/docs/inventory/audit wiring before scanning source seams.
- Hardened `scripts/check-sdk-public-api.mjs` so the SDK public API contract validates schema, wrapper package/tsconfig/smoke file inputs, root symbols, subpath symbol maps, tsconfig aliases, stale package marker scan regex/paths, and Make/docs/inventory/audit wiring before comparing package exports and smoke coverage.
- Hardened `scripts/check-sdk-runtime-contract.mjs` so the SDK runtime contract validates schema, safe evidence paths, policy markers, unique runtime seam ids/paths, test paths, package-surface markers, and Make/docs/inventory/audit wiring before scanning hand-written SDK runtime seams.
- Hardened `scripts/check-schema-quality.mjs` so the schema-quality contract validates schema, safe evidence paths, policy/corrected-spec/evidence-ledger/generated-SDK/supporting-evidence marker entries, explicit schema thresholds, required Make targets, and Make/docs/inventory/audit wiring before reading OpenAPI or generated SDK evidence.
- Hardened `scripts/check-operation-coverage.mjs` so the operation-coverage contract validates schema, safe evidence paths, policy markers, report input paths, numeric coverage thresholds, required docs/targets, supporting evidence, and Make/docs/inventory/audit wiring before reading operation inventory or parity reports.
- Hardened `scripts/check-openapi-evidence.mjs` so the OpenAPI evidence contract validates schema, safe evidence paths, policy markers, discrepancy-ledger required findings/status markers, supporting evidence, required Make targets, and Make/docs/inventory/audit wiring before reading the evidence ledger.
- Hardened `scripts/check-upstream-drift.mjs` so the upstream-drift contract validates schema, safe evidence paths, policy markers, lifecycle evidence entries, generated truth surface paths, required Make targets, and Make/docs/inventory/audit wiring before scanning drift evidence.
- Hardened `docs/runtime-support.json` and `scripts/check-runtime-support.mjs` with schema/invariant/path/wiring shape validation so package engine/runtime-doc checks fail fast before reading manifests or docs.
- Hardened `docs/version-policy.json` and `scripts/check-version-policy.mjs` with policy shape validation, explicit product-surface path wiring, safe path checks, package-id invariants, and an explicit product-surface `package` -> manifest `name` mapping.
- Hardened `docs/workflow-cookbook-contract.json` and `scripts/check-workflow-cookbook.mjs` with cookbook/planner/product-surface/supporting-doc shape validation and explicit `workflow-cookbook` Makefile/audit wiring checks before markdown evidence scanning.
- Hardened `docs/examples-matrix-contract.json` and `scripts/check-examples-matrix.mjs` with schema/invariant/path/row/planner/supporting-evidence shape validation before reading Makefile, docs index, quality gates, contract inventory, or audit evidence.
- Hardened `docs/naming-taxonomy-contract.json` and `scripts/check-naming-taxonomy.mjs` with schema/invariant/path/vocabulary/supporting-evidence shape validation and moved the combined vocabulary evidence source list into the contract instead of hardcoding it in the checker.
- Hardened `docs/snippet-safety-contract.json` and `scripts/check-snippet-safety.mjs` with schema/invariant/path/surface/supporting-evidence shape validation and moved forbidden generated/internal import markers into the contract.
- Hardened `docs/security-threat-model-contract.json` and `scripts/check-security-threat-model.mjs` with schema/invariant/path/risk/supporting-evidence shape validation and moved non-Make proof target exceptions into the contract.
- Hardened `docs/decision-records-contract.json` and `scripts/check-decision-records.mjs` with schema/invariant/path/record/heading shape validation plus Makefile/docs-index/quality-gate/contract-inventory/audit wiring checks.
- Promoted `docs-drift` from checker-only configuration to `docs/docs-drift-contract.json`; `scripts/check-docs-drift.mjs` now shape-validates scan roots, exclusions, extensions, regex rules, allowlists, wrapper boundaries, and Makefile/docs/audit wiring before scanning docs.
- Promoted `docs-index-drift` to `docs/docs-index-contract.json`; `scripts/check-doc-index.mjs` now shape-validates required docs links, link existence rules, and Makefile/quality-gate/audit wiring before checking `docs/README.md`.
- Promoted `changelog-drift` to `docs/changelog-coverage-contract.json`; `scripts/check-changelog-entry.mjs` now shape-validates package scope/changelog mappings, required `[Unreleased]` headings, and Makefile/audit wiring before applying git-diff changelog coverage checks.
- Promoted `generated-edit-check` to `docs/generated-edit-contract.json`; `scripts/check-no-generated-edits.mjs` now shape-validates guarded generated/snapshot prefixes, bypass env, regeneration guidance, and audit wiring before applying git-diff guard logic.
- Tightened `docs/secret-hygiene.json` and `scripts/check-secret-hygiene.mjs` so malformed policy shape now fails as `secret hygiene contract shape failed`, with explicit ignore-list and Makefile/audit wiring invariants.
- Tightened `docs/change-impact-contract.json` and `scripts/check-change-impact.mjs` so malformed routing contracts now fail as `Change impact contract shape failed`, with explicit Makefile/audit wiring and declared non-Make target exceptions before evidence scanning.
- Tightened `docs/data-handling-contract.json` and `scripts/check-data-handling.mjs` so malformed data-handling contract shape fails before evidence scanning, with explicit Makefile/audit wiring invariants.
- Tightened `docs/support-bundle-contract.json` and `scripts/check-support-bundle.mjs` so malformed support-bundle shape fails before evidence scanning or generated bundle checks, with explicit Makefile/audit wiring invariants.
- Tightened `docs/release-readiness-contract.json` and `scripts/check-release-readiness.mjs` so malformed release-readiness shape fails before checklist/supporting evidence/generated report checks, with explicit Makefile/audit wiring invariants.
- Tightened `docs/risk-register.json` and `scripts/check-risk-register.mjs` so malformed risk-register shape fails before markdown/evidence/generated report checks, with allowed statuses and Makefile/audit wiring declared in the contract.
- Tightened `docs/operator-toolbox-contract.json` and `scripts/check-operator-toolbox.mjs` so malformed operator-toolbox shape fails before helper ownership/command coverage checks, with explicit Makefile/audit wiring invariants.
- Tightened `docs/performance-budgets.json` and `scripts/check-performance-budgets.mjs` so malformed budget/calibration shape fails before calibration-plan checks or performance measurements, with explicit Makefile/audit wiring invariants.
- Tightened `docs/enterprise-goal-status-contract.json` and `scripts/check-enterprise-goal-status-contract.mjs` so malformed active-goal status shape fails before status-script/generated report checks, with explicit Makefile/audit wiring invariants.
- Tightened `docs/final-proof-command-contract.json` and `scripts/check-final-proof-command-contract.mjs` with explicit command-contract invariants and shape-failure handling before final-proof command/doc/script/receipt evidence scans.
- Tightened `docs/final-proof-preflight-contract.json` and `scripts/check-final-proof-preflight-contract.mjs` with explicit Makefile/audit wiring and shape-failure handling before generated-report/preflight target evidence checks.

- Hardened final proof receipt acceptance so `scripts/check-final-proof-receipt.mjs` now fails malformed `docs/final-proof-receipt-manifest.json` shape with `final proof receipt manifest shape failed` before judging receipt existence/content, and records contract invariants plus Makefile/audit wiring in the manifest/audit evidence.

- Hardened packed-consumer smoke proof so `scripts/pack-consumer-smoke.mjs` now reports malformed `docs/pack-consumer-smoke-contract.json` as `pack consumer smoke contract shape failed`, and the contract/audit evidence now record Makefile plus audit wiring for `make pack-smoke`.

- Hardened developer-environment proof so `scripts/check-developer-environment.mjs` now fails malformed `docs/developer-environment-contract.json` as `developer environment contract shape failed` before reading package/docs evidence, with explicit Makefile/audit wiring recorded in the contract and audit markers.

- Hardened contract-inventory proof so `scripts/check-contract-inventory.mjs` validates `docs/contract-inventory.json` shape and `makefile-audit-wiring` before loading Makefile/docs/audit evidence, failing malformed inventory maps as `Contract inventory shape failed:`.

- Hardened top-level enterprise audit so `scripts/check-enterprise-hardening.mjs` now validates `docs/enterprise-hardening-audit.json` invariants, typed requirement/evidence shape, temporary/final receipt paths, and Makefile wiring before scanning evidence files, failing malformed maps as `enterprise hardening audit shape failed`.

- Added explicit Makefile/audit wiring to `docs/package-contract.json` and `scripts/check-package-contract.mjs` so package manifest, export, bin, pack-file, and publish-safety proof names its owning `make package-contract` gate and audit requirement.

- Added explicit Makefile/audit wiring to legacy contracts that already had shape/content splits: compatibility, dependency-boundary, receipts, and supply-chain now all include `makefile-audit-wiring`, `wiring.makeTarget`, and `wiring.checker` in their JSON contracts, checkers, and enterprise audit evidence.

- Normalized `docs/operator-toolbox-contract.json` with top-level `contractInvariants` while preserving `listInvariants`; `scripts/check-operator-toolbox.mjs` now shape-checks both so the operator helper catalogue matches the rest of the contract family.

- Hardened operation coverage wiring so `scripts/check-operation-coverage.mjs` now enforces exact target/checker/quality-gate/inventory/audit ids and `docs/operation-coverage-contract.json` includes `makefile-audit-wiring`.

- Fixed enterprise audit marker compatibility: `scripts/check-enterprise-hardening.mjs` now accepts both `contains` and legacy `markers` evidence arrays via `evidenceMarkerContract`, so existing audit-map sections are not falsely rejected by the new shape validator.

- Added machine-readable final blocker summaries to the no-network status reports: `scripts/enterprise-goal-status.mjs` now emits `finalBlockingSignalIds` and `finalBlockingRiskIds`, `scripts/release-readiness-report.mjs` now emits `blockingSignalIds` and `blockingRiskIds`, and the enterprise-goal-status, release-readiness, final-proof-preflight, and enterprise-audit contracts preserve those fields.

- Refined blocker summary contracts so generated reports must expose blocker arrays (`finalBlockingSignalIds`/`finalBlockingRiskIds` and `blockingSignalIds`/`blockingRiskIds`) without requiring a fixed blocker-id set that would become stale as final proof blockers are resolved.

- Documented the new blocker-summary fields in operator-facing surfaces: `docs/release-readiness-checklist.md`, `docs/operator-toolbox.md`, and `docs/final-proof-runbook.md` now explain `finalBlockingSignalIds`/`finalBlockingRiskIds` and `blockingSignalIds`/`blockingRiskIds`; release-readiness, operator-toolbox, final-proof-preflight, and enterprise-audit contracts preserve that guidance.

- Corrected final live-proof completion wording: `docs/release-readiness-checklist.md` and `docs/final-proof-runbook.md` now match the final receipt manifest/checker by treating deferred live proof as a draft blocker, not final readiness; release-readiness, final-proof-preflight, and enterprise-audit contracts preserve this wording.

- Removed stale final-readiness wording that treated live-proof deferral like an acceptable final state. `docs/support-runbook.md`, `docs/security-threat-model.md`, `docs/quickstart-receipt.md`, `docs/release-support-policy.md`, and the hardening plan now distinguish draft live-proof deferral from final readiness, which requires completed sandbox live proof; owner contracts and enterprise-audit evidence preserve the distinction.

- Removed stale performance-finalization wording from `docs/release-readiness-checklist.md`: final readiness now requires measured calibration plus `Budget status: tightened`, not an explicit justification for provisional budgets; release-readiness contract and enterprise-audit evidence preserve that final-state requirement.

- Clarified maintenance planning around performance budgets: `scripts/maintenance-plan.mjs` now says routine maintenance may leave budgets provisional, but final readiness requires measured tightening; maintenance-playbook contract and enterprise-audit evidence preserve that distinction.

- Tightened residual-risk final-readiness wording in the release decision helper, live-test guide, and final proof runbook: carried/deferred risk belongs in draft or support packets with owner/reason/closure gates, while a completed final proof receipt must end with `Residual risk status: none` and no blocking residual risk.
- Locked the residual-risk wording into live-safety, final-proof preflight/command, release-readiness, and enterprise-audit contracts so deferred live proof and carried residual risks remain draft/support states rather than final-ready states.
- Corrected operator onboarding broad-readiness guidance so final product readiness requires completed live sandbox proof and no blocking residual risks, not live deferral; operator-onboarding, user-docs, and enterprise-audit contracts preserve the boundary.
- Tightened generated no-network status/readiness report guidance so `DEFER_LIVE_REASON` remains available for draft receipt capture, but reports now state live deferral is draft-only and must be replaced before `make final-proof-final`; owning contracts/audit preserve the phrase.
- Added the same draft-only live-deferral stop condition to onboarding and maintenance helper plans, and locked it into operator-onboarding/maintenance contracts plus enterprise-audit evidence.
- Corrected the enterprise-audit marker ownership for the draft-only deferral guardrail: it now belongs to operator onboarding, not OpenAPI evidence.
- Corrected the temporary-context lifecycle across operator/docs/helper surfaces: keep the file through evidence capture and receipt drafting, remove it after receipt completion and immediately before final acceptance, then run `make final-proof-final`; owner contracts and enterprise-audit evidence now preserve that sequence.
- Tightened final-proof receipt-filled report details so status/readiness reports require final live completion rather than completed/deferred wording; contracts and audit evidence preserve final-only live completion while draft deferral remains separately documented.
- Updated the unchecked enterprise hardening plan step so temporary-context removal happens before final acceptance and is followed by `make final-proof-final`, matching the receipt checker contract.
- Corrected an older context breadcrumb so it no longer implies deferred live proof can satisfy final acceptance; deferral remains draft-only and final acceptance requires `Live proof status: completed`.
- Corrected `docs/final-proof-runbook.md` completion criteria so `make final-proof-receipt-check` is listed after temporary context removal, matching `mustBeAbsentOnDisk`; final-proof command contract and audit evidence preserve that order.
- Tightened `final-proof-pending` in the risk register so the hardening objective remains open until the receipt is filled, the temporary context is removed, and `make final-proof-final` passes; release-readiness, maintenance, and enterprise-audit contracts preserve that summary.
- Expanded the unchecked enterprise hardening plan completion step so it includes `make performance-receipt`, `LIVE=1 make final-proof-draft`, and manual final receipt filling before temporary-context removal. Release-readiness guidance now says live deferral is draft-only and final receipt checking runs after temporary context removal.
- Added enterprise-audit markers for the expanded final completion sequence and release-readiness wording: performance receipts and `LIVE=1 make final-proof-draft` are now preserved in the active plan evidence, and release-readiness audit evidence preserves draft-only deferral plus post-temp-removal receipt checking.
- Clarified the active plan's final acceptance step: after removing the temporary context file, the final proof receipt must record the temporary-context cleanup section plus exact final audit command/output before `make final-proof-final`.
- Added the missing no-network preflight and audit commands to the active completion block and no-network goal-status guidance: final completion now routes through `make final-proof-preflight`, `make enterprise-audit`, `make perfect-fast`, `make performance-receipt`, `make perfect-full`, `make perfect-live`, then `make final-proof-draft` before final receipt completion.
- Added `make perfect-live` to the generated release-readiness report's required proof list so it matches the active plan and runbook sequence; release-readiness contract and enterprise-audit evidence now preserve the live proof command as a first-class proof id.
- Reordered the generated release-readiness proof list to match the final proof runbook and active plan: enterprise audit, perfect-fast, performance receipt, perfect-full, perfect-live, final-proof-draft, receipt check, final acceptance.
- Expanded `docs/operator-toolbox.md` from an abbreviated draft/check/final split to the full final-proof evidence sequence: final-proof preflight, enterprise audit, perfect-fast, performance receipt, perfect-full, perfect-live, draft receipt, receipt check, final acceptance. Operator-toolbox contract and enterprise-audit evidence preserve the sequence.
- Tightened no-network status/readiness report handling for `docs/performance-baseline-latest.json`: the reports now parse the latest receipt and mark it blocking when it has `failures` or any measurement without `ok: true`, instead of treating file existence as a successful baseline.
- Current-state note after accidental shell-backtick proof attempt: `docs/final-proof-receipt.md` and `docs/performance-baseline-latest.json` now exist but are failed draft artifacts, not final evidence. The receipt contains failed command output and placeholders; the performance baseline contains a failed `mcp-tools-list` measurement caused by missing `mcp/node_modules/@modelcontextprotocol/sdk/client/index.js`.
- Fixed two file-state failures exposed by the failed draft: `docs/enterprise-hardening-audit.json` no longer has duplicate requirement ids or duplicate `contains`/`markers` entries, and `docs/openapi-evidence-policy.md` now contains the exact `Generated TypeScript is an output` marker required by its contract.
- Tightened enterprise-goal-status and release-readiness reports so a latest performance baseline with `failures` or any measurement without `ok: true` is reported as blocking rather than present/passed; contracts and audit evidence preserve `performanceReceiptStatus`, `failedMeasurements`, and `successful latest receipt` markers.
- Tightened enterprise-goal-status and release-readiness reports so a current failed draft `docs/final-proof-receipt.md` is reported as blocking when it contains `NOT COMPLETE`, `Result: failed`, non-zero `Exit status`, draft-blocker, or empty-placeholder markers, instead of merely reporting the file as present.
- Tightened `scripts/risk-status-report.mjs` so its performance-baseline file-state signal also parses `docs/performance-baseline-latest.json` and reports a failed latest receipt as `blocking`, with details preserved in `fileSignalDetails`.
- Tightened `scripts/risk-status-report.mjs` so its final-proof receipt file-state signal also reports a failed draft `docs/final-proof-receipt.md` as `blocking`, with failed-draft marker details preserved in `fileSignalDetails`.
- Tightened `scripts/check-risk-register.mjs` and `docs/risk-register.json` so the generated risk-status report contract now requires `fileSignalDetails` keys for both `finalProofReceipt` and `performanceBaselineLatest`, not only high-level file-signal statuses.
- Tightened generated status/readiness report contracts so `performance-baseline` plus `performance-calibration` / `performance-budget-calibration` are required signal ids, not optional source-text details.
- Tightened `scripts/check-risk-register.mjs` again so required `fileSignalDetails` values must be non-empty strings, guarded by `requiredFileSignalDetailKeysAreNonEmpty: true` in `docs/risk-register.json`.
- Tightened `scripts/check-final-proof-receipt.mjs` so final receipt acceptance also parses the latest performance receipt from `docs/performance-budgets.json` `calibrationPolicy.receiptPath` and rejects JSON receipts with failures or failed measurement entries.
- Added `budget.latestReceipt` to `docs/final-proof-receipt-manifest.json` and hardened `scripts/check-final-proof-receipt.mjs` so the latest-performance-receipt rule is an explicit manifest contract that cannot be softened away from `calibrationPolicy.receiptPath`, JSON object shape, required measurements, no failures, and no failed measurements.
- Updated `docs/final-proof-receipt.template.md` so operators see that pasted performance output is not enough: the latest JSON receipt at `calibrationPolicy.receiptPath` must also have measurements, no failures, and no failed measurement entries.
- Aligned `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` with the stricter final checker/risk report performance receipt semantics: every measurement must have `ok: true`; missing or non-true `ok` values are counted as failed measurements.
- Tightened `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` again so malformed `docs/performance-baseline-latest.json` is reported as `blocking` invalid receipt JSON instead of collapsing to a missing baseline.
- Tightened `scripts/risk-status-report.mjs` the same way: it now uses `readJsonState` for `docs/performance-baseline-latest.json`, preserves parse errors in `fileSignalDetails`, and reports malformed latest performance receipts as blocking invalid receipt JSON.
- Tightened final performance proof again: `docs/final-proof-receipt-manifest.json` now requires the latest JSON receipt's embedded `calibrationPolicy.status` to match the required calibrated budget status, and `scripts/check-final-proof-receipt.mjs` enforces it via `readDottedField`. Operators now need a successful `make performance-receipt` after budget calibration.
- Updated `scripts/performance-calibration-plan.mjs` and `docs/performance-budgets.json` so the no-network calibration plan exposes the latest receipt's embedded `calibrationPolicyStatus` and `calibrationPolicyFinalStatus`, and tells operators to rerun `make performance-receipt` after calibration when the latest receipt is stale.
- Tightened `scripts/enterprise-goal-status.mjs`, `scripts/release-readiness-report.mjs`, and `scripts/risk-status-report.mjs` so successful latest performance receipts include embedded `calibrationPolicy.status` in their detail, and become blocking when budgets are calibrated but the latest receipt still embeds a stale non-calibrated status.
- Tightened final performance proof against stale budget-schema receipts: `docs/final-proof-receipt-manifest.json` now requires the latest JSON receipt's `budgetsSchemaVersion` to match the current `docs/performance-budgets.json` `schemaVersion`, and `scripts/check-final-proof-receipt.mjs` rejects mismatches.
- Tightened `scripts/enterprise-goal-status.mjs`, `scripts/release-readiness-report.mjs`, and `scripts/risk-status-report.mjs` so passing latest performance receipts are also blocking when their `budgetsSchemaVersion` differs from the current `docs/performance-budgets.json` `schemaVersion`.
- Updated `scripts/performance-calibration-plan.mjs` so the no-network calibration plan displays the current budget schema version, displays the latest receipt's `budgetsSchemaVersion`, and tells operators to rerun `make performance-receipt` when the latest receipt was generated against a stale budget schema.
- Tightened `docs/performance-budgets.json` and `scripts/check-performance-budgets.mjs` so the generated performance calibration plan contract requires a top-level `budgetSchemaVersion` field and checks that it mirrors the current performance budget `schemaVersion`.
- Added deterministic `budgetFingerprint` writing to `scripts/check-performance-budgets.mjs` performance receipts, and added `budgetFingerprint` to the required latest-receipt calibration-plan contract keys.
- Tightened final receipt acceptance so `docs/final-proof-receipt-manifest.json` requires the latest JSON receipt's `budgetFingerprint` to match the current `docs/performance-budgets.json` content fingerprint, and `scripts/check-final-proof-receipt.mjs` rejects mismatches.
- Updated `scripts/performance-calibration-plan.mjs` and `docs/performance-budgets.json` so the no-network calibration plan displays and contract-checks the current `budgetFingerprint`, displays the latest receipt's fingerprint, and tells operators to rerun `make performance-receipt` when the latest receipt fingerprint is stale.
- Tightened `scripts/check-performance-budgets.mjs` so the generated calibration plan's top-level `budgetFingerprint` must mirror the current `docs/performance-budgets.json` content fingerprint.
- Tightened `scripts/enterprise-goal-status.mjs`, `scripts/release-readiness-report.mjs`, and `scripts/risk-status-report.mjs` so passing latest performance receipts are blocking when their `budgetFingerprint` differs from the current `docs/performance-budgets.json` content fingerprint.
- Added shared `scripts/budget-fingerprint.mjs` with `stableJson` and `budgetFingerprint`, then switched performance budget, final receipt, status, readiness, risk, and calibration-plan scripts to import the shared helper instead of carrying duplicate fingerprint implementations.
- Cleaned the performance-budget enterprise-audit evidence so `scripts/performance-calibration-plan.mjs` is checked only for calibration-plan markers it actually owns, and added explicit audit evidence for the shared budget fingerprint helper.
- Expanded `scripts/enterprise-goal-status.mjs` so the no-network active-goal report exposes the full ordered final proof command sequence, not only draft/check/final: preflight, enterprise audit, perfect-fast, performance receipt, perfect-full, perfect-live, draft receipt, receipt check, and final acceptance. `docs/enterprise-goal-status-contract.json`, `scripts/check-enterprise-goal-status-contract.mjs`, and enterprise-audit evidence now preserve the generated `finalProofCommandOrder`, all command entries, and the added command-availability signal ids.
- Expanded `scripts/release-readiness-report.mjs` so release preflight output also publishes a single `requiredFinalProofCommandOrder` and Markdown `Full final proof order`, merging required preflight and required proof into the same machine-checked sequence. `docs/release-readiness-contract.json`, `scripts/check-release-readiness.mjs`, and enterprise-audit evidence now preserve that order.
- Tightened the combined final-proof preflight contract so `docs/final-proof-preflight-contract.json` now requires ordered proof-chain arrays from both generated reports: `finalProofCommandOrder` on the enterprise-goal-status report and `requiredFinalProofCommandOrder` on the release-readiness report. `scripts/check-final-proof-preflight-contract.mjs` validates those `requiredOrderedArrays`, and enterprise-audit evidence preserves the combined preflight coverage.
- Added ordered proof-chain coverage to the contract inventory map: `scripts/contract-inventory-report.mjs` now scans inventoried contract files for final proof ordering markers, reports `orderedProofChainCoverage`, and counts missing required ordered-chain entries as inventory invariant failures. `docs/contract-inventory.json`, `scripts/check-contract-inventory.mjs`, `docs/contract-inventory-policy.md`, and enterprise-audit evidence now require release-readiness, enterprise-goal-status-contract, and final-proof-preflight-contract to remain visible as proof-order-owning entries.
- Strengthened risk-status reporting with a generated `riskRoutingSummary` (`finalReadinessRiskStatus`, blocking count, visible non-blocking count, blocked-upstream count, accepted count) so final-readiness risk routing has a single machine-readable summary in addition to the exact risk ID lists. `docs/risk-register.json`, `scripts/check-risk-register.mjs`, `docs/risk-register.md`, and enterprise-audit evidence now preserve that summary.
- Strengthened the support bundle so `scripts/create-support-bundle.mjs` includes a compact no-network `readinessContext` from enterprise-goal-status, release-readiness, risk-status, and contract-inventory reports. The bundle now carries final blocker IDs, ordered proof command chains, risk routing summary, and ordered proof-chain inventory coverage without capturing secret values or running proof gates. `docs/support-bundle-contract.json`, `scripts/check-support-bundle.mjs`, `docs/support-runbook.md`, and enterprise-audit evidence now preserve the shape.
- Strengthened issue/support intake so bugs and PRs preserve the support bundle's `readinessContext` instead of only asking for a generic bundle. `docs/issue-intake-contract.json` now declares `readinessContextFields`; `scripts/check-issue-intake.mjs` enforces those markers in the intake policy, bug report template, and PR template; `docs/issue-intake-policy.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/pull_request_template.md`, and enterprise-audit evidence now require `finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage` when readiness/proof routing is relevant.
- Strengthened operator onboarding so non-coder/future-agent bootstrap teaches the support bundle's `readinessContext` and generated plans preserve it. `docs/operator-onboarding.md` now explains `finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage`; `scripts/onboarding-plan.mjs` includes those fields in full-readiness/support stop conditions; `docs/operator-onboarding-contract.json` adds `requiredGoalTextMarkers`; `scripts/check-operator-onboarding.mjs` validates those markers in generated goals; enterprise-audit evidence preserves the behavior.
- Strengthened maintenance planning so release rehearsal and rollback workflows preserve support-bundle `readinessContext`. `docs/maintenance-playbook.md` now has a readiness-context maintenance rule; `scripts/maintenance-plan.mjs` adds support-bundle generation plus `finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage` requirements to release/rollback cadences; `docs/maintenance-playbook-contract.json` adds `requiredCadenceTextMarkers`; `scripts/check-maintenance-playbook.mjs` validates those markers in generated cadence plans; enterprise-audit evidence preserves the behavior.
- Strengthened release decision planning so tag/npm/workflow/local-tarball decisions carry support-bundle readiness context before being treated as safe. `scripts/release-decision-plan.mjs` now emits a `readinessContextChecklist` with the support-bundle command and required `readinessContext`, `finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage` fields; `docs/release-readiness-contract.json` and `scripts/check-release-readiness.mjs` validate that generated decision plan; `docs/release-readiness-checklist.md` and enterprise-audit evidence preserve the release-decision boundary.

## 2026-05-27 - Mutation safety readiness-context bridge

- Hardened `docs/mutation-safety-contract.json` with a `readinessContext` section so ambiguous write failures must preserve `readinessContext`, `finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage` markers.
- Updated `scripts/check-mutation-safety.mjs` to validate the new readiness-context contract shape and require the mutation policy to document those fields plus `ambiguousMutationSignalIds` handoff behavior.
- Updated `docs/mutation-safety-policy.md` with the operator/support rule: ambiguous non-idempotent writes that may affect final proof need an `ambiguousMutationSignalIds` trail rather than silent retry.
- No intentional tests, builds, proof gates, final audits, dependency installs, or git commands were run in this pass.

## 2026-05-27 - Generator postgen escape-hatch hardening

- Hardened `docs/generator-independence-contract.json` with a `postgenEscapeHatch` section so generated-output mutation scripts must be registered and generated-core decisions must document the allowed escalation order.
- Updated `scripts/check-generator-independence.mjs` to validate the new postgen escape-hatch contract, require ADR markers, and scan script directories for unregistered postgen/fix-generated/patch-generated/manual-generated mutator names.
- Updated `docs/decisions/0002-generated-core-boundary.md` to state the enterprise rule: prefer upstream OpenAPI/generator fixes first, use durable wrapper seams for product behavior, and treat deterministic post-generation cleanup as a registered escape hatch only.
- No intentional tests, builds, proof gates, final audits, dependency installs, or git commands were run in this pass.

## 2026-05-27 - Local/free generator portability hardening

- Hardened `docs/generator-portability-contract.json` with a `localReproducibility` section so generator proof cannot require API tokens, hosted logins, paid hosted accounts, or paid/hosted generator dependencies in package manifests.
- Updated `scripts/check-generator-portability.mjs` to validate local-reproducibility shape, require account-gated failure markers in the portability plan, and fail if wrapper/CLI/MCP package manifests depend on forbidden paid/hosted generator packages.
- Updated `docs/generator-portability-plan.md` with an account-gated generator failure policy: `Upgrade Required`, quota, entitlement, workspace, and account eligibility errors are environment constraints, not OpenAPI defects, and must not trigger buying or migrating to paid tooling to satisfy proof.
- Updated the `generator-portability` entry in `docs/enterprise-hardening-audit.json` to expect the new account-gated/local-reproducibility markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, or git commands were run in this pass.

## 2026-05-27 - Cross-surface workflow claim hardening

- Updated `scripts/generate-product-surface.mjs` so every workflow claim now carries explicit `surfaceAvailability`, `proofMode`, `recovery`, and `intentionalGaps` metadata across SDK, CLI, TypeScript MCP, and GOCLMCP surfaces.
- Regenerated `docs/product-surface.json` and `docs/product-surface.md` with the new workflow-claim columns/fields.
- Hardened `docs/workflow-cookbook-contract.json` and `scripts/check-workflow-cookbook.mjs` so workflow metadata must include those fields, recovery arrays must be non-empty, and any empty surface array must have an `intentionalGaps` explanation.
- Updated the `workflow-cookbook` entry in `docs/enterprise-hardening-audit.json` to expect the new workflow-claim markers.
- Ran only `node scripts/generate-product-surface.mjs --write` as an implementation generation step. No intentional tests, builds, proof gates, final audits, dependency installs, or git commands were run in this pass.

## 2026-05-27 - Documentation truth-surface claim hardening

- Hardened `docs/docs-quality-contract.json` with a `productSurfaceClaims` section so user-facing workflow documentation claims must be backed by `docs/product-surface.json` workflow metadata.
- Updated `scripts/check-docs-quality.mjs` to validate product-surface claim shape and fail when workflows lack `surfaceAvailability`, `proofMode`, non-empty `recovery`, or an `intentionalGaps` explanation for an empty SDK/CLI/TS MCP/GOCLMCP surface.
- Updated `docs/docs-quality-policy.md` with the `Generated claim backing` rule so READMEs, cookbook, onboarding notes, and release checklists must agree with generated workflow metadata.
- Updated the `docs-quality` entry in `docs/enterprise-hardening-audit.json` to expect the new product-surface claim markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms contract hardening

- Added `docs/axioms-contract.json` so all 10 SDK/CLI/MCP/OpenAPI axioms are machine-checkable and mapped to concrete gates, contracts, or evidence surfaces.
- Added `scripts/check-axioms-contract.mjs` to validate axiom document markers, exactly 10 axiom entries, supporting evidence ids, safe evidence paths, docs index wiring, quality-gate wiring, enterprise audit wiring, and `perfect-fast`/`perfect-full` inclusion.
- Wired `make axioms-contract` into `Makefile`, `make help`, `perfect-fast`, and `perfect-full`.
- Updated `docs/README.md`, `docs/quality-gates.md`, and the `axioms` entry in `docs/enterprise-hardening-audit.json` so the axioms are discoverable as an executable contract rather than unmanaged prose.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms inventory/discovery wiring

- Added `docs/axioms-contract.json` and `scripts/check-axioms-contract.mjs` to make the 10 SDK/CLI/MCP/OpenAPI axioms executable and evidence-backed.
- Wired `make axioms-contract` into `Makefile`, help output, `perfect-fast`, and `perfect-full`.
- Added the axioms contract to `docs/README.md`, `docs/quality-gates.md`, `docs/docs-index-contract.json`, and `docs/contract-inventory.json` so it is discoverable through docs index, quality-gate, and contract-inventory surfaces.
- Updated `docs/enterprise-hardening-audit.json` so both the `axioms` evidence and the contract-inventory evidence expect the new axioms contract/checker wiring.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms documentation-governance wiring

- Added `docs/axioms-contract.json` to `docs/user-docs-contract.json` so user-facing documentation checks require the axioms contract to remain discoverable and tied to non-coder reproducibility evidence.
- Added `docs/axioms.md` and `docs/axioms-contract.json` to `docs/docs-quality-contract.json` so documentation quality treats the axioms as governed product docs, not unmanaged guidance prose.
- Updated the `user-docs` and `docs-quality` entries in `docs/enterprise-hardening-audit.json` to expect the new axioms-contract markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms operator-toolbox proof-boundary wiring

- Updated `docs/operator-toolbox.md` so `make axioms-contract` appears in the proof-boundary gate list, not as a no-network helper.
- Updated `docs/operator-toolbox-contract.json` so the toolbox must continue surfacing `make axioms-contract` for operators.
- Updated the `operator-toolbox` entry in `docs/enterprise-hardening-audit.json` to expect the new axioms proof-boundary marker.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms required inventory entry

- Promoted `axioms-contract` into `docs/contract-inventory.json` `reportGenerator.generatedReport.requiredEntryIds`, so the contract-inventory report must treat the axioms contract as a required hardening entry rather than a best-effort inventory row.
- Left `requiredOrderedProofChainEntries` unchanged because that list is currently scoped to final-proof readiness sequencing (`release-readiness`, `enterprise-goal-status-contract`, `final-proof-preflight-contract`), while axioms are enforced through `perfect-fast`/`perfect-full` and docs/operator proof-boundary wiring.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms final-proof receipt wiring

- Updated `scripts/run-final-proof.mjs` so the draft final-proof receipt now runs `make axioms-contract` and writes a dedicated `Axioms contract proof` section between artifact audit and deterministic local proof.
- Updated `docs/final-proof-runbook.md` and `docs/final-proof-receipt.template.md` so final proof explicitly captures `make axioms-contract` output instead of relying only on its inclusion inside `perfect-fast` and `perfect-full`.
- Updated `docs/final-proof-receipt-manifest.json` so final receipt checking requires the `## Axioms contract proof` section, the `make axioms-contract` command, and success evidence for that section.
- Updated `docs/final-proof-command-contract.json`, `docs/release-readiness-checklist.md`, `docs/risk-register.md`, and the `final-proof-command-contract` evidence in `docs/enterprise-hardening-audit.json` to preserve the new axioms proof requirement.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms final-proof status/readiness ordering

- Updated `scripts/enterprise-goal-status.mjs` so final proof command ordering and command-availability signals include `make axioms-contract` between `make enterprise-audit` and `make perfect-fast`.
- Updated `docs/enterprise-goal-status-contract.json` and its enterprise-audit evidence so the no-network active-goal status report must preserve `axiomsContract`, `axioms-contract-command`, and `make axioms-contract` markers.
- Updated `scripts/release-readiness-report.mjs` so required proof and full final-proof order include the axioms contract gate.
- Updated `docs/release-readiness-contract.json` and its enterprise-audit evidence so release-readiness reporting and required targets include `axioms-contract` / `make axioms-contract`.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git commands were run in this pass.

## 2026-05-27 - Axioms change-impact routing
- Added a dedicated `axioms-contract` change-impact scope for `docs/axioms.md`, `docs/axioms-contract.json`, and `scripts/check-axioms-contract.mjs`.
- Routed axioms edits to `make axioms-contract` plus docs-quality, user-docs, docs-index, contract-inventory, change-impact, and enterprise-audit checks.
- Included `axioms-contract` in the default generated change-impact plan so future agents see it without needing path-specific inputs.
- Updated enterprise audit evidence so the change-impact contract and plan generator must keep the axioms route visible.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-table rewrites, or git operations were run for this slice.

## 2026-05-27 - Docs drift placeholder polish
- Replaced the source wrapper changelog's `[0.1.0] -- TBD (initial publish)` heading with a concrete `2026-05-24` date, matching the first dated package history boundary.
- Kept generated TypeDoc output untouched; `docs/api/` remains regenerated output, not a hand-edited source of truth.
- Narrowly allowlisted `docs/final-proof-receipt-manifest.json` for the docs-drift `TODO`/`TBD` rule because that manifest intentionally names those strings as forbidden final-receipt markers.
- Updated enterprise audit evidence so the docs-drift checker preserves the final-proof manifest allowlist.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated-doc rewrites, or git operations were run for this slice.

## 2026-05-27 - Package metadata contract hardening
- Strengthened `docs/package-contract.json` so SDK, CLI, and MCP package manifests must preserve `type`, `license`, `engines.node`, repository URL/directory, bugs URL, homepage, and meaningful descriptions.
- Added wrapper-specific `sideEffects: false` contract coverage so the library package keeps its tree-shaking signal.
- Updated `scripts/check-package-contract.mjs` to enforce those metadata fields alongside existing files/bin/export/prepublish checks.
- Updated enterprise audit evidence for the package contract to require the new metadata markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, package rewrites, or git operations were run for this slice.

## 2026-05-27 - PublishConfig safety contract hardening
- Strengthened `docs/package-contract.json` so SDK, CLI, and MCP package manifests must preserve exact `publishConfig.access: public` and `publishConfig.provenance: true` values, not just any publishConfig object.
- Updated `scripts/check-package-contract.mjs` to validate the expected publish access/provenance shape and fail if package manifests weaken those publish-safety flags.
- Updated enterprise audit evidence for the package contract to require the new publishConfig markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, package rewrites, or git operations were run for this slice.

## 2026-05-27 - Dependency lockfile reproducibility contract
- Strengthened `docs/dependency-boundary.json` with per-package `package-lock.json` paths and npm lockfile version 3 expectations for SDK, CLI, and MCP packages.
- Updated `scripts/check-dependency-boundary.mjs` to require each lockfile, verify `lockfileVersion`, and compare lockfile root name/version against the matching package manifest.
- Updated `docs/dependency-policy.md` so human dependency-update guidance matches the machine contract: manifest and lockfile move together.
- Updated enterprise audit evidence for the dependency-boundary requirement to preserve the lockfile reproducibility markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, package rewrites, or git operations were run for this slice.

## 2026-05-27 - Supply-chain publish access alignment
- Updated `docs/supply-chain-policy.md` so package supply-chain rules require both `publishConfig.access: public` and `publishConfig.provenance: true`, while preserving the no-default-publish policy.
- Strengthened `docs/supply-chain-contract.json` so the policy must mention public publish access and the supporting package contract must expose `expectedPublishConfig`.
- Updated enterprise audit evidence for the supply-chain requirement to preserve the access/provenance alignment markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, package rewrites, or git operations were run for this slice.

## 2026-05-27 - Dependency license range ledger
- Strengthened `docs/dependency-license-contract.json` so each runtime dependency ledger entry includes the exact manifest version range, not only name/license/purpose.
- Updated `scripts/check-dependency-license.mjs` to validate dependency range shape and fail when a runtime dependency version range in `package.json` drifts from the license ledger.
- Updated `docs/dependency-license-policy.md` with a `Manifest range` column so human review sees the same dependency-version boundary as the checker.
- Updated enterprise audit evidence for the dependency-license requirement to preserve range-ledger markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, package rewrites, or git operations were run for this slice.

## 2026-05-27 - Breaking-change version-policy bridge
- Strengthened `docs/breaking-change-review-contract.json` with a `version-and-release-surface` entry pointing at `docs/version-policy.json` and added `make version-policy` to required breaking-change proof targets.
- Updated `scripts/check-breaking-change-review.mjs` so the breaking-change contract requires the new `typed-version-policy-evidence` invariant.
- Updated `docs/breaking-change-review-policy.md` so public-surface changes must answer the version-policy outcome and run/cite `make version-policy`.
- Updated enterprise audit evidence for the breaking-change-review requirement to preserve the version-policy bridge markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Compatibility deprecation-window contract
- Strengthened `docs/compatibility-contract.json` with a typed `deprecationWindow` section and added `make breaking-change-review` to compatibility proof targets.
- Updated `scripts/check-compatibility-contract.mjs` to validate deprecation-window shape and require compatibility-policy markers for the old-path window, migration/changelog notes, breaking-change review, and final proof stack.
- Updated `docs/compatibility-policy.md` with an explicit compatibility-window section: keep deprecated public paths until the next major version unless maintainer approval and migration receipt exist.
- Updated enterprise audit evidence for compatibility-contract to preserve the deprecation-window and breaking-change linkage markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Observability redaction evidence contract
- Strengthened `docs/observability-contract.json` with typed redaction observability evidence that ties observability output to data-handling and support-bundle redaction rules.
- Added required Make targets for `observability`, `data-handling`, `support-bundle`, `receipts-contract`, and `receipt-examples` so observability proof cannot drift away from safe receipts and bundles.
- Updated `scripts/check-observability-contract.mjs` to validate the new `redaction` evidence section and required Make-target list.
- Updated `docs/observability-policy.md` proof-gate ordering to surface data-handling/support-bundle checks directly after observability.
- Updated enterprise audit evidence for the observability-contract requirement to preserve redaction and required-target markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Diagnostics no-network evidence contract
- Strengthened `docs/diagnostics-contract.json` with typed `noNetworkEvidence` for SDK diagnostics, CLI doctor, and MCP doctor resource files.
- Added per-file forbidden network/client markers such as `fetch(`, `new ClockifyApiClient`, `node:http`, and `node:https` so diagnostics remain local readiness checks rather than live probes.
- Updated `scripts/check-diagnostics-contract.mjs` to validate the new evidence shape and fail if diagnostics implementations contain forbidden network/client markers.
- Updated `docs/diagnostics-policy.md` with an explicit no-network proof section that separates diagnostic next steps from work performed by diagnostics.
- Updated enterprise audit evidence for diagnostics-contract to preserve the no-network evidence markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Quickstart receipt template and copy-paste safety
- Strengthened `docs/quickstart-receipt-contract.json` with a typed `receiptTemplate` section so required quickstart receipt fields cannot disappear from the operator quickstart.
- Added quickstart-specific forbidden markers for risky copied commands or real-looking secrets, including `npm publish`, `CLOCKIFY_API_KEY=real`, `CLOCKIFY_WORKSPACE_ID=real`, `PASTE TOKEN`, and bearer headers.
- Updated `scripts/check-quickstart-receipt.mjs` to validate required receipt fields and fail if forbidden quickstart markers appear in the quickstart receipt document.
- Added a `Copy-paste safety` section to `docs/quickstart-receipt.md` that separates local diagnostics/mock/sandboxed live probes from mutation, publication, customer workspace, and raw-secret commands.
- Updated enterprise audit evidence for quickstart-receipt to preserve the template and copy-paste safety markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Support-bundle quickstart diagnostics summary
- Strengthened `docs/support-bundle-contract.json` with required no-network diagnostic surfaces (SDK, CLI, MCP) and required safe command hints, including `make quickstart-receipt`.
- Updated `scripts/check-support-bundle.mjs` so generated support bundles must include SDK/CLI/MCP diagnostics with `network: "none"` and quickstart-safe command hints.
- Added a `Quickstart and diagnostics handoff` section to `docs/support-runbook.md` so first-run support packets preserve local diagnostics, mock proof, and live-sandbox proof boundaries.
- Updated enterprise audit evidence for support-bundle to preserve the quickstart/diagnostics summary markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Issue-intake quickstart diagnostics context
- Strengthened `docs/issue-intake-contract.json` with typed `quickstartDiagnosticsFields` so bug reports, PRs, and intake policy preserve quickstart receipt and diagnostic-surface context.
- Updated `scripts/check-issue-intake.mjs` to require those quickstart diagnostics markers in the intake policy, bug report template, and PR template.
- Updated `docs/issue-intake-policy.md` so first-run/setup issues name whether `make quickstart-receipt` was used and which diagnostic surface produced evidence: `clockifyDiagnostics()`, `clk115 doctor --json`, or `clockify://mcp/doctor`.
- Updated GitHub bug and PR templates to collect quickstart/diagnostics context and safe command hints without env values.
- Updated enterprise audit evidence for issue-intake to preserve the quickstart diagnostics markers.
- No intentional tests, builds, proof gates, final audits, dependency installs, generated rewrites, or git operations were run for this slice.

## 2026-05-27 - Acceptance first-run diagnostics scenario

- Added `first-run-diagnostics-support` as a no-network acceptance scenario in `scripts/acceptance-plan.mjs`.
- Required the acceptance contract and policy doc to cover `clockifyDiagnostics()`, `clk115 doctor --json`, `clockify://mcp/doctor`, `make quickstart-receipt`, `make support-bundle`, `safeCommandHints`, and `readinessContext` before live readiness claims.
- Updated the enterprise hardening audit so acceptance-scenario evidence includes the planner and first-run support handoff markers.
- No validation was intentionally run in this slice; run `make acceptance-scenarios` and the broader requested gates only when explicitly approved.

## 2026-05-27 - Workflow cookbook first-run support workflow

- Added `first-run-support` to `scripts/workflow-plan.mjs` as the no-network diagnostics/support-handoff workflow for setup, auth, runtime, and support-readiness issues.
- Added a `First-run diagnostics and support handoff` section to `docs/workflow-cookbook.md` covering `clockifyDiagnostics()`, `clk115 doctor --json`, `clk115 status --json`, `clockify://mcp/doctor`, `make quickstart-receipt`, `make support-bundle`, `readinessContext`, and `safeCommandHints`.
- Updated `docs/workflow-cookbook-contract.json`, `scripts/check-workflow-cookbook.mjs`, `docs/acceptance-scenarios-contract.json`, and `docs/enterprise-hardening-audit.json` so the first-run workflow is contract/audit visible.
- Updated `scripts/generate-product-surface.mjs`, `docs/product-surface.json`, and `docs/product-surface.md` manually so product-surface workflow parity includes `first-run-support` without running `make product-surface` in this no-validation slice.
- No validation was intentionally run in this slice; likely focused checks, if approved, are `make workflow-cookbook`, `make acceptance-scenarios`, and `make product-surface-drift`.

## 2026-05-27 - First-run support discoverability docs pass

- Updated `docs/README.md` so the workflow cookbook row and quality-gate row describe first-run support as part of the cookbook surface, not only generic user jobs.
- Updated `docs/quality-gates.md` so `make workflow-cookbook` and `make workflow-plan` mention first-run support in their operator-facing descriptions.
- Updated `docs/user-docs-contract.json` so user-doc coverage for `docs/workflow-cookbook.md` requires `First-run diagnostics and support handoff`, `clockifyDiagnostics()`, `clk115 doctor --json`, `clockify://mcp/doctor`, and `safeCommandHints`.
- Updated `docs/enterprise-hardening-audit.json` user-docs evidence so the top-level audit preserves the new first-run support user-doc markers.
- No validation was intentionally run in this slice; focused checks, if approved, are `make user-docs`, `make docs-index-drift`, `make workflow-cookbook`, and `make enterprise-audit`.

## 2026-05-27 - First-run support change-impact routing

- Added a dedicated `first-run-support` change-impact scope in `docs/change-impact-contract.json` for workflow cookbook, workflow planner, product-surface generator/output, acceptance contract, and user-doc contract changes.
- Added path probes and scope requirement expectations so edits to `scripts/workflow-plan.mjs`, `docs/workflow-cookbook-contract.json`, and `scripts/generate-product-surface.mjs` route through the first-run support proof obligations.
- Required `workflow-cookbook`, `acceptance-scenarios`, `quickstart-receipt`, `diagnostics`, `support-bundle`, `product-surface-drift`, `user-docs`, `docs-index-drift`, `contract-inventory`, and `enterprise-audit` for first-run support workflow changes.
- Updated `docs/change-impact-policy.md` and `docs/enterprise-hardening-audit.json` so the routing rule and audit evidence preserve first-run diagnostics/support handoff boundaries.
- No validation was intentionally run in this slice; likely focused checks, if approved, are `make change-impact`, `make workflow-cookbook`, and `make enterprise-audit`.

## 2026-05-27 - Operator first-run support route

- Added a direct `node scripts/workflow-plan.mjs --workflow first-run-support` row to `docs/operator-toolbox.md` and required it in `docs/operator-toolbox-contract.json`.
- Updated `docs/operator-onboarding.md`, `docs/operator-onboarding-contract.json`, and `scripts/onboarding-plan.mjs` so support escalation starts with the first-run support workflow, preserves `safeCommandHints`, and routes through quickstart, diagnostics, support-bundle, workflow-cookbook, and acceptance-scenario checks.
- Updated `docs/enterprise-hardening-audit.json` so operator-toolbox and operator-onboarding evidence preserve the first-run support command and safe-command-hint markers.
- Extended the `first-run-support` scope in `docs/change-impact-contract.json` to cover operator toolbox/onboarding docs, contracts, and onboarding plan changes, and to require operator-toolbox/operator-onboarding gates alongside diagnostics, quickstart, support-bundle, workflow, acceptance, product-surface, docs-index, inventory, and enterprise-audit gates.
- While extending that scope, corrected the current first-run support route shape so the scope remains valid JSON after the previous work.
- No validation was intentionally run in this slice; focused checks, if approved, are `make operator-toolbox`, `make operator-onboarding`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - First-run support inventory promotion

- Promoted the first-run support proof chain into `docs/contract-inventory.json` generated-report `requiredEntryIds`: `workflow-cookbook`, `acceptance-scenarios`, `quickstart-receipt`, `diagnostics-contract`, `support-bundle`, `change-impact`, `operator-onboarding`, and `operator-toolbox` now sit beside final-proof and axioms entries.
- Updated `docs/enterprise-hardening-audit.json` contract-inventory evidence so the top-level audit preserves those required first-run support chain entries.
- No validation was intentionally run in this slice; focused checks, if approved, are `make contract-inventory`, `make operator-toolbox`, `make operator-onboarding`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - Support bundle first-run workflow hint

- Added `node scripts/workflow-plan.mjs --workflow first-run-support` to the support runbook's quickstart/diagnostics handoff section so support escalation starts with the no-network workflow map before mock/live proof.
- Added the same command to `scripts/create-support-bundle.mjs` `safeCommandHints`, and required it in `docs/support-bundle-contract.json`.
- Extended the `first-run-support` change-impact route in `docs/change-impact-contract.json` to cover `docs/support-bundle-contract.json` and `scripts/create-support-bundle.mjs` alongside support runbook/operator workflow surfaces.
- Updated `docs/enterprise-hardening-audit.json` support-bundle evidence so the top-level audit preserves the runbook, contract, and generated safe-command-hint markers.
- No validation was intentionally run in this slice; focused checks, if approved, are `make support-bundle`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - Release and maintenance first-run support handoff

- Added `node scripts/workflow-plan.mjs --workflow first-run-support` to the release-readiness support-bundle handoff path in `docs/release-readiness-checklist.md`.
- Updated `scripts/release-decision-plan.mjs` and `docs/release-readiness-contract.json` so release decisions carry a `workflowCommand`, require `safeCommandHints`, and keep the first-run support workflow ahead of tag/npm/CI/CD decisions.
- Added the same first-run support command and `safeCommandHints` expectations to `docs/maintenance-playbook.md`, `scripts/maintenance-plan.mjs`, and `docs/maintenance-playbook-contract.json` for release rehearsal and rollback handoffs.
- Extended the `first-run-support` scope in `docs/change-impact-contract.json` to include release-readiness and maintenance docs/contracts/planners, and added `release-readiness` plus `maintenance-playbook` to that scope's required targets.
- Updated `docs/enterprise-hardening-audit.json` release-readiness and maintenance evidence so the top-level audit preserves these first-run support handoff markers.
- No validation was intentionally run in this slice; focused checks, if approved, are `make release-readiness`, `make maintenance-playbook`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - Agent handoff first-run support route

- Updated `docs/agent-handoff-policy.md` so follow-on agents with setup/auth/runtime/support uncertainty start with `node scripts/workflow-plan.mjs --workflow first-run-support` and preserve `safeCommandHints` before asking for logs, retrying live calls, mutating Clockify data, or changing release posture.
- Updated `docs/agent-handoff-contract.json` so the policy, temporary context, and workflow cookbook guidance must preserve first-run support markers; added `docs/workflow-cookbook.md` to guidance scan paths.
- Updated `docs/enterprise-hardening-audit.json` so agent-handoff audit evidence requires the first-run support command and `safeCommandHints`.
- Extended the `first-run-support` scope in `docs/change-impact-contract.json` to cover agent-handoff policy/contract changes and require `agent-handoff` alongside the other support/readiness gates.
- No validation was intentionally run in this slice; focused checks, if approved, are `make agent-handoff`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - Issue intake first-run support route

- Updated `docs/issue-intake-policy.md` so first-run/setup/support issues start with `node scripts/workflow-plan.mjs --workflow first-run-support`, then capture quickstart receipt and diagnostic-surface context without env values.
- Updated `.github/ISSUE_TEMPLATE/bug_report.yml` and `.github/pull_request_template.md` so bug reports and PRs explicitly consider the first-run support workflow and `safeCommandHints` impact.
- Updated `docs/issue-intake-contract.json` so shared quickstart diagnostics fields and template markers require the first-run workflow command.
- Updated `docs/enterprise-hardening-audit.json` issue-intake evidence for the new first-run workflow markers.
- Extended the `first-run-support` scope in `docs/change-impact-contract.json` to cover issue-intake policy/contract/checker and GitHub templates, and to require `issue-intake` as part of the first-run support proof chain.
- No validation was intentionally run in this slice; focused checks, if approved, are `make issue-intake`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - Data/security first-run support boundary

- Updated `docs/data-handling-policy.md` and `docs/data-handling-contract.json` so first-run support handoffs start from `node scripts/workflow-plan.mjs --workflow first-run-support`, preserve only safe `safeCommandHints`, and do not commit raw workflow output if an operator added env values, tokens, workspace IDs, raw logs, or customer data around it.
- Updated `docs/security-threat-model.md` with a `First-run support handoff` risk surface covering escalation from local diagnostics into raw logs, env dumps, live Clockify calls, mutation, or release changes.
- Updated `docs/security-threat-model-contract.json` with the first-run support risk surface, supporting workflow-cookbook evidence, `workflow-cookbook` proof target, and `safeCommandHints` markers.
- Updated `docs/enterprise-hardening-audit.json` so data-handling and security-threat-model evidence preserve these first-run support markers.
- Extended the `first-run-support` scope in `docs/change-impact-contract.json` to include data-handling and security threat-model docs/contracts/checkers, and to require `data-handling` plus `security-threat-model` gates.
- No validation was intentionally run in this slice; focused checks, if approved, are `make data-handling`, `make security-threat-model`, `make change-impact`, and `make enterprise-audit`.

## 2026-05-27 - Snippet/docs-quality first-run support boundary

- Added first-run support wording to snippet safety and documentation quality policies: `node scripts/workflow-plan.mjs --workflow first-run-support` is a no-network support map, not proof.
- Extended snippet/docs-quality contracts and enterprise audit evidence to require `safeCommandHints`, the exact first-run command, and the `not proof` boundary.
- Extended the `first-run-support` change-impact scope so snippet-safety and docs-quality files are required when this workflow changes.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make snippet-safety`, `make docs-quality`, `make change-impact`, `make enterprise-audit`.

## 2026-05-27 - First-run support promoted into axioms

- Updated `docs/axioms.md` so the non-coder reproducibility axiom explicitly starts first-run confusion with `node scripts/workflow-plan.mjs --workflow first-run-support`, preserves `safeCommandHints`, and states that the workflow is a map, not proof.
- Updated `docs/axioms-contract.json` with first-run support markers and a `first-run-support-workflow` supporting evidence entry pointing at `docs/workflow-cookbook-contract.json`.
- Extended the `first-run-support` change-impact scope in `docs/change-impact-contract.json` to require `axioms-contract` and include `docs/axioms.md` plus `docs/axioms-contract.json`.
- Updated `docs/enterprise-hardening-audit.json` axiom evidence so the top-level audit preserves the first-run support axiom markers.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make axioms-contract`, `make change-impact`, `make enterprise-audit`.

## 2026-05-27 - Enterprise audit duplicate-marker cleanup

- Inspected the failed `docs/final-proof-receipt.md` draft output against the current audit state without running proof gates.
- Confirmed the OpenAPI evidence policy now includes the previously missing `Generated TypeScript is an output` marker, so no OpenAPI evidence patch was needed in this slice.
- Removed the remaining visible duplicate `requiredFinalProofCommandOrder` marker from the release-readiness evidence entry in `docs/enterprise-hardening-audit.json`.
- Left `docs/final-proof-receipt.md` untouched because it is a failed/stale proof receipt, not current proof; final receipt replacement still requires approved gate execution.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make enterprise-audit`, `make openapi-evidence`, `make final-proof-preflight`.

## 2026-05-27 - Performance MCP dependency resolution hardening

- Updated `scripts/check-performance-budgets.mjs` so the `mcp-tools-list` smoke resolves `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/inMemory.js` with `createRequire(pathToFileURL(root + '/mcp/package.json'))` instead of hardcoding `mcp/node_modules/...` paths.
- This keeps the performance receipt probe aligned with normal package-relative dependency resolution and avoids failing when dependencies are hoisted or installed outside the exact `mcp/node_modules` path.
- Updated `docs/enterprise-hardening-audit.json` performance-budget evidence so the audit preserves `createRequire`, `mcp/package.json`, and the MCP SDK import markers.
- Left `docs/performance-baseline-latest.json` and `docs/final-proof-receipt.md` untouched because they are failed/stale proof artifacts; replacement still requires approved performance/final proof gate execution.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make performance-budgets`, `make performance-receipt`, `make enterprise-audit`, `make final-proof-preflight`.

## 2026-05-27 - MCP prompt argsSchema type fix

- Fixed the stale `make perfect-live` TypeScript blocker in `mcp/src/prompts.ts` by changing `clockify-workflow-plan` from `argsSchema: z.object({ goal: z.string().optional() })` to the MCP SDK-compatible raw shape `argsSchema: { goal: z.string().optional() }`.
- This keeps runtime prompt behavior the same while matching the `registerPrompt` type expected by `@modelcontextprotocol/sdk`.
- Updated `docs/mcp-agent-ux-contract.json` and `docs/enterprise-hardening-audit.json` so prompt evidence preserves `argsSchema` and `goal: z.string().optional()` markers.
- Left `docs/final-proof-receipt.md` untouched because it is a stale failed receipt; replacement still requires approved proof execution.
- Validation intentionally not run in this slice. Focused checks to run if approved: `cd mcp && npm run build`, `make mcp-agent-ux`, `make mcp-contract`, `make enterprise-audit`, `make perfect-live`.

## 2026-05-27 - Final proof live-status integrity fix

- Fixed `scripts/run-final-proof.mjs` so `LIVE=1 make final-proof-draft` no longer writes `Live proof status: completed` when `make perfect-live` exits nonzero, omits cleanup JSON, reports leftovers, or misses required cleanup prefixes.
- Attempted live proof failures now write `Live proof status: failed` and add a carried-risk blocker instead of being mislabeled as completed or deferred.
- Updated `docs/final-proof-receipt-manifest.json` and `scripts/check-final-proof-receipt.mjs` so `failed` is a recognized draft-only live status with required failure evidence; final completion still requires `completed`.
- Updated `docs/final-proof-runbook.md`, `docs/final-proof-command-contract.json`, and `docs/enterprise-hardening-audit.json` so the failed/completed/deferred distinction is documented and audit-visible.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make final-proof-command-contract`, `make final-proof-receipt-check`, `make enterprise-audit`, `LIVE=1 make final-proof-draft` after all prerequisite gates are ready.

## 2026-05-27 - Final proof failed-live reporting and preflight order

- Updated `scripts/enterprise-goal-status.mjs` and `scripts/release-readiness-report.mjs` so failed live proof is explicitly called out as something that must be rerun successfully, distinct from intentional live deferral.
- Updated `docs/release-readiness-checklist.md`, `docs/enterprise-goal-status-contract.json`, `docs/release-readiness-contract.json`, `docs/final-proof-preflight-contract.json`, and `docs/enterprise-hardening-audit.json` with the failed-live markers.
- Extended the `final-proof` change-impact route in `docs/change-impact-contract.json` to include `docs/release-readiness-checklist.md` and `scripts/run-final-proof.mjs` in the relevant final-proof changed paths/docs.
- Fixed `docs/final-proof-preflight-contract.json` required ordered proof arrays so they include the axioms proof step (`axiomsContract` / `axioms-contract`), matching the current status and release-readiness report scripts.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make final-proof-preflight-contract`, `make enterprise-goal-status-contract`, `make release-readiness`, `make change-impact`, `make enterprise-audit`.

## 2026-05-27 - Risk report failed-live status preservation

- Updated `scripts/risk-status-report.mjs` so `fileSignals.finalReceiptLiveStatus` preserves any live status allowed by `docs/final-proof-receipt-manifest.json`, including `failed`, instead of collapsing failed attempted live proof to `missing`.
- Updated `docs/risk-register.json`, `docs/risk-register.md`, and `docs/enterprise-hardening-audit.json` so the risk report contract/audit documents that final receipt live status preserves `completed`, `failed`, and `deferred`.
- Extended the `final-proof` change-impact route in `docs/change-impact-contract.json` to include risk-register JSON/Markdown and risk-status report/checker files because final live-status semantics affect final-readiness risk routing.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make risk-register`, `make final-proof-preflight-contract`, `make change-impact`, `make enterprise-audit`.

## 2026-05-27 - Risk report live-status recovery detail

- Updated `scripts/risk-status-report.mjs` so `fileSignalDetails.finalReceiptLiveStatus` explains `completed`, `failed`, `deferred`, or missing live proof status.
- Failed live proof now reports the recovery action: rerun `make perfect-live` successfully before final acceptance.
- Deferred live proof now reports that deferral is draft-only and must be replaced before final acceptance.
- Updated `docs/risk-register.json`, `docs/risk-register.md`, and `docs/enterprise-hardening-audit.json` so the generated risk report contract/audit requires final live-status recovery detail.
- Validation intentionally not run in this slice. Focused checks to run if approved: `make risk-register`, `make change-impact`, `make enterprise-audit`.
