# Slice D — Documentation, Spec/OpenAPI, and Repository-Level Configuration Audit

Repo: `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`
Auditor slice: docs/** (all markdown + sampled JSON contracts), spec/**, root docs, release config, skills, editorconfig, dependabot.
Date: 2026-08-06. HEAD: `49462f5`. Working tree: only `.gitignore` modified (pre-existing).

---

## 1) Scope + commands run

Read in full: `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE.md`, `package.json`, `.release-please-manifest.json`, `release-please-config.json`, `.editorconfig`, `.github/dependabot.yml`, all 4 `.claude/skills/*/SKILL.md`, `docs/README.md`, all 6 `docs/decisions/*.md`, all 9 `docs/gotchas/*.md`, all 7 `docs/agent-tasks/*.md`, `spec/evidence/discrepancies.md` (3,731 lines, complete), `spec/evidence/generator-comparison.md`, `spec/evidence/probes/README.md`, `spec/evidence/fixtures/README.md`, `spec/fern/fern.config.json`, `spec/fern/generators.yml`, `docs/product-north-star.md`, `docs/release-decision.md`, `docs/migration-guide.md`, `docs/quality-gates.md`, `docs/spec-confidence.md`, `docs/spec-diff-official.md`, `docs/live-evidence-index.md`, `docs/openapi-operations.md`, `docs/operation-parity.md`, `docs/error-codes.md`, `docs/roadmap-1.0.md` (head), `docs/mcp-backlog.md`, `docs/axioms.md`, `docs/conformance.md`, `docs/risk-register.md`, `docs/gate-tiers.md`, `docs/unique-claim-inventory-policy.md`, `docs/one-point-zero-surface-inventory.md` (head), plus heads of the remaining policy docs. Sampled every `docs/*.json` contract used for count/version claims.

Commands (all read-only): `grep`, `find`, `ls`, `wc`, `git log`, `git status`, `git check-ignore`, `shasum -a 256`, inline `python3` YAML/JSON structural probes, `diff`. No make gates, no builds, no test suites, no network calls were executed.

Mechanical counts established (baseline truth for the findings below):

| Quantity | Value | Source |
|---|---|---|
| Corrected spec operations | 168 (no duplicate operationIds) | grep + yaml probe, `spec/corrected/clockify.corrected.openapi.yaml` |
| `x-clockify-live-status` | 161 live-success / 6 probe-documented / 1 documented | same |
| x-fern-sdk-group-name stamps | 149 ops / 27 distinct groups (19 unstamped) | same |
| Path entries / methods / tags / schemas | 113 paths (49 GET, 52 POST, 29 PUT, 23 DELETE, 15 PATCH) / 31 tags / 405 component schemas | same |
| Per-op `servers` overrides | 11 (10 reports + 1 auditlog); host split api=157, reports=10, auditlog=1 | same |
| `page`+`page-size` on PAGINATED_LIST_OPS | 21/21 (inline or via `pageQuery`/`PageQuery`/`pageSizeQuery`/`PageSizeHyphen` refs) | generator `../GOCLMCP/scripts/gen-clockify-openapi:905-929` vs spec |
| `x-clockify-last-page-header` | 18 | spec grep (matches AGENTS.md claim) |
| MCP tools | 162 = 22 workflow + 140 domain (21 domain groups) | `docs/mcp-tools.json`, `mcp/tests/server.test.ts:290` |
| CLI commands | 66 | `docs/cli-commands.json` |
| SDK public names / subpaths | 93 root symbols / 28 subpaths (27 named + root) | `docs/sdk-public-api.json`, `wrapper/scripts/verify-dual-build.sh:18` |
| SDK resource modules | 29 (31 dirs incl. `index.ts` + `balanceAssignment`) | `output/ts-sdk/api/resources` |
| Live-evidence manifest rows | 168 (all ops covered); statuses 134 live-success / 19 probe-documented / 15 documented | `spec/evidence/live-evidence-manifest.json` |
| GOCLMCP PHANTOM_PATHS / SDK_METHOD_NAMES | 35 entries / 172 entries (149 match shipped spec, 23 stale) | `../GOCLMCP/scripts/gen-clockify-openapi:471,1103` |
| Ledger entries / anchor inventory | 79 slugs in `discrepancies.md` vs 78 in `docs/operation-evidence-anchor-inventory.json` | grep + python |
| Broken relative markdown links | 1 (docs/README.md → `./api/index.html`, intentional — gitignored TypeDoc output, documented exception) | link checker script |

Verified-consistent claims (no finding): 168 ops / 161 live-success headline in AGENTS.md:705, CLAUDE.md:221, wrapper/README.md:12, spec-confidence.md (161/6/1, generated); 149 explicit + 19 derived in operation-parity.json; 162/22/140 everywhere generated; 66 CLI commands; 93 names/28 subpaths in CLAUDE.md:31; 29 resource modules in README:17,146; 27 roadmap receipts; 15 risk entries; 52 unique claims (27+15+6+4); 8 GitHub workflows; Node >=22.13.0 engines + `^1` SDK peer ranges + bins (`clockify115`, `clk115`, `clockify115-mcp`); Go MCP 156 tools (GOCLMCP tool-catalog); `CLOCKIFY_WEBHOOK_EVENT_NAMES` length 50 (verify-dual-build.sh); package-lock workspaces/versions 1.0.1/1.0.1/1.0.1; release-please manifest/config retained-and-retired per `docs/gotchas/release-ci-handoff.md`.

---

## 2) Inventory observations

- `docs/` holds 242 files (126 markdown, 116 JSON). The task brief said "198 entries"; the tree has grown since that count was written.
- The docs system is "doc-as-contract": most prose counts are gate-enforced by `make docs-counts` (denylist + derived-claim layers, `scripts/check-docs-counts.mjs`). Findings D-01/D-02/D-13 show the enforcement has blind spots.
- `spec/` holds: corrected snapshot (24,339 lines), official snapshot (27,545 lines), the 3,731-line discrepancy ledger, 4 fixtures, 3 cassettes, 2 fern-issues drafts, 2 fern configs, live-evidence manifest (1,741 lines) + campaign receipt + probes README. No raw probes are committed (gitignored, per `.gitignore:11-13`).
- `spec/corrected/clockify.corrected.openapi.yaml` and `../GOCLMCP/docs/openapi/clockify-openapi.yaml` are byte-identical (both sha256 `abebc826...`); the local snapshot is a true copy of GOCLMCP HEAD `7d26f48` — but NOT of the commit the source lock attests (see S-01).
- The ledger is actively maintained (entries through 2026-08-06), but it is a historical log: in-file line references and interim count claims rot (S-04, S-10, S-07).
- Release-please config/manifest are retained but retired (documented 2026-07-27); `make version-consistency` reconciles them. No issue found there.

---

## 3) Findings table

| ID | Category | Severity | Confidence | One-line claim |
|---|---|---|---|---|
| S-01 | evidence/provenance chain | high | high | Source lock + live-evidence manifest attest GOCLMCP `1dc0392` (736,890 B), but the shipped snapshot is 764,551 B from later commits `ea7eb23`+`d15ce1e`; H01-LOCK was not re-approved |
| D-01 | stale doc / count | medium | high | AGENTS.md says build:smoke verifies "92 names"; the real pinned count is 93 |
| D-02 | stale doc + gate gap | medium | high | `docs/gotchas/spec-live-api-reality.md:66` says live-success "135/163"; current is 161/168, and `docs-counts` cannot catch it |
| D-03 | stale doc / counts | medium | high | ADR 0006 "current baseline" claims 163 ops (149+14) and api=152; actual 168 (149+19), api=157 |
| D-04 | contradictory docs | medium | high | ADR 0006 addenda tool-count sequence is self-contradictory (144→162→147→162); contradicts mcp-backlog.md |
| D-05 | version/metadata drift | medium | high | `docs/release-decision.md:27-28` calls 0.15.1/0.5.1/0.8.1 "current"; packages are 1.0.1, and the prose contradicts its own registry receipt |
| S-02 | evidence-ledger gap | medium | high | Manifest attests 134/168 live-success while spec+headline claim 161/168 (31 row mismatches), unexplained |
| S-03 | spec defect (annotations) | medium | high | `x-clockify-security-aliases` disagrees with `securitySchemes.AddonTokenAuth` header (X-Addon-Key vs X-Addon-Token) and with itself |
| S-04 | ledger claim vs spec | medium | high | Ledger claims "never combines nullable with $ref (41 uses)"; spec has 42 nullable, 3 combined with $ref |
| S-05 | spec metadata | low | high | `info.version: 2026-05-12` is a hardcoded constant; content regenerated through 2026-08-05 |
| S-06 | generator data staleness | low | high | GOCLMCP `SDK_METHOD_NAMES` has 23 entries for [method,path] pairs absent from the shipped spec |
| S-07 | stale doc / count | low | medium | AGENTS.md "33 quarantined" phantom paths; PHANTOM_PATHS now has 35 |
| D-06 | stale doc / count | low | high | `docs/agent-tasks/add-mcp-tool.md:30` says "22 workflow + 124 domain"; actual 22+140 |
| D-07 | stale doc / version | low | high | `docs/one-point-zero-surface-inventory.md` says "all 1.0.0"; packages are 1.0.1 |
| D-08 | stale doc / count | low | medium | `generator-comparison.md` says "the spec is now 184 operations"; it is 168 |
| D-09 | stale doc / path | low | medium | `probes/README.md` says files are "git-ignored as part of `fern/`" (old repo name) |
| D-10 | stale doc / count | low | high | `docs/README.md` says "Generated (14 rows)… Hand-maintained (91 rows)"; table has 112 rows, 92 "edit intentionally" |
| D-11 | evidence gap | low | medium | Anchor inventory has 78 entries; ledger has 79 (`errors.400-not-found…` missing) despite "complete" claim |
| D-12 | gate denylist stale | low | medium | `docs-counts-contract.json` forbids "93 public names" although 93 is now the current count |
| S-08 | spec cosmetic | low | low | operationId `createApprrovalRequest_1` carries upstream typo + `_1` suffix |
| S-10 | ledger count inconsistency | medium | low | Ledger (2026-08-05) cites "156/168 live-success headline"; neither spec (161) nor manifest (134) supports it |

---

## 4) Detailed findings

### S-01 — Source lock and live-evidence manifest attest the wrong upstream commit (HIGH, verified)

- **Claim:** `docs/openapi-source-lock.json` binds the corrected snapshot to GOCLMCP commit `1dc0392c6a36fe5f636848d7ea0ef5c62bb83c84`, `sourceSha256: aa59a0766bd9043bf634f9cfe09b01c8fb7e86871900b2c26409490de67e9f70`, `sourceBytes: 736890`, `approvedAt: 2026-08-04T02:59:40Z`. `spec/evidence/live-evidence-manifest.json` agrees: `canonicalCommit: 1dc0392…`, `canonicalOpenApiSha256: aa59a076…`.
- **Actual:** `shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml` = `abebc8260c9366769298ee6c8fb609b76b1ea80a9b4924dca8b2330def67a2d0`, size 764,551 — identical to the GOCLMCP canonical at GOCLMCP HEAD `7d26f48`, which contains commits `ea7eb23 fix(openapi): quarantine 2 phantoms, ingest 7 official-spec operations` and `d15ce1e feat(openapi): promote 5 operations to live-success` on top of the locked `1dc0392`.
- **Why gates pass:** `scripts/check-live-evidence-manifest.mjs` (`validateLiveEvidenceManifest`, lines 276-288) compares `manifest.canonicalCommit`↔`sourceLock.commit` and `manifest.canonicalOpenApiSha256`↔`sourceLock.sourceSha256` only — never against the shipped spec bytes. `docs/live-evidence-currentness.json` (baseCommit `fa1673cb…`, verifiedAt 2026-08-06T01:27:57Z) records the *new* spec hash in `inputHashes` (recorded after the change), so it matches the tree.
- **Impact:** The immutable-source-lock guarantee ("what commit is our snapshot derived from is an answerable, checkable question", `docs/openapi-source-lock-policy.md`) is violated for the current tree: the lock answers `1dc0392`, the tree is from `ea7eb23`+`d15ce1e`. The H01-LOCK human approval procedure was not re-run after the 2026-08-05 seven-op ingestion, although the ledger itself requires it for spec changes (`holidays.update.replace-and-scope-filter`, 2026-08-04 re-verify: "Correcting the canonical schema still requires the separately governed upstream-change, commit, and source-lock approval workflow"). A network verifier (`make openapi-source-lock`) would still pass because the lock is self-consistent against GitHub.
- **Verification:** `shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml` vs `python3 -c` read of both JSON files; `cd ../GOCLMCP && git log --oneline -3 -- docs/openapi/clockify-openapi.yaml`.
- **Remediation:** Re-run H01-LOCK: approve a lock for `7d26f48` (or the specific commit whose bytes the snapshot copies), regenerate the live-evidence manifest at that commit, and/or make `validateLiveEvidenceManifest` compare `canonicalOpenApiSha256` against the actual snapshot bytes.
- **Contradictory evidence:** none found. The manifest, lock, and approval receipt (`docs/live-evidence-approval.json`, approved 2026-08-06T01:27:56Z for manifest `cf854141…`) are mutually consistent — consistently stale relative to the shipped bytes.

### S-02 — Two authoritative live-success sources disagree by 27 ops (MEDIUM, verified)

- **Claim (manifest schema, `docs/live-evidence-manifest.schema.json:5`):** the manifest "Replaces headline live-success counts derived by counting x-clockify-live-status markers in YAML with one sanitized row per canonical operation."
- **Actual:** manifest row statuses: 134 live-success / 19 probe-documented / 15 documented. The corrected spec + the docs-counts-derived headline: 161 live-success / 6 probe-documented / 1 documented. 31 rows disagree with the spec stamp; 27 spec-live-success ops are not attested live-success (e.g. `uploadImage`, `submitApprovalRequest`, `submitApprovalRequestForUser`, `updateApprovalRequest`, `searchAuditLogs`, `updateWorkspaceCostRate`, `downloadExpenseReceipt`, `updateInvoiceSettings`, `duplicateInvoice`, `addInvoiceItem`, `importInvoiceItems`, `addInvoicePayment`, `changeInvoiceStatus`, `createProjectFromTemplate`, `publishAssignments`, `updateBalance`, `changeTimeOffRequestStatus`, `updateUserStatus`, `updateUserCostRate`, `updateUserHourlyRate`, `giveUserManagerRole`, `removeUserManagerRole`, `patchWorkspacesWorkspaceIdWebhooksWebhookIdToken`, …).
- **Impact:** The "evidence-gated 161/168" headline (AGENTS.md:705) is not backed by the chain-of-custody manifest; a consumer trusting the manifest concludes the headline is overstated, and vice versa. No doc explains the split (sweep promotions are recorded in the ledger, but nothing ties the 134-attested count to the 161-stamped count).
- **Verification:** python probe comparing `x-clockify-live-status` per op vs manifest `status` per op.
- **Remediation:** Document the intended semantics (campaign attestation vs sweep promotion) in the manifest schema/currentness contract, or re-run the campaign so the manifest attests the current stamps.
- **Contradictory evidence:** the ledger's `live-evidence-currentness…` entry records the campaign result as "168 rows, live-success 129 → 134", consistent with the manifest but not with the 161 stamps.

### D-01 — AGENTS.md "92 names" is stale; the pinned surface is 93 (MEDIUM, verified)

- **Claim:** AGENTS.md:326 — "`npm run build:smoke` (verifies ESM + CJS expose 92 names + 28 subpaths; wired into prepublishOnly)".
- **Actual:** `wrapper/scripts/verify-dual-build.sh:18` `EXPECTED_ROOT_SURFACE_COUNT=93`; the SURFACE CSV contains 93 names (counted); `docs/sdk-public-api.json` `rootSymbols` = 93; CLAUDE.md:31 says "93 SDK public names across 28 subpaths". Subpaths are 28 including root (27 named) — that half of the claim is right.
- **Impact:** Misleads contributors about the public-surface gate; the two canonical agent docs disagree with each other.
- **Verification:** `grep -n EXPECTED_ROOT_SURFACE_COUNT wrapper/scripts/verify-dual-build.sh`; python count of the SURFACE CSV.
- **Remediation:** s/92 names/93 names/ in AGENTS.md:326 (and note AGENTS.md §6's "27 named subpaths" phrasing is fine).

### D-02 — Gotcha doc carries stale live-success headline that the counts gate cannot catch (MEDIUM, verified)

- **Claim:** `docs/gotchas/spec-live-api-reality.md:66` — "`x-clockify-live-status: live-success` count is evidence-gated: **135/163**, each op promoted only by a real sandbox probe…".
- **Actual:** current spec = 161/168 (grep count + CLAUDE.md:221, AGENTS.md:705, spec-confidence.md).
- **Why the gate misses it:** `docs/docs-counts-contract.json` puts `docs/gotchas/spec-live-api-reality.md` in `proseDocs` (layer 2, denylist only) and `mustAppearIn` is only `["AGENTS.md","CLAUDE.md"]` (layer 3). The denylist contains `"135 live-verified"` but not `"135/163"`, so the stale string survives `make docs-counts`.
- **Impact:** The most operationally-read gotcha doc states a headline that is 26 ops and 5 denominator points out of date; the enforcement system that exists for exactly this failure mode has a hole.
- **Verification:** `grep -n 135/163 docs/gotchas/spec-live-api-reality.md`; inspect `docs/docs-counts-contract.json` `forbiddenStrings`/`mustAppearIn`; `scripts/check-docs-counts.mjs:108-158`.
- **Remediation:** Update the number and add `"135/163"` to `forbiddenStrings` (or widen `mustAppearIn`).

### D-03 — ADR 0006 "current baseline" is stale (MEDIUM, verified)

- **Claim:** `docs/decisions/0006-mcp-tool-surface-scope.md` — "The current canonical baseline is 163 corrected OpenAPI operations: 149 explicitly named SDK methods and 14 operationId-derived methods… the current service derivation is api=152, reports=10, audit=1." Also: "For the 14 operations without explicit SDK stamps… The governed set is `uploadImage`, `getCurrentUser`, `addLimitedUsersWithInfo`, `generateDetailedReportV1`, `changeRecurringPeriod`, `changeTimeOffRequestStatus`, `deleteMany`, `filterWorkspaceUsers`, `updateUserStatus`, `updateUserCostRate`, `updateUserCustomFieldValue`, `updateUserHourlyRate`, `findUserTeamManagers`, and `getWebhookEventStatusesWithLatestLog`."
- **Actual:** 168 ops, 149 explicit + **19** derived (`docs/operation-parity.json` summary; spec stamp count; `docs/sdk-operation-naming-classifications.json` has 19 classifications matching the 19 unstamped spec ops). Host derivation: api=**157**, reports=10, audit=1 (spec `x-clockify-host` counts). The governed set now also includes `getMultipleTimeEntries`, `createBalanceAssignment`, `getBalanceAssignmentsForUserAndPolicy`, `updateBalanceAssignment`, `deleteBalanceAssignment`.
- **Impact:** A decision record that explicitly labels its own top section "current" contradicts the generated surfaces it names as authority.
- **Verification:** python probes on spec + both JSON inventories.
- **Remediation:** Update the "Current baseline and supersession" paragraph to 168/149/19 and api=157, and extend the governed set list to 19.

### D-04 — ADR 0006 addenda tool-count sequence is self-contradictory (MEDIUM, verified)

- **Claim sequence in `docs/decisions/0006-mcp-tool-surface-scope.md` addenda:** base 140 → Task 22: 141 → Task 23: 142 → Task 24: 143 → Task 25: 144 → **Task 26: "162 tools (22 workflow + 140 domain)"** → **Task 27: "147 tools (22 workflow + 125 domain)"** → 2026-08-04 addendum: "**162 tools (22 workflow + 140 domain)**" after *removing* `clockify_invoices_export`.
- **Actual:** `docs/mcp-backlog.md` records the consistent sequence 144 → 146 (Task 26, two memberships tools) → 147 (Task 27) → 153 (7 new-op tools − invoices_export) → 162 (final 9-tool tranche, 2026-08-05). Current truth: 162 = 22 + 140 (`docs/mcp-tools.json`, `mcp/tests/server.test.ts:290`).
- **Impact:** Two addenda (Task 26's "162" and the 08-04 "162") are arithmetically impossible within their own sequence (144+2≠162; 147−1≠162) and contradict the backlog roadmap; a reader cannot reconstruct the surface history.
- **Verification:** read both docs' addenda vs the mcp-backlog tail; count check 144+2, 147−1.
- **Remediation:** Correct Task 26's number to 146 and the 2026-08-04 addendum to the true pre/post counts, or mark both as superseded by `docs/mcp-backlog.md`.

### D-05 — release-decision.md version claims are stale and self-contradictory (MEDIUM, verified)

- **Claim:** `docs/release-decision.md:27-28` — "The current source package versions are coordinated at SDK `0.15.1`, CLI `0.5.1`, and MCP `0.8.1`."
- **Actual:** all three packages are 1.0.1 (`wrapper|cli|mcp/package.json`, `.release-please-manifest.json`, README Status table, `docs/product-surface.json`); the 1.0.1 release commit `fa1673c` is in history. The prose also contradicts its own attachment `docs/release-decision-registry-receipt.json`, which records CLI `0.6.1` and MCP `0.9.1`. The decision posture (`defer_1x`, "No calendar reopening date") predates the 1.0.0/1.0.1 releases; AGENTS.md §11 says "current release decisions are in docs/release-decision.md".
- **Impact:** The doc designated as the current release-decision surface describes a pre-release state; anyone reading it for the current posture gets wrong versions and a wrong decision.
- **Verification:** `python3 -c` on package.jsons; `git log --oneline -3 -- docs/release-decision.md` (last touched at `5ea3202`, before `fa1673c`).
- **Remediation:** Refresh versions to 1.0.1 and update the decision posture to reflect the taken 1.0.1 release (or explicitly mark the doc historical and point to the changelogs).

### S-03 — `x-clockify-security-aliases` is internally inconsistent and contradicts the scheme definition (MEDIUM, verified)

- **Claim (annotations in spec):** per-op `x-clockify-security-aliases` records the header/scheme aliases for the operation's security.
- **Actual:** `components.securitySchemes.AddonTokenAuth.name = "X-Addon-Token"` (spec head). The aliases disagree: 60 ops → `AddonTokenAuth → headers: ["X-Addon-Key"]`; 5 ops → `["x-addon-token"]`; 2 ops → `["X-Addon-Key","X-Marketplace-Key"]`; 1 op → `["X-Marketplace-Key"]`; 9 ops → `headers: []`; 2 ops list only `ApiKeyAuth`. The official snapshot's scheme is `AddonKeyAuth`/`x-addon-token` — so the alias table matches neither the corrected scheme (X-Addon-Token) nor the official one (x-addon-token) on 60 of 79 ops.
- **Impact:** Annotation-only, but the spec description advertises these extensions as provenance ("Operation vendor extensions preserve provenance, host, live status, MCP mapping, risk, raw unit notes…"); a consumer or downstream generator using the aliases for header construction gets the wrong header name.
- **Verification:** python probe grouping `x-clockify-security-aliases` values; head of spec securitySchemes; `spec/official/…yaml` securitySchemes.
- **Remediation:** Regenerate aliases from the scheme definitions (GOCLMCP) or drop the header lists from the alias table.
- **Contradictory evidence:** none. (`AddonTokenAuth` header name is not live-probed in the ledger; `fern.sdk.auth.addonToken…` entry only confirms exclusivity semantics, not the header string.)

### S-04 — Ledger's "no nullable+$ref" claim is false of the current spec (MEDIUM, verified)

- **Claim:** `spec/evidence/discrepancies.md` (`expenses.list.expanded-category-and-project-dropped`, resolution note) — "This spec never combines `nullable` with `$ref` (41 `nullable` uses, all on plain types)".
- **Actual:** the spec has 42 `nullable: true` occurrences, and 3 combine `nullable` with `$ref`: `TimeEntry.properties.costRate` → `$ref OpenapiRateDto`, `TimeEntry.properties.hourlyRate` → `$ref OpenapiRateDto`, `WeeklyReportResponse.properties.totals.items` → `$ref TimeEntryReportTotals`.
- **Impact:** The ledger is the evidence-of-record for schema-quality decisions; the statement is relied on by `schema-quality` reviewers and by the "house style" rationale cited in the same entry. Both the count (41→42) and the "never" claim are wrong.
- **Verification:** python walk of components; `grep -c "nullable: true"` = 42.
- **Remediation:** Correct the sentence or qualify it ("no *new* nullable+$ref since 2026-07-29…").
- **Contradictory evidence:** none; the claim may have been true at write time and the spec regenerated since (the 3 combos are in schemas not touched by the 08-05 ingestion), so this is a ledger-vs-spec drift either way.

### S-05 — `info.version` is a hardcoded stale date (LOW, verified)

- **Claim:** `spec/corrected/clockify.corrected.openapi.yaml` head: `version: '2026-05-12'`.
- **Actual:** `../GOCLMCP/scripts/gen-clockify-openapi:1659` hardcodes `"version" => "2026-05-12"`; the document was regenerated through 2026-08-05 (7-op ingestion, 5 promotions). The version implies a snapshot date that is ~3 months old.
- **Impact:** Downstream consumers that key on the OpenAPI `version` see a stale identifier; the field cannot distinguish snapshots.
- **Verification:** grep generator line 1659; compare with git log of the canonical.
- **Remediation:** Derive the version from the regen date or a generator constant that is bumped with each evidence change.

### S-06 — GOCLMCP `SDK_METHOD_NAMES` carries 23 dead entries (LOW, verified)

- **Claim (AGENTS.md §2.6):** `SDK_METHOD_NAMES` "pairs `x-fern-sdk-group-name` + `x-fern-sdk-method-name` on 149 ops".
- **Actual:** the generator map has 172 entries; 23 reference `[method,path]` pairs that are **absent from the shipped corrected spec** (quarantined phantoms): `/policies` ×6, `/time-off/requests/{requestId}` ×3, `/scheduling/assignments` ×3, `/scheduling/assignments/recurring/{id}` PUT, `/scheduling/assignments/users/totals` POST, `/projects/{id}/archive`, `/projects/{id}/{hourly,cost}-rate`, `/clients/{id}/archive`, `/user-groups/{id}` + `/user-groups/{id}/users`, `/webhooks/{id}/generateNewToken`, `/webhooks/{id}/logs`, `/workspaces/{workspaceId}` PUT. The 149 live entries exactly match the spec's 149 stamps.
- **Impact:** Zero runtime impact (stamping is keyed on method+path), but the map misleads maintainers (a `policies` module appears "stamped" in the generator while no such module ships), and the ledger shows the discipline of removing stale entries is applied selectively (`balances.listForUser` was removed; these 23 were not).
- **Verification:** python parse of the generator map vs spec path set.
- **Remediation:** Prune the 23 dead entries in GOCLMCP, or add a drift check that fails when map keys don't intersect the canonical path set.

### S-07 — AGENTS.md phantom-path count stale (LOW, medium confidence)

- **Claim:** AGENTS.md §2.6: "`PHANTOM_PATHS` + `phantom_path?` — 33 quarantined live-404/405 method+path pairs". Also AGENTS.md §3: "(canonical, 168 ops, **42 quarantined sources**)".
- **Actual:** `PHANTOM_PATHS` has 35 entries (33 at the 2026-08-01 Phase L sweep, +`["patch", "…/time-entries/invoiced/bulk"]` and +`["get", "…/webhooks/{webhookId}/logs"]` quarantined 2026-08-04/05, matching ledger entries). "42 quarantined sources" in §3 is not defined anywhere and could not be verified from this repo (unknown, likely a different unit — source fragments — but no corroborating count exists).
- **Impact:** Minor; the two counts (35 vs 33) are both AGENTS.md's own and drift without a gate.
- **Verification:** python count of `PHANTOM_PATHS` entries in `../GOCLMCP/scripts/gen-clockify-openapi:471`.
- **Remediation:** s/33/35/ in AGENTS.md; clarify or drop "42 quarantined sources".

### D-06 — add-mcp-tool packet split count stale (LOW, verified)

- **Claim:** `docs/agent-tasks/add-mcp-tool.md:30` — "mcp/src/server.ts — registration order; how the 22 workflow + **124 domain** split is built."
- **Actual:** 22 workflow + 140 domain (`docs/mcp-tools.json`, mcp-contract.json, server.test.ts:290).
- **Impact:** A task packet a weaker agent uses to add a tool states the wrong domain count (16 short).
- **Verification:** grep; count.
- **Remediation:** s/124/140/.

### D-07 — one-point-zero-surface-inventory version stale (LOW, verified)

- **Claim:** `docs/one-point-zero-surface-inventory.md` — "the coordinated 1.0 release has been taken: wrapper, CLI and MCP are all **1.0.0**".
- **Actual:** 1.0.1 (released at `fa1673c`; README, package.jsons, .release-please-manifest.json). The same file also pins registry rows at SDK 0.15.1 (lines 308-329) — those are historical rows, but the decision-posture sentence is present tense.
- **Remediation:** "all 1.0.x" or "1.0.1".

### D-08 — generator-comparison "now" count stale (LOW, medium confidence)

- **Claim:** `spec/evidence/generator-comparison.md` intro: "It has since migrated to the local generator…; the spec is now 184 operations / 31 tags with ~687 synced TS files."
- **Actual:** 168 operations / 31 tags; synced file count not recounted (would require `npm run sync`).
- **Impact:** Marked HISTORICAL, so low impact, but the "now" phrasing is factually wrong and contradicts the generated inventories it sits next to.
- **Remediation:** s/now 184/at the time 184/ or update to 168.

### D-09 — probes README stale repo path (LOW, medium confidence)

- **Claim:** `spec/evidence/probes/README.md`: "These files are git-ignored as part of `fern/`."
- **Actual:** the repo and directory are `clockify-ts-sdk/spec/evidence/probes/`; gitignore entries are `spec/evidence/probes/*.{json,hdr}` (`.gitignore:11-13`). The `fern/` name is the pre-rename workspace (see GOCLMCP comment "addons-me/fern/…" too).
- **Impact:** Cosmetic; a future reader may look for a `fern/` directory.
- **Remediation:** Update the path wording.

### D-10 — docs/README generated-surfaces row counts stale (LOW, verified)

- **Claim:** `docs/README.md`: "**Generated** (14 rows)… **Hand-maintained contracts** (91 rows)."
- **Actual:** the table has 112 rows: 92 marked "edit intentionally", 20 others (14 generated + `mcp-tool-manifest.json` "generated" + live-evidence record + source-derived fallback + …).
- **Impact:** The doc itself disclaims ("The heading is historical; treat `edit intentionally` as authoritative over it"), so impact is minimal, but the numbers are wrong on their face.
- **Remediation:** Refresh counts or drop them.

### D-11 — Anchor inventory lags the ledger by one entry (LOW, medium confidence)

- **Claim:** `docs/operation-evidence-anchor-inventory.json` purpose: "classifying every discrepancy-ledger anchor"; docs/README calls it "Complete reviewed classification of every discrepancy-ledger anchor".
- **Actual:** 78 anchors vs 79 ledger `### \`…\`` slugs; missing: `errors.400-not-found.regex-breadth-unprobed` (OPEN, added 2026-08-06 — the newest entry, likely pending review).
- **Impact:** The "complete" claim is off by one; the semantic-contract/parity gates that consume the inventory may be blind to the newest open entry.
- **Verification:** python set-diff of ledger slugs vs `evidenceId`s.
- **Remediation:** Add the entry to the inventory when reviewed.

### D-12 — docs-counts denylist contains a now-current count (LOW, medium confidence)

- **Claim:** `docs/docs-counts-contract.json` `forbiddenStrings` includes `"93 public names"`.
- **Actual:** the current count IS 93 (rootSymbols=93); CLAUDE.md:31 carries "93 SDK public names across 28 subpaths" — a different substring, so the gate passes while the denylist entry itself is stale (it was presumably added when 93 was wrong). This is the same class of brittleness that let D-02's "135/163" through.
- **Impact:** Demonstrates the denylist approach decays: stale entries stay forever, and near-miss strings (e.g. "135/163" vs "135 live-verified") escape.
- **Remediation:** Replace the denylist layer with the derived-claim layer for the live-success headline and the public-name count (which the contract already does for some counts).

### S-08 — operationId typo retained (LOW, low confidence on impact)

- **Claim:** corrected spec operationId `createApprrovalRequest_1` (POST `/workspaces/{workspaceId}/approval-requests/{approvalRequestId}`).
- **Actual:** the official snapshot (line 347) has `createApprrovalRequest` (same triple-r typo, no suffix). The `_1` suffix was added to disambiguate within the corrected spec (no duplicate operationIds allowed). The typo is inherited from upstream; the SDK method is curated to `submitWithType` so users never see it.
- **Impact:** Cosmetic; only visible in generated request-type names and docs tables (`docs/openapi-operations.md` row).
- **Remediation:** Optional; rename upstream in GOCLMCP.

### S-10 — Ledger cites a live-success headline that matches neither authority (MEDIUM, low confidence on interpretation)

- **Claim:** `spec/evidence/discrepancies.md` (approval-requests.balance-assignment entry, 2026-08-05): "None of the 7 are counted in the `156/168` live-success headline's numerator".
- **Actual:** the current spec headline is 161/168; the campaign manifest attests 134. 156 appears nowhere else; the ledger's own campaign entry records 129→134. The 134→156→161 progression is not documented anywhere.
- **Impact:** An in-ledger count that cannot be reconciled statically; suggests either promotions occurred between the entry and the final snapshot without a ledger record, or the "156" was a miscount.
- **Verification:** grep for 156/168 (only discrepancies.md:3676); spec count 161; manifest count 134.
- **Remediation:** Annotate the entry or leave as historical with a correction note.

---

## 5) Contradictions / unknowns

**Contradictions (documented above):**
- AGENTS.md "92 names" vs CLAUDE.md + verify-dual-build.sh "93" (D-01).
- Gotcha doc "135/163" vs spec/AGENTS/CLAUDE "161/168" (D-02).
- ADR 0006 "163 ops / 14 derived / api=152" vs operation-parity "168 / 19 / api=157" (D-03); ADR addenda 162-vs-147 sequence vs mcp-backlog (D-04).
- release-decision.md versions vs package.jsons and vs its own registry receipt (D-05).
- Manifest 134/168 vs spec 161/168 (S-02); ledger "156/168" vs both (S-10).
- Ledger "never nullable+$ref, 41 uses" vs spec 42 uses, 3 on $refs (S-04).
- Security-alias header names vs securitySchemes and official spec (S-03).
- Source lock/commit vs shipped bytes (S-01).
- "33 quarantined" vs 35 PHANTOM_PATHS entries; "42 quarantined sources" undefined (S-07).

**Observed facts vs inferred responsibilities:**
- Observed: all 161 live-success stamps exist in the spec; the manifest attests 134. Inferred (not documented): the 27-op delta is due to ledger-documented sweeps (2026-07-28/2026-08-01) whose evidence lives in GOCLMCP findings files, never re-run by the campaign. This inference is the weakest link in S-02.
- Observed: `x-clockify-notes` on `uploadImage` reference live probes dated 2026-08-04/05. Inferred: those probes are the sweep evidence for its live-success stamp.

**Unknowns needing execution:**
- Whether `make docs-counts`, `make check-live-evidence-currentness`, `make openapi-source-lock` (networked), and `make contract-gates` currently pass or fail on this tree (not run — four parallel auditors; would produce false reds). S-01/S-02 may already red `contract-gates`; the ledger's own 2026-08-05 entry says the currentness gate failed at that time and was "closed" only by committing + re-running the campaign.
- The meaning of "42 quarantined sources" (AGENTS.md §3) — no definition found in this repo.
- The synced TS file count (~687, generator-comparison.md) — needs `npm run sync` to recount.
- Whether the 23 dead `SDK_METHOD_NAMES` entries are deliberate retention (the ledger documents selective pruning, suggesting not).
- Whether GOCLMCP `status_bucket`/`choose_live_status` regeneration after `7d26f48` changed any stamp counts (the ledger says the 08-05 fix produced a byte-identical contract in GOCLMCP; unverified here).
- `docs/operation-parity.json` `curated: 42` — not independently recomputed (would need the parity generator).

---

## 6) Verification queue (for the stronger model; read-only unless noted)

1. Confirm S-01 end-to-end: `make check-live-evidence-currentness` (or run `node scripts/check-live-evidence-currentness.mjs` if it accepts a no-network mode) and `node scripts/check-live-evidence-manifest.mjs` — expect both to pass despite the lock/spec mismatch; then run the networked `make openapi-source-lock` (network allowed for that auditor) to show it also passes.
2. Confirm D-02's gate gap: run `node scripts/check-docs-counts.mjs` and verify it exits 0 despite `135/163` in spec-live-api-reality.md; then temporarily append `135/163` to `forbiddenStrings` in a scratch copy of the contract and confirm it reds (proving the denylist mechanism works and the string is simply absent).
3. Verify D-05's "current decision" framing against `docs/roadmap-1.0.md`'s pointer ("Current release and maintenance decisions live in docs/release-decision.md") and the 1.0.1 changelog entries; decide whether the doc should be marked historical.
4. Recount `docs/README.md` generated-surfaces table rows (112) and reconcile with the "14 rows / 91 rows" prose.
5. In GOCLMCP: confirm `PHANTOM_PATHS` = 35 and enumerate the 23 dead `SDK_METHOD_NAMES` keys (already enumerated here); check whether a gate exists that would catch them.
6. Check `docs/operation-evidence-semantic-contract.json`'s expected anchors against the 78-anchor inventory to see if the missing `errors.400-not-found…` entry reds `make operation-parity` (needs build, so defer to a solo run).
7. Reconcile the 134 → 161 live-success delta by reading GOCLMCP `findings/*.md` promotion rows for the 27 ops listed in S-02.
8. Verify the 3 nullable+$ref combos (`TimeEntry.costRate`, `TimeEntry.hourlyRate`, `WeeklyReportResponse.totals.items`) against GOCLMCP sources to determine whether they are deliberate (nullable refs are legal OAS 3.0) — the defect is the ledger sentence, not necessarily the spec.

---

## 7) Final assessment

The repo's doc/gate machinery is unusually self-policing, and the majority of headline counts (168 ops, 161/168, 162 tools, 66 commands, 93/28, 29 modules, 21 paginated ops, 18 last-page headers) verify exactly against the generated surfaces. The failures cluster in **hand-maintained prose that the gates cannot see**: the gotcha doc's stale 135/163, AGENTS.md's 92-vs-93, ADR 0006's stale/contradictory baseline and addenda, and release-decision.md's pre-release versions. The single most serious issue is S-01: the immutable source-lock/evidence chain attests an upstream commit whose bytes are not the shipped snapshot, and the currentness gates structurally cannot detect it — a provenance-integrity gap in the very mechanism the repo advertises as its trust anchor. Second is S-02: the two authoritative "live-success" sources (spec stamps vs campaign manifest) disagree on 27 operations with no documented reconciliation. Neither requires code changes to fix, but both undermine the evidence story the docs tell. No critical runtime or security defect was found in this slice; the spec itself is internally consistent on pagination, servers, security schemes (aside from the annotation-only alias table), and operation counts.
