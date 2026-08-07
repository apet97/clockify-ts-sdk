# Live Validation — Documentation Drift and Gate Auditor (Subagent 4 of 5)

**Scope:** D-01 to D-12, G-01 to G-04, WF-01 to WF-04. Read-only probes only. No file was changed.

## 00 Snapshot

- Repository: `apet97/clockify-ts-sdk` at `49462f5` (`main`, clean except `/.ai-audit/` in `.gitignore`)
- Package versions: wrapper `1.0.1`, cli `1.0.1`, mcp `1.0.1` (all three `package.json` read)
- Spec: `spec/corrected/clockify.corrected.openapi.yaml` → 168 operations; live-success markers `x-clockify-live-status: live-success` → 161; `probe-documented` 6, `documented` 1 (yaml probe confirmed)
- Operation parity: `docs/operation-parity.json` `summary` `{operations:168, sdkGenerated:168, sdkExplicitlyNamed:149, sdkOperationIdDerived:19}`; service derivation `docs/service-routing-matrix.json` `{api:157, reports:10, audit:1}` (total 168)
- MCP tools: `docs/mcp-tools.json` `{totalTools:162, workflowTools:22, domainTools:140}` (22+140=162, matches `docs/mcp-tool-manifest.json` and `product-surface.json`)
- CLI commands: `docs/cli-commands.json` length 66 (matches `docs/cli-contract.json` `expected.commandCount`)
- SDK public API: `docs/sdk-public-api.json` `rootSymbols` length 93, `subpaths` keys 28 (matches `wrapper/scripts/verify-dual-build.sh` `SURFACE` count 93)
- Live evidence manifest: `spec/evidence/live-evidence-manifest.json` attests `1dc0392` (736,890 B) but shipped snapshot hashes to `ea7eb23+d15ce1e` (764,551 B) — provenance gap already known as S-01, not re-proved here except by hash
- Anchors: `docs/operation-evidence-anchor-inventory.json` 78 anchors; `spec/evidence/discrepancies.md` 79 `###` headings with backticks, 78 unique slugs (one duplicate), so unique counts match (detail in D-11)
- Tags: `git tag -l` shows only package-prefixed tags (`wrapper-v*`, `cli-v*`, `mcp-v*`); zero bare `v*.*.*` tags (verified)
- Workflows: `.github/workflows/` has 8 files (`ci.yml`, `docs.yml`, `release.yml`, `ci-cli-release.yml`, `ci-mcp-release.yml`, `codeql.yml`, `sandbox-key-health.yml`, `mutation.yml`); only `codeql` and `sandbox-key-health` carry a `cron` schedule

## 01 Doc Count Validation

Counts were checked with `grep -n`, `python3` json/yaml probes, and `node -e` where needed. Each row states the weakest hypothesis that covers the evidence.

| ID | Document and claim | Observed (live probe) | Verdict | Weakest hypothesis |
|---|---|---|---|---|
| D-01 | `AGENTS.md:326` build:smoke verifies "92 names" | `wrapper/scripts/verify-dual-build.sh` `SURFACE` has 93 comma-separated names; `docs/sdk-public-api.json` `rootSymbols` has 93; `verify-dual-build.sh` sets `SURFACE_COUNT=93` and `EXPECTED_ROOT_SURFACE_COUNT=93` | **Confirmed stale** | Doc fix only: single number drift (92→93). No intent to keep historical count; `CLAUDE.md` already has no claim, wrapper source is authoritative. |
| D-02 | `docs/gotchas/spec-live-api-reality.md:66` live-success "135/163" (and `AGENTS.md:712` historical "46/184 to 135/163") | Corrected spec has 161 live-success / 168 total. Gotcha paragraph presents "135/163" as current evidence-gated count and links it to `make docs-counts` deriving the headline. `AGENTS.md:705` correctly says **161/168** current. `docs/docs-counts-contract.json` `liveSuccessProse.mustAppearIn` only gates `AGENTS.md` and `CLAUDE.md`, not gotchas; `forbiddenStrings` has `"135 live-verified"` but not `"135/163"` | **Confirmed stale in gotcha; historical use in AGENTS.md is correct** | Gotcha doc states stale headline as current. Weakest fix: update the one sentence to 161/168 and add `"135/163"` to `forbiddenStrings` (or extend derived claim to gotchas). The AGENTS.md `135/163` occurrence is valid history and needs no change. |
| D-03 | `docs/decisions/0006-mcp-tool-surface-scope.md:25-27` "163 ops: 149+14, api=152, 162 tools (22+140)" | `docs/operation-parity.json` 168 ops (149+19), `docs/service-routing-matrix.json` api=157. Tool split 22+140 is correct today, but the operation split and service count are stale. | **Confirmed stale** | Decision record labels stale numbers as "current baseline". Weakest fix: update to 168 (149+19), api=157; keep historical 163 discussion as history. No intent to retain 14 derived; generated inventories agree on 19. |
| D-04 | ADR 0006 addenda sequence 144→162 (Task 26) →147 (Task 27) →162 (2026-08-04 after removing a tool) | `docs/mcp-backlog.md` records 143→144 (Task 25) →146 (Task 26) →147 (Task 27) →153→162; ADR jumps from 144 to 162 at Task 26, skipping the real +2 step, and rises from 147 to 162 while describing a removal | **Confirmed contradictory** | ADR addenda were written as snapshots and not reconciled with backlog history. Weakest fix: correct Task 26 to 146 and the 08-04 addendum to show net +9 after interim steps, or mark addenda as superseded by backlog. |
| D-05 | `docs/release-decision.md:27-28` "current versions SDK 0.15.1, CLI 0.5.1, MCP 0.8.1" | Packages are 1.0.1; `docs/release-decision-registry-receipt.json` records registry 0.15.1 / 0.6.1 / 0.9.1 at `2026-08-05`, queried against old tags. Last touch of `release-decision.md` is `5ea3202` (pre-1.0.1 `fa1673c`). | **Confirmed stale** | Decision doc is pre-release and was not refreshed at 1.0.1. Weakest fix: refresh current posture to 1.0.1 or mark historical. |
| D-06 | `docs/agent-tasks/add-mcp-tool.md:10` "22 workflow + 124 domain split" | `mcp/src/server.ts` registration and `docs/mcp-tools.json` summary show 22+140 (total 162). The file is not at line 30 for this claim (line 30 is `toHaveLength`); line 10 carries the 124 figure. | **Confirmed stale** | Task packet predates final backlog tranche (153→162). Weakest fix: edit line 10 to 140. |
| D-07 | `docs/one-point-zero-surface-inventory.md:11` "wrapper, CLI and MCP are all 1.0.0" | Table at line 179-181 says 1.0.1 for all three; `package.json` files are 1.0.1; `docs/one-point-zero-surface-inventory.json` has mixed 1.0.1 in inventory and 1.0.0 in guidance prose (3 occurrences) | **Confirmed stale prose** | The bullet describes release decision `released_1_0`; the version was bumped to 1.0.1 without updating the reason sentence. Weakest fix: change prose to "1.0.1" or "1.0.x" and note the 1.0.1 patch. |
| D-08 | `spec/evidence/generator-comparison.md:6` "the spec is now 184 operations" | Spec is 168; operation inventories and parity agree on 168. File header says "> **HISTORICAL (Phase 0 spike).**" | **Confirmed present-tense error in historical doc** | The doc is intentionally retained as historical context; "now" should read "at the time". Weakest fix: reword to "at the time 184" and keep historical label. Gate gap: header already says HISTORICAL, so risk is low. |
| D-09 | `spec/evidence/probes/README.md:12` "git-ignored as part of `fern/`" | `.gitignore:11-13` ignores `spec/evidence/probes/*.{json,hdr}`; repo is `clockify-ts-sdk`, not `fern/` | **Confirmed stale path** | Workspace renamed from `fern/` before ship. Weakest fix: change wording to `spec/evidence/probes/`. |
| D-10 | `docs/README.md:134,138` "Generated (14 rows) … Hand-maintained (91 rows)" | Main table `| Surface | Regenerate | Purpose |` has 112 rows: 19 with `` `make ...` ``, 1 with `` `node scripts/...` ``, 2 with `generated`, 1 with `live-evidence record`, 1 with `source-derived fallback`, and **92 with `edit intentionally`**. Total 112, not 105; hand count is 92 not 91; generated `make` count is 19 not 14. Header note says "The heading is historical; treat `edit intentionally` as authoritative over it." | **Confirmed stale counts with in-doc disclaimer** | Heading predates 7 added rows. Weakest fix: update bullets to "Generated (19 `make` rows) … Hand-maintained (92 rows)" or remove counts and rely on the disclaimer. No gate checks the bullet numbers directly; the table itself is authoritative. |
| D-11 | `docs/operation-evidence-anchor-inventory.json` 78 anchors vs ledger 79; "newest entry missing" | Ledger has 79 `###` headings with backticks but **78 unique slugs** (duplicate `timeoff.legacy-policies-requests.phantom-path-quarantined` at lines 1681 and 1736 with different status tags). Inventory has 78 unique `evidenceId` entries. Set difference ledger−inventory = 0, inventory−ledger = 0. Newest entry `errors.400-not-found.regex-breadth-unprobed` (OPEN 2026-08-06, line 3706) **is present** in the inventory. | **Not confirmed as filed; apparent miscount due to duplicate slug** | The finding counts raw headings (79) against unique anchors (78) and assumes a gap. Weakest hypothesis: ledger duplicate inflates the raw count; the inventory is complete on unique evidence IDs. Fix the duplicate (merge or dedup the two round headings) or clarify counting rule (unique slugs). No remediation needed for the newest entry. |
| D-12 | `docs/docs-counts-contract.json` forbids "93 public names" while 93 is current | `docs/sdk-public-api.json` `rootSymbols#length` is 93. The forbidden list does include `"93 public names"` (along with older `"91 public names"`, etc.). `CLAUDE.md:31` would not trigger because it says "93 SDK public names across 28 subpaths" — different substring. | **Confirmed denylist decay (stale entry)** | Denylist is a ratchet of past stale values and must be pruned when a value becomes current. Weakest fix: remove `"93 public names"` from `forbiddenStrings`; the `derivedClaims` + `authoritativeCounts` layers now own the 93 count and will catch future drift more reliably. Same pattern let "135/163" through (D-02). |

## 02 Gate Weakness Validation

### G-01 — `docs/cli-contract.json` missing `--region`/`--subdomain`

- **Claim:** `globalFlags` lists 7 of 9, so removal of the two routing flags passes every gate.
- **Observed:** Contract has 7 flags: `--workspace`, `--base-url`, `--json`, `--output`, `--compact`, `--select`, `--no-color`. `cli/src/index.ts` registers 9 flags at program level via `.option(...)`: the same 7 plus `--region <name>` (mutually exclusive with `--base-url`, mirror `CLOCKIFY_REGION`) and `--subdomain <label>` (requires regional `--region`, mirror `CLOCKIFY_SUBDOMAIN`). Both route flags have beened documented in CLI help since 1.0.1 and in `AGENTS.md` service-routing section.
- **Checker:** `scripts/check-cli-contract.mjs:206-209` iterates `contract.expected.globalFlags` and asserts each flag string appears in `cli/src/index.ts` and `cli/README.md`. It does **not** check the reverse (flags in source that are missing from the contract), so extra or missing routing flags are invisible. Removal of `--region` would not fail `cli-contract`; `exit-code` check (line 218) is only a substring search for `toBe(2)` in `exit-contract.test.ts`.
- **Verdict: Confirmed.** Add `--region` and `--subdomain` to the contract; extend checker to assert set equality between `program.option` flags and `contract.expected.globalFlags`.

### G-02 — `scripts/check-tag-hygiene.mjs` stale message

- **Claim:** Message names `release.yml` publishing on bare `v*.*.*` while real trigger is package-prefixed.
- **Observed:** `scripts/check-tag-hygiene.mjs:6-7` comment/message references bare `v*.*.*`. `release.yml:5-7` triggers on `wrapper-v*.*.*`; `.github/workflows/docs.yml:5` still has the bare `v*.*.*` tag trigger (the only workflow using it). The prohibition (reject bare semver) remains useful, but the diagnostic text misnames the publisher.
- **Verdict: Confirmed — message/label drift, not a safety loss.** Update comment and error text to name `docs.yml` vs package-prefixed release workflows.

### G-03 — Marker-only gates (~80 of ~90)

- **Pattern probed:** `scripts/check-mutation-safety.mjs` is representative. It reads `docs/mutation-safety-contract.json` (policy markers) and then uses `includesAll(text, markers, label)` to assert marker strings appear in referenced docs (`docs/mutation-safety-policy.md`, `wrapper/composed-fetch.ts`, etc.). It checks **presence of prose markers**, not the underlying runtime behavior. `wrapper/composed-fetch.ts` supporting evidence checks only that the file contains literals like `retryPolicy` and `retryableMethods: ["GET", "HEAD", "OPTIONS"]`.
- **Siblings inspected:** `check-live-safety.mjs`, `check-env-contract.mjs`, `check-config-precedence.mjs`, `check-data-handling.mjs`, `check-mutation-safety.mjs`, `check-aggregate-gates.mjs` all share the `includesAll`/marker schema. `grep -l includesAll` returns 23 `check-*.mjs` files (list in receipts). `grep -c includesAll` top counts: mutation-safety 6, acceptance-scenarios 5, etc.
- **Gates that DO inspect source:** `check-cli-write-safety.mjs` (introspects `cli` command tree), `check-consumer-cast-budget*.mjs`, `check-generator-comparison.mjs`, `check-generator-independence.mjs`, `check-schema-quality.mjs`, `check-performance-budgets.mjs`, `check-version-consistency.mjs`, `check-cli-contract.mjs` (partially), and a few others — the minority. The audit's " ~80 marker-only" is directionally correct; a few dozen are true behavioral checks.
- **Impact:** A gate stays green while behavior regresses if the doc markers remain. Example: retry mutation logic could reorder `retryableMethods` while policy prose still contains the old literal; the supporting-evidence literal check would still pass if the literal persists in a comment.
- **Verdict: Confirmed.** For each high-value marker gate, either add real proof (execute the path) or rename the claim to "docs assert X" rather than "system guarantees X". Highest value to harden: `docs-counts` (already upgraded to derived claims for live-success), `cli-contract` (G-01), `mcp-write-safety`, `live-safety`, `env-contract`.

### G-04 — `docs/cli-commands.json` self-consistency loop

- **Claim:** Hand-maintained `cli-commands.json` (66 rows) has no generator; `check-cli-contract.mjs` only verifies command strings appear in `cli/README.md`, which `scripts/update-readme-tables.mjs:31-43` regenerates from the same JSON — a loop that hides help-text drift.
- **Observed:** `docs/cli-commands.json` is not emitted by any `make` target. `scripts/check-cli-contract.mjs:195-198` reads the JSON, then for each `command.command` asserts `readme.includes(command)`. `scripts/update-readme-tables.mjs` writes the `generated:cli-commands` block in `cli/README.md` from that JSON. Descriptions and arg shapes are never compared against `collectClassifiedLeaves(buildProgram())` output. The 66-row count is validated against `docs/operation-parity.json` only indirectly via `cli-contract` command count; leaf add/remove is caught by `cli-write-safety` introspection, but flag descriptions are not.
- **Verdict: Confirmed — loop exists for descriptions/args, count is guarded elsewhere.** Fix: compare JSON command names against the live commander tree (use `buildProgram()`), not just against the README rendered from the JSON.

## 03 Workflow Audit

### WF-01 — `docs.yml` tag trigger `v*.*.*` never fires

- **File:** `.github/workflows/docs.yml:5` → `on.push.tags: - "v*.*.*"`
- **Tags in repo:** `git tag -l` = 35 tags, all package-prefixed: `wrapper-v1.0.0`, `wrapper-v0.15.1`, `cli-v1.0.0`, `cli-v0.6.1`, `mcp-v1.0.0`, `mcp-v0.9.1`, … zero bare `v*.*.*`. `git tag -l "v*"` returns empty. `scripts/check-tag-hygiene.mjs` forbids bare semver tags.
- **Effect:** Docs deploy on `push` to `main` only; the tag path is reachable on a bare tag but no such tag is ever created by the release flows (`release.yml` publishes on `wrapper-v*`, `ci-cli-release.yml` on `cli-v*`, `ci-mcp-release.yml` on `mcp-v*`).
- **Verdict: Confirmed dead trigger.** Change `docs.yml` tags to `wrapper-v*.*.*`, `cli-v*.*.*`, `mcp-v*.*.*` or remove the tag trigger and add a comment linking to `check-tag-hygiene.mjs`.

### WF-02 — Governance and heavy gates never run in CI

- **Probe:** `grep -l "performance-budgets|governance-audit|verify.mjs"` across `.github/workflows/*.yml` → no hits (exit 1). `ci.yml` runs two jobs:
  - `packages` (matrix 22.13.0 + 24): `npm ci`, `make sdk-codegen`, `npm run build -w clockify-sdk-ts-115`, lint/type-check/test/build, `build:smoke` on wrapper, `pack-snapshot` on 22.13.0.
  - `contracts` (Node 22.13.0): `npm ci`, `make sdk-codegen`, `npm run build`, `make contract-gates`, then `make sdk-codegen-drift sdk-codegen-test codegen-determinism build-determinism generator-comparison pack-smoke coverage mutation-ci` plus `node --test check-npm-audit.test.mjs && check-npm-audit.mjs`.
- **Missing from CI:** `performance-budgets` (Makefile target, not in any workflow), `governance-audit` (alias for `governance-contracts` = 17 enterprise/process checks including `docs-counts`, `conformance-drift`, `enterprise-audit`, `decision-records`, etc.), `verify.mjs fast/full` direct, and the standalone `perfect-fast`/`perfect-full` aggregates. `Makefile:143` notes `performance-budgets` must be last after package/heavy proof to avoid load contention.
- **Cron:** Only `codeql.yml` (`23 4 * * 1`) and `sandbox-key-health.yml` (`0 7 * * 1`) have schedules. `AGENTS.md:10-13` describes `governance-audit` as "Scheduled governance" but no workflow schedules it.
- **Verdict: Confirmed.** `performance-budgets` and the governance surface are guardable offline without credentials — they should run in CI (gated behind build artifacts). Add a scheduled workflow for `governance-audit` or fold its leaf checks into `ci.yml` contracts.

### WF-03 — Release smoke failure swallowed (always exit 0)

- **Files:** `release.yml:160-163`, `ci-cli-release.yml:158-161`, `ci-mcp-release.yml:222-225`
- **Pattern:**
  ```sh
  if node scripts/registry-smoke.mjs sdk --version "$PACKAGE_VERSION" --timeout-ms 120000; then
    node scripts/release-state.mjs registry-smoke --file "$RELEASE_STATE_FILE" --status passed
  else
    node scripts/release-state.mjs registry-smoke --file "$RELEASE_STATE_FILE" --status failed
  fi
  ```
  Both branches exit 0. The job continues regardless; only the `release-state.json` receipt records `failed`. The later job `if:` gates may still gate the next steps, but the shell step itself never fails the run. The sibling `release-attestation` step would also fail only if provenance is absent (<45 days); registry replication lag could pass attestation while smoke failed.
- **Verdict: Confirmed — status is recorded but not fatal.** The receipt-based design is documented in `docs/ci-policy.md` markers, so the behavior is intentional per G-03's policy. Weakest fix that preserves receipt: `else` branch records `failed` then `exit 1` (or set output and fail after receipt write) so the release visibly reds.

### WF-04 — SBOM best-effort `continue-on-error`

- **File:** `release.yml:174-202`
  ```yaml
  - name: Generate SBOM (SPDX JSON, best-effort)
    continue-on-error: true
    run: |
      npm sbom --sbom-format spdx --sbom-type library \
        > "$RUNNER_TEMP/sbom-${PACKAGE_VERSION}.spdx.json"
      test -s "$RUNNER_TEMP/sbom-${PACKAGE_VERSION}.spdx.json"
  - name: Create or update GitHub release (+ attach SBOM if present)
    run: |
      if [ -s "$RUNNER_TEMP/sbom-${PACKAGE_VERSION}.spdx.json" ]; then
        gh release upload ... --clobber
      else
        echo "No valid SBOM file to attach; skipping upload."
      fi
  ```
  The SBOM step can fail (non-zero or empty output) and the release still succeeds with "skipping upload". Provenance/attestation are separate gates, but SBOM consumers get silent absence.
- **Verdict: Confirmed — best-effort by design.** Either make it fatal or document in `release-policy.md` that SBOM is optional and the release receipt notes its absence. The `continue-on-error` is deliberate per its label, so the fix is policy clarification + optional hardening.

## 04 Stale Docs Detailed

All findings above were checked against the live file at audit time (`main` @ `49462f5`). The table in §01 is the detailed record. Additional nuance for the two disputed cases:

### D-10 nuance

The README table has 112 rows. The prose bullets claim 14 + 91 = 105. The table actually has 19 `make` rows (plus 1 `node scripts/...`, 1 `source-derived fallback`, 2 `generated`, 1 `live-evidence record`), so "14 generated" undercounts by at least 5. The 91 → 92 hand drift is the smallest error. The in-doc disclaimer ("The heading is historical; treat `edit intentionally` as authoritative") mitigates reader confusion, but the numbers should be updated to 19 and 92 or removed.

### D-11 nuance

The finding as filed double-counts the ledger. The ledger's `timeoff.legacy-policies-requests.phantom-path-quarantined` appears twice (EXPANDED and RESOLVED) with distinct suffixes. Counting raw headings gives 79; counting unique slugs gives 78, matching the inventory. The inventory **does** contain the newest entry `errors.400-not-found.regex-breadth-unprobed` (OPEN 2026-08-06). The remediation is ledger hygiene (merge or rename one heading), not an inventory gap.

### D-08 nuance

The file is correctly labeled `HISTORICAL (Phase 0 spike)`. The drift is the adverb "now" in line 6, which should be past tense. No gate checks this sentence; the risk is reader misreading the snapshot as current authority. Low priority.

## 05 Remediation Mapping

One line per finding; read-only per mission — no file was changed.

| ID | File(s) | Edit |
|---|---|---|
| D-01 | `AGENTS.md:326` | `92 names` → `93 names`; consider adding a check that AGENTS.md and CLAUDE.md cross-reference the same count (or remove the number from AGENTS and point to `docs/sdk-public-api.json`). |
| D-02 | `docs/gotchas/spec-live-api-reality.md:66` + `docs/docs-counts-contract.json` | Change `135/163` → `161/168`; add `"135/163"` to `forbiddenStrings`; extend `liveSuccessProse.mustAppearIn` or add a `derivedClaims` entry for this gotcha so the headline re-gates there. |
| D-03 | `docs/decisions/0006-mcp-tool-surface-scope.md:25-27` | `163`→`168`, `14`→`19`, `api=152`→`api=157`; keep the historical 163 note but label it as at-time. |
| D-04 | `docs/decisions/0006-mcp-tool-surface-scope.md` addenda (§ Task 26, 27, 08-04) | Fix Task 26 to 146 (not 162), annotate 08-04's 147→162 rise as the final-tranche +9 after the 08-04 removal, or mark addenda as superseded by `docs/mcp-backlog.md`. |
| D-05 | `docs/release-decision.md:27-28` + `docs/release-decision-registry-receipt.json` | Refresh current posture to `1.0.1` for all three packages; re-run the registry smoke capture post-1.0.1 or mark the receipt as at-time 0.9.1. |
| D-06 | `docs/agent-tasks/add-mcp-tool.md:10` | `124 domain` → `140 domain`. |
| D-07 | `docs/one-point-zero-surface-inventory.md:11` | `all 1.0.0` → `all 1.0.1` (or `all 1.0.x`) and note the patch; align the JSON prose counts (3 guidance strings still say 1.0.0). |
| D-08 | `spec/evidence/generator-comparison.md:6` | `is now 184` → `at the time 184`; keep HISTORICAL banner. |
| D-09 | `spec/evidence/probes/README.md:12` | `as part of \`fern/\`` → `in \`spec/evidence/probes/\``; fix gitignore reference. |
| D-10 | `docs/README.md:134,138` | `Generated (14 rows)` → `Generated (19 \`make\` rows)` (or `22` if counting all generated kinds); `Hand-maintained (91 rows)` → `(92 rows)`; total 112. Or remove counts and cite the disclaimer. |
| D-11 | `spec/evidence/discrepancies.md` (two headings) | Merge/dedup the duplicate `timeoff.legacy-policies-requests.phantom-path-quarantined` headings (lines 1681/1736) or give one a distinct base slug; no inventory change needed. |
| D-12 | `docs/docs-counts-contract.json` | Remove `"93 public names"` from `forbiddenStrings`; more generally, rotate any forbidden entry that becomes the current count. |
| G-01 | `docs/cli-contract.json` + `scripts/check-cli-contract.mjs` | Add `"--region"` and `"--subdomain"` to `expected.globalFlags`; add reverse set-equality check (source flags missing from contract fail). |
| G-02 | `scripts/check-tag-hygiene.mjs` | Update message/comment to name `docs.yml` as the bare-tag trigger and `release.yml`/`ci-*-release.yml` as package-prefixed; keep the prohibition. |
| G-03 | `scripts/check-mutation-safety.mjs` + 22 sibling `check-*.mjs` + `docs/mutation-safety-contract.json` | Per gate, either add a behavioral proof (execute the path) or retag the contract purpose to "docs assert X"; prioritize `cli-contract`, `mcp-write-safety`, `live-safety`, `env-contract` for real-source checks. |
| G-04 | `docs/cli-commands.json` + `scripts/check-cli-contract.mjs` | Introspect `buildProgram()` leaf names and compare against `cli-commands.json` command strings (count + descriptions), not just README substring containment. |
| WF-01 | `.github/workflows/docs.yml` | Tags: `v*.*.*` → `wrapper-v*.*.*`, `cli-v*.*.*`, `mcp-v*.*.*` (or drop tags block). Update or add comment referencing `check-tag-hygiene.mjs`. |
| WF-02 | `.github/workflows/ci.yml` + `Makefile` | Add `performance-budgets` to `ci.yml` contracts job (after build), and schedule `governance-audit` via a weekly workflow or fold its drift checks into CI; remove "Scheduled" label from `make help` until scheduled. |
| WF-03 | `release.yml`, `ci-cli-release.yml`, `ci-mcp-release.yml` | After `release-state.mjs registry-smoke --status failed`, `exit 1` (keep receipt). Alternatively set step output `failed=true` and fail the job after finalization. |
| WF-04 | `release.yml` SBOM block | Keep `continue-on-error` only if the policy explicitly documents SBOM as optional; otherwise remove it. Always emit the "skipping upload" warning as a `::warning::` so consumers notice absence. |

## 06 Unknowns

- **Live-success semantics (S-02 family):** Manifest attests 134/168, spec stamps 161/168 — a 27-op delta explained in `docs/live-evidence-currentness.json` as campaign vs sweep promotion waves. The probes above did not re-derive per-op evidence; the headline 161/168 is authoritative per AGENTS.md and the spec markers, but the per-op reconciliation remains a live-evidence question.
- **Tool-count history reconstruction:** The exact point at which `docs/mcp-tools.json` moved from 153 to 162 is in `docs/mcp-backlog.md`'s final-tranche note ("surface 153 → 162") but the ADR does not cite it; the ordering was not cross-checked against `git log`.
- **Governance audit reach:** `governance-audit` is `governance-contracts` which expands to 17 checks; we did not individually verify each of the 17 is free of further marker-only gaps beyond G-03's representative sampling.
- **SBOM truth:** No run of `npm sbom` was executed locally; the "best-effort" status is taken from workflow comments and `continue-on-error: true`.
- **Performance-budgets load sensitivity:** The startup-time budgets (`cli-version` ≤600 ms, `mcp-tools-list` ≤1200 ms) are documented as flaky under CPU contention; not re-measured locally per §4's `perfect-fast solo` rule.

## 07 Receipts

Commands executed (read-only; no file was changed; no API key was logged — blanked creds were used only conceptually):

```sh
python3 - <<'PY'  # D-01: SURFACE count + sdk-public-api rootSymbols
python3 - <<'PY'  # D-02: spec live-success marker count + docs-counts-contract forbidden/mustAppearIn
python3 - <<'PY'  # D-02 deeper: AGENTS.md historical 135/163 vs current 161/168
python3 - <<'PY'  # D-03: ADR 0006 baseline + parity summary + service-routing-matrix counts
python3 - <<'PY'  # D-03 service derivation: docs/openapi-operations.json + operation-parity probes
python3 - <<'PY'  # D-04: backlog sequence vs ADR addenda
python3 - <<'PY'  # D-05: release-decision.md vs package.json versions + registry receipt
python3 - <<'PY'  # D-06/D-07: agent-tasks/add-mcp-tool.md + mcp-tools.json + surface inventory
python3 - <<'PY'  # D-08/D-09/D-10: generator-comparison.md, probes/README.md, docs/README.md bullets
python3 - <<'PY'  # D-10/D-11 deeper: docs/README table parse (112 rows) + anchor inventory vs ledger slugs
python3 - <<'PY'  # D-11 detailed: set diff ledger unique vs inventory; duplicate slug detection
python3 - <<'PY'  # G-01: cli-contract globalFlags + cli/src/index.ts --region/--subdomain options
python3 - <<'PY'  # WF-01/G-01: docs.yml tags + git tag -l + cli flags
grep -l "performance-budgets|governance-audit|verify.mjs" .github/workflows/*.yml   # WF-02: no hits
grep -n "registry-smoke|continue-on-error|sbom" .github/workflows/release.yml       # WF-03/WF-04
sed -n '150,210p' .github/workflows/release.yml                                      # WF-03 block
grep -n "includesAll|marker" scripts/check-mutation-safety.mjs                       # G-03 marker pattern
grep -l "includesAll" scripts/check-*.mjs                                            # G-03 prevalence (23 files)
grep -l "wrapper/src|mcp/src|cli/src" scripts/check-*.mjs                           # gates that DO inspect source
cat .github/workflows/docs.yml                                                       # WF-01 trigger
grep -n "performance-budgets|governance-audit|verify.mjs" Makefile                  # workflow vs Makefile
python3 - <<'PY'  # docs/README final authoritative count (19 make / 92 hand / 112 total)
```

Key files read in full or by probe: `AGENTS.md`, `CLAUDE.md`, `wrapper/scripts/verify-dual-build.sh`, `docs/sdk-public-api.json`, `docs/gotchas/spec-live-api-reality.md`, `docs/docs-counts-contract.json`, `scripts/check-docs-counts.mjs`, `spec/corrected/clockify.corrected.openapi.yaml`, `docs/operation-parity.json`, `docs/openapi-operations.json`, `docs/service-routing-matrix.json`, `docs/decisions/0006-mcp-tool-surface-scope.md`, `docs/mcp-backlog.md`, `docs/release-decision.md`, `docs/release-decision-registry-receipt.json`, `wrapper/package.json`, `cli/package.json`, `mcp/package.json`, `docs/agent-tasks/add-mcp-tool.md`, `docs/mcp-tools.json`, `docs/one-point-zero-surface-inventory.md`, `spec/evidence/generator-comparison.md`, `spec/evidence/probes/README.md`, `docs/README.md`, `docs/operation-evidence-anchor-inventory.json`, `spec/evidence/discrepancies.md`, `docs/cli-contract.json`, `scripts/check-cli-contract.mjs`, `cli/src/index.ts`, `scripts/check-mutation-safety.mjs`, `docs/mutation-safety-contract.json`, `docs/cli-commands.json`, `.github/workflows/docs.yml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/ci-cli-release.yml`, `.github/workflows/ci-mcp-release.yml`, `Makefile`.

Probe method for each count: `grep -n` for fixed strings, `python3 -c` / `yaml.safe_load` for OpenAPI markers, `json.loads(...).__len__` for symbol/tool/command inventories, `git tag -l` for tag shape, `grep -n "cron"` for schedule, `sed -n`/regex for workflow `if/else/fi` blocks, and `re.findall(r"^###\s+`([^`]+)`", ledger)` for evidence anchors.

---

*Audit completed read-only. No network calls, no credential use, no file writes. The single modified file is this report.*
