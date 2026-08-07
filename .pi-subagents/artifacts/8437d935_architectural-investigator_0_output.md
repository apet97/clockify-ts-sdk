I have completed the investigation. All evidence below was gathered read-only from the repository at HEAD `931ac01`. Here is the full report.

```json
{
  "taskId": "architectural-investigation-clockify-ts-sdk",
  "repositoryHead": "931ac0114fe98211f96f82b0a3e76b145b261150",
  "workingTreeState": "?? .ai-audit/ (untracked local dir), ?? .pi-subagents/ (untracked local dir); no tracked-file modifications",
  "architectureMap": {
    "packages": [
      "wrapper: clockify-sdk-ts-115 (core SDK; generated src/ + ~30 hand-written root modules + internal/)",
      "cli: @apet97/clockify-cli-115 (commander CLI; 26 command modules + 8 root modules)",
      "mcp: @apet97/clockify-mcp-115 (MCP stdio server; 29 tool modules + 13 root modules + orchestration/)"
    ],
    "dependencyDirection": ["cli -> wrapper (workspace symlink via peerDependencies ^1 + devDependencies \"*\")", "mcp -> wrapper (same)", "wrapper -> none of cli/mcp", "cli <-> mcp: zero imports"],
    "keyCallPaths": [
      "cli: index.ts buildProgram() -> commands/*.ts -> client.ts buildClient() -> createClockifyClient (wrapper)",
      "mcp: index.ts main() -> client.ts loadContext() -> createClockifyClient; server.ts buildServer() -> tools/*.ts -> wrapper subpaths (requests, resolve, iter, money, ...)",
      "wrapper: create-client.ts -> composed-fetch.ts + internal/routing.ts -> src/** (generated)"
    ],
    "generatedBoundaries": [
      "output/ts-sdk/** (681 files, gitignored): scripts/generate-sdk-from-openapi.mjs from spec/corrected/clockify.corrected.openapi.yaml",
      "wrapper/src/** (680 files, gitignored): synced from output/ts-sdk by wrapper/scripts/sync-sdk.mjs",
      "wrapper/generated/version.ts + cli/src/generated/version.ts + mcp/src/generated/version.ts: scripts/generate-package-versions.mjs",
      "wrapper/error-codes.ts + cli/src/error-codes.ts + mcp/src/error-codes.ts + docs/error-codes.md: scripts/generate-error-docs.mjs",
      "docs/product-surface.{json,md}, openapi-operations.{json,md}, operation-parity.{json,md}, mcp-tool-manifest.json, gate-tier-inventory.{json,md}, one-point-zero-surface-inventory.{json,md}, conformance.md, troubleshooting.md: scripts/generate-*.mjs",
      "wrapper/docs/resources/*.md (31 files): wrapper/scripts/gen-resource-docs.ts (chained by sync-sdk.mjs)",
      "cli/README.md + mcp/README.md tool/command tables: scripts/update-readme-tables.mjs",
      "docs/contributing-matrix: scripts/generate-contributing-matrix.mjs"
    ],
    "testGates": [
      "ci.yml packages job: lint/type-check/test/build per package + pack-snapshot --check",
      "ci.yml contracts job: make contract-gates (65 leaf gates) + sdk-codegen-drift/sdk-codegen-test/codegen-determinism/build-determinism/generator-comparison/pack-smoke/coverage/mutation-ci + npm-audit",
      "release.yml (wrapper-v* tags): contract-gates + release-proof + exact-artifact sha512 + release-state receipt + registry-smoke + provenance check",
      "ci-cli-release.yml / ci-mcp-release.yml: same pattern for cli-v*/mcp-v* tags",
      "mutation.yml: workflow_dispatch only; never run locally (Makefile fails closed)",
      "governance-audit (22 gates): not wired into any CI workflow; manual/scheduled",
      "docs.yml: TypeDoc -> gh-pages on tag push"
    ],
    "releaseMachinery": [
      "tag-gated CI publish (wrapper-v*/cli-v*/mcp-v*); release-please config+manifest retained as version-policy anchor only (retired 2026-07-27)",
      "scripts/release-state.mjs + release-publish.mjs + release-attestation.mjs + registry-smoke.mjs: exact-artifact sha512 integrity pipeline",
      "pack snapshots: wrapper/.packsnapshot, cli/.packsnapshot, mcp/.packsnapshot vs scripts/pack-snapshot.mjs --check",
      "scripts/generate-package-versions.mjs regenerates version constants before every build/test"
    ]
  },
  "candidates": [
    {
      "candidateId": "INV-01",
      "classification": "should_simplify",
      "title": "CLI/MCP region-routing block duplicated (buildRoutingOptions, region consts, unconfirmedRegionNotice)",
      "currentProblem": "Two near-identical implementations of Clockify region validation and routing-options construction live in the CLI and MCP packages; only error-message wording differs, so the copies have already drifted in user-facing text.",
      "exactFilesAndSymbols": ["cli/src/client.ts:14 REGIONAL_PREFIXES", "cli/src/client.ts:15 KNOWN_REGIONS", "cli/src/client.ts:24 buildRoutingOptions", "cli/src/client.ts:66 unconfirmedRegionNotice", "mcp/src/client.ts:14 REGIONAL_PREFIXES", "mcp/src/client.ts:15 KNOWN_REGIONS", "mcp/src/client.ts:23 buildRoutingOptions", "mcp/src/client.ts:236 unconfirmedRegionNotice"],
      "evidence": [
        "cli/src/client.ts:24-52 and mcp/src/client.ts:23-52: identical function bodies; normalized diff (flag/env names replaced) shows only error-string differences",
        "cli/src/client.ts:33 vs mcp/src/client.ts:32: same check, different message ('--subdomain requires --region' vs 'CLOCKIFY_SUBDOMAIN requires CLOCKIFY_REGION') — drift already materialized",
        "Both packages pin the same list twice more: commit 65cc83e 'test(cli,mcp): pin both region lists to the SDK's ClockifyRegion union'",
        "~60 duplicated logic lines per package; wrapper/create-client.ts already exports the ClockifyRegion type (line 36) but no runtime list"
      ],
      "desiredEndState": "Single runtime region list + one buildRoutingOptions in the SDK (e.g. clockify-sdk-ts-115/create-client) parameterized for flag/env wording; CLI and MCP call it.",
      "smallestTransformation": "Export a runtime REGIONAL_PREFIXES/KNOWN_REGIONS const and a buildRoutingOptions(region, subdomain, { messageStyle }) from wrapper/create-client.ts; replace the two local implementations; keep both message styles via a small option so existing tests and user-facing text are unchanged.",
      "publicInvariants": ["Any new export/subpath is a public-API addition: must update docs/sdk-public-api.json, package.json exports (import+require, types+default), tsconfig aliases, and wrapper/scripts/verify-dual-build.sh", "acknowledgeUnconfirmedRegion semantics must not change", "Region set is 'global|eu|us|uk|au|developer' — pinned by tests"],
      "generatedBoundaries": "none (wrapper root files are hand-written)",
      "dependsOn": "none",
      "baselineTestsAndGates": ["cli/tests/client.test.ts", "mcp/tests/client.test.ts", "make cli-contract", "make mcp-contract", "make config-precedence", "make sdk-public-api", "make consumer-cast-budget"],
      "verificationRequired": ["npm test -w cli && npm test -w mcp", "make sdk-public-api", "make config-precedence", "make consumer-cast-budget", "full perfect-fast"],
      "rollbackOrStoppingCondition": "If any CLI/MCP test that asserts exact error message text changes output, stop and parameterize the message instead of changing it.",
      "mustNotChange": ["Message wording visible to users (tests assert it)", "acknowledgeUnconfirmedRegion auto-supply behavior", "CLOCKIFY_REGION/CLOCKIFY_SUBDOMAIN env semantics"],
      "confidence": "high",
      "uncertainties": ["None: both copies fully read and diffed"]
    },
    {
      "candidateId": "INV-02",
      "classification": "should_simplify",
      "title": "Two orphaned scripts-test files are executed by nothing",
      "currentProblem": "scripts/check-mcp-write-safety.test.mjs and scripts/check-aggregate-wiring.test.mjs are not invoked by any Makefile target, npm script, workflow, or importing script. They survive only because docs/test-wiring-contract.json exempts them — including a written plan to delete the aggregate-wiring entry.",
      "exactFilesAndSymbols": ["scripts/check-mcp-write-safety.test.mjs", "scripts/check-aggregate-wiring.test.mjs", "docs/test-wiring-contract.json:18-25 (unwiredTests entries)"],
      "evidence": [
        "grep of Makefile (189 script refs), .github/workflows, package.json, and all scripts/*.mjs imports: zero references to either file",
        "docs/test-wiring-contract.json:25: 'After the rewrite, wire it into the mcp-write-safety-run recipe ... and delete this entry. Passes when run by hand on a clean worktree (last verified 2026-07-30)' — the repo itself documents them as unwired",
        "check-test-wiring.mjs (scripts/check-test-wiring.mjs:1-13) exists precisely to fail on unwired test files; these two are the only exceptions"
      ],
      "desiredEndState": "Every scripts/*.test.mjs is either executed by a gate or deleted; test-wiring-contract.json unwiredTests list is empty.",
      "smallestTransformation": "Delete scripts/check-mcp-write-safety.test.mjs (verify no coverage loss: check-mcp-write-safety.mjs itself is wired) and wire or delete scripts/check-aggregate-wiring.test.mjs per the contract's own note; then remove both unwiredTests entries and regenerate gate-tier-inventory.",
      "publicInvariants": ["none (internal gate machinery)"],
      "generatedBoundaries": "docs/test-wiring-contract.json is hand-maintained; docs/gate-tier-inventory.json is generated (make gate-tier-inventory)",
      "dependsOn": "none",
      "baselineTestsAndGates": ["make aggregate-gates (runs check-test-wiring.mjs)", "make governance-audit"],
      "verificationRequired": ["make aggregate-gates", "make gate-tier-inventory-drift"],
      "rollbackOrStoppingCondition": "If check-test-wiring fails after deletion, restore the file and revisit (the exception exists for a documented reason).",
      "mustNotChange": ["check-mcp-write-safety.mjs behavior (the manifest temp-dir rewrite hazard the orphan test documents)"],
      "confidence": "high",
      "uncertainties": ["None: exhaustive reference scan performed"]
    },
    {
      "candidateId": "INV-03",
      "classification": "should_simplify",
      "title": "Twelve one-off scratch probes tracked under output/",
      "currentProblem": "output/ is documented (AGENTS.md, .gitignore:21-25) as regenerable local generator output; its only gitignored subtree is output/ts-sdk. Twelve developer scratch probes are tracked in git and ship in the repo, added in a single docs commit.",
      "exactFilesAndSymbols": ["output/scratch-allowlist-probe.mjs", "output/scratch-clone-test.mjs", "output/scratch-dates-probe.mjs", "output/scratch-live-pagination-probe.mjs", "output/scratch-live-projects-end.mjs", "output/scratch-live-terminal-page.mjs", "output/scratch-live-wide-walk.mjs", "output/scratch-mutation-summary.mjs", "output/scratch-paging-divergence.mjs", "output/scratch-resolve-ref-list.mjs", "output/scratch-resolve-user-ref.mjs", "output/scratch-url-probe.mjs"],
      "evidence": ["git ls-files output/ returns exactly these 12 files", "git log --oneline --diff-filter=A -- output/scratch-resolve-user-ref.mjs shows commit a8d61d0 'docs(wrapper): record the measured mutation result and the last uncovered mutant'", "None are referenced by Makefile, workflows, package.json, or scripts/ (verified by grep)"],
      "desiredEndState": "output/ contains only regenerable generator output; scratch probes live untracked or under a dedicated gitignored dir.",
      "smallestTransformation": "git rm the 12 files (history retains them) or move the still-useful live-probe helpers into scripts/live/ with tests.",
      "publicInvariants": ["none"],
      "generatedBoundaries": "none (they are not generated)",
      "dependsOn": "none",
      "baselineTestsAndGates": ["make repo-doctor (checks repo shape; verify it does not enumerate output/ scratch files)"],
      "verificationRequired": ["make repo-doctor", "make contract-gates"],
      "rollbackOrStoppingCondition": "Trivial: files are self-contained; restore from git if a probe is later needed.",
      "mustNotChange": ["output/ts-sdk/ gitignore contract", "spec/evidence/probes gitignore contract"],
      "confidence": "high",
      "uncertainties": ["Whether the owner intended them as retained evidence; the commit message suggests they were one-off probes"]
    },
    {
      "candidateId": "INV-04",
      "classification": "should_simplify",
      "title": "Governance gate machinery is 4x the size of hand-written product source",
      "currentProblem": "scripts/ is 95,133 lines across 264 files (124 check-*.mjs, 68 self-tests) vs ~23,700 lines of hand-written product source (wrapper root 8,260 + cli src 5,985 + mcp src 9,455). The Makefile has 179 targets. The governance bundle (22 gates) checks documentation existence and wiring rather than product behavior, and is not CI-wired.",
      "exactFilesAndSymbols": ["scripts/ (264 files, 95,133 lines)", "Makefile (179 targets, 820 lines)", "scripts/check-agent-tasks.mjs", "scripts/check-decision-records.mjs", "scripts/check-workflow-cookbook.mjs", "scripts/check-operator-toolbox.mjs", "scripts/check-axioms-contract.mjs", "scripts/lib/gate-targets.mjs", "docs/test-wiring-contract.json", "docs/contract-inventory.json (1,517 lines)", "docs/enterprise-hardening-audit.json (4,142 lines)"],
      "evidence": [
        "wc -l: scripts 95,133; cli/src 5,985; mcp/src 9,455; wrapper root+internal 8,260 → ratio ~4.0x",
        "52 of 124 check scripts import isWiringTargetReachable (scripts/lib/gate-targets.mjs) to re-verify their own five-anchor wiring ('Makefile / quality-gates / docs index / contract inventory / enterprise audit' — stated in scripts/check-agent-tasks.mjs:3-6)",
        "75 docs/*-contract.json files; 42 are consumed by exactly one check script (grep-based audit)",
        "governance-contracts = 22 leaves (Makefile), none reached by ci.yml (which runs only contract-gates); the whole bundle runs only via manual/scheduled make governance-audit",
        "CLAUDE.md:35-37 documents why this exists: 'A 2026-06-29 review found 47 real bugs, several of which were false-green gates' — the machinery demonstrably caught real defects"
      ],
      "desiredEndState": "The governance tier protects the same evidence with fewer moving parts: merge pure existence-checkers into one composite gate; keep the fail-closed properties and audit trail.",
      "smallestTransformation": "Consolidate the 5-6 pure documentation-existence checkers (agent-tasks, decision-records, workflow-cookbook, operator-toolbox, api-docs) into one scripts/check-governance-docs.mjs with one contract JSON, preserving each contract's rows as data. Do NOT touch aggregate-gates, verify-plan, or gate-tier-inventory (they guard the other gates).",
      "publicInvariants": ["none (internal machinery)"],
      "generatedBoundaries": "docs/gate-tier-inventory.{json,md} regenerate from the Makefile; contract-inventory.json and enterprise-hardening-audit.json are hand-maintained ledgers that each check script validates",
      "dependsOn": "INV-02 (orphan tests are part of the wiring surface)",
      "baselineTestsAndGates": ["make governance-audit", "make aggregate-gates", "make gate-tier-inventory-drift", "make contract-inventory"],
      "verificationRequired": ["make governance-audit", "make contract-gates", "make gate-tier-inventory-drift"],
      "rollbackOrStoppingCondition": "Any loss of a fail-closed property (a gate that stops reddening on the same defect) = stop and revert; the 2026-06-29 false-green history is the acceptance bar.",
      "mustNotChange": ["aggregate-gates / verify-plan / gate-tier-inventory meta-gates", "Any gate that caught a real defect in the audit campaign", "The five-anchor wiring contract for gates that stay"],
      "confidence": "medium",
      "uncertainties": ["Whether consolidation is worth the churn given every leaf has an audit trail; the strongest argument against is that each gate was hard-won evidence of a past defect class"]
    },
    {
      "candidateId": "INV-05",
      "classification": "optional",
      "title": "Gate guidance documented in five places",
      "currentProblem": "The same pre-push proof tiering (contract-gates / perfect-fast / perfect-full / perfect-live) is restated in AGENTS.md §4, CLAUDE.md 'Verify Gates', docs/quality-gates.md, docs/gate-tiers.md, docs/gate-tier-inventory.md (generated), and docs/README.md — each with slightly different wording that must be kept in lockstep.",
      "exactFilesAndSymbols": ["AGENTS.md:345-414 (§4 tables)", "CLAUDE.md:87-198 ('Verify Gates')", "docs/quality-gates.md (entire file)", "docs/gate-tiers.md", "docs/gate-tier-inventory.md (generated)", "docs/README.md:44-60"],
      "evidence": [
        "docs/quality-gates.md:5-7 'Pre-push proof has three tiers: make contract-gates is the CI-enforced... make perfect-fast is runtime/package proof, and make perfect-full adds heavy proof' — near-verbatim restatement of AGENTS.md:44-49",
        "CLAUDE.md:1-2 states 'The canonical contract is AGENTS.md; read it before edits' yet re-derives the full gate list in 110 lines",
        "docs/gate-tiers.md:1-5 itself says 'The executable source of truth remains docs/change-impact-contract.json'"
      ],
      "desiredEndState": "One canonical prose location (AGENTS.md §4 + the generated gate-tier-inventory); quality-gates.md and gate-tiers.md link out instead of restating.",
      "smallestTransformation": "Rewrite quality-gates.md as an index that points at AGENTS.md §4 and the generated gate-tier-inventory.md; trim CLAUDE.md 'Verify Gates' to the runbook essentials it uniquely owns (solo-run discipline, budget flake handling).",
      "publicInvariants": ["docs-quality, docs-index-drift, agent-handoff, and contributing-matrix gates may assert headings/link presence — verify their contracts before deleting prose"],
      "generatedBoundaries": "docs/gate-tier-inventory.md is generated; quality-gates.md and gate-tiers.md are hand-written",
      "dependsOn": "none",
      "baselineTestsAndGates": ["make docs-quality", "make docs-index-drift", "make user-docs", "make docs-drift"],
      "verificationRequired": ["make docs-quality", "make docs-index-drift", "make docs-drift"],
      "rollbackOrStoppingCondition": "If a doc-links test or docs-quality assertion fails on removed prose, restore the sentence and adjust the gate contract instead.",
      "mustNotChange": ["The generated gate-tier-inventory content", "AGENTS.md §4 tables (they are the canonical runbook)"],
      "confidence": "medium",
      "uncertainties": ["docs-quality-contract.json may pin specific headings; needs a contract read before editing"]
    },
    {
      "candidateId": "INV-06",
      "classification": "optional",
      "title": "Last-Page header parsing implemented twice",
      "currentProblem": "mcp/src/tools/paging.ts re-implements the Last-Page header walk that wrapper/iter.ts already provides; the CLI consumes the wrapper's iterAll while the MCP keeps a parallel walker.",
      "exactFilesAndSymbols": ["mcp/src/tools/paging.ts:33-41 parseLastPageHeader", "mcp/src/tools/paging.ts:43-84 pageWithMeta/collectPagedList", "wrapper/iter.ts:187-291 (Last-Page parsing + iteration)", "cli/src/commands/resolve-refs.ts:41 (uses wrapper iterAll)"],
      "evidence": ["wrapper/iter.ts:207 'Parse the `Last-Page` response header' vs mcp/src/tools/paging.ts:33 identical case-insensitive true/false parse", "mcp does not import clockify-sdk-ts-115/iter anywhere (grep of mcp/src)", "The MCP variant additionally needs page metadata (hasMore/lastPageHeader) for tool envelopes, which iterAll does not return"],
      "desiredEndState": "One Last-Page parser in the wrapper; mcp/src/tools/paging.ts either delegates or the wrapper exposes the page-meta walk the MCP envelope needs.",
      "smallestTransformation": "Export parseLastPageHeader (or a page-meta iterator) from wrapper/iter.ts and have mcp paging.ts import it; keep collectPagedList/pageWithMeta as thin envelope adapters.",
      "publicInvariants": ["Adding an export to iter.ts extends the public API: update docs/sdk-public-api.json + verify-dual-build.sh if root-visible; a non-exported internal helper avoids this"],
      "generatedBoundaries": "none",
      "dependsOn": "none",
      "baselineTestsAndGates": ["wrapper/tests/iter.test.ts", "mcp/tests/iter-maxpages.test.ts", "mcp tests using collectPagedList"],
      "verificationRequired": ["npm test -w mcp", "npm test -w clockify-sdk-ts-115"],
      "rollbackOrStoppingCondition": "If any MCP envelope meta field changes (hasMore/lastPageHeader semantics), revert — the envelope contract is user-visible to agents.",
      "mustNotChange": ["MCP envelope meta semantics (hasMore, lastPageHeader, count, page, pageSize)"],
      "confidence": "medium",
      "uncertainties": ["Whether exposing page-meta iteration from the wrapper is worth a public-API addition for ~20 duplicated lines"]
    },
    {
      "candidateId": "INV-07",
      "classification": "optional",
      "title": "Identical entityId test duplicated in cli and mcp",
      "currentProblem": "cli/tests/sdk-narrow.test.ts and mcp/tests/sdk-narrow.test.ts are the same 12-line test of the wrapper's entityId helper (one imports the wrapper directly, the other via mcp/src/result.ts re-export).",
      "exactFilesAndSymbols": ["cli/tests/sdk-narrow.test.ts", "mcp/tests/sdk-narrow.test.ts", "mcp/src/result.ts:526 (entityId re-export)"],
      "evidence": ["Full file diff shows identical describe/it bodies", "The wrapper's own operation-receipt tests already cover entityId behavior (wrapper/tests/operation-receipt.test.ts)"],
      "desiredEndState": "One test of entityId in the wrapper; the mcp/cli copies deleted.",
      "smallestTransformation": "Delete cli/tests/sdk-narrow.test.ts and mcp/tests/sdk-narrow.test.ts (behavior is covered at the wrapper).",
      "publicInvariants": ["none"],
      "generatedBoundaries": "none",
      "dependsOn": "none",
      "baselineTestsAndGates": ["wrapper/tests/operation-receipt.test.ts", "make test-matrix (may pin test file counts per package — verify)"],
      "verificationRequired": ["npm test -w cli", "npm test -w mcp", "make test-matrix"],
      "rollbackOrStoppingCondition": "If test-matrix or coverage floors dip below pinned values, keep one copy instead.",
      "mustNotChange": ["entityId behavior"],
      "confidence": "high",
      "uncertainties": ["test-matrix-contract.json may require per-package test presence"]
    },
    {
      "candidateId": "INV-08",
      "classification": "optional",
      "title": "Implementation-text-mirroring tests",
      "currentProblem": "Two test families pin implementation details (dist file layout, generator source text) rather than behavior: wrapper/tests/dual-build.test.ts asserts the internal dist/ layout and export-name lists (duplicating verify-dual-build.sh with a stale comment), and wrapper/tests/generated-baseurl-routing.test.ts greps the generator emitter source for function names.",
      "exactFilesAndSymbols": ["wrapper/tests/dual-build.test.ts:22 EXPECTED_EXPORTS (18 names)", "wrapper/tests/dual-build.test.ts:16 'the same 17-name baseline used by the shell smoke script' (stale: verify-dual-build.sh pins 93 curated names)", "wrapper/scripts/verify-dual-build.sh SURFACE= (93 names)", "wrapper/tests/generated-baseurl-routing.test.ts:16-25 (reads emitter.mjs and asserts string content)"],
      "evidence": [
        "sed count of dual-build.test.ts EXPECTED_EXPORTS = 18 vs the comment's '17-name baseline' vs the shell script's 93-name SURFACE",
        "generated-baseurl-routing.test.ts:13-15 reads scripts/sdk-codegen/emitter.mjs and wrapper/src/core/request.ts and asserts expect(generator).toContain('function requestRuntimeSourceWithTimeoutAndRetry()') — source-text mirroring",
        "Both protect real risks (dual-build parity; generator drift) but as implementation snapshots that must be hand-updated"
      ],
      "desiredEndState": "Dual-build parity asserted once (pick verify-dual-build.sh as canonical; make the vitest test delegate or drop the stale comment and reconcile lists); generator-routing assertions expressed as behavioral tests against generated output rather than source text.",
      "smallestTransformation": "Fix the stale comment and reconcile the two export lists (or have dual-build.test.ts import the same list file); keep generated-baseurl-routing.test.ts but accept it as deliberate drift-pinning.",
      "publicInvariants": ["The 93-name curated surface + 28 subpaths are the public API; any test consolidation must keep exact-surface enforcement"],
      "generatedBoundaries": "wrapper/src/** and emitter.mjs output are generated; the test pins them",
      "dependsOn": "none",
      "baselineTestsAndGates": ["npm run build:smoke -w clockify-sdk-ts-115", "make sdk-public-api", "make generator-comparison"],
      "verificationRequired": ["npm run build:smoke -w clockify-sdk-ts-115", "npm test -w clockify-sdk-ts-115"],
      "rollbackOrStoppingCondition": "If dual-build or generator-drift protection weakens (a real ESM/CJS divergence passes), revert immediately.",
      "mustNotChange": ["The exact-surface enforcement (extra/removed name detection)"],
      "confidence": "high",
      "uncertainties": ["Whether the 18-name vitest list and the 93-name shell list were intentionally different scopes (root-level vs curated) — the comment suggests they were meant to be the same"]
    }
  ],
  "leftAlone": [
    {"structure": "error-codes.ts triplicate (wrapper/error-codes.ts, cli/src/error-codes.ts, mcp/src/error-codes.ts — 3x298 byte-identical lines)", "why": "Generator-owned (scripts/generate-error-docs.mjs writes all three + drift-gated by make error-docs-drift); the copies are a packaging necessity since cli/mcp are independently published packages. Restructuring would add public API surface for zero behavior gain."},
    {"structure": "wrapper/internal/routing.ts hand-mirror of docs/service-routing-matrix.json", "why": "Deliberate, documented, fail-closed design (wrapper/tests/routing-matrix-equality.test.ts; AGENTS.md:180-188 'Change both together'). Runtime code must not import generator tooling. The mirror test is the correct pattern."},
    {"structure": "cli/src/output.ts printError vs mcp/src/result.ts errorResult", "why": "Both are thin surface-specific adapters over the shared generated error-code helpers (errorCodeForStatus ?? errorCodeForMessage precedence, recoveryForCode). Each has exactly one surface-specific override (400->not_found quirk in cli/output.ts:97-107; setup_required in mcp/result.ts:215-222). Legitimate layering, not duplication."},
    {"structure": "mcp/src/orchestration/webhook-url.ts", "why": "Already simplified: 5-line re-export of clockify-sdk-ts-115/webhooks (commit history shows the guard was promoted to the wrapper). This is the pattern the repo should repeat."},
    {"structure": "release-please-config.json + .release-please-manifest.json", "why": "Not dead: consumed as the version-policy anchor by scripts/check-version-consistency.mjs:147-151 and its tests. Retirement is documented in AGENTS.md:26-27."},
    {"structure": "scripts/lib/consumer-cast-governance.mjs (12,951 lines) + check-consumer-cast-budget.test.mjs (13,124 lines)", "why": "A purpose-built TS dataflow engine proving CLI/MCP request casts stay at zero — the repo's single most expensive gate, but it protects a security invariant (untyped values never reaching generated requests) that has a documented exception budget of zero. AGENTS.md:472-489. Not a candidate for deletion; only for future maintenance-cost review."},
    {"structure": "scripts/live/* (orchestrator 1,130, cleanup 1,130, generate-live-evidence-manifest 3,615 lines)", "why": "Credentialed-sandbox proof boundary with fail-closed cleanup; cost is proportionate to what it proves (161/168 live-success ops)."},
    {"structure": "mcp/clockify115-mcp-*.mcpb/build.json/spdx.json (3.3MB binary present locally)", "why": "Properly gitignored (.gitignore:53-58); not tracked. No action."},
    {"structure": "mock-clockify-server.mjs + cassettes + fixtures", "why": "Shared deterministic test infra consumed by all three packages (7 test files); the fixture-mock-parity gate byte-checks golden fixtures against it."},
    {"structure": "the 65-leaf contract-gates bundle", "why": "CI-enforced, and the repo's own audit history (2026-06-29: 47 gate bugs incl. false-greens) shows this tier caught real defects. Cost is justified at the CI boundary; the governance tier (INV-04) is where consolidation is safe."}
  ],
  "commandsExecuted": [
    {"command": "git rev-parse HEAD / git status --short", "exitCode": 0, "stdout": "931ac0114fe98211f96f82b0a3e76b145b261150; ?? .ai-audit/ ?? .pi-subagents/"},
    {"command": "cat package.json + wrapper/cli/mcp package.json", "exitCode": 0, "stdout": "workspaces [wrapper, cli, mcp]; all v1.0.1; cli/mcp peerDep clockify-sdk-ts-115 ^1"},
    {"command": "wc -l + find across wrapper/cli/mcp/scripts/docs", "exitCode": 0, "stdout": "scripts 95,133 lines/264 files; docs 63,136/242; cli/src 5,985; mcp/src 9,455; wrapper root 7,792+internal 468"},
    {"command": "diff wrapper/error-codes.ts cli/src/error-codes.ts mcp/src/error-codes.ts", "exitCode": 0, "stdout": "byte-identical (both diffs empty)"},
    {"command": "diff (normalized) cli/src/client.ts vs mcp/src/client.ts routing block", "exitCode": 0, "stdout": "only error-string differences"},
    {"command": "grep reference scans (Makefile, .github, package.json, scripts imports, docs)", "exitCode": 0, "stdout": "orphans: check-mcp-write-safety.test.mjs, check-aggregate-wiring.test.mjs; 12 tracked output/scratch-*.mjs with zero references"},
    {"command": "git log --oneline -40 / git log --follow on key files", "exitCode": 0, "stdout": "1.0.1 campaign history; webhook-url promotion; release-state machinery from 7420954"},
    {"command": "Makefile target/leaf counting", "exitCode": 0, "stdout": "179 targets; contract-gates 65 leaves (38+10+7+10); governance 22; perfect-fast 21"}
  ],
  "receipts": ["inline (no files written; read-only investigation)"],
  "uncertainties": [
    "Runtime timing of perfect-fast/perfect-full not measured (read-only mandate; would take ~30+ min and needs the wrapper generated tree)",
    "CI execution cost per gate not measurable from the repo alone",
    "Whether the 18-name vitest dual-build list vs the 93-name shell list are intentionally different scopes",
    "docs-quality-contract.json / test-matrix-contract.json may pin prose and file counts that constrain candidates INV-05/INV-07"
  ]
}
```

---

# Architectural Investigation Report — clockify-ts-sdk

**Investigator:** architectural-investigator (DeepSeek Flash, read-only subagent)
**Repository:** `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`
**HEAD:** `931ac0114fe98211f96f82b0a3e76b145b261150` (main; 774 commits)
**Working tree:** clean except two untracked local dirs (`.ai-audit/`, `.pi-subagents/` — agent scratch, not tracked)
**Method:** read-only inspection; every claim below cites file:line or the command that produced it. Nothing was modified.

## Repository map narrative

This is a three-package npm-workspaces monorepo that shipped 1.0.1 on all three packages after a long adversarial audit campaign (commits `fa1673c` release 1.0.1, `11e1ce2` "close two shipping defects and four gates that had stopped guarding", `7420954` release-proof machinery, M-16/W-01 fixes at HEAD). The defining trait: **the governance layer is larger than the product layer**. Gate machinery (`scripts/` = 95,133 lines, 264 tracked files, 179 Makefile targets) is ~4x the hand-written product source (~23,700 lines), and `docs/` (63,136 lines, 242 files) is 2.7x. The governance exists because an earlier audit found 47 real gate bugs, including false-green gates (documented CLAUDE.md:35-37); several of the gates the audit found broken were then fixed *in the gates themselves*, which is why so many `scripts/*.test.mjs` self-tests exist (68 of them).

---

## A. Package map + dependency direction

| Package | npm name | Purpose | Entry points | Hand-written surface |
|---|---|---|---|---|
| `wrapper/` | `clockify-sdk-ts-115` | Core SDK: generated client + hand-written ergonomics | `index.ts` (barrel), 28 governed subpaths in `exports` (package.json) | 30 root `*.ts` (7,792 lines) + `internal/` 4 files (468 lines) + `scripts/` 4 + `tests/` 56 files (15,845 lines) |
| `cli/` | `@apet97/clockify-cli-115` | Commander CLI, bins `clockify115`/`clk115` | `src/index.ts` (`buildProgram`), 26 command modules | `src/` 5,985 lines; `tests/` 42 files (10,437 lines) |
| `mcp/` | `@apet97/clockify-mcp-115` | MCP stdio server, bin `clockify115-mcp` | `src/index.ts` (main), `src/server.ts` (buildServer), `src/client.ts` (loadContext) | `src/` 9,455 lines (13 root modules, 29 tool modules incl. `workflows/`, `invoices/`, `timeOff/` subdirs, 2 orchestration); `tests/` 75 files (22,202 lines) |

**Dependency direction (verified):**
- `cli -> wrapper` and `mcp -> wrapper` via workspace symlinks: both declare `peerDependencies: clockify-sdk-ts-115: ^1` and `devDependencies: "*"` (cli/package.json:61-70, mcp/package.json:63-71). Imports are by package name/subpath — cli has 33, mcp has 56 `from "clockify-sdk-ts-115..."` imports.
- `wrapper -> cli/mcp`: none. `cli <-> mcp`: zero imports (grep for `../mcp`, `../cli`, `../wrapper` in the three src trees found only intra-package `../client.js`-style imports).
- Subpath usage: both consumers lean on `clockify-sdk-ts-115/requests` (cli 16, mcp 29 imports); mcp additionally uses `resolve` (12), `money` (3), `iter` (3); cli uses `operation-receipt` (4), `ensure` (2), `create-client` (2).
- Neither cli nor mcp imports `clockify-sdk-ts-115/iter` at runtime — the CLI's `resolve-refs.ts:41` uses `iterAll`; the MCP re-implements pagination (see C3).

## B. Generated vs hand-written boundary map

| Tree | Generator | Owner | Git state |
|---|---|---|---|
| `output/ts-sdk/**` (681 files incl. `codegen-receipt.json`) | `scripts/generate-sdk-from-openapi.mjs` from `spec/corrected/clockify.corrected.openapi.yaml` (168 ops, 30 resources) | repo script (sister repo GOCLMCP owns the upstream generator) | gitignored (`.gitignore:25`); `make sdk-codegen` wipes+rewrites |
| `wrapper/src/**` (680 files) | `wrapper/scripts/sync-sdk.mjs` (atomic staged copy from output/ts-sdk, skips package.json/tsconfig/node_modules/.gitignore — sync-sdk.mjs:27-40) | same | gitignored; never hand-edit (AGENTS.md §5.3) |
| `wrapper/generated/version.ts`, `cli/src/generated/version.ts`, `mcp/src/generated/version.ts` | `scripts/generate-package-versions.mjs` (run in every build/test/type-check script of all three packages) | repo script | tracked |
| `wrapper/error-codes.ts`, `cli/src/error-codes.ts`, `mcp/src/error-codes.ts`, `docs/error-codes.md` | `scripts/generate-error-docs.mjs` (writes 3 TS targets + 1 md; drift-gated by `make error-docs-drift`) | repo script | tracked |
| `docs/product-surface.{json,md}`, `docs/openapi-operations.{json,md}`, `docs/operation-parity.{json,md}`, `docs/mcp-tool-manifest.json`, `docs/gate-tier-inventory.{json,md}`, `docs/one-point-zero-surface-inventory.{json,md}`, `docs/conformance.md`, `docs/troubleshooting.md`, `docs/contributing-matrix` | `scripts/generate-*.mjs` (`--write`/`--check` pairs, 10 pairs in Makefile) | repo scripts | tracked |
| `wrapper/docs/resources/*.md` (31 files) | `wrapper/scripts/gen-resource-docs.ts` (chained by sync-sdk.mjs) | repo script | tracked |
| cli/README.md + mcp/README.md command/tool tables | `scripts/update-readme-tables.mjs` | repo script | tracked |

**Hand-written code that depends on generated shapes:** everything — `wrapper/index.ts` re-exports `./src/index.js`; `wrapper/errors.ts` imports `./src/errors/index.js` and `./src/core/index.js`; cli/mcp build request bodies against generated `ClockifyRequestBody<T>` unions (governed by the zero-cast budget, AGENTS.md §5.11). The dual-build smoke (`verify-dual-build.sh`) pins 93 curated + 32 generated-core root names and 28 subpaths against the built dist.

## C. Duplication findings (ranked by severity)

**C1 — Region routing block duplicated between CLI and MCP (HIGH, drift already materialized).**
`cli/src/client.ts:14-97` and `mcp/src/client.ts:14-87,236-247` each contain: `REGIONAL_PREFIXES` (`["eu","us","uk","au"]`), `KNOWN_REGIONS` (`["global",...REGIONAL_PREFIXES,"developer"]`), `buildRoutingOptions(region, subdomain)` (same branch structure, same `acknowledgeUnconfirmedRegion: true` auto-supply), and `unconfirmedRegionNotice`. A normalized diff (replacing `--region`/`CLOCKIFY_REGION` tokens) shows the only differences are error-message wording:
- cli/src/client.ts:33 `--subdomain requires --region (got ...)` vs mcp/src/client.ts:32 `CLOCKIFY_SUBDOMAIN requires CLOCKIFY_REGION to be one of ...` — same validation, different user text.
- cli/src/client.ts:48 vs mcp/src/client.ts:47: `Unrecognized Clockify region ... Provide one of` vs `Unrecognized CLOCKIFY_REGION ... Expected one of`.
- `unconfirmedRegionNotice` (cli:66-75, mcp:236-247) differs only in the notice prefix (`clk115: using the unconfirmed...` vs `routing: using the unconfirmed... from CLOCKIFY_REGION/CLOCKIFY_SUBDOMAIN`).
≈60 duplicated logic lines per package. Drift risk is real, not hypothetical: the messages already disagree. Both packages also pin the region list a third time in tests (commit `65cc83e`). The SDK already exports the `ClockifyRegion` *type* (wrapper/create-client.ts:36) but no runtime list, which is why both packages re-derived it.

**C2 — Generated error-code registry triplicated (LOW severity by design, generator-owned).**
`wrapper/error-codes.ts`, `cli/src/error-codes.ts`, `mcp/src/error-codes.ts` are byte-identical (diff exit 0, 298 lines each = 894 total) and carry the header `/* Generated by scripts/generate-error-docs.mjs ... */`. This is a generated triplicate, not hand-maintained drift: one generator writes all three plus `docs/error-codes.md`, and `make error-docs-drift` fails on any skew. Classification: LEAVE ALONE — the copies exist because cli/mcp are independently published packages; consolidating would require a new public subpath for zero behavior gain.

**C3 — Parallel pagination walker in MCP (MEDIUM).**
`mcp/src/tools/paging.ts` (84 lines) implements `collectPagedList`/`pageWithMeta` with its own `parseLastPageHeader` (paging.ts:33-41), while `wrapper/iter.ts:187-291` already parses the same `Last-Page` header (line 207) and the CLI consumes it via `iterAll` (cli/src/commands/resolve-refs.ts:41). The MCP never imports `clockify-sdk-ts-115/iter`. Nuance: the MCP walker exists because tool envelopes need page *meta* (`hasMore`, `lastPageHeader`, `count`) that `iterAll` doesn't return — so this is partial duplication (the header parser + the paged loop), with a real requirement difference underneath.

**C4 — Same test duplicated in cli and mcp (LOW).**
`cli/tests/sdk-narrow.test.ts` and `mcp/tests/sdk-narrow.test.ts` are the identical 12-line test of wrapper `entityId` (one imports the wrapper directly, the other through `mcp/src/result.ts:526` re-export). The wrapper's `operation-receipt.test.ts` already covers the same behavior.

**C5 — Resolver plumbing: shared core, duplicated shell (LOW).**
Name→id resolution semantics ARE shared: both packages import `matchByName`/`looksLikeClockifyId` from `clockify-sdk-ts-115/resolve` (cli/src/commands/resolve-refs.ts:8; mcp/src/tools/workflows/resolve.ts:5,784), and the MCP domain tools use the higher-level `resolveUserRefs`/`resolveGroupRefs`/`resolveEntityRef` (holidays.ts:10,141,157; projects.ts:4,278; scheduling.ts:9,245; timeOff/policies.ts:12,322). What remains duplicated is the thin plumbing: cli `collectPaged+pickIdByName` (resolve-refs.ts:21-58) vs mcp `resolveByName+findOneByName` (workflows/resolve.ts:638-660,773-784) and mcp `user-refs.ts` — each a paged list fetch + match + surface-specific error. Different error contracts (CLI throws, MCP returns clarify/`AmbiguousNameError`) justify most of the split. Verdict: acceptable layering, not a fix target.

**C6 — Confirmation/write-safety flow: MCP-only, no CLI analog (NOT duplication).**
The dry-run→confirm_token flow (`mcp/src/result.ts:298-469` `defineTool`/`defineGuardedTool`, `mcp/src/orchestration/confirmation.ts` 146 lines) has no CLI counterpart — verified by grep (cli matches for "confirm" are unrelated: error-code strings and rc-file wording). The webhook SSRF guard was already de-duplicated: `mcp/src/orchestration/webhook-url.ts` is now a 5-line re-export of `clockify-sdk-ts-115/webhooks` (the guard was promoted to the wrapper; see git history `5ea3202`/`603fbc6`). This is the pattern the repo should repeat.

## D. Oversized / cohesion findings

Top 15 hand-written source files (wc -l, excluding generated wrapper/src, dist, node_modules, tests, output):

| Rank | File | Lines | Cohesion verdict |
|---|---|---|---|
| 1 | `mcp/src/tools/workflows/resolve.ts` | 880 | **Grab-bag**: work-package orchestration (createWorkPackage, 373 lines), defaultRecovery, findEntryForFix, summarizeEntries, dateRange, 6 name→id resolvers, AmbiguousNameError, entryIds, mergeChanged, validators. Multiple responsibilities, but all are workflow-tier helpers shared by the 9-module workflows/ tree (2,844 lines total) |
| 2 | `wrapper/composed-fetch.ts` | 834 | Cohesive: one fetch wrapper (retry policy, hooks, request-id); the largest hand-written SDK module and the most heavily tested (composed-fetch.test.ts 2,564 lines) |
| 3 | `wrapper/webhook-events.ts` | 723 | Cohesive: 76 type exports + 1 const (`CLOCKIFY_WEBHOOK_EVENT_NAMES`); a pure type module |
| 4 | `wrapper/errors.ts` | 681 | Cohesive: error subclasses + promoteApiError + classification over the generated registry |
| 5 | `mcp/src/tools/scheduling.ts` | 680 | Cohesive: one register function + two filters |
| 6 | `mcp/src/tools/projects.ts` | 669 | Cohesive (one tool group) |
| 7 | `mcp/src/tools/reports.ts` | 608 | Cohesive |
| 8 | `mcp/src/tools/expenses.ts` | 590 | Cohesive |
| 9 | `mcp/src/result.ts` | 526 | Cohesive: MCP envelope + writeReceipt + defineTool/defineGuardedTool |
| 10 | `mcp/src/tools/timeOff/policies.ts` | 519 | Cohesive |
| 11 | `wrapper/resolve.ts` | 511 | Cohesive: shared name-resolution library (the de-duplication success story) |
| 12 | `mcp/src/tools/invoices/invoices.ts` | 497 | Cohesive |
| 13 | `wrapper/create-client.ts` | 493 | Cohesive: factory + auth + routing validation + env reading |
| 14 | `mcp/src/tools/workflows/index.ts` | 486 | Cohesive: workflow registration |
| 15 | `cli/src/commands/sharedReports.ts` | 480 | Cohesive |

**Verdict:** only `workflows/resolve.ts` is multi-responsibility, and its size is a shared-helper phenomenon within one tier rather than a design defect. No module needs splitting as a first-class candidate. Note the asymmetry: `scripts/lib/consumer-cast-governance.mjs` (12,951 lines) + its test (13,124 lines) are the two largest *gate* files — larger than any product file.

## E. scripts/ and docs/ inventories

**scripts/ (264 tracked files, 95,133 lines):**
- **Checkers (`check-*.mjs`): 124.** 52 import `isWiringTargetReachable` (scripts/lib/gate-targets.mjs) and re-verify their own five-anchor wiring (Makefile / quality-gates.md / docs index / contract-inventory.json / enterprise-hardening-audit.json — pattern stated in scripts/check-agent-tasks.mjs:3-6).
- **Generators (`generate-*.mjs`): 16**, 10 wired as `--write`/`--check` drift pairs.
- **Gate self-tests: 68 `*.test.mjs`**, of which **2 are orphaned** (see INV-02): `check-aggregate-wiring.test.mjs` and `check-mcp-write-safety.test.mjs` — executed by no Makefile target, npm script, workflow, or importer. Both are documented as exceptions in `docs/test-wiring-contract.json:18-25`, which includes the note "delete this entry" after the manifest-temp-dir fix.
- **Plan/report topics (`plan.mjs` + `<topic>-plan.mjs`):** 10 topics routed through `scripts/plan.mjs` (AGENTS.md:392-400); the topic modules are libraries, not CLIs.
- **Libraries (`lib/`, 42 files, ~30k lines):** aggregate-gates (1,413), verify-plan, wiring-contract, consumer-cast-governance (12,951), live-differential, mutation-score, openapi-source-lock, release-boundaries/state, remote-mutation-proof.
- **Live proof (`live/`, 12 files):** orchestrator (1,130), cleanup (1,130), generate-live-evidence-manifest (3,615), run-live-evidence-campaign, attestation.
- **Codegen (`sdk-codegen/`, 12 files):** generator (emitter 911, model, schema, naming, paths, constants) + fixture tests.
- **Referenced classification:** of the 261 `.mjs` files, every one has at least one reference (Makefile, workflow, package.json, docs, or another script) **except the 2 orphaned tests**. `probe-and-stamp.mjs`, `build-replay-fixtures.mjs`, `verify-remote-mutation-proof.mjs` are documented-but-not-wired manual tools (referenced only in `docs/live-probe-ledger.json`, `docs/replay-fixtures-contract.json`, `docs/docs-quality-contract.json:111`); `import-live-evidence-manifest.mjs` is a documented human-approval step (docs/live-tests.md:132).
- **12 tracked scratch probes under `output/`** (INV-03) — the only truly dead tracked code.

**docs/ (242 tracked files, 63,136 lines):**
- **126 markdown** + **115 JSON** + 1 Makefile.
- **Types:** guidance (quality-gates, gate-tiers, axioms, product-north-star, README/index), **contracts** (`*-contract.json`: 75 files; 42 consumed by exactly one check script), **policy** (`*-policy.md`: ~40 paired with contracts), **generated surfaces** (product-surface, openapi-operations 5,728 lines, operation-parity 3,223, mcp-tool-manifest 2,290, gate-tier-inventory 4,941, one-point-zero-surface-inventory, error-codes.md, troubleshooting.md, conformance.md, contributing-matrix), **ledgers/inventories** (contract-inventory 1,517, enterprise-hardening-audit 4,142, unique-claim-inventory 3,080, operation-dispositions 2,535, risk-register, live-probe-ledger, gate-tier-inventory), **evidence** (live-evidence-currentness.json, live-sandbox-fingerprint, live-differential-receipt), **decisions** (6 ADRs), **agent-tasks** (8 packets), **gotchas** (9 topic files), **roadmap receipts** (27 task receipts).
- **Docs that exist to satisfy other docs/gates:** `docs/quality-gates.md` restates AGENTS.md §4 (see INV-05); `docs/gate-tiers.md` self-describes as a human map whose "executable source of truth" is elsewhere (gate-tiers.md:1-5); the governance bundle's 22 checkers validate that contract-declared doc paths exist and are wired — i.e., documentation whose primary consumer is another documentation gate.

## F. Gate inventory (cost vs protection)

**Makefile: 179 targets.** Aggregates: `perfect-fast` (21 prereqs + `scripts/verify.mjs fast`), `contract-gates` = **65 leaves** (product-contracts 38 + security-contracts 10 + release-contracts 7 + docs-contracts 10), `governance-audit` (22 leaves, **not CI-wired** — manual/scheduled only), `release-proof` (3 heavy), `perfect-full` (contract-gates + heavy-proof + verify.mjs full), `perfect-live`/`live-differential`/`live-evidence-campaign` (credentialed).

CI enforcement (ci.yml): only `contract-gates` + the codegen/determinism/build/pack-smoke/coverage/mutation-ci set + npm-audit. `release.yml`/`ci-cli-release.yml`/`ci-mcp-release.yml` run `contract-gates` + `release-proof` on tag push.

**Cost-vs-protection assessment:**
- **High value (keep):** `sdk-codegen-drift`/`sdk-codegen-test`/`codegen-determinism` (protect the generated boundary), `generated-edit-check` (no hand-edits to generated trees), `consumer-cast-budget` (zero-cast security invariant; its 13k-line engine + 13k-line test is the most expensive gate, but the invariant has a zero-exception budget), `breaking-typecheck`/`breaking-change-review` (compiler-owned public API proof), `version-consistency` (uses the retired release-please manifest as policy anchor), `pack-snapshot-check`, `mutation-ci` (offline verification of GitHub-only mutation wiring), `live-safety`/`test-data-lifecycle` (sandbox discipline).
- **Generated-vs-generated cross-checks (deliberate, sound):** `operation-parity-drift` compares the spec-derived `openapi-operations.json` against the server-derived `mcp-tool-manifest.json` — a genuine spec-vs-runtime comparison, not circular. `service-routing-matrix` and `routing-matrix-equality.test.ts` check the hand-written routing table against the approved JSON — a documented fail-closed mirror.
- **Doc-consistency-only (low protection per gate, highest count):** the 22-leaf governance bundle (existence + five-anchor wiring checks); `docs-counts` (derives the 161/168 headline from the spec so prose can't go stale); `readme-tables-drift`, `docs-index-drift`, `contributing-matrix`, `gate-tier-inventory-drift` (all regenerate-and-compare docs against docs).
- **Known exceptions:** two orphaned test files documented in `docs/test-wiring-contract.json` (INV-02); `check-aggregate-wiring.test.mjs`'s entry explicitly says "delete this entry" once fixed.

## G. Release machinery assessment

- **Tag-gated CI publish only** — `release.yml` fires on `wrapper-v*.*.*` tags (also cli/mcp twins); laptop `npm publish` is impossible by contract (AGENTS.md §10.5). The tag-vs-version guard (`release.yml` "Verify tag matches package version") is load-bearing.
- **Exact-artifact integrity pipeline:** `scripts/release-state.mjs` (init/set-artifact/fail/show), `release-publish.mjs`, `release-attestation.mjs` (npm provenance), `registry-smoke.mjs` (post-publish install smoke) — added by `7420954` ("fix(perfect-state): close audit and release proof gaps") and `6e5dfd1`.
- **release-please leftovers: NOT dead.** `.release-please-manifest.json` + `release-please-config.json` are consumed by `scripts/check-version-consistency.mjs:147-151` and its tests as the coordinated-version policy anchor; retirement is documented (AGENTS.md:26-27, `docs/gotchas/release-ci-handoff.md`).
- **Pack snapshots:** `wrapper/.packsnapshot`, `cli/.packsnapshot`, `mcp/.packsnapshot` tracked; CI compares via `scripts/pack-snapshot.mjs --check` (ci.yml).
- **mcpb bundle:** `mcp/clockify115-mcp-*.mcpb/build.json/spdx.json` (3.3MB binary present locally) are gitignored (`.gitignore:53-58`); tracked only `.mcpbignore` + manifest checks (`mcpb-validate`).
- **docs.yml:** TypeDoc → gh-pages on tag push.
- **Assessment:** sound and unusually fail-closed. The only true leftovers are the two orphaned test files (INV-02) and the 12 tracked scratch probes (INV-03).

## H. Simplification candidates (numbered)

1. **INV-01 (SHOULD SIMPLIFY, high confidence)** — Consolidate the duplicated region-routing block (C1) into the SDK.
   - Problem: ~120 lines of near-identical logic in cli/src/client.ts:14-97 and mcp/src/client.ts:14-87,236-247; user-visible message text already drifted.
   - Transformation: export runtime region constants + a parameterized `buildRoutingOptions` from `wrapper/create-client.ts`; both packages delegate.
   - Benefit: single validation semantics; kills the third pin (region-list tests) too.
   - Risk: public-API addition requires the full governance chain (sdk-public-api.json, package.json exports, verify-dual-build.sh, tsconfig aliases); message wording must be preserved via parameterization.

2. **INV-02 (SHOULD SIMPLIFY, high confidence)** — Resolve the two orphaned gate tests (`scripts/check-mcp-write-safety.test.mjs`, `scripts/check-aggregate-wiring.test.mjs`): wire or delete, then empty the `unwiredTests` list in `docs/test-wiring-contract.json` and regenerate `gate-tier-inventory`. The contract itself already instructs this ("delete this entry", test-wiring-contract.json:25).

3. **INV-03 (SHOULD SIMPLIFY, high confidence)** — Remove the 12 tracked `output/scratch-*.mjs` probes (added in `a8d61d0`; zero references anywhere; output/ is documented as regenerable output).

4. **INV-04 (SHOULD SIMPLIFY, medium confidence)** — Consolidate the governance-existence tier: fold the 5-6 pure doc-existence checkers into one composite gate. Do NOT touch the meta-gates (aggregate-gates/verify-plan/gate-tier-inventory) or any gate that caught a real defect in the 2026-06-29 audit. This is the highest-value but riskiest simplification; the protection-to-cost ratio of the 22-leaf governance bundle (not CI-wired, checks docs about docs) is the weakest in the repo.

5. **INV-05 (OPTIONAL, medium)** — De-duplicate gate guidance across AGENTS.md §4 / CLAUDE.md / docs/quality-gates.md / docs/gate-tiers.md: keep one canonical prose home, link elsewhere.

6. **INV-06 (OPTIONAL, medium)** — Expose Last-Page parsing (or page-meta iteration) from wrapper/iter.ts and have mcp/src/tools/paging.ts delegate; or accept the ~20 duplicated lines given the different envelope requirements.

7. **INV-07 (OPTIONAL, high)** — Delete the duplicated `entityId` test copies in cli/tests/sdk-narrow.test.ts and mcp/tests/sdk-narrow.test.ts (covered at the wrapper).

8. **INV-08 (OPTIONAL, high)** — Reconcile the dual-build export-list duplication: fix the stale "17-name baseline" comment (actual vitest list: 18 names; shell baseline: 93 curated), or make the vitest test import the same list as `verify-dual-build.sh`; keep the exact-surface enforcement intact.

## Why these are real problems (and the strongest argument against each)

- **INV-01:** Drift is not hypothetical — the two error strings already disagree (cli:33 vs mcp:32). Against: the two packages have genuinely different input vocabularies (flags+rc-file vs env-only); parameterizing messages may be as much code as the duplication, and any new public export triggers the full surface-governance chain. The type-level union already keeps them honest; the runtime text is the only cost.
- **INV-02:** Two test files are executed by nothing; the repo's own meta-gate (check-test-wiring) has to exempt them. Against: both were written to guard a real hazard (manifest rewrite dirtying the tracked tree) that has since been fixed in check-mcp-write-safety.mjs — deletion is safe only because the fix landed; the contract's own note says so.
- **INV-03:** 12 dead probes in a directory whose documented purpose is regenerable output. Against: they are evidence of live-probe campaigns; but they are not referenced by any ledger, gate, or doc — untracked history would preserve them.
- **INV-04:** The governance tier protects documentation consistency, not product behavior, at 22 gates + ~5 anchors each; its maintenance cost is the "five-anchor wiring" ceremony. Against: the strongest argument is that every leaf exists because a past defect class was found and memorialized — consolidation risks losing a fail-closed property, and the repo's own history (47 gate bugs, false-greens) argues for keeping verification machinery deliberately redundant. This is why the candidate is SHOULD SIMPLIFY (merge existence-checkers only), not MUST FIX.

## Tests assessment (area 8)

- **Where:** wrapper/tests (56 files, 15,845 lines), cli/tests (42, 10,437), mcp/tests (75, 22,202). Counts of `it(`/`test(` calls: wrapper 837, cli 387, mcp 777.
- **Behavior vs implementation:** overwhelmingly behavior-focused (command trees in cli/tests/index.test.ts:22-50; wire-shape quirk behavior in mcp/tests/wire-shape.test.ts). Implementation-mirroring exceptions: `wrapper/tests/dual-build.test.ts` (asserts `dist/esm|dist/cjs` file layout + export names — protects the real dual-build behavior but mirrors the shell script with a stale comment); `wrapper/tests/generated-baseurl-routing.test.ts` (greps generator emitter source text for function names — source-text mirroring); `wrapper/tests/routing-matrix-equality.test.ts` and `axioms-checklist.test.ts` (deliberate doc↔code mirror checks, documented fail-closed patterns — these are features).
- **Env-gated live tests:** `sandbox.test.ts` in all three packages (wrapper 190 lines/7 flows, cli 480/12, mcp 570/12), `describe.skip` when credentials are absent; plus `live-sandbox-support.ts` helpers (108/142/437 lines — different per package, not duplicated) and the credentialed `scripts/live` campaign machinery.
- **Coverage:** pinned floors in `docs/coverage-contract.json`, enforced by `make coverage` (perfect-full only, not in fast loop).

## Git history notes (area 11)

- The 1.0.1 campaign (`fa1673c`, `11e1ce2`, `7420954`, `65cc83e`, `49462f5`, HEAD `931ac01`) added: the release-state exact-artifact machinery (7420954), the openapi-lint wiring into contract-gates (fa1673c), region-list pinning tests (65cc83e), and fixes for gates that "had stopped guarding" (11e1ce2) — the audit-remediation pattern is: *defect found → fix the gate → add a gate self-test* (68 `*.test.mjs`).
- `wrapper/webhook-url.ts` history (follow: `443b1a2` → `e211ca6` → `603fbc6` → `5ea3202` → `80f48bb`) shows the SSRF guard migrating from mcp/src/orchestration into the wrapper — the template for INV-01.
- `wrapper/resolve.ts` history (`6a38aff` → `96975df` → `82be0c7` "unify name matching onto one canonical matchByName") shows the repo's successful de-duplication pattern: extract the shared semantic into a wrapper subpath, leave thin surface adapters.
- The `output/scratch-*.mjs` files were added in `a8d61d0` ("docs(wrapper): record the measured mutation result...") — evidence they are probes, not product.
- Release machinery was *added* during the audit (release-state.mjs first appears in `6e5dfd1`/`7420954`), not inherited — the release-please retirement is deliberate and the files are repurposed as policy anchors.

## Uncertainties

1. Gate runtime (perfect-fast/perfect-full wall time) not measured — read-only mandate and the wrapper's generated tree would be needed.
2. The 18-name vitest dual-build list vs 93-name shell list may be intentionally different scopes (root-level vs curated); the comment says otherwise.
3. docs-quality-contract.json and test-matrix-contract.json may pin prose/counts that constrain INV-05/INV-07 — each needs a contract read before acting.
4. UNVERIFIED: nothing in this report claims live-API behavior; all claims are about repo structure verified by inspection.