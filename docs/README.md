# Documentation Index

This repo keeps product docs, generated truth surfaces, and agent handoff files in one place. Use this index instead of hunting through the tree.

## Start here

New to the repo? Pick your surface, then read the cross-cutting docs:

| I want to… | First read |
|---|---|
| Use the **SDK** (`clockify-sdk-ts-115`) | [SDK README](../wrapper/README.md) — install, auth, pagination, typed errors, webhooks, observability |
| Use the **CLI** (`@clockify115/cli`) | [CLI README](../cli/README.md) — `clockify115` / `clk115` commands, output modes, config precedence, shell completion |
| Run the **MCP server** (`@clockify115/mcp-server`) | [MCP README](../mcp/README.md) — stdio tools, guide resources, dry-run + confirm_token write safety |

Then, regardless of surface:

- [`install-personas.md`](./install-personas.md) — which install path fits you, and the mock vs. live boundary.
- [`quickstart-receipt.md`](./quickstart-receipt.md) — a diagnostics-first first run (no live calls required).
- [`workflow-cookbook.md`](./workflow-cookbook.md) — common cross-surface recipes (set up work → log it, invoice a client, review a timesheet).
- [`agent-tasks/README.md`](./agent-tasks/README.md) — task-scoped playbooks for agents (fix a helper, add a tool/command, handle drift) with files-to-edit, tests, and checklists.
- [`../spec/evidence/discrepancies.md`](../spec/evidence/discrepancies.md) — the live-verified Clockify wire-shape evidence ledger (why the SDK departs from the spec in places).

Two SDK helper layers are shared by all three surfaces so you never hand-roll them:
the `clockify-sdk-ts-115/resolve` subpath turns a **name** into a real id (case-insensitive,
with a grounded "did you mean?" on a miss), and `clockify-sdk-ts-115/dates` resolves
"yesterday" / "next Monday" / period keywords to the instants the API wants.

## Operator docs

| Document | Purpose |
|---|---|
| [`quality-gates.md`](./quality-gates.md) | Exact commands for local, full, live, metadata, changelog, and budget gates. |
| [`axioms.md`](./axioms.md) | Durable SDK/CLI/MCP product rules. |
| [`axioms-contract.json`](./axioms-contract.json) | Machine-checkable contract tying each axiom to concrete evidence. |
| [`product-north-star.md`](./product-north-star.md) | Final-state quality bar for the repo. |
| [`naming-taxonomy-policy.md`](./naming-taxonomy-policy.md) | One Clockify vocabulary across SDK, CLI, MCP, docs, examples, and OpenAPI parity. |
| [`enterprise-hardening-audit.json`](./enterprise-hardening-audit.json) | Machine-readable map from validation gates to artifact evidence. |
| [`gate-tiers.md`](./gate-tiers.md) | Human map of validation tiers, surface-to-gate routing, and intentional gate overlap. |
| [`install-personas.md`](./install-personas.md) | Separate install paths for SDK, CLI, and MCP users. |
| [`operator-onboarding.md`](./operator-onboarding.md) | Non-coder maintainer bootstrap path: first reads, generated onboarding-plan shape, persona choice, mock/live safety, stop conditions, and readiness boundaries. |
| [`operator-toolbox.md`](./operator-toolbox.md) | No-network helper command catalogue for orientation, workflow, maintenance, release, performance, risk, and support planning. |
| [`quickstart-receipt.md`](./quickstart-receipt.md) | Diagnostics-first quickstart receipt for SDK, CLI, MCP, mock/live split, and first live probes. |
| [`migration-guide.md`](./migration-guide.md) | Package naming, import, auth, CLI, and MCP migration notes. |
| [`dependency-policy.md`](./dependency-policy.md) | Local codegen tooling, runtime floors, and dependency update rules. |
| [`dependency-license-policy.md`](./dependency-license-policy.md) | Runtime dependency license ledger, purpose map, and dependency-change evidence rules. |
| [`config-precedence-policy.md`](./config-precedence-policy.md) | SDK/CLI/MCP configuration precedence, rc-file, env, flag, and base URL override rules. |
| [`generator-portability-plan.md`](./generator-portability-plan.md) | Repo-owned local-generator and no-paid-generator plan for OpenAPI-to-SDK generation. |
| [`sdk-runtime-policy.md`](./sdk-runtime-policy.md) | Durable hand-written SDK runtime seam policy around the generated core. |
| [`workflow-cookbook.md`](./workflow-cookbook.md) | Cross-surface recipes and generated workflow-plan shape for first-run support plus common SDK, CLI, and MCP user jobs. |
| [`acceptance-scenarios.md`](./acceptance-scenarios.md) | End-to-end SDK/CLI/MCP user journey acceptance matrix with generated plan shape, mock/live, receipt, cleanup, and OpenAPI proof expectations. |
| [`examples-matrix.md`](./examples-matrix.md) | Cross-surface SDK/CLI/MCP examples matrix and generated examples-plan shape with mock/live boundaries and receipt expectations. |
| [`snippet-safety-policy.md`](./snippet-safety-policy.md) | Copy-paste snippet safety rules for SDK, CLI, MCP, README, and cookbook examples. |
| [`decision-records-policy.md`](./decision-records-policy.md) | Rules for durable decision records that preserve source-of-truth, release, and live proof rationale. |
| [`contract-inventory-policy.md`](./contract-inventory-policy.md) | Rules for keeping policy docs, contract JSON, checker scripts, Make targets, helper ownership, helper command coverage, and audit evidence wired together. |
| [`change-impact-policy.md`](./change-impact-policy.md) | Change-scope to required-gate mapping and generated change-impact plan shape for SDK, CLI, MCP, OpenAPI, docs, release, live proof, and final proof changes. |
| [`security-threat-model.md`](./security-threat-model.md) | Practical SDK/CLI/MCP/OpenAPI threat model with mitigations and proof gates. |
| [`data-handling-policy.md`](./data-handling-policy.md) | Workspace data, privacy, evidence, and redaction policy. |
| [`supply-chain-policy.md`](./supply-chain-policy.md) | Package license, provenance, tarball, and publish-safety rules. |
| [`compatibility-policy.md`](./compatibility-policy.md) | SDK/CLI/MCP/OpenAPI compatibility and deprecation rules. |
| [`breaking-change-review-policy.md`](./breaking-change-review-policy.md) | Replacement-first review rules for SDK, CLI, MCP, OpenAPI, package, docs, changelog, and migration breaking changes. |
| [`receipts-policy.md`](./receipts-policy.md) | SDK/CLI/MCP receipt, correlation, and observability rules. |
| [`observability-policy.md`](./observability-policy.md) | Request correlation, telemetry hooks, structured receipts, redaction, and support-bundle observability rules. |
| [`diagnostics-policy.md`](./diagnostics-policy.md) | SDK/CLI/MCP diagnostics rules for no-network readiness, redaction, receipts, and first live probes. |
| [`receipt-examples.md`](./receipt-examples.md) | Golden SDK/CLI/MCP success and recovery receipt examples. |
| [`support-runbook.md`](./support-runbook.md) | Safe support bundle and escalation runbook for SDK/CLI/MCP/OpenAPI issues, including generated redaction flags and package prepublish-gate metadata. |
| [`issue-intake-policy.md`](./issue-intake-policy.md) | Bug, feature, PR, support, and security intake rules for reproducible evidence without secrets. |
| [`release-support-policy.md`](./release-support-policy.md) | Release readiness, support windows, no-default-publish stance, and security support. |
| [`release-readiness-checklist.md`](./release-readiness-checklist.md) | Evidence checklist and decision-planner boundary for release, package handoff, and final readiness claims. |
| [`maintenance-playbook.md`](./maintenance-playbook.md) | Maintainer cadence, generated maintenance-plan shape, dependency update, generator bump, API drift, release rehearsal, and rollback playbook. |
| [`mutation-safety-policy.md`](./mutation-safety-policy.md) | Cross-surface mutation, idempotency, retry, write, receipt, and ambiguous-failure recovery policy. |
| [`ci-policy.md`](./ci-policy.md) | GitHub workflow roles, CI safety rules, and release-workflow decision boundary. |
| [`live-tests.md`](./live-tests.md) | Sandbox-only live-test policy, cleanup proof, deferral rules, and mock alternative. |
| [`test-data-lifecycle-policy.md`](./test-data-lifecycle-policy.md) | Live sandbox prefix ledger, cleanup obligations, leftover scan, and test-data stop conditions. |
| [`risk-register.md`](./risk-register.md) | Known limitations, accepted risks, provisional states, helper planners, generated risk-status report shape, and closure gates. |
| [`user-docs-policy.md`](./user-docs-policy.md) | User-facing README, onboarding, install, migration, and troubleshooting documentation rules. |
| [`docs-quality-policy.md`](./docs-quality-policy.md) | Evidence-first documentation quality rules: exact names, generated truth surfaces, no unsupported readiness claims, and non-coder clarity. |
| [`agent-handoff-policy.md`](./agent-handoff-policy.md) | Future-agent guidance, canonical contract, and temporary-context lifecycle rules. |
| [`developer-environment-policy.md`](./developer-environment-policy.md) | Local Node/npm workspace, codegen, GOCLMCP bootstrap rules, and repo-doctor generated report shape. |
| [`api-docs-policy.md`](./api-docs-policy.md) | TypeDoc and generated SDK resource documentation rules. |
| [`mcp-write-safety-policy.md`](./mcp-write-safety-policy.md) | MCP destructive-write confirmation, receipt, and recovery policy. |
| [`mcp-agent-ux-policy.md`](./mcp-agent-ux-policy.md) | MCP agent UX rules for workflow-first guidance, server instructions, resources, prompts, receipts, and recovery. |
| [`cli-write-safety-policy.md`](./cli-write-safety-policy.md) | CLI write/delete determinism, explicit target, and receipt policy. |
| [`openapi-evidence-policy.md`](./openapi-evidence-policy.md) | Evidence rules for manual OpenAPI corrections and generator decisions. |
| [`schema-quality-policy.md`](./schema-quality-policy.md) | OpenAPI component schema, enum, request/response model, loose-object, and generated TypeScript model quality rules. |
| [`upstream-drift-policy.md`](./upstream-drift-policy.md) | Clockify API, GOCLMCP, SDK, CLI, MCP, and docs drift lifecycle and routing rules. |
| [`operation-coverage-policy.md`](./operation-coverage-policy.md) | No-regression coverage thresholds for OpenAPI, SDK names, TS MCP, GOCLMCP, and curated parity overrides. |

## Generated truth surfaces

| Surface | Regenerate | Purpose |
|---|---|---|
| [`product-surface.json`](./product-surface.json) / [`product-surface.md`](./product-surface.md) | `make product-surface` | SDK/CLI/MCP package and workflow metadata. |
| [`generated-edit-contract.json`](./generated-edit-contract.json) | edit intentionally | Generated/snapshot path edit guard contract. |
| [`error-codes.json`](./error-codes.json) / [`error-codes.md`](./error-codes.md) | `make error-docs` | Shared error and recovery vocabulary. |
| [`troubleshooting.md`](./troubleshooting.md) | `make troubleshooting` | Generated recovery guide from the error registry. |
| [`openapi-operations.json`](./openapi-operations.json) / [`openapi-operations.md`](./openapi-operations.md) | `make openapi-operations` | Corrected OpenAPI operation inventory. |
| [`openapi-evidence-contract.json`](./openapi-evidence-contract.json) | edit intentionally | Discrepancy ledger and OpenAPI evidence contract. |
| [`schema-quality-contract.json`](./schema-quality-contract.json) | edit intentionally | Schema/model quality contract for corrected OpenAPI and generated TypeScript surfaces. |
| [`upstream-drift-contract.json`](./upstream-drift-contract.json) | edit intentionally | Upstream API drift lifecycle, evidence, routing, regeneration, and proof contract. |
| [`operation-coverage-contract.json`](./operation-coverage-contract.json) | edit intentionally | OpenAPI/SDK/MCP operation coverage no-regression threshold contract. |
| [`operation-parity.json`](./operation-parity.json) / [`operation-parity.md`](./operation-parity.md) | `make operation-parity` | Best-effort OpenAPI, SDK, TS MCP, and GOCLMCP parity join. |
| [`official-openapi-drift-contract.json`](./official-openapi-drift-contract.json) | edit intentionally | Official-vs-custom OpenAPI drift pipeline contract. |
| [`official-openapi-drift-policy.md`](./official-openapi-drift-policy.md) | edit intentionally | Official-vs-custom drift lifecycle, commands, and response policy. |
| [`spec-diff-official.md`](./spec-diff-official.md) | `make official-openapi-report` | Official-vs-custom OpenAPI diff (NEW_OFFICIAL_ENDPOINT / CUSTOM_BETTER / CONFLICT / PHANTOM_RISK). |
| [`spec-confidence.md`](./spec-confidence.md) | `make official-openapi-report` | Per-operation confidence from `x-clockify-live-status`; why the custom spec is trusted. |
| [`live-evidence-index.md`](./live-evidence-index.md) | `make official-openapi-report` | Where custom claims meet real Clockify behavior, plus quarantined phantom routes. |
| [`conformance.md`](./conformance.md) | `make conformance` | Claim → proof matrix: every headline behavior claim mapped to a runnable proof gate. |
| [`operation-parity-overrides.json`](./operation-parity-overrides.json) | `make operation-parity` | Curated non-mechanical parity mappings. |
| [`cli-commands.json`](./cli-commands.json) | `make readme-tables` | Source for the generated CLI README command table. |
| [`mcp-tools.json`](./mcp-tools.json) | `make readme-tables` | Source for the generated MCP README tool tables. |
| [`performance-budgets.json`](./performance-budgets.json) | edit intentionally | Built artifact size/startup ceilings plus generated calibration-plan shape contract. |
| [`package-contract.json`](./package-contract.json) | edit intentionally | Public package names, bins, exports, pack files, and publish-safety invariants. |
| [`pack-consumer-smoke-contract.json`](./pack-consumer-smoke-contract.json) | edit intentionally | Packed SDK/CLI/MCP consumer proof contract for local tarball install/import/run checks. |
| [`examples-contract.json`](./examples-contract.json) | edit intentionally | Runnable SDK example inventory and import/secret-safety contract. |
| [`examples-matrix-contract.json`](./examples-matrix-contract.json) | edit intentionally | SDK/CLI/MCP examples matrix, generated examples-plan, mock/live boundary, and receipt contract. |
| [`snippet-safety-contract.json`](./snippet-safety-contract.json) | edit intentionally | Copy-paste snippet safety contract. |
| [`docs-drift-contract.json`](./docs-drift-contract.json) | edit intentionally | Allowlisted docs drift scan roots, rules, and intentional exceptions. |
| [`runtime-support.json`](./runtime-support.json) | edit intentionally | Package engine and runtime support contract. |
| [`env-contract.json`](./env-contract.json) | edit intentionally | Environment/configuration variable and secret-hygiene contract. |
| [`config-precedence-contract.json`](./config-precedence-contract.json) | edit intentionally | SDK/CLI/MCP configuration precedence and base URL override contract. |
| [`sdk-public-api.json`](./sdk-public-api.json) | edit intentionally | SDK root symbol and subpath public API contract. |
| [`sdk-runtime-contract.json`](./sdk-runtime-contract.json) | edit intentionally | SDK hand-written runtime seam contract. |
| [`workflow-cookbook-contract.json`](./workflow-cookbook-contract.json) | edit intentionally | Cross-surface workflow cookbook and generated workflow-plan contract. |
| [`acceptance-scenarios-contract.json`](./acceptance-scenarios-contract.json) | edit intentionally | SDK/CLI/MCP acceptance scenario, generated plan, proof-mode, receipt, and cleanup contract. |
| [`naming-taxonomy-contract.json`](./naming-taxonomy-contract.json) | edit intentionally | SDK/CLI/MCP/OpenAPI naming and taxonomy contract. |
| [`decision-records-contract.json`](./decision-records-contract.json) | edit intentionally | Durable decision-record coverage contract. |
| [`docs-index-contract.json`](./docs-index-contract.json) | edit intentionally | Required docs index links and docs-index drift checker wiring. |
| [`contract-inventory.json`](./contract-inventory.json) | edit intentionally | Inventory tying enterprise contracts to docs, scripts, Make targets, helper ownership, helper command coverage, and audit evidence. |
| [`change-impact-contract.json`](./change-impact-contract.json) | edit intentionally | Change-scope to required-gate and generated plan contract. |
| [`changelog-coverage-contract.json`](./changelog-coverage-contract.json) | edit intentionally | Package scope to changelog coverage contract for touched package files. |
| [`security-threat-model-contract.json`](./security-threat-model-contract.json) | edit intentionally | SDK/CLI/MCP/OpenAPI security threat-model contract. |
| [`version-policy.json`](./version-policy.json) | edit intentionally | Package version, changelog, product-surface, and install-example contract. |
| [`secret-hygiene.json`](./secret-hygiene.json) | edit intentionally | Lightweight source/docs secret scanning policy. |
| [`replay-fixtures-contract.json`](./replay-fixtures-contract.json) | edit intentionally | Required committed replay fixtures, redaction checks, and wire-shape tripwires. |
| [`live-probe-ledger.json`](./live-probe-ledger.json) | edit intentionally | Redacted live-probe evidence ledger linking corrected API behavior to offline fixtures. |
| [`data-handling-contract.json`](./data-handling-contract.json) | edit intentionally | Workspace data handling and redaction contract. |
| [`supply-chain-contract.json`](./supply-chain-contract.json) | edit intentionally | Package license, provenance, tarball, and publish-safety contract. |
| [`dependency-boundary.json`](./dependency-boundary.json) | edit intentionally | Package runtime dependency and SDK peer boundary contract. |
| [`dependency-license-contract.json`](./dependency-license-contract.json) | edit intentionally | Runtime dependency license, purpose, and manifest-ledger contract. |
| [`compatibility-contract.json`](./compatibility-contract.json) | edit intentionally | Public compatibility and deprecation contract across SDK, CLI, MCP, and OpenAPI generation. |
| [`breaking-change-review-contract.json`](./breaking-change-review-contract.json) | edit intentionally | Breaking-change review evidence contract for public SDK/CLI/MCP/OpenAPI/package surface changes. |
| [`observability-contract.json`](./observability-contract.json) | edit intentionally | Request correlation, telemetry hook, structured receipt, golden receipt examples, and support-bundle observability contract. |
| [`diagnostics-contract.json`](./diagnostics-contract.json) | edit intentionally | Cross-surface SDK/CLI/MCP diagnostics contract for no-network readiness, redaction, and the operator quickstart-receipt path. |
| [`support-bundle-contract.json`](./support-bundle-contract.json) | edit intentionally | Safe support bundle, generated redaction flags, prepublish-gate metadata, lockfile summary metadata, and escalation contract. |
| [`issue-intake-contract.json`](./issue-intake-contract.json) | edit intentionally | Issue, feature, PR, support, and security intake contract. |
| [`release-support-contract.json`](./release-support-contract.json) | edit intentionally | Release/support/security documentation contract for package readiness. |
| [`release-readiness-contract.json`](./release-readiness-contract.json) | edit intentionally | Release and handoff readiness evidence contract. |
| [`ci-contract.json`](./ci-contract.json) | edit intentionally | GitHub workflow posture and release-safety contract. |
| [`live-safety-contract.json`](./live-safety-contract.json) | edit intentionally | Sandbox-only live-test safety and cleanup contract. |
| [`test-data-lifecycle-contract.json`](./test-data-lifecycle-contract.json) | edit intentionally | Live sandbox test-data prefix, cleanup, leftover scan, and receipt contract. |
| [`risk-register.json`](./risk-register.json) | edit intentionally | Evidence-backed risk and limitation register. |
| [`user-docs-contract.json`](./user-docs-contract.json) | edit intentionally | User-facing documentation parity contract. |
| [`docs-quality-contract.json`](./docs-quality-contract.json) | edit intentionally | Evidence-first documentation quality contract for SDK, CLI, MCP, OpenAPI, and operator docs. |
| [`agent-handoff-contract.json`](./agent-handoff-contract.json) | edit intentionally | Future-agent guidance and temporary-context lifecycle contract. |
| [`agent-tasks-contract.json`](./agent-tasks-contract.json) | edit intentionally | Agent task packet contract: required packets, sections, and index links. |
| [`docs-counts-contract.json`](./docs-counts-contract.json) | edit intentionally | Headline-count contract: generated count sources agree and docs hold no stale counts. |
| [`developer-environment-contract.json`](./developer-environment-contract.json) | edit intentionally | Local bootstrap/runtime/codegen environment contract and repo-doctor generated report shape. |
| [`operator-onboarding-contract.json`](./operator-onboarding-contract.json) | edit intentionally | Non-coder bootstrap, persona-choice, mock/live, stop-condition, and readiness-boundary contract. |
| [`operator-toolbox-contract.json`](./operator-toolbox-contract.json) | edit intentionally | No-network operator helper command catalogue and inventory-ownership contract. |
| [`api-docs-contract.json`](./api-docs-contract.json) | edit intentionally | TypeDoc and generated SDK resource documentation contract. |
| [`mcp-contract.json`](./mcp-contract.json) | edit intentionally | TS MCP tools/resources/prompts/output-schema discoverability contract. |
| [`mcp-agent-ux-contract.json`](./mcp-agent-ux-contract.json) | edit intentionally | MCP server instructions, workflow-first guidance, resources, prompts, output schema, receipt, and README UX contract. |
| [`mcp-write-safety-contract.json`](./mcp-write-safety-contract.json) | edit intentionally | MCP destructive-write confirmation, hint, and receipt contract. |
| [`mcp-tool-manifest.json`](./mcp-tool-manifest.json) | generated | Structural MCP tool manifest generated from `buildServer`; consumed by write-safety and operation-parity gates. |
| [`cli-contract.json`](./cli-contract.json) | edit intentionally | CLI command/global/completion/exit-code contract. |
| [`cli-write-safety-contract.json`](./cli-write-safety-contract.json) | edit intentionally | CLI write/delete determinism, explicit target, and receipt contract. |
| [`consumer-cast-budget-contract.json`](./consumer-cast-budget-contract.json) | edit intentionally | Consumer `as never` cast budget, KEEP-as-never allow-list policy, and per-package strictness state. |
| [`test-matrix-contract.json`](./test-matrix-contract.json) | edit intentionally | SDK/CLI/MCP package script and required test-file contract. |
| [`coverage-contract.json`](./coverage-contract.json) | edit intentionally | Measured SDK/CLI/MCP coverage floor contract (hand-written surface; ratchets up). |
| [`generator-config-contract.json`](./generator-config-contract.json) | edit intentionally | Local TypeScript generator input, output, command, and sync contract. |
| [`generator-independence-contract.json`](./generator-independence-contract.json) | edit intentionally | Generated-core boundary contract for wrapper exports and CLI/MCP dependencies. |
| [`generator-comparison-contract.json`](./generator-comparison-contract.json) | edit intentionally | OpenAPI SDK-stamp to generated TypeScript method comparison contract. |
| [`generator-portability-contract.json`](./generator-portability-contract.json) | edit intentionally | No-paid-generator and vendor-exit contract. |
| [`mock-clockify-contract.json`](./mock-clockify-contract.json) | edit intentionally | Local mock Clockify route/test/docs contract. |
| [`maintenance-playbook-contract.json`](./maintenance-playbook-contract.json) | edit intentionally | Maintainer cadence, generated maintenance-plan, upgrade, drift, release rehearsal, and rollback contract. |
| [`mutation-safety-contract.json`](./mutation-safety-contract.json) | edit intentionally | SDK retry, CLI write, MCP confirmation, receipt, and ambiguous-failure contract. |

## Contract checks

| Check | Command | Purpose |
|---|---|---|
| OpenAPI lint | `make openapi-lint` | Enforce operation-count, SDK-stamp, pagination, and Last-Page invariants. |
| Schema quality | `make schema-quality` | Check component schemas, enums, loose objects, request/response models, discrepancy evidence, and generated TypeScript model ergonomics. |
| OpenAPI evidence | `make openapi-evidence` | Check discrepancy ledger policy, core findings, support evidence, and Makefile targets. |
| Upstream drift | `make upstream-drift` | Check Clockify/API/GOCLMCP/SDK drift lifecycle, routing, evidence, regeneration, and proof surfaces. |
| Official OpenAPI drift | `make official-openapi-drift` | Check the official-vs-custom diff/confidence/live-evidence surfaces are fresh and wired (offline; `make official-openapi-fetch` for the live delta). |
| Operation coverage | `make operation-coverage` | Check OpenAPI operation count plus SDK, TS MCP, GOCLMCP, and curated parity coverage floors. |
| Generator config | `make generator-config` | Check local TypeScript generator input, output, command, and wrapper sync paths. |
| Generator independence | `make generator-independence` | Keep generated SDK output behind wrapper seams. |
| Generator comparison | `make generator-comparison` | Compare OpenAPI SDK stamps to generated TypeScript methods. |
| Generator portability | `make generator-portability` | Check no-paid-generator, local-regeneration, and vendor-exit boundaries. |
| Package contract | `make package-contract` | Compare SDK/CLI/MCP manifests to the public package contract snapshot. |
| Pack smoke | `make pack-smoke` | Pack SDK/CLI/MCP tarballs, install them into clean temporary consumer projects, and check import/binary entrypoints against the smoke contract. |
| Examples contract | `make examples-contract` | Check runnable SDK examples against the public package/import contract. |
| Examples matrix | `make examples-matrix` | Check SDK/CLI/MCP examples matrix and generated examples-plan shape, mock/live boundaries, mutation safety, and receipt expectations. |
| Snippet safety | `make snippet-safety` | Check SDK/CLI/MCP README and cookbook snippets avoid secrets, internals, and unsafe live defaults. |
| Runtime support | `make runtime-support` | Check package engines and runtime docs agree on Node 20+. |
| Env/config contract | `make env-contract` | Check SDK/CLI/MCP environment variables and mock/replay base URL docs. |
| Config precedence | `make config-precedence` | Check SDK option/env fallback, CLI flag/env/rc order, MCP env-only startup, and base URL override safety. |
| SDK public API | `make sdk-public-api` | Check SDK root symbols and package subpaths against the public API snapshot. |
| SDK runtime contract | `make sdk-runtime-contract` | Check SDK wrapper seams for auth, fetch, pagination, raw responses, errors, webhooks, health, rate limits, scopes, hooks, and deprecation. |
| Workflow cookbook | `make workflow-cookbook` | Check first-run support, user workflows, generated workflow-plan shape, SDK/CLI/MCP paths, product-surface metadata, and safety contracts stay aligned. |
| Acceptance scenarios | `make acceptance-scenarios` | Check end-to-end user journeys and generated acceptance-plan shape across SDK, CLI, MCP, mock/live proof, receipts, cleanup, and OpenAPI truth. |
| Naming taxonomy | `make naming-taxonomy` | Check one Clockify vocabulary across SDK methods, CLI commands, MCP tools, docs, examples, and OpenAPI parity. |
| Decision records | `make decision-records` | Check required architectural and operations decisions remain documented with proof. |
| Contract inventory | `make contract-inventory` | Check policy docs, contract JSON, checker scripts, Make targets, generated inventory report shape, toolbox helper ownership and command coverage, docs index rows, quality-gate rows, and audit evidence stay wired. |
| Change impact | `make change-impact` | Check change scopes and generated change-impact plan shape map to required gates, docs, changelog posture, and proof receipts. |
| Security threat model | `make security-threat-model` | Check SDK/CLI/MCP/OpenAPI threat model risks, mitigations, supporting docs, and proof-gate wiring. |
| Version policy | `make version-policy` | Check package versions, changelogs, product surface, and install examples agree. |
| Secret hygiene | `make secret-hygiene` | Scan committed source/docs for common token-shaped secrets. |
| Data handling | `make data-handling` | Check workspace data classes, redaction rules, live evidence, and support bundle boundaries. |
| Supply chain | `make supply-chain` | Check package licenses, provenance settings, exact `prepublishOnly` gate shape, tarball files, and supporting contracts. |
| Dependency boundary | `make dependency-boundary` | Check runtime dependencies and SDK peer/dev boundaries remain intentional. |
| Dependency license | `make dependency-license` | Check SDK/CLI/MCP runtime dependency ledger, known licenses, package manifests, and forbidden dependency list. |
| Compatibility contract | `make compatibility-contract` | Check compatibility policy, deprecation helper, changelogs, migration docs, and surface contracts. |
| Breaking-change review | `make breaking-change-review` | Check replacement-first review evidence for public SDK/CLI/MCP/OpenAPI/package breakage. |
| Observability contract | `make observability` | Check request IDs, telemetry hooks, response metadata, CLI/MCP receipts, golden receipt examples, redaction, and support-bundle evidence. |
| Diagnostics contract | `make diagnostics` | Check SDK `clockifyDiagnostics()`, CLI `doctor`, MCP `clockify://mcp/doctor`, the operator quickstart-receipt path, redaction, receipts, and product-surface discoverability. |
| Support bundle | `make support-bundle` | Check safe diagnostic bundle, generated redaction flags, package prepublish-gate metadata, lockfile summary metadata, escalation template, and redaction guidance stay aligned. |
| Issue intake | `make issue-intake` | Check bug, feature, PR, support, and security intake templates collect reproducible sanitized evidence. |
| Release/support contract | `make release-support-contract` | Check release support policy, `SECURITY.md`, package names, and proof targets stay aligned. |
| Release readiness | `make release-readiness` | Check release/handoff evidence checklist, generated preflight report shape, final proof closure, and publish decision boundary. |
| Release decision plan | `make release-decision-plan` | Print no-network release workflow decision options without granting publish permission. |
| CI contract | `make ci-contract` | Check GitHub workflow posture, package workflow gates, docs/release workflow safety rails, and release decision boundary. |
| Live safety | `make live-safety` | Check sandbox-only live-test docs, env gates, cleanup prefixes, and mock alternative. |
| Test data lifecycle | `make test-data-lifecycle` | Check live sandbox prefixes, create/delete pairing, cleanup script coverage, leftover scans, and sanitized cleanup receipts. |
| Risk register | `make risk-register` | Check known risks, accepted constraints, evidence paths, and closure gates. |
| Risk status report | `make risk-status-report` | Print no-network open/provisional risk and file-state signals. |
| Performance budgets | `make performance-budgets` | Check built SDK/CLI/MCP artifact size/startup ceilings and generated calibration-plan policy alignment. |
| Performance receipt | `make performance-receipt` | Write measured package size/startup receipt for budget calibration. |
| Performance calibration plan | `make performance-calibration-plan` | Print no-network budget-policy-backed calibration and tightening plan. |
| User docs | `make user-docs` | Check root, SDK, CLI, MCP, install, migration, and troubleshooting docs cover required onboarding content. |
| Documentation quality | `make docs-quality` | Check evidence-first claims, exact package names, generated truth surfaces, safe snippets, and unsupported marketing-claim blacklist. |
| Axioms contract | `make axioms-contract` | Check SDK/CLI/MCP/OpenAPI axioms stay tied to concrete gates and evidence. |
| Agent handoff | `make agent-handoff` | Check AGENTS/CLAUDE guidance, generated-path rules, temporary context lifecycle, and stale-count markers. |
| Developer environment | `make developer-environment` | Check root workspace lockfile/scripts, repo-doctor generated report shape, Node floor, local codegen/GOCLMCP setup docs, and workspace boundary. |
| Operator toolbox | `make operator-toolbox` | Check the no-network helper command catalogue and inventory ownership for operators and future agents. |
| Operator onboarding | `make operator-onboarding` | Check first-read bootstrap, generated onboarding-plan shape, SDK/CLI/MCP path choice, mock/live boundaries, stop conditions, and readiness levels. |
| API docs | `make api-docs` | Check TypeDoc configuration, generated resource docs, sync wiring, Pages workflow, and docs identity. |
| MCP contract | `make mcp-contract` | Check TS MCP tools, guide resources, prompts, output schema, README, and server tests agree. |
| MCP agent UX | `make mcp-agent-ux` | Check MCP server instructions, workflow-first tool guidance, resources, prompts, structured receipts, safety, and README discoverability. |
| MCP write safety | `make mcp-write-safety` | Check destructive MCP tools advertise risk, high-risk writes require preview confirmation, and receipts stay recoverable. |
| MCP tool manifest | `make mcp-tool-manifest` | Regenerate the structural MCP tool manifest and use `make mcp-tool-manifest-drift` to check freshness. |
| CLI contract | `make cli-contract` | Check CLI command metadata, README, globals, completion shells, binaries, and exit-code tests agree. |
| CLI write safety | `make cli-write-safety` | Check write/delete commands stay explicit, non-interactive, ID-scoped where destructive, and receipt-oriented. |
| Consumer cast budget | `make consumer-cast-budget` | Check CLI/MCP `as never` escape hatches stay eliminated or `KEEP as never` annotated under a ratcheting budget. |
| Test matrix | `make test-matrix` | Check package scripts and required SDK/CLI/MCP test files are present. |
| Mock Clockify | `make mock-contract` | Check local mock Clockify routes and SDK/CLI/MCP mock-backed tests stay aligned. |
| Replay fixtures | `make replay-fixtures` | Replay committed redacted fixtures and check live-fidelity wire-shape tripwires offline. |
| Maintenance playbook | `make maintenance-playbook` | Check maintainer cadence, generated maintenance-plan shape, dependency updates, generator bumps, API drift response, release rehearsal, rollback, and receipts stay explicit. |
| Mutation safety | `make mutation-safety` | Check SDK retry defaults, CLI write rules, MCP confirmation flow, receipt shape, and ambiguous-failure recovery stay aligned. |

## Planning artifacts

| Document | Purpose |
|---|---|
| [`superpowers/plans/2026-05-26-enterprise-sdk-hardening.md`](./superpowers/plans/2026-05-26-enterprise-sdk-hardening.md) | Current implementation checklist for the enterprise SDK hardening goal. |
| [`superpowers/plans/2026-05-26-clockify-sdk-platform-final-state-goal.md`](./superpowers/plans/2026-05-26-clockify-sdk-platform-final-state-goal.md) | Older final-state goal packet. |
| [`superpowers/plans/2026-05-26-clockify-sdk-platform-polish-next.md`](./superpowers/plans/2026-05-26-clockify-sdk-platform-polish-next.md) | Older polish follow-up plan. |

## Generated API docs

[`api/`](./api/index.html) is generated by TypeDoc from the SDK wrapper and generated SDK resource modules. Do not hand-edit generated API pages.
