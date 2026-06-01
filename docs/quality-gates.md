# Quality Gates

This file maps the enterprise-SDK polish target to concrete commands. It is written for a non-coder operator and for future agents that have lost conversation context.

## Root commands

| Goal | Command | What it proves |
|---|---|---|
| See available gates | `make help` | The repo exposes a one-screen command menu. |
| Fast deterministic proof | `make perfect-fast` | Guarded generated paths are clean, product surface metadata is current, allowlisted docs drift is checked, and SDK/CLI/MCP package gates pass. |
| Full generation proof | `make perfect-full` | GOCLMCP drift gates, local SDK generation, all package gates, and packed-consumer smoke pass. |
| Live sandbox proof | `make perfect-live` | TS MCP live cleanup and GOCLMCP sacrificial-workspace live proof run with explicit live env. |
| Refresh surface metadata | `make product-surface` | `docs/product-surface.json` and `docs/product-surface.md` match package manifests and workflow metadata. |
| Refresh error docs | `make error-docs` | `docs/error-codes.md` matches the shared SDK/CLI/MCP recovery registry. |
| Refresh troubleshooting | `make troubleshooting` | `docs/troubleshooting.md` matches the shared SDK/CLI/MCP recovery registry. |
| Refresh operation inventory | `make openapi-operations` | `docs/openapi-operations.json` and `docs/openapi-operations.md` match the corrected OpenAPI snapshot. |
| Refresh operation parity | `make operation-parity` | `docs/operation-parity.json` and `docs/operation-parity.md` join corrected OpenAPI operations to SDK names and MCP tool names where mechanically obvious. |
| Check OpenAPI contract lint | `make openapi-lint` | Corrected OpenAPI operation count, operation IDs, tags, responses, SDK naming coverage, pagination, and Last-Page stamps stay within expected bounds. |
| Check schema quality | `make schema-quality` | Corrected OpenAPI schemas, enums, loose objects, request/response models, evidence ledger, and generated TypeScript model ergonomics stay governed. |
| Check OpenAPI evidence contract | `make openapi-evidence` | Discrepancy ledger policy, required finding markers, support evidence, and OpenAPI proof targets stay explicit. |
| Check upstream drift lifecycle | `make upstream-drift` | Clockify/API/GOCLMCP/SDK drift detection, classification, evidence, regeneration, reconciliation, and proof rules stay explicit. |
| Check operation coverage | `make operation-coverage` | OpenAPI operation count plus SDK, TS MCP, GOCLMCP, and curated parity coverage floors do not regress. |
| Check generator config | `make generator-config` | Local TypeScript generator input, output, command, and wrapper sync paths stay intentional. |
| Check generator independence | `make generator-independence` | Generated local SDK output remains behind the wrapper package seam and is not imported by CLI/MCP as product code. |
| Check generator comparison | `make generator-comparison` | Corrected OpenAPI SDK method stamps still exist in generated TypeScript client files. |
| Check generator portability | `make generator-portability` | No-paid-generator, local-regeneration, and vendor-exit boundaries stay explicit. |
| Check package contract | `make package-contract` | SDK/CLI/MCP manifests keep the expected public package names, bins, exports, pack files, and publish-safety rails. |
| Check examples contract | `make examples-contract` | SDK examples import the public package name, stay catalogued, avoid local source imports, and avoid committed secret-shaped values. |
| Check examples matrix | `make examples-matrix` | SDK/CLI/MCP examples, generated examples-plan shape, mock/live boundaries, mutation safety, and receipt expectations stay aligned. |
| Print examples plan | `make examples-plan` | Static no-network SDK/CLI/MCP examples plan with safety boundaries and proof hints, backed by the examples-matrix contract. |
| Check snippet safety | `make snippet-safety` | SDK/CLI/MCP README and cookbook snippets avoid secrets, internals, and unsafe live defaults. |
| Check runtime support | `make runtime-support` | SDK/CLI/MCP package engines and runtime support docs agree on Node 20+. |
| Check env/config contract | `make env-contract` | SDK/CLI/MCP environment variables, mock base URL behavior, and secret-hygiene docs stay aligned. |
| Check config precedence | `make config-precedence` | SDK option/env fallback, CLI flag/env/rc order, MCP env-only startup, and base URL override safety stay aligned. |
| Check SDK public API contract | `make sdk-public-api` | SDK root symbols, package subpaths, and dual-build smoke expectations agree. |
| Check SDK runtime contract | `make sdk-runtime-contract` | Hand-written SDK runtime seams around the generated core stay durable, exported, and tested. |
| Check decision records | `make decision-records` | Durable architectural and operations decisions remain documented with context, consequences, and proof. |
| Check contract inventory | `make contract-inventory` | Policy docs, contract JSON, checker scripts, Make targets, generated inventory report shape, toolbox helper ownership and command coverage, docs index rows, quality-gate rows, and audit evidence stay wired together. |
| Print contract inventory report | `make contract-inventory-report` | Static no-network report of contract entries, checker ownership, generated report/helper ownership, toolbox helper ownership and command coverage, perfect-gate coverage, and missing-file signals. |
| Check workflow cookbook | `make workflow-cookbook` | First-run support, real user jobs, generated workflow-plan shape, SDK/CLI/MCP paths, product-surface metadata, and write-safety contracts stay aligned. |
| Print workflow plan | `make workflow-plan` | Static no-network SDK/CLI/MCP plan for first-run support, common user workflows, and recovery paths, backed by the workflow-cookbook contract. |
| Check acceptance scenarios | `make acceptance-scenarios` | End-to-end SDK/CLI/MCP user journeys, generated acceptance-plan shape, proof mode, receipts, cleanup, and OpenAPI truth stay covered. |
| Print acceptance scenario plan | `make acceptance-plan` | Static no-network proof plan for SDK/CLI/MCP acceptance scenarios and required evidence, backed by the acceptance-scenarios contract. |
| Check naming taxonomy | `make naming-taxonomy` | One Clockify vocabulary across SDK methods, CLI commands, MCP tools, docs, examples, and OpenAPI parity stays aligned. |
| Check change impact | `make change-impact` | Change scopes, generated change-impact plan shape, required gates, docs, changelog posture, and proof receipts stay aligned. |
| Print change impact plan | `make change-impact-plan` | Static no-network proof plan for default docs/axioms/release scopes, backed by the change-impact contract; use the script directly with `--scope` or `--path` for focused triage. |
| Check security threat model | `make security-threat-model` | SDK/CLI/MCP/OpenAPI risk surfaces, mitigations, supporting safety docs, and proof-gate wiring stay explicit. |
| Check version policy | `make version-policy` | Package manifests, changelog headings, generated product surface, and install examples agree on versions. |
| Check secret hygiene | `make secret-hygiene` | Scans committed source/docs for common token-shaped secrets and verifies secret-handling docs remain present. |
| Check data handling | `make data-handling` | Workspace data classes, redaction rules, live evidence, and support bundle boundaries stay explicit. |
| Check supply chain | `make supply-chain` | Package licenses, provenance settings, exact `prepublishOnly` gate shape, tarball files, and supporting package/dependency contracts stay aligned. |
| Check dependency boundary | `make dependency-boundary` | Package runtime dependencies, SDK peer/dev boundaries, and forbidden generated-core imports stay intentional. |
| Check dependency license | `make dependency-license` | Runtime dependency license ledger, purpose map, package manifests, and forbidden dependency list stay aligned. |
| Check compatibility contract | `make compatibility-contract` | Public SDK/CLI/MCP/OpenAPI compatibility policy, deprecation helper, changelogs, migration docs, and surface contracts stay aligned. |
| Check breaking-change review | `make breaking-change-review` | Public SDK/CLI/MCP/OpenAPI/package breakage has replacement-first migration, changelog, acceptance, and proof evidence. |
| Check receipts contract | `make receipts-contract` | SDK request correlation, response metadata, OTel hooks, CLI JSON errors, and MCP structured envelopes stay aligned. |
| Check observability contract | `make observability` | SDK request IDs, telemetry hooks, response metadata, CLI/MCP receipts, redaction rules, and safe support bundles stay aligned. |
| Check diagnostics contract | `make diagnostics` | SDK, CLI, and MCP no-network diagnostics stay redacted, receipt-shaped, and aligned with first live probes. |
| Check quickstart receipt | `make quickstart-receipt` | Diagnostics-first quickstart, SDK/CLI/MCP local checks, mock/live split, first live probes, and receipt template stay aligned. |
| Check receipt examples | `make receipt-examples` | Golden SDK/CLI/MCP success and recovery receipt examples stay aligned with receipt contracts. |
| Check support bundle | `make support-bundle` | Safe diagnostic bundle, generated redaction flags, package prepublish-gate metadata, package-lock summary metadata, escalation template, and support evidence stay aligned. |
| Check issue intake | `make issue-intake` | Bug, feature, PR, support, and security intake templates collect surface, version, receipt, proof, risk, and redaction evidence. |
| Check release/support contract | `make release-support-contract` | Release support policy, `SECURITY.md`, package names, proof targets, and no-default-publish guidance stay aligned. |
| Check release readiness | `make release-readiness` | Release/handoff evidence checklist, generated preflight report shape, final proof closure, and publish decision boundary stay explicit. |
| Print release workflow decision plan | `make release-decision-plan` | Static no-network decision packet for local tarball, tag-only, npm-via-CI, or legacy-workflow retirement paths. |
| Check CI contract | `make ci-contract` | GitHub workflow roles, package CI gates, docs/release safety rails, and release decision boundary stay explicit. |
| Check live safety | `make live-safety` | Sandbox-only live-test policy, env gates, cleanup prefixes, live-proof deferral rules, and mock alternative stay aligned. |
| Check test data lifecycle | `make test-data-lifecycle` | Sandbox prefixes, create/delete pairing, cleanup scan coverage, leftover counts, and sanitized cleanup receipts stay aligned. |
| Check risk register | `make risk-register` | Known limitations, accepted constraints, provisional states, evidence paths, closure gates, and generated risk-status report shape stay explicit. |
| Print risk status report | `make risk-status-report` | Static no-network report of open/provisional risks, closure gates, and performance/temp-context file-state signals. |
| Check user docs | `make user-docs` | Root, SDK, CLI, MCP, install, migration, and troubleshooting docs keep required onboarding content. |
| Check documentation quality | `make docs-quality` | Evidence-first docs, exact names, generated truth surfaces, safe snippets, and unsupported readiness claims stay governed. |
| Check axioms contract | `make axioms-contract` | SDK/CLI/MCP/OpenAPI axioms stay tied to concrete gates and evidence. |
| Check agent handoff | `make agent-handoff` | AGENTS/CLAUDE guidance, generated-path rules, temporary-context lifecycle, and stale-count markers stay aligned. |
| Check developer environment | `make developer-environment` | Root workspace lockfile/scripts, exact `prepublishOnly` command shape, repo-doctor generated report shape, Node floor, local codegen/GOCLMCP setup docs, and workspace boundaries stay aligned. |
| Check operator toolbox | `make operator-toolbox` | No-network helper command catalogue stays safe, discoverable, inventory-owned, and clearly separated from proof gates. |
| Check operator onboarding | `make operator-onboarding` | Non-coder bootstrap, generated onboarding-plan shape, SDK/CLI/MCP path choice, mock/live boundaries, stop conditions, and readiness levels stay aligned. |
| Check API docs | `make api-docs` | TypeDoc configuration, generated resource docs, sync wiring, Pages workflow, and docs package identity stay aligned. |
| Check MCP contract | `make mcp-contract` | TS MCP tool counts, guide resources, prompts, output schema, README, and server tests stay aligned. |
| Check MCP agent UX | `make mcp-agent-ux` | MCP server instructions, workflow-first guidance, resources, prompts, structured receipts, recovery, and README discoverability stay aligned. |
| Check MCP write safety | `make mcp-write-safety` | Destructive MCP tools advertise risk, high-risk workflows require `dry_run` plus `confirm_token`, and receipts stay recoverable. |
| Check CLI contract | `make cli-contract` | CLI command metadata, README table, global flags, completion shells, binaries, and exit-code tests stay aligned. |
| Check CLI write safety | `make cli-write-safety` | CLI write/delete commands stay explicit, non-interactive, ID-scoped where destructive, and receipt-oriented. |
| Check test matrix contract | `make test-matrix` | SDK/CLI/MCP required test files, package test/build scripts, exact `prepublishOnly` command shape, and root gate targets remain present. |
| Check mock Clockify contract | `make mock-contract` | Mock Clockify server routes, headers, docs, and SDK/CLI/MCP mock-backed tests stay aligned. |
| Check maintenance playbook | `make maintenance-playbook` | Maintainer cadence, generated maintenance-plan shape, dependency updates, Fern/generator bumps, Clockify API drift response, release rehearsal, rollback, and receipts stay explicit. |
| Print maintenance plan | `make maintenance-plan` | Static no-network upkeep plan for weekly, monthly, dependency, generator, drift, release, and rollback paths, backed by the maintenance-playbook contract. |
| Check mutation safety | `make mutation-safety` | SDK retry defaults, CLI write rules, MCP confirmation flow, receipt shape, and ambiguous-failure recovery stay aligned. |
| Refresh README tables | `make readme-tables` | CLI command and MCP tool tables match `docs/cli-commands.json` and `docs/mcp-tools.json`. |
| Check changelog coverage | `make changelog-drift` | Touched package scopes include a changelog entry. |
| Check docs index | `make docs-index-drift` | `docs/README.md` links and required generated surface references are current. |
| Check enterprise hardening audit | `make enterprise-audit` | The hardening objective's artifact-level requirements are mapped to concrete current-state evidence. |
| Check performance budgets | `make performance-budgets` | Built SDK/CLI/MCP artifacts stay under size/startup ceilings, and the generated calibration plan mirrors budget policy. |
| Record performance receipt | `make performance-receipt` | Writes `docs/performance-baseline-latest.json` with measured sizes/timings for budget tightening. |
| Print performance calibration plan | `make performance-calibration-plan` | Static no-network plan from budget policy for baseline receipts, budget tightening, and final proof markers. |
| Check generated edit discipline | `make generated-edit-check` | Local diffs do not hand-edit `spec/corrected`, `output/ts-sdk`, or `wrapper/src`. |
| Check hand-written doc drift | `make docs-drift` | Hand-written wrapper SDK docs/examples stay current with the package names and changelogs. |
| Test packed artifacts like a user | `make pack-smoke` | Fresh temp projects install packed SDK, CLI, and MCP tarballs and import/run the expected entrypoints. |
| Start deterministic mock API | `make mock-clockify` | A local Clockify-shaped HTTP server is available for future mock/replay tests. |

Mock/replay tests can point SDK, CLI, or MCP clients at the server with
`CLOCKIFY_BASE_URL` or the SDK `environment` option. Do not set this
for normal Clockify use.

## Package gates

| Package | Command | Required before claiming |
|---|---|---|
| SDK wrapper | `cd wrapper && npm run type-check && npm test && npm run build && npm run build:smoke && npm pack --dry-run` | SDK source, tests, dual ESM/CJS build, and package file list are sound. |
| CLI | `cd cli && npm run type-check && npm test && npm run build && npm pack --dry-run` | CLI source, command tests, build, and package file list are sound. |
| TS MCP | `cd mcp && npm run type-check && npm test && npm run build && npm pack --dry-run` | MCP source, tool tests, build, and package file list are sound. |

## Spec and generator gates

| Scope | Command | Required before claiming |
|---|---|---|
| GOCLMCP OpenAPI truth | `cd ../GOCLMCP && make openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift` | Canonical OpenAPI and generated Go MCP docs/assets are current. |
| GOCLMCP tool parser | `cd ../GOCLMCP && go test ./internal/tools/...` | The Go MCP tool layer still parses and consumes the canonical spec. |
| Local TypeScript generator | `make sdk-codegen` | The corrected OpenAPI snapshot can reproduce `output/ts-sdk/**` and refresh `wrapper/src/**`. |
| Local generator drift check | `make sdk-codegen-drift` | The local generator output is reproducible without writing files. |
| Local generator fixture tests | `make sdk-codegen-test` | Fixture specs prove nullable fields, simple unions, `RTL`/`rtl`, path/query/body splitting, binary responses, multipart upload, naming hints, deterministic ordering, and JSON diagnostic receipts. |

## Live safety rules

- Never run live gates against a customer workspace.
- Require `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` for TS MCP live cleanup.
- Require the GOCLMCP live env described in `../GOCLMCP/docs/live-tests.md` before running Go MCP live proof.
- Trust the final cleanup receipt more than intermediate green lines.

## Failure handling

1. If a generated path changed, stop and decide whether this was a legitimate generation-chain diff.
2. If package gates fail, fix the package that failed before widening scope.
3. If product surface drift fails, run `make product-surface` and inspect the generated diff.
4. If live cleanup leaves objects behind, do not claim readiness until cleanup is proven.
