.PHONY: help perfect perfect-fast perfect-full perfect-live contract-gates wrapper-gates cli-gates mcp-gates goclmcp-drift sdk-codegen-sync sdk-wrapper-build sdk-codegen sdk-codegen-drift sdk-codegen-test codegen-determinism build-determinism product-surface product-surface-drift error-docs error-docs-drift error-registry troubleshooting troubleshooting-drift openapi-operations openapi-operations-drift operation-parity operation-parity-drift mcp-tool-manifest mcp-tool-manifest-drift operation-coverage naming-taxonomy openapi-lint schema-quality openapi-evidence upstream-drift official-openapi-drift official-openapi-report official-openapi-fetch operation-coverage generator-config generator-independence generator-comparison doc-correctness-anchor doc-correctness-anchor-strict generator-portability package-contract examples-contract examples-matrix examples-plan snippet-safety snippet-method-parity snippet-compile runtime-support env-contract config-precedence sdk-public-api sdk-runtime-contract decision-records contract-inventory contract-inventory-report workflow-cookbook workflow-plan acceptance-scenarios acceptance-plan naming-taxonomy change-impact change-impact-plan version-policy tag-hygiene version-consistency secret-hygiene data-handling security-threat-model supply-chain dependency-boundary dependency-license compatibility-contract breaking-change-review observability diagnostics support-bundle issue-intake release-support-contract release-readiness release-decision-plan ci-contract live-safety test-data-lifecycle risk-register risk-status-report user-docs docs-quality axioms-contract agent-handoff agent-tasks developer-environment repo-doctor onboarding-plan operator-toolbox operator-onboarding api-docs mcp-contract mcp-agent-ux mcp-write-safety cli-contract cli-write-safety consumer-cast-budget test-matrix mock-contract replay-fixtures cassettes fixture-mock-parity maintenance-playbook maintenance-plan mutation-safety readme-tables readme-tables-drift changelog-drift docs-index-drift enterprise-audit docs-counts conformance conformance-drift performance-budgets performance-receipt performance-calibration-plan generated-edit-check docs-drift pack-smoke sandbox-key-health mock-clockify coverage mutation mutation-ci mcpb mcpb-validate mcpb-smoke

help:
	@printf '%s\n' 'Clockify TypeScript SDK platform gates'
	@printf '%s\n' ''
	@printf '%s\n' 'Core targets:'
	@printf '%s\n' '  make perfect-fast        Deterministic local product gates without codegen/live Clockify.'
	@printf '%s\n' '  make perfect-full        Canonical OpenAPI, local SDK codegen, package gates, packed-consumer smoke, and CI mutation wiring.'
	@printf '%s\n' '  make perfect-live        Explicit sandbox/live cleanup proof. Requires live env vars.'
	@printf '%s\n' ''
	@printf '%s\n' 'Focused targets:'
	@printf '%s\n' '  make product-surface     Regenerate docs/product-surface.{json,md}.'
	@printf '%s\n' '  make error-docs          Regenerate docs/error-codes.md from docs/error-codes.json.'
	@printf '%s\n' '  make error-registry      Check shared error-code registry integrity.'
	@printf '%s\n' '  make troubleshooting     Regenerate docs/troubleshooting.md from error registry.'
	@printf '%s\n' '  make openapi-operations  Regenerate docs/openapi-operations.{json,md}.'
	@printf '%s\n' '  make operation-parity    Regenerate docs/operation-parity.{json,md}.'
	@printf '%s\n' '  make mcp-tool-manifest  Regenerate docs/mcp-tool-manifest.json from the real MCP server.'
	@printf '%s\n' '  make operation-coverage  Check OpenAPI/SDK/MCP operation coverage no-regression thresholds.'
	@printf '%s\n' '  make naming-taxonomy    Check SDK/CLI/MCP/OpenAPI vocabulary and taxonomy consistency.'
	@printf '%s\n' '  make openapi-lint        Check corrected OpenAPI operation contract invariants.'
	@printf '%s\n' '  make sdk-codegen         Regenerate output/ts-sdk and sync wrapper/src from the corrected OpenAPI snapshot.'
	@printf '%s\n' '  make sdk-codegen-drift   Check local SDK codegen output is reproducible.'
	@printf '%s\n' '  make sdk-codegen-test    Run fixture tests for local generator schema/runtime compatibility.'
	@printf '%s\n' '  make build-determinism  Build wrapper twice and compare dist bytes.'
	@printf '%s\n' '  make schema-quality     Check OpenAPI schema/model quality, enums, loose objects, and generated TS ergonomics.'
	@printf '%s\n' '  make openapi-evidence    Check discrepancy ledger policy and evidence markers.'
	@printf '%s\n' '  make upstream-drift     Check Clockify/API/GOCLMCP/SDK drift lifecycle, routing, evidence, and regeneration policy.'
	@printf '%s\n' '  make official-openapi-report  Regenerate docs/spec-diff-official.md, spec-confidence.md, live-evidence-index.md.'
	@printf '%s\n' '  make official-openapi-drift   Check official-vs-custom OpenAPI drift surfaces are fresh and wired.'
	@printf '%s\n' '  make official-openapi-fetch   Compare the LIVE official OpenAPI (network) against the custom spec.'
	@printf '%s\n' '  make generator-config    Check local TypeScript generator input, output, command, and sync wiring.'
	@printf '%s\n' '  make generator-independence Check generated core remains behind wrapper seams.'
	@printf '%s\n' '  make generator-comparison Compare OpenAPI SDK stamps to generated TS methods.'
	@printf '%s\n' '  make doc-correctness-anchor Compare documented operation count to generated methods.'
	@printf '%s\n' '  make generator-portability Check repo-owned local-generator and no-paid-generator contract.'
	@printf '%s\n' '  make package-contract    Check SDK/CLI/MCP package names, bins, exports, and pack files.'
	@printf '%s\n' '  make examples-contract   Check SDK examples import public package and stay catalogued.'
	@printf '%s\n' '  make examples-matrix     Check SDK/CLI/MCP examples matrix, mock/live boundaries, and receipt expectations.'
	@printf '%s\n' '  make examples-plan       Print a no-network SDK/CLI/MCP examples plan.'
	@printf '%s\n' '  make snippet-safety     Check copy-paste snippets avoid secrets and internals.'
	@printf '%s\n' '  make snippet-method-parity Check agent-facing SDK snippets use generated methods.'
	@printf '%s\n' '  make snippet-compile       Pin tagged SDK fences to compiled curated examples.'
	@printf '%s\n' '  make runtime-support     Check package engines and runtime docs stay aligned.'
	@printf '%s\n' '  make env-contract        Check env/config variables are implemented and documented consistently.'
	@printf '%s\n' '  make config-precedence  Check SDK/CLI/MCP configuration precedence and base URL override safety.'
	@printf '%s\n' '  make sdk-public-api      Check SDK root symbols and subpaths stay intentionally governed.'
	@printf '%s\n' '  make sdk-runtime-contract Check SDK wrapper runtime seams stay durable and tested.'
	@printf '%s\n' '  make decision-records    Check durable architectural decisions stay documented.'
	@printf '%s\n' '  make contract-inventory  Check contract docs, scripts, Make targets, and audit map stay wired.'
	@printf '%s\n' '  make contract-inventory-report Print a no-network operator report of contract inventory ownership.'
	@printf '%s\n' '  make workflow-cookbook   Check SDK/CLI/MCP workflow cookbook stays aligned.'
	@printf '%s\n' '  make workflow-plan       Print a no-network SDK/CLI/MCP workflow plan.'
	@printf '%s\n' '  make acceptance-scenarios Check SDK/CLI/MCP user journeys, proof mode, receipts, and cleanup coverage.'
	@printf '%s\n' '  make acceptance-plan     Print a no-network acceptance scenario proof plan.'
	@printf '%s\n' '  make change-impact       Check change scopes map to required gates and docs.'
	@printf '%s\n' '  make change-impact-plan  Print a no-network proof plan from the change-impact matrix.'
	@printf '%s\n' '  make version-policy      Check package versions, changelogs, and product surface agree.'
	@printf '%s\n' '  make tag-hygiene         Check local git tags avoid bare semver publish-trigger names.'
	@printf '%s\n' '  make version-consistency Check package versions against release-please manifest policy.'
	@printf '%s\n' '  make secret-hygiene      Scan committed source/docs for common token-shaped secrets.'
	@printf '%s\n' '  make data-handling      Check workspace data, privacy, and redaction boundaries.'
	@printf '%s\n' '  make security-threat-model Check SDK/CLI/MCP threat model risks, mitigations, and proof gates.'
	@printf '%s\n' '  make supply-chain       Check package license, provenance, tarball, and publish-safety posture.'
	@printf '%s\n' '  make dependency-boundary Check package runtime dependencies and SDK peer boundaries.'
	@printf '%s\n' '  make dependency-license Check runtime dependency license ledger and purpose map.'
	@printf '%s\n' '  make compatibility-contract Check public compatibility and deprecation policy evidence.'
	@printf '%s\n' '  make breaking-change-review Check replacement-first review for SDK/CLI/MCP/OpenAPI breaking changes.'
	@printf '%s\n' '  make observability     Check request correlation, telemetry hooks, structured receipts, safe support bundles, and golden receipt examples.'
	@printf '%s\n' '  make diagnostics     Check SDK/CLI/MCP no-network diagnostics, redaction, receipts, quickstart-receipt path, and first-live-probe guidance.'
	@printf '%s\n' '  make support-bundle     Check safe support/escalation diagnostic bundle guidance.'
	@printf '%s\n' '  make issue-intake      Check bug, feature, PR, support, and security intake templates collect safe reproducible evidence.'
	@printf '%s\n' '  make release-support-contract Check release/support/security docs against package policy.'
	@printf '%s\n' '  make release-readiness Check release/handoff readiness evidence checklist.'
	@printf '%s\n' '  make release-decision-plan Print a no-network release workflow decision packet.'
	@printf '%s\n' '  make ci-contract        Check GitHub workflow posture and release-safety documentation.'
	@printf '%s\n' '  make live-safety        Check sandbox-only live proof and cleanup contract.'
	@printf '%s\n' '  make test-data-lifecycle Check sandbox prefixes, create/delete pairing, cleanup scans, and leftover receipts.'
	@printf '%s\n' '  make risk-register      Check known risks, limitations, evidence, and closure gates.'
	@printf '%s\n' '  make risk-status-report Print a no-network risk status report from the risk register.'
	@printf '%s\n' '  make user-docs          Check user-facing README/onboarding documentation parity.'
	@printf '%s\n' '  make docs-quality      Check evidence-first docs, exact names, generated table discipline, and no unsupported hype.'
	@printf '%s\n' '  make axioms-contract   Check SDK/CLI/MCP/OpenAPI axioms map to concrete evidence.'
	@printf '%s\n' '  make agent-handoff      Check future-agent guidance and temporary-context lifecycle.'
	@printf '%s\n' '  make agent-tasks        Check docs/agent-tasks/ packets exist with required sections.'
	@printf '%s\n' '  make docs-counts        Check generated count sources agree and docs hold no stale headline counts.'
	@printf '%s\n' '  make conformance        Regenerate docs/conformance.md (claim -> proof matrix).'
	@printf '%s\n' '  make developer-environment Check local bootstrap/runtime/codegen setup contract.'
	@printf '%s\n' '  make repo-doctor        Print a no-network JSON repo-shape doctor for non-coder setup triage.'
	@printf '%s\n' '  make onboarding-plan    Print a no-network SDK/CLI/MCP/mock/live/full/support onboarding plan.'
	@printf '%s\n' '  make operator-toolbox   Check no-network helper catalogue and inventory ownership.'
	@printf '%s\n' '  make operator-onboarding Check non-coder bootstrap, persona selection, mock/live boundaries, stop conditions, and readiness levels.'
	@printf '%s\n' '  make api-docs           Check TypeDoc and generated resource-docs contract.'
	@printf '%s\n' '  make mcp-contract        Check MCP tools/resources/prompts/output schema stay aligned.'
	@printf '%s\n' '  make mcp-agent-ux       Check MCP server instructions, workflow-first guidance, resources, prompts, receipts, and agent UX.'
	@printf '%s\n' '  make mcp-write-safety    Check MCP destructive tools have confirmations, hints, and receipts.'
	@printf '%s\n' '  make cli-contract        Check CLI commands, globals, completion, and exit-code contract.'
	@printf '%s\n' '  make cli-write-safety    Check CLI write commands stay explicit, non-interactive, and receipt-oriented.'
	@printf '%s\n' '  make consumer-cast-budget Check CLI/MCP consumer as-never escape hatches stay annotated and budgeted.'
	@printf '%s\n' '  make coverage            Measure SDK/CLI/MCP coverage and enforce pinned floors.'
	@printf '%s\n' '  make mutation            Opt-in local Stryker mutation test; prefer the manual GitHub Mutation workflow.'
	@printf '%s\n' '  make mutation-ci         Check the manual GitHub Mutation workflow is wired.'
	@printf '%s\n' '  make test-matrix         Check SDK/CLI/MCP test files and package scripts are present.'
	@printf '%s\n' '  make mock-contract       Check mock Clockify server routes and mock-backed tests.'
	@printf '%s\n' '  make replay-fixtures     Replay committed redacted fixtures and check wire-shape tripwires.'
	@printf '%s\n' '  make cassettes           Replay redacted response cassettes through the typed SDK client.'
	@printf '%s\n' '  make fixture-mock-parity Byte-check committed golden fixtures against the live mock server.'
	@printf '%s\n' '  make maintenance-playbook Check maintainer cadence, upgrade, drift, release, and rollback playbooks.'
	@printf '%s\n' '  make maintenance-plan    Print a no-network maintenance plan by cadence or procedure.'
	@printf '%s\n' '  make mutation-safety    Check SDK retry, CLI write, MCP confirmation, receipt, and ambiguous-failure rules.'
	@printf '%s\n' '  make readme-tables       Regenerate CLI/MCP README tables from metadata.'
	@printf '%s\n' '  make changelog-drift     Check touched package scopes have changelog entries.'
	@printf '%s\n' '  make enterprise-audit    Check framework artifacts and audit map.'
	@printf '%s\n' '  make performance-budgets Check built package size/startup budgets.'
	@printf '%s\n' '  make performance-receipt Write latest size/startup measurements for budget calibration.'
	@printf '%s\n' '  make performance-calibration-plan Print the no-network budget calibration plan.'
	@printf '%s\n' '  make pack-smoke          Install packed SDK/CLI/MCP tarballs into temp consumer projects.'
	@printf '%s\n' '  make sandbox-key-health  Validate sandbox key shape offline; LIVE probe only when a key is present.'
	@printf '%s\n' '  make mock-clockify       Start the local mock Clockify server for deterministic tests.'
	@printf '%s\n' '  make mcpb-validate       Validate the MCPB manifest without building a bundle.'
	@printf '%s\n' '  make mcpb                Build the self-contained MCP one-click install bundle (mcp/*.mcpb).'
	@printf '%s\n' '  make mcpb-smoke          Build the MCPB bundle and inspect it with the pinned mcpb tool.'

perfect: perfect-fast

# NOTE: `performance-budgets` is intentionally the LAST prerequisite in both
# perfect-fast and perfect-full. Its CLI/MCP startup-time sub-checks are
# load-sensitive and flake under CPU contention; placed last (and relying on
# GNU make's serial, left-to-right, abort-on-first-failure prerequisite order —
# do not invoke these targets with -j), a flake can no longer skip the heavy
# proofs (pack-smoke/coverage/mutation). It stays a FATAL prerequisite: the
# file-size and import/startup-crash budgets still block. Keep it last when
# editing these prerequisite lists.
perfect-fast: official-openapi-drift mutation-safety mcp-write-safety mcp-agent-ux cli-write-safety live-safety test-data-lifecycle generator-comparison config-precedence sdk-public-api cli-contract mcp-contract runtime-support diagnostics docs-quality release-support-contract release-readiness package-contract version-consistency changelog-drift docs-index-drift agent-handoff ci-contract
	node scripts/verify.mjs fast

# Deterministic, offline, network-free contract/doc/drift gates only.
# This is the perfect-fast set minus the package gates (wrapper-gates,
# cli-gates, mcp-gates) and performance-budgets, which need generated
# package artifacts. The src-dependent checks
# (schema-quality, generator-comparison) skip their generated-TS portions
# with a clear warning when wrapper/src is absent, so this target runs
# green on a fresh checkout without code generation. CI uses it to gate the doc
# and contract drift suite that previously only ran locally.
contract-gates: generated-edit-check openapi-evidence upstream-drift official-openapi-drift operation-coverage generator-config generator-independence generator-comparison doc-correctness-anchor generator-portability package-contract examples-contract examples-matrix snippet-safety snippet-method-parity snippet-compile runtime-support env-contract config-precedence sdk-public-api sdk-runtime-contract decision-records contract-inventory workflow-cookbook acceptance-scenarios naming-taxonomy change-impact version-policy tag-hygiene version-consistency secret-hygiene data-handling security-threat-model supply-chain dependency-boundary dependency-license compatibility-contract breaking-change-review observability diagnostics support-bundle issue-intake release-support-contract release-readiness ci-contract live-safety test-data-lifecycle risk-register user-docs docs-quality axioms-contract agent-handoff agent-tasks developer-environment operator-toolbox operator-onboarding api-docs mcp-contract mcp-agent-ux mcp-write-safety cli-contract cli-write-safety consumer-cast-budget test-matrix mock-contract cassettes fixture-mock-parity maintenance-playbook mutation-safety error-docs-drift error-registry troubleshooting-drift readme-tables-drift changelog-drift docs-index-drift enterprise-audit docs-counts conformance-drift docs-drift schema-quality

perfect-full: official-openapi-drift mutation-safety mcp-write-safety mcp-agent-ux cli-write-safety live-safety test-data-lifecycle generator-comparison config-precedence sdk-public-api cli-contract mcp-contract runtime-support diagnostics docs-quality release-support-contract release-readiness package-contract version-consistency changelog-drift docs-index-drift agent-handoff mutation-ci ci-contract
	node scripts/verify.mjs full

perfect-live: live-safety test-data-lifecycle sdk-wrapper-build
	node scripts/run-live-proof.mjs

wrapper-gates:
	cd wrapper && npm run type-check && npm test && npm run build && npm run build:smoke && npm pack --dry-run

cli-gates:
	cd cli && npm run type-check && npm test && npm run build && npm pack --dry-run

mcp-gates:
	cd mcp && npm run type-check && npm test && npm run build && npm pack --dry-run

# Lint the hand-written surface of all three packages. Assumes the wrapper is
# already built and synced (cli/mcp type-aware lint follows imports into its
# types; the wrapper lint follows into wrapper/src). perfect-fast runs the
# package gates first, so this is safe there.
lint:
	npm run lint -w clockify-sdk-ts-115
	npm run lint -w @apet97/clockify-cli-115
	npm run lint -w @apet97/clockify-mcp-115

# Regenerate package .packsnapshot files from freshly built package dist trees.
# Run after public surfaces or generated file names change, then commit.
pack-snapshot:
	npm run build -w clockify-sdk-ts-115
	npm run build -w @apet97/clockify-cli-115
	npm run build -w @apet97/clockify-mcp-115
	node scripts/pack-snapshot.mjs --pkg=wrapper
	node scripts/pack-snapshot.mjs --pkg=cli
	node scripts/pack-snapshot.mjs --pkg=mcp

# Verify committed snapshots still match the built tarballs (same proof CI
# runs). Assumes package dist trees are already built.
pack-snapshot-check:
	node scripts/pack-snapshot.mjs --pkg=wrapper --check
	node scripts/pack-snapshot.mjs --pkg=cli --check
	node scripts/pack-snapshot.mjs --pkg=mcp --check

# Build the self-contained MCP one-click install bundle (mcp/*.mcpb). Operator
# command only — needs network and emits a binary, so it is intentionally NOT
# wired into perfect-fast/perfect-full. Builds the wrapper + MCP first, then
# stages a production install and packs it (scripts/build-mcpb.mjs).
mcpb: mcpb-validate
	npm run build -w clockify-sdk-ts-115
	npm run build -w @apet97/clockify-mcp-115
	node scripts/build-mcpb.mjs

mcpb-validate:
	node scripts/check-mcpb-manifest.mjs
	node --test scripts/mcpb-artifacts.test.mjs

mcpb-smoke: mcpb
	node scripts/smoke-mcpb.mjs

goclmcp-drift:
	@if [ ! -d ../GOCLMCP ]; then echo 'goclmcp-drift: ../GOCLMCP not found.' >&2; exit 1; fi
	cd ../GOCLMCP && $(MAKE) openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift
	cd ../GOCLMCP && go test ./internal/tools/...

# Cross-repo spec parity: spec/corrected/clockify.corrected.openapi.yaml must be a
# byte-faithful copy of GOCLMCP's canonical OpenAPI. No other gate compares the two
# (upstream-drift is internal-only, official-openapi-drift compares spec/official,
# goclmcp-drift only proves GOCLMCP self-regenerates), so a stale or hand-tweaked
# copy would otherwise pass every gate. perfect-full only (needs the sibling);
# skips gracefully when ../GOCLMCP is absent.
spec-sync-drift:
	@if [ ! -d ../GOCLMCP ]; then echo 'spec-sync-drift: ../GOCLMCP not found, skipping.'; exit 0; fi
	@a=`shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml | cut -d' ' -f1`; \
	 b=`shasum -a 256 ../GOCLMCP/docs/openapi/clockify-openapi.yaml | cut -d' ' -f1`; \
	 if [ "$$a" != "$$b" ]; then \
	   echo 'spec-sync-drift: SDK corrected snapshot != GOCLMCP canonical' >&2; \
	   echo "  SDK     $$a" >&2; \
	   echo "  GOCLMCP $$b" >&2; \
	   echo '  Re-copy: cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml spec/corrected/clockify.corrected.openapi.yaml' >&2; \
	   exit 1; \
	 fi; \
	 echo "spec-sync-drift: OK (SDK snapshot == GOCLMCP canonical, $$a)"

sdk-codegen-sync:
	node scripts/generate-sdk-from-openapi.mjs --write
	cd wrapper && npm run sync

sdk-wrapper-build: sdk-codegen-sync
	npm run build -w clockify-sdk-ts-115

sdk-codegen: sdk-codegen-sync

sdk-codegen-drift:
	node scripts/generate-sdk-from-openapi.mjs --check

sdk-codegen-test:
	npm run test:codegen

# Run codegen twice and fail if the output differs; guards against locale or
# Node-version skew producing nondeterministic SDK files. Slow, so perfect-full
# only.
codegen-determinism:
	node scripts/check-codegen-determinism.mjs

build-determinism:
	node scripts/check-build-determinism.mjs

product-surface:
	node scripts/generate-product-surface.mjs --write

product-surface-drift:
	node scripts/generate-product-surface.mjs --check

error-docs:
	node scripts/generate-error-docs.mjs --write

error-docs-drift:
	node scripts/generate-error-docs.mjs --check

error-registry:
	node scripts/check-error-registry.mjs

troubleshooting:
	node scripts/generate-troubleshooting.mjs --write

troubleshooting-drift:
	node scripts/generate-troubleshooting.mjs --check

openapi-operations:
	node scripts/generate-openapi-operations.mjs --write

openapi-operations-drift:
	node scripts/generate-openapi-operations.mjs --check

operation-parity:
	node scripts/generate-operation-parity.mjs --write

operation-parity-drift: mcp-tool-manifest
	node scripts/generate-operation-parity.mjs --check

mcp-tool-manifest: sdk-wrapper-build
	cd mcp && node --import tsx scripts/generate-tool-manifest.mjs --write

mcp-tool-manifest-drift: sdk-wrapper-build
	cd mcp && node --import tsx scripts/generate-tool-manifest.mjs --check

operation-coverage:
	node scripts/check-operation-coverage.mjs

openapi-lint:
	node scripts/lint-openapi-contract.mjs

schema-quality:
	node scripts/check-schema-quality.mjs

openapi-evidence:
	node scripts/check-openapi-evidence.mjs

upstream-drift:
	node scripts/check-upstream-drift.mjs

official-openapi-report:
	node scripts/official-openapi-drift.mjs --write

official-openapi-drift:
	node scripts/official-openapi-drift.mjs --check
	node scripts/check-official-openapi-drift.mjs

official-openapi-fetch:
	node scripts/official-openapi-drift.mjs --fetch

generator-config:
	node scripts/check-generator-config.mjs

generator-independence:
	node scripts/check-generator-independence.mjs

generator-comparison:
	node scripts/check-generator-comparison.mjs

doc-correctness-anchor:
	node scripts/check-doc-correctness-anchor.mjs

doc-correctness-anchor-strict:
	STRICT_DOC_ANCHOR=1 node scripts/check-doc-correctness-anchor.mjs

generator-portability:
	node scripts/check-generator-portability.mjs

package-contract:
	node scripts/check-package-contract.mjs

examples-contract:
	node scripts/check-examples-contract.mjs

examples-matrix:
	node scripts/check-examples-matrix.mjs

examples-plan:
	node scripts/plan.mjs examples

snippet-safety:
	node scripts/check-snippet-safety.mjs

snippet-method-parity:
	node scripts/check-snippet-method-parity.mjs

snippet-compile:
	node scripts/check-snippet-compile.mjs

runtime-support:
	node scripts/check-runtime-support.mjs

env-contract:
	node scripts/check-env-contract.mjs

config-precedence:
	node scripts/check-config-precedence.mjs

sdk-public-api:
	node scripts/check-sdk-public-api.mjs

sdk-runtime-contract:
	node scripts/check-sdk-runtime-contract.mjs

decision-records:
	node scripts/check-decision-records.mjs

contract-inventory:
	node scripts/check-contract-inventory.mjs

contract-inventory-report:
	node scripts/plan.mjs contract-inventory

workflow-cookbook:
	node scripts/check-workflow-cookbook.mjs

workflow-plan:
	node scripts/plan.mjs workflow

acceptance-scenarios:
	node scripts/check-acceptance-scenarios.mjs

acceptance-plan:
	node scripts/plan.mjs acceptance

naming-taxonomy:
	node scripts/check-naming-taxonomy.mjs

change-impact:
	node scripts/check-change-impact.mjs

change-impact-plan:
	node scripts/plan.mjs change-impact

version-policy:
	node scripts/check-version-policy.mjs

tag-hygiene:
	node scripts/check-tag-hygiene.mjs

version-consistency:
	node scripts/generate-package-versions.mjs
	node scripts/check-version-consistency.mjs

secret-hygiene:
	node scripts/check-secret-hygiene.mjs

data-handling:
	node scripts/check-data-handling.mjs

security-threat-model:
	node scripts/check-security-threat-model.mjs

supply-chain:
	node scripts/check-supply-chain.mjs

dependency-boundary:
	node scripts/check-dependency-boundary.mjs

dependency-license:
	node scripts/check-dependency-license.mjs

compatibility-contract:
	node scripts/check-compatibility-contract.mjs

breaking-change-review:
	node scripts/check-breaking-change-review.mjs

observability:
	node scripts/check-observability-contract.mjs

diagnostics:
	node scripts/check-diagnostics-contract.mjs

support-bundle:
	node scripts/check-support-bundle.mjs

issue-intake:
	node scripts/check-issue-intake.mjs

release-support-contract:
	node scripts/check-release-support-contract.mjs

release-readiness:
	node scripts/check-release-readiness.mjs

release-decision-plan:
	node scripts/plan.mjs release-decision --decision all

ci-contract:
	node scripts/check-ci-contract.mjs
	node --test scripts/check-cli-release-workflow.test.mjs
	node --test scripts/check-mcp-release-workflow.test.mjs
	node scripts/check-release-dispatch-guard.mjs
	node scripts/test-release-workflow-sha-pins.mjs

live-safety:
	node scripts/check-live-safety.mjs
	node --test scripts/live/orchestrator.test.mjs

test-data-lifecycle:
	node scripts/check-test-data-lifecycle.mjs
	node --test scripts/live/cleanup.test.mjs

risk-register:
	node scripts/check-risk-register.mjs

risk-status-report:
	node scripts/plan.mjs risk-status

user-docs:
	node scripts/check-user-docs.mjs

docs-quality:
	node scripts/check-docs-quality.mjs

axioms-contract:
	node scripts/check-axioms-contract.mjs

agent-handoff:
	node scripts/check-agent-handoff.mjs

agent-tasks:
	node scripts/check-agent-tasks.mjs

docs-counts:
	node scripts/check-docs-counts.mjs

conformance:
	node scripts/generate-conformance.mjs --write

conformance-drift:
	node scripts/generate-conformance.mjs --check

developer-environment:
	node scripts/check-developer-environment.mjs

repo-doctor:
	node scripts/repo-doctor.mjs

onboarding-plan:
	node scripts/plan.mjs onboarding --goal all

operator-toolbox:
	node scripts/check-operator-toolbox.mjs

operator-onboarding:
	node scripts/check-operator-onboarding.mjs

api-docs:
	node scripts/check-api-docs.mjs

mcp-contract:
	node scripts/check-mcp-contract.mjs

mcp-agent-ux:
	node scripts/check-mcp-agent-ux.mjs

mcp-write-safety: mcp-tool-manifest
	node scripts/check-mcp-write-safety.mjs

cli-contract:
	node scripts/check-cli-contract.mjs

cli-write-safety:
	node scripts/check-cli-write-safety.mjs

consumer-cast-budget:
	node scripts/check-consumer-cast-budget.mjs

test-matrix:
	node scripts/check-test-matrix-contract.mjs

mock-contract:
	node scripts/check-mock-clockify-contract.mjs

replay-fixtures:
	node --import tsx scripts/check-replay-fixtures.mjs

cassettes: sdk-codegen-sync
	node --import tsx scripts/check-cassettes.mjs

fixture-mock-parity:
	node scripts/check-fixture-mock-parity.mjs

maintenance-playbook:
	node scripts/check-maintenance-playbook.mjs

maintenance-plan:
	node scripts/plan.mjs maintenance --cadence all

mutation-safety:
	node scripts/check-mutation-safety.mjs

readme-tables:
	node scripts/update-readme-tables.mjs --write

readme-tables-drift:
	node scripts/update-readme-tables.mjs --check

changelog-drift:
	node scripts/check-changelog-entry.mjs

docs-index-drift:
	node scripts/check-doc-index.mjs

enterprise-audit:
	node scripts/check-enterprise-hardening.mjs

performance-budgets:
	node scripts/check-performance-budgets.mjs

performance-receipt:
	node scripts/check-performance-budgets.mjs --write-receipt

performance-calibration-plan:
	node scripts/plan.mjs performance-calibration

generated-edit-check:
	node scripts/check-no-generated-edits.mjs

docs-drift:
	git diff --check -- AGENTS.md CLAUDE.md README.md docs wrapper/README.md cli/README.md mcp/README.md
	node scripts/check-docs-drift.mjs

pack-smoke:
	node scripts/pack-consumer-smoke.mjs

sandbox-key-health:
	node scripts/check-sandbox-key-health.mjs

mock-clockify:
	node scripts/mock-clockify-server.mjs

# Measured coverage gate. Runs each package's test:coverage script (which
# writes <pkg>/coverage/coverage-summary.json), then enforces the pinned
# floors in docs/coverage-contract.json. The wrapper run needs the generated
# client present, so depend on sdk-codegen. Standalone gate: not in
# perfect-fast (keep the fast inner loop fast) but in perfect-full.
coverage: sdk-codegen
	CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run test:coverage -w clockify-sdk-ts-115
	CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run test:coverage -w @apet97/clockify-cli-115
	CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run test:coverage -w @apet97/clockify-mcp-115
	node scripts/check-coverage-floor.mjs

# Opt-in local mutation-score gate (Stryker, wrapper + mcp packages). Proves
# tests catch injected bugs, not just that lines ran. CPU-bound by design:
# prefer the manual GitHub "Mutation" workflow for authoritative proof.
# Distinct from mutation-safety, which validates write policy.
mutation: sdk-codegen
	CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run mutation -w clockify-sdk-ts-115
	CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm run mutation -w @apet97/clockify-mcp-115
	node scripts/check-mutation-score.mjs

mutation-ci:
	node --test scripts/check-mutation-ci-workflow.test.mjs scripts/lib/mutation-score.test.mjs
	node scripts/check-mutation-ci-workflow.mjs

# Bundle-size ceiling gate (size-limit against the built wrapper/dist export
# barrels). Mirrors the CI `size` job (.github/workflows/ci.yml) so a local
# `make perfect-full` is a faithful proxy: build the wrapper, then enforce the
# per-export byte ceilings in wrapper/.size-limit.json. Needs the built dist, so
# depend on sdk-wrapper-build (not sdk-codegen). Standalone gate: perfect-full
# only (keep the fast inner loop fast), alongside coverage/mutation/openapi-lint.
size: sdk-wrapper-build
	npm run size -w clockify-sdk-ts-115
