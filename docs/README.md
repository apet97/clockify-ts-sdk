# Documentation Index

This repo keeps product docs, generated truth surfaces, and agent handoff files in one place. Use this index instead of hunting through the tree.

## Start here

New to the repo? Pick your surface, then read the cross-cutting docs:

| I want to… | First read |
|---|---|
| Use the **SDK** (`clockify-sdk-ts-115`) | [SDK README](../wrapper/README.md) — install, auth, pagination, typed errors, webhooks, observability |
| Use the **CLI** (`@apet97/clockify-cli-115`) | [CLI README](../cli/README.md) — `clockify115` / `clk115` commands, output modes, config precedence, shell completion |
| Run the **MCP server** (`@apet97/clockify-mcp-115`) | [MCP README](../mcp/README.md) — stdio tools, guide resources, dry-run + confirm_token write safety |

Then, regardless of surface:

- [`install-personas.md`](./install-personas.md) — which install path fits you, and the mock vs. live boundary.
- [`quickstart-receipt.md`](./quickstart-receipt.md) — a diagnostics-first first run (no live calls required).
- **Make your first SDK API call:** set `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID`,
  then use `createClockifyClient()` and `client.tags.list({ workspaceId })`; the
  [SDK README](../wrapper/README.md) auth section and
  [`quickstart-receipt.md`](./quickstart-receipt.md) walk the first run safely.
- [`workflow-cookbook.md`](./workflow-cookbook.md) — common cross-surface recipes (set up work → log it, invoice a client, review a timesheet).
- [`cookbook.md`](./cookbook.md) — compile-checked SDK helper snippets for ensure, resolve, money, dates, reports, bulk, and composition.
- [`agent-tasks/README.md`](./agent-tasks/README.md) — task-scoped playbooks for agents (fix a helper, add a tool/command, handle drift) with files-to-edit, tests, and checklists.
- [`../spec/evidence/discrepancies.md`](../spec/evidence/discrepancies.md) — the live-verified Clockify wire-shape evidence ledger (why the SDK departs from the spec in places).
- [`rejected-findings.md`](./rejected-findings.md) — reported defects that were investigated and closed without a code change, with the evidence that settled them. Read it before re-filing a finding.

Two SDK helper layers are shared by all three surfaces so you never hand-roll them:
the `clockify-sdk-ts-115/resolve` subpath turns a **name** into a real id (case-insensitive,
with a grounded "did you mean?" on a miss), and `clockify-sdk-ts-115/dates` resolves
"yesterday" / "next Monday" / period keywords to the instants the API wants.

## Operator docs

### User-facing

| Document | Purpose |
|---|---|
| [`quality-gates.md`](./quality-gates.md) | Exact commands for local, full, live, metadata, changelog, and budget gates. |
| [`axioms.md`](./axioms.md) | Durable SDK/CLI/MCP product rules. |
| [`axioms-contract.json`](./axioms-contract.json) | Machine-checkable contract tying each axiom to concrete evidence. |
| [`product-north-star.md`](./product-north-star.md) | Final-state quality bar for the repo. |
| [`roadmap-1.0.md`](./roadmap-1.0.md) | Completed historical 1.0 readiness campaign, retained receipts, closure gates, and execution boundaries. |
| [`roadmap-1.0-status.json`](./roadmap-1.0-status.json) | Tracked historical 1.0 status snapshot for retained proof artifacts and approval state; not completion proof or an active queue. |
| [`release-decision.md`](./release-decision.md) / [`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md) | The latest release decision, what must be re-proven before the next one, and the classified SDK surface every symbol decision rests on. |
| [`unique-claim-inventory-policy.md`](./unique-claim-inventory-policy.md) / [`unique-claim-inventory.json`](./unique-claim-inventory.json) | Machine projection of 27 roadmap, 15 risk, 6 workflow, and 4 selected readiness claims with exact evidence and boundaries; not completion proof. |
| [`naming-taxonomy-policy.md`](./naming-taxonomy-policy.md) | One Clockify vocabulary across SDK, CLI, MCP, docs, examples, and OpenAPI parity. |
| [`enterprise-hardening-audit.json`](./enterprise-hardening-audit.json) | Machine-readable map from validation gates to artifact evidence. |
| [`gate-tiers.md`](./gate-tiers.md) | Human map of validation tiers, surface-to-gate routing, and intentional gate overlap. |
| [`gate-tier-inventory.md`](./gate-tier-inventory.md) / [`gate-tier-inventory.json`](./gate-tier-inventory.json) | Generated active `contract-gates` bundle graph and complete D4 tier-decision packet. |
| [`install-personas.md`](./install-personas.md) | Separate install paths for SDK, CLI, and MCP users. |
| [`operator-onboarding.md`](./operator-onboarding.md) | Non-coder maintainer bootstrap path: first reads, generated onboarding-plan shape, persona choice, mock/live safety, stop conditions, and readiness boundaries. |
| [`operator-toolbox.md`](./operator-toolbox.md) | No-network helper command catalogue for orientation, workflow, maintenance, release, performance, risk, and support planning. |
| [`quickstart-receipt.md`](./quickstart-receipt.md) | Diagnostics-first quickstart receipt for SDK, CLI, MCP, mock/live split, and first live probes. |
| [`migration-guide.md`](./migration-guide.md) | Package naming, import, auth, CLI, and MCP migration notes. |
| [`cookbook.md`](./cookbook.md) | Compile-checked SDK helper cookbook for the hand-written helper subpaths. |

### Repo gotchas

Situational detail extracted from `CLAUDE.md` so that file can stay an index.
Read the one that matches what you are touching, not all of them. The canonical
contract remains [`AGENTS.md`](../AGENTS.md).

| Document | Read it when you are touching |
|---|---|
| [`gotchas/workspace-build-generated-paths.md`](./gotchas/workspace-build-generated-paths.md) | The workspace layout, builds, or a generated path. |
| [`gotchas/spec-live-api-reality.md`](./gotchas/spec-live-api-reality.md) | The spec, a response type, or live-API behavior. |
| [`gotchas/mcp-tools-write-safety.md`](./gotchas/mcp-tools-write-safety.md) | An MCP tool, a receipt, or a write guard. |
| [`gotchas/live-evidence-and-deletes.md`](./gotchas/live-evidence-and-deletes.md) | A delete path or a live-evidence behavior. |
| [`gotchas/live-creds-sandbox-scope-filters.md`](./gotchas/live-creds-sandbox-scope-filters.md) | Live credentials, the sandbox, or a scope filter. |
| [`gotchas/generated-docs-and-pack-snapshots.md`](./gotchas/generated-docs-and-pack-snapshots.md) | A generated doc or a pack snapshot. |
| [`gotchas/gates-coverage-mutation-performance.md`](./gotchas/gates-coverage-mutation-performance.md) | Coverage, mutation, performance, or determinism gates. |
| [`gotchas/operator-docs-and-index-drift.md`](./gotchas/operator-docs-and-index-drift.md) | An operator doc or the docs index. |
| [`gotchas/release-ci-handoff.md`](./gotchas/release-ci-handoff.md) | A release, CI, or the handoff contract. |

### Internal governance

| Document | Purpose |
|---|---|
| [`dependency-policy.md`](./dependency-policy.md) | Local codegen tooling, runtime floors, and dependency update rules. |
| [`dependency-license-policy.md`](./dependency-license-policy.md) | Runtime dependency license ledger, purpose map, and dependency-change evidence rules. |
| [`config-precedence-policy.md`](./config-precedence-policy.md) | SDK/CLI/MCP configuration precedence, rc-file, env, flag, and base URL override rules. |
| [`generator-portability-plan.md`](./generator-portability-plan.md) | Repo-owned local-generator and no-paid-generator plan for OpenAPI-to-SDK generation. |
| [`sdk-runtime-policy.md`](./sdk-runtime-policy.md) | Durable hand-written SDK runtime seam policy around the generated core. |
| [`workflow-cookbook.md`](./workflow-cookbook.md) | Cross-surface recipes and generated workflow-plan shape for first-run support plus common SDK, CLI, and MCP user jobs. |
| [`acceptance-scenarios.md`](./acceptance-scenarios.md) | End-to-end SDK/CLI/MCP user journey acceptance matrix with generated plan shape, mock/live, receipt, cleanup, and OpenAPI proof expectations. |
| [`examples-matrix.md`](./examples-matrix.md) | Cross-surface SDK/CLI/MCP examples matrix and generated examples-plan shape with mock/live boundaries and receipt expectations. |
| [`snippet-safety-policy.md`](./snippet-safety-policy.md) | Copy-paste snippet safety rules for SDK, CLI, MCP, README, and cookbook examples. |
| [`snippet-compile-policy.md`](./snippet-compile-policy.md) | README SDK snippet compile-pin rules for byte-exact slices of curated examples. |
| [`decision-records-policy.md`](./decision-records-policy.md) | Rules for durable decision records that preserve source-of-truth, release, and live proof rationale. |
| [`contract-inventory-policy.md`](./contract-inventory-policy.md) | Rules for keeping policy docs, contract JSON, checker scripts, Make targets, helper ownership, helper command coverage, and audit evidence wired together. |
| [`change-impact-policy.md`](./change-impact-policy.md) | Change-scope to required-gate mapping and generated change-impact plan shape for SDK, CLI, MCP, OpenAPI, docs, release, live proof, and final proof changes. |
| [`security-threat-model.md`](./security-threat-model.md) | Practical SDK/CLI/MCP/OpenAPI threat model with mitigations and proof gates. |
| [`data-handling-policy.md`](./data-handling-policy.md) | Workspace data, privacy, evidence, and redaction policy. |
| [`supply-chain-policy.md`](./supply-chain-policy.md) | Package license, provenance, tarball, and publish-safety rules. |
| [`compatibility-policy.md`](./compatibility-policy.md) | SDK/CLI/MCP/OpenAPI compatibility and deprecation rules. |
| [`breaking-change-review-policy.md`](./breaking-change-review-policy.md) | Replacement-first review rules for SDK, CLI, MCP, OpenAPI, package, docs, changelog, and migration breaking changes. |
| [`receipts-policy.md`](./receipts-policy.md) | SDK/CLI/MCP receipt, correlation, and observability rules. |
| [`instruction-walkthrough-2026-08-10.md`](./instruction-walkthrough-2026-08-10.md) | Dated naive-agent baseline over all seven task packets and the 16 change-scope verification rows. |
| [`quality-survey-2026-08-11.md`](./quality-survey-2026-08-11.md) / [`quality-survey-2026-08-11.json`](./quality-survey-2026-08-11.json) | Four-pass quality survey (graph facts, judged candidates, test-dimension audit, verification meta-audit); passes 1-2 complete, passes 3-4 not started with the exact stopping point recorded. |
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
| [`live-tests.md`](./live-tests.md) | Sandbox-only live-test policy, cleanup proof, isolated evidence campaign, exact-hash approval/import, deferral rules, and mock alternative. |
| [`test-data-lifecycle-policy.md`](./test-data-lifecycle-policy.md) | Live sandbox prefix ledger, cleanup obligations, leftover scan, and test-data stop conditions. |
| [`risk-register.md`](./risk-register.md) | Known limitations, accepted risks, provisional states, helper planners, generated risk-status report shape, and closure gates. |
| [`user-docs-policy.md`](./user-docs-policy.md) | User-facing README, onboarding, install, migration, and troubleshooting documentation rules. |
| [`docs-quality-policy.md`](./docs-quality-policy.md) | Evidence-first documentation quality rules: exact names, generated truth surfaces, no unsupported readiness claims, and non-coder clarity. |
| [`agent-handoff-policy.md`](./agent-handoff-policy.md) | Future-agent guidance, canonical contract, and temporary-context lifecycle rules. |
| [`plan-lifecycle-policy.md`](./plan-lifecycle-policy.md) | Canonical `pending` through `archived` roadmap lifecycle and fail-closed completion rules. |
| [`developer-environment-policy.md`](./developer-environment-policy.md) | Local Node/npm workspace, codegen, GOCLMCP bootstrap rules, and repo-doctor generated report shape. |
| [`api-docs-policy.md`](./api-docs-policy.md) | TypeDoc and generated SDK resource documentation rules. |
| [`mcp-write-safety-policy.md`](./mcp-write-safety-policy.md) | MCP destructive-write confirmation, receipt, and recovery policy. |
| [`mcp-agent-ux-policy.md`](./mcp-agent-ux-policy.md) | MCP agent UX rules for workflow-first guidance, server instructions, resources, prompts, receipts, and recovery. |
| [`cli-write-safety-policy.md`](./cli-write-safety-policy.md) | CLI write/delete determinism, explicit target, and receipt policy. |
| [`mcp-backlog.md`](./mcp-backlog.md) | Literal roadmap for the 22 accepted MCP could-add candidates from ADR 0006; docs-only until a deliberate tool-count change lands. |
| [`openapi-evidence-policy.md`](./openapi-evidence-policy.md) | Evidence rules for manual OpenAPI corrections and generator decisions. |
| [`openapi-source-lock-policy.md`](./openapi-source-lock-policy.md) | Immutable upstream OpenAPI source-lock shape/network-proof split and the H01-LOCK change procedure. |
| [`service-routing-matrix-policy.md`](./service-routing-matrix-policy.md) | Evidentiary standard for the service-routing matrix and the H02-ROUTING approval procedure. |
| [`schema-quality-policy.md`](./schema-quality-policy.md) | OpenAPI component schema, enum, request/response model, loose-object, and generated TypeScript model quality rules. |
| [`upstream-drift-policy.md`](./upstream-drift-policy.md) | Clockify API, GOCLMCP, SDK, CLI, MCP, and docs drift lifecycle and routing rules. |
| [`operation-coverage-policy.md`](./operation-coverage-policy.md) | No-regression coverage thresholds for OpenAPI, SDK names, TS MCP, GOCLMCP, and curated parity overrides. |

## Generated truth surfaces

This table holds **two different kinds of file**, and the `Regenerate` column is
what tells them apart — read it before editing anything here:

- **Generated** (14 rows) — the cell names a command, e.g. `make product-surface`.
  These are machine-written. Never hand-edit one: your change is erased on the
  next run, and the matching `*-drift` gate reds until the checked-in copy
  matches the generator.
- **Hand-maintained contracts** (91 rows) — the cell reads `edit intentionally`.
  These are *not* generated. You SHOULD edit them when the governed behavior
  changes, together with the checker, its test, and the Make target named in
  [`contract-inventory.json`](./contract-inventory.json).

The heading is historical; treat `edit intentionally` as authoritative over it.

| Surface | Regenerate | Purpose |
|---|---|---|
| [`product-surface.json`](./product-surface.json) / [`product-surface.md`](./product-surface.md) | `make product-surface` | SDK/CLI/MCP package and workflow metadata. |
| [`generated-edit-contract.json`](./generated-edit-contract.json) | edit intentionally | Generated/snapshot path edit guard contract. |
| [`error-codes.json`](./error-codes.json) / [`error-codes.md`](./error-codes.md) | `make error-docs` | Shared error and recovery vocabulary. |
| [`error-registry-contract.json`](./error-registry-contract.json) | edit intentionally | Integrity anchor for the shared error-code registry: code id set, required fields, package copies, and reachable-code grounding. |
| [`troubleshooting.md`](./troubleshooting.md) | `make troubleshooting` | Generated recovery guide from the error registry. |
| [`openapi-operations.json`](./openapi-operations.json) / [`openapi-operations.md`](./openapi-operations.md) | `make openapi-operations` | Corrected OpenAPI operation inventory. |
| [`openapi-source-lock.schema.json`](./openapi-source-lock.schema.json) | edit intentionally | Shape contract for the immutable, human-approved upstream OpenAPI source lock (repo/commit/path/hash/composer/approval). See `scripts/lib/openapi-source-lock.mjs`. The canonical [`openapi-source-lock.json`](./openapi-source-lock.json) is human-approved at the exact 2026-08-04 upstream commit and SHA-256, and consumed by `check-live-evidence-manifest.mjs` and `check-live-evidence-currentness.mjs`. |
| [`openapi-source-lock.example.json`](./openapi-source-lock.example.json) | edit intentionally | An obviously non-authoritative example matching the schema shape. Not a real lock; excluded from release proof. |
| [`live-evidence-currentness-contract.json`](./live-evidence-currentness-contract.json) | edit intentionally | Names the exact campaign inputs and governed approval artifacts that determine whether imported live evidence is still current. |
| [`live-evidence-currentness.json`](./live-evidence-currentness.json) | `node scripts/record-live-evidence-currentness.mjs`, after genuine re-verification | Honest base commit plus exact content hashes for the imported manifest, campaign receipt, approval receipt, and governed inputs; a stale record is release-blocking and is never edited to pretend that an old campaign proves new code. |
| [`live-differential-contract.json`](./live-differential-contract.json) | edit intentionally | Differential gate between the live wire and the corrected OpenAPI response schemas. A field on the wire but absent from the schema is data the SDK silently drops and FAILS; a schema-only field only warns. `knownDrift` is a tracked defect list with closure targets, not a standing exemption -- new fields on a recorded operation still fail, and a record that stops reproducing fails until removed. |
| [`live-differential-receipt.json`](./live-differential-receipt.json) | `make live-differential` | Sanitized receipt for the last differential run: operation ids and FIELD NAMES only, never response values. |
| [`service-routing-matrix.json`](./service-routing-matrix.json) | edit intentionally, per source evidence | Evidence-backed Clockify service/profile routing matrix (ROUTE-001). H02-ROUTING-approved 2026-07-27; ROUTE-002 shipped runtime routing in SDK 0.13.0. Wrapper runtime does not import this file — it keeps an equality-pinned hand-written copy in `wrapper/internal/routing.ts`, and `wrapper/tests/routing-matrix-equality.test.ts` fails closed on drift. |
| [`openapi-evidence-contract.json`](./openapi-evidence-contract.json) | edit intentionally | Discrepancy ledger and OpenAPI evidence contract. |
| [`schema-quality-contract.json`](./schema-quality-contract.json) | edit intentionally | Schema/model quality contract for corrected OpenAPI and generated TypeScript surfaces. |
| [`upstream-drift-contract.json`](./upstream-drift-contract.json) | edit intentionally | Upstream API drift lifecycle, evidence, routing, regeneration, and proof contract. |
| [`operation-coverage-contract.json`](./operation-coverage-contract.json) | edit intentionally | OpenAPI/SDK/MCP operation coverage and exact generated-SDK split contract. |
| [`operation-dispositions.json`](./operation-dispositions.json) | `make operation-parity` | All 168 operations mapped to codegen-receipt reachability, naming class, and evidence identifiers. |
| [`operation-evidence-anchor-inventory.json`](./operation-evidence-anchor-inventory.json) | edit intentionally | Complete reviewed classification of every discrepancy-ledger anchor and its current operation applicability. |
| [`operation-evidence-semantic-contract.json`](./operation-evidence-semantic-contract.json) | edit intentionally | Independent canonical pagination routes plus route/schema-derived evidence-set expectations. |
| [`operation-evidence-map.json`](./operation-evidence-map.json) | `make operation-parity` | Derived 168-row evidence audit with applicable anchors or an explicit audited-no-applicable-evidence reason. |
| [`sdk-operation-naming-classifications.json`](./sdk-operation-naming-classifications.json) | edit intentionally | Governed registry for the exact 19 operationId-derived generated methods. |
| [`operation-parity.json`](./operation-parity.json) / [`operation-parity.md`](./operation-parity.md) | `make operation-parity` | Receipt-derived generated SDK, TS MCP, and GOCLMCP parity join. |
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
| [`build-determinism-contract.json`](./build-determinism-contract.json) | edit intentionally | Wrapper build-twice determinism contract for stable `dist/` output. |
| [`package-contract.json`](./package-contract.json) | edit intentionally | Public package names, bins, exports, pack files, and publish-safety invariants. |
| [`pack-consumer-smoke-contract.json`](./pack-consumer-smoke-contract.json) | edit intentionally | Packed SDK/CLI/MCP consumer proof contract for local tarball install/import/run checks. |
| [`examples-contract.json`](./examples-contract.json) | edit intentionally | Runnable SDK example inventory and import/secret-safety contract. |
| [`examples-matrix-contract.json`](./examples-matrix-contract.json) | edit intentionally | SDK/CLI/MCP examples matrix, generated examples-plan, mock/live boundary, and receipt contract. |
| [`snippet-safety-contract.json`](./snippet-safety-contract.json) | edit intentionally | Copy-paste snippet safety contract. |
| [`snippet-method-parity-policy.md`](./snippet-method-parity-policy.md) | edit intentionally | SDK snippet method-name parity rules for MCP docs and READMEs. |
| [`snippet-method-parity-contract.json`](./snippet-method-parity-contract.json) | edit intentionally | Contract for checking SDK snippet method names against the generated client. |
| [`snippet-compile-contract.json`](./snippet-compile-contract.json) | edit intentionally | Contract for pinning tagged SDK fences to compiled curated examples. |
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
| [`./spec/evidence/cassettes`](../spec/evidence/cassettes) | edit intentionally | Redacted response cassettes replayed through the typed SDK client by `make cassettes`. |
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
| [`live-sandbox-fingerprint.json`](./live-sandbox-fingerprint.json) | edit intentionally | Non-reversible identity pin for the governed sacrificial live-test workspace. |
| [`test-data-lifecycle-contract.json`](./test-data-lifecycle-contract.json) | edit intentionally | Live sandbox test-data prefix, cleanup, leftover scan, and receipt contract. |
| [`risk-register.json`](./risk-register.json) | edit intentionally | Evidence-backed risk and limitation register. |
| [`user-docs-contract.json`](./user-docs-contract.json) | edit intentionally | User-facing documentation parity contract. |
| [`docs-quality-contract.json`](./docs-quality-contract.json) | edit intentionally | Evidence-first documentation quality contract for SDK, CLI, MCP, OpenAPI, and operator docs. |
| [`agent-handoff-contract.json`](./agent-handoff-contract.json) | edit intentionally | Future-agent guidance and temporary-context lifecycle contract. |
| [`plan-lifecycle-contract.json`](./plan-lifecycle-contract.json) | edit intentionally | Machine-readable roadmap states, transitions, evidence, dependencies, Task 1 review model, and Task 21 wiring. |
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
| [`lint-config-contract.json`](./lint-config-contract.json) | edit intentionally | The three ESLint flat configs' strictTypeChecked/warn-free/consistent-type-imports requirements and the 6-entry rationale-backed disable allowlist. |
| [`tsconfig-parity-contract.json`](./tsconfig-parity-contract.json) | edit intentionally | The three tsconfig.json files' required-equal flags, declared per-package diffs, and verbatimModuleSyntax compiler-side equivalence claim. |
| [`gate-reachability-contract.json`](./gate-reachability-contract.json) | edit intentionally | The six named root gates and the licensed-exception allowlist for any `scripts/check-*.mjs` file not executed by the Makefile, a package.json script, or a workflow. |
| [`surface-divergence-licenses.json`](./surface-divergence-licenses.json) | edit intentionally | Licensed intentional divergences across the SDK/CLI/MCP surfaces (schema kinds plus the cross-surface behavior kind); an unlicensed or rotted divergence reds `make mcp-schema-parity`. |
| [`consumer-cast-budget-contract.json`](./consumer-cast-budget-contract.json) | edit intentionally | Source-aware zero request-cast ratchet, complete exception-governance schema, reused public no-`any` proof, and per-package strictness state. |
| [`published-surface-diff-contract.json`](./published-surface-diff-contract.json) | edit intentionally | Published-vs-candidate SDK/CLI/MCP surface differ: the 3 registry specs it fetches and the bump-class policy (major/minor/patch/none/downgrade) that decides `make published-surface-diff`'s block/pass verdict. |
| [`test-matrix-contract.json`](./test-matrix-contract.json) | edit intentionally | SDK/CLI/MCP package script and required test-file contract. |
| [`coverage-contract.json`](./coverage-contract.json) | edit intentionally | Measured SDK/CLI/MCP coverage floor contract (hand-written surface; ratchets up). |
| [`mutation-score-contract.json`](./mutation-score-contract.json) | edit intentionally | Wrapper + MCP + CLI Stryker mutation-score floor contract for hand-written helper, safety-critical, command-risk, reference, and receipt modules. |
| [`remote-mutation-proof-contract.json`](./remote-mutation-proof-contract.json) | live-evidence record | Canonical aggregate GitHub-only mutation-proof record, verified for the retained aggregate Actions artifact; `make mutation-ci` binds its offline duplicate evidence, while a fresh download still requires the separately invoked live verifier. |
| [`aggregate-gates-contract.json`](./aggregate-gates-contract.json) | edit intentionally | Exact aggregate Make/verify execution sequences, one-execution counts, standalone full/release proof ownership, performance-last ordering, raw Make/Stryker accounting, recursive npm payload traversal, and transitive no-local-mutation bounds. |
| [`gate-tier-inventory.json`](./gate-tier-inventory.json) / [`gate-tier-inventory.md`](./gate-tier-inventory.md) | `make gate-tier-inventory` | Generated active four-bundle `contract-gates` proof topology plus all 87 resolved D4 decision rows. |
| [`test-wiring-contract.json`](./test-wiring-contract.json) | edit intentionally | Every test file under `scripts/` must be executed by a Make target, npm script, or workflow. Records the pinned test-file count and the exemption list, which is checked in four directions so an exemption cannot outlive its reason. Runs from `make aggregate-gates`. |
| [`aggregate-gates-goclmcp.Makefile`](./aggregate-gates-goclmcp.Makefile) | source-derived fallback | Exact relevant GOCLMCP Make target subset used only when the sibling directory is absent and checked target-by-target against a readable live sibling when present. |
| [`generator-config-contract.json`](./generator-config-contract.json) | edit intentionally | Local TypeScript generator input, output, command, and sync contract. |
| [`generator-independence-contract.json`](./generator-independence-contract.json) | edit intentionally | Generated-core boundary contract for wrapper exports and CLI/MCP dependencies. |
| [`generator-comparison-contract.json`](./generator-comparison-contract.json) | edit intentionally | OpenAPI SDK-stamp to generated TypeScript method comparison contract. |
| [`generator-portability-contract.json`](./generator-portability-contract.json) | edit intentionally | No-paid-generator and vendor-exit contract. |
| [`mock-clockify-contract.json`](./mock-clockify-contract.json) | edit intentionally | Local mock Clockify route/test/docs contract. |
| [`fixture-mock-parity-map.json`](./fixture-mock-parity-map.json) | edit intentionally | Golden fixture to mock-route parity map for served and unserved-by-design fixtures. |
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
| Doc correctness anchor | `make doc-correctness-anchor` | Compare the documented OpenAPI operation count to emitted generated SDK methods. |
| Generator portability | `make generator-portability` | Check no-paid-generator, local-regeneration, and vendor-exit boundaries. |
| Package contract | `make package-contract` | Compare SDK/CLI/MCP manifests to the public package contract snapshot. |
| Pack smoke | `make pack-smoke` | Pack SDK/CLI/MCP tarballs, install them into clean temporary consumer projects, and check import/binary entrypoints against the smoke contract. |
| Examples contract | `make examples-contract` | Check runnable SDK examples against the public package/import contract. |
| Examples matrix | `make examples-matrix` | Check SDK/CLI/MCP examples matrix and generated examples-plan shape, mock/live boundaries, mutation safety, and receipt expectations. |
| Examples run | `make examples-run` | Run the mock-safe example allowlist against a real mock Clockify server and assert each one's documented output. `perfect-full` tier only. |
| Snippet safety | `make snippet-safety` | Check SDK/CLI/MCP README and cookbook snippets avoid secrets, internals, and unsafe live defaults. |
| Snippet method parity | `make snippet-method-parity` | Check MCP and README SDK snippets against generated SDK method names. |
| Snippet compile pins | `make snippet-compile` | Check tagged SDK fences against compiled curated examples. |
| Runtime support | `make runtime-support` | Check package engines and runtime docs agree on Node 22.13+. |
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
| Sandbox key health | `make sandbox-key-health` | Optional live Clockify sandbox key preflight; skips cleanly when credentials are blank. |
| Live safety | `make live-safety` | Check confirmed sandbox scope, exclusive lock behavior, four-surface aggregation, finally cleanup, and secret-free receipts. |
| Test data lifecycle | `make test-data-lifecycle` | Check exact/legacy prefixes, create/delete pairing, dependency-ordered cleanup, complete rescans, and zero-leftover receipts. |
| Live-evidence campaign | `make live-evidence-campaign` | Rebuild and execute the content-snapshotted 168-operation sandbox campaign, producing ignored candidates for separate exact-hash approval and import. |
| Risk register | `make risk-register` | Check known risks, accepted constraints, evidence paths, and closure gates. |
| Risk status report | `make risk-status-report` | Print no-network open/provisional risk and file-state signals. |
| Performance budgets | `make performance-budgets` | Check built SDK/CLI/MCP artifact size/startup ceilings and generated calibration-plan policy alignment. |
| Performance receipt | `make performance-receipt` | Write measured package size/startup receipt for budget calibration. |
| Performance calibration plan | `make performance-calibration-plan` | Print no-network budget-policy-backed calibration and tightening plan. |
| User docs | `make user-docs` | Check root, SDK, CLI, MCP, install, migration, and troubleshooting docs cover required onboarding content. |
| Documentation quality | `make docs-quality` | Check evidence-first claims, exact package names, generated truth surfaces, safe snippets, and unsupported marketing-claim blacklist. |
| Axioms contract | `make axioms-contract` | Check SDK/CLI/MCP/OpenAPI axioms stay tied to concrete gates and evidence. |
| Agent handoff | `make agent-handoff` | Check AGENTS/CLAUDE guidance, the closed roadmap lifecycle, evidence-only closeout rules, generated-path rules, temporary context, and stale-count markers. |
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
| Consumer cast budget | `make consumer-cast-budget` | Keep CLI/MCP request assertions and canonical exceptions exactly at zero while validating future exception references and the existing public no-`any` type proof. |
| Published surface diff | `make published-surface-diff` | Fetch the last-published SDK/CLI/MCP tarballs, diff each against the local candidate build, and block on a surface delta the bump class does not permit. `release-proof` tier only. |
| Test matrix | `make test-matrix` | Check package scripts and required SDK/CLI/MCP test files are present. |
| Mock Clockify | `make mock-contract` | Check local mock Clockify routes and SDK/CLI/MCP mock-backed tests stay aligned. |
| Mutation score | `make mutation` | Opt-in local wrapper + MCP + CLI Stryker mutation testing; prefer the manual GitHub Mutation workflow for routine proof. |
| Mutation CI wiring | `make mutation-ci` | Check the GitHub Mutation workflow and canonical proof record offline: weekly schedule plus manual dispatch on exact Node 22.13.0, SHA-pinned actions, complete history, 14-day reports, and fixture-only verifier tests. It retains historical maximum floors and the governed-package/module union, never calls GitHub/downloads an artifact/runs Stryker, and cannot accept a pending record as final proof. |
| Replay fixtures | `make replay-fixtures` | Replay committed redacted fixtures and check live-fidelity wire-shape tripwires offline. |
| Typed cassettes | `make cassettes` | Replay redacted response cassettes through the typed SDK client and local mock server. |
| Maintenance playbook | `make maintenance-playbook` | Check maintainer cadence, generated maintenance-plan shape, dependency updates, generator bumps, API drift response, release rehearsal, rollback, and receipts stay explicit. |
| Mutation safety | `make mutation-safety` | Check SDK retry defaults, CLI write rules, MCP confirmation flow, receipt shape, and ambiguous-failure recovery stay aligned. |

## Generated API docs

[`api/`](./api/index.html) is generated by TypeDoc from the SDK wrapper and generated SDK resource modules. Do not hand-edit generated API pages.
