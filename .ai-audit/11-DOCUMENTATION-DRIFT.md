# 11 — DOCUMENTATION DRIFT

Slice D findings (D-*), the MCP/CLI doc findings (M-02, M-03, M-08, C-4,
C-7), and SDK doc findings (W-11, W-13, W-08). All verified statically.

## Count/version drift in authoritative docs

| Doc | Claim | Actual | ID |
|---|---|---|---|
| `AGENTS.md:326` | build:smoke verifies "92 names" | 93 (SURFACE CSV, `verify-dual-build.sh:18`, `docs/sdk-public-api.json`) | D-01 |
| `docs/gotchas/spec-live-api-reality.md:66` | live-success "135/163" | 161/168; docs-counts denylist cannot catch it (only "135 live-verified" is forbidden) | D-02 |
| `docs/decisions/0006-mcp-tool-surface-scope.md` | "current baseline 163 ops: 149 + 14 derived; api=152" | 168 ops: 149 + 19 derived; api=157 | D-03 |
| `docs/decisions/0006…` addenda | tool-count sequence 144→162→147→162 | arithmetically impossible; `docs/mcp-backlog.md` records 144→146→147→153→162 | D-04 |
| `docs/release-decision.md:27-28` | "current versions SDK 0.15.1, CLI 0.5.1, MCP 0.8.1" | all 1.0.1; contradicts its own `release-decision-registry-receipt.json` (0.6.1/0.9.1) | D-05 |
| `docs/agent-tasks/add-mcp-tool.md:30` | "22 workflow + 124 domain" | 22 + 140 | D-06 |
| `docs/one-point-zero-surface-inventory.md` | "all 1.0.0" | 1.0.1 | D-07 |
| `spec/evidence/generator-comparison.md` | "the spec is now 184 operations" | 168 (marked HISTORICAL, but "now" is wrong) | D-08 |
| `spec/evidence/probes/README.md` | probes gitignored "as part of `fern/`" | repo is `clockify-ts-sdk`; gitignore is `spec/evidence/probes/*.{json,hdr}` | D-09 |
| `docs/README.md` | "Generated (14 rows)… Hand-maintained (91 rows)" | table has 112 rows; 92 marked "edit intentionally" | D-10 |
| `wrapper/README.md:11` | "29 resource modules" | 30 resources in code; `docs/resources/README.md` says 30 | W-11 |
| `AGENTS.md` §2.6 / §3 | "33 quarantined" phantom paths; "42 quarantined sources" | PHANTOM_PATHS = 35; "42" undefined anywhere | S-07 |
| `docs/docs-counts-contract.json` | forbids "93 public names" | 93 is now the current count (denylist self-stale) | D-12 |

## Evidence-chain drift (docs that describe the trust anchor)

- S-01 (high): `docs/openapi-source-lock.json` + live-evidence manifest
  attest GOCLMCP `1dc0392` (736,890 B, `aa59a076…`); shipped snapshot is
  764,551 B (`abebc826…`) from `ea7eb23`+`d15ce1e`. H01-LOCK not re-approved.
  `check-live-evidence-manifest.mjs` compares manifest↔lock only.
- S-02: manifest attests 134/168 live-success; spec + headline say 161/168.
- S-10: ledger cites "156/168" — matches neither authority.
- D-11: `operation-evidence-anchor-inventory.json` (78 anchors) lags the
  ledger (79); the newest entry is missing despite the "complete" claim.

## Stale MCP/CLI docs

- M-02: `mcp/README.md:38-39` one-click bundle links 0.8.0; package is
  1.0.1; 0.8.0 predates the 162-tool surface.
- M-03: `docs/mcp-tools.json:49` holidays row count 5, 4 names
  (`list_in_period` missing); README table generated verbatim from it.
- M-08: `clockify_sdk_snippet` promises "URL safety warnings" the dry-run
  envelope never carries.
- C-4: README "See `examples/` for runnable scripts" points at
  `cli/examples/daily-timesheet.sh` which cannot run (nonexistent `review`
  command, nonexistent `--date` flag); no gate covers `cli/examples/*.sh`.
- C-7: README "success-only commands emit `{ok:true,message}`" — nothing
  emits that shape.

## Doc/code contract mismatches (SDK)

- W-08: `iter.ts:41-42` documents pageSize "max 200"; no cap enforced.
- W-13: `pagination.ts:19-22` claims Last-Page honoring via `iterAll`; the
  `paginate` callback path never carries the header.
- W-04: README browser claim vs unguarded `process.versions.node` +
  `node:crypto`/`node:os`/`Buffer` imports.
- W-10: `dual-build.test.ts:8` "17-name baseline" for an 18-entry array.

## Ledger-vs-spec drift (spec/evidence/discrepancies.md)

- S-04: "never combines nullable with $ref (41 uses)" — spec has 42
  nullable, 3 combined with $ref (`TimeEntry.costRate`,
  `TimeEntry.hourlyRate`, `WeeklyReportResponse.totals.items`).
- S-05: `info.version: '2026-05-12'` hardcoded in the generator; content
  regenerated through 2026-08-05.
- S-03: `x-clockify-security-aliases` header names disagree with the
  `AddonTokenAuth` scheme definition (X-Addon-Key vs X-Addon-Token) and with
  the official spec (x-addon-token).
- S-06: 23 dead `SDK_METHOD_NAMES` entries in GOCLMCP for method+path pairs
  absent from the shipped spec.
- S-08: `createApprrovalRequest_1` upstream typo + `_1` suffix retained.
- S-09 (evidence-pack addition): `x-clockify-mcp-tools` empty on all 168 ops
  while the spec's vendor-extension description advertises MCP mapping
  provenance.

## Duplicated documentation (observed)

- AGENTS.md and CLAUDE.md overlap heavily (both carry the build chain, gate
  table, conventions); they disagree on the 92-vs-93 names claim (D-01) —
  one of the two must win or they must cross-check.
- The same live-success headline exists in AGENTS.md:705, CLAUDE.md:221,
  wrapper/README.md:12, spec-confidence.md, and the gotcha doc (D-02) — only
  the gotcha is stale.
- `docs/README.md` generated-surfaces table duplicates counts that also live
  in `docs-counts-contract.json` (D-10 family).

## Missing documentation (observed)

- `docs/operation-parity.json` does not record WHY an op is unexposed
  (`overrideReason: null` on all 64) — the coverage decision is missing
  where the gate reads it (M-06).
- No doc reconciles the 134-attested vs 161-stamped live-success split
  (S-02).
- The `mcp-v1.0.1` release has no tag in this clone and no README bundle
  link; release story incomplete (M-02, MCP-unknown 1).
