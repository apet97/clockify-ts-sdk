# 16 — HANDOFF

For the stronger model that audits and improves this repository. Evidence
first, then judgment. Nothing in this pack is truth until re-verified
against the live source.

## Reading order

1. `00-SNAPSHOT.md` — what was inspected, when, under what conditions, and
   what was NOT inspected (read the limitations section).
2. `04-CONTRACT-TRACEABILITY.csv` — the 168-operation surface map
   (generated mechanically from the spec + `docs/operation-parity.json`;
   the CLI/test columns are group-level evidence, not per-op proof).
3. `13-FINDINGS-LEDGER.csv` — every candidate finding with evidence,
   verification method, and contradictory evidence. 68 findings; every
   prose finding in files 05-12 has a ledger row (checked).
4. `02-ARCHITECTURE-OBSERVATIONS.md` — the dependency direction and the
   ten recorded contradictions.
5. `06-SDK-AUDIT.md`, `07-MCP-AUDIT.md`, `08-CLI-AUDIT.md` — per-surface
   detail, including the "verified sound" lists (do not re-audit those
   areas from scratch).
6. `09-TYPE-SAFETY-AUDIT.md`, `10-TEST-AND-GATE-MATRIX.md` — the unsafety
   map and what each gate genuinely proves (including the marker-only gate
   family, G-3).
7. `11-DOCUMENTATION-DRIFT.md`, `12-BLOAT-AND-SIMPLIFICATION.md` — the
   prose-drift inventory and the traced dead-code candidates.
8. `14-DISAGREEMENTS-AND-UNKNOWN.md`, `15-VERIFICATION-QUEUE.md` — the
   unresolved questions and the ordered queue.
9. The four raw subagent reports in `.ai-audit/raw/` for the full
   reasoning trails behind the ledger rows.

## Highest-risk areas (in order)

1. **Provenance chain (S-01)** — the source lock and live-evidence manifest
   attest GOCLMCP commit `1dc0392` (sha `aa59a076…`); the shipped snapshot
   is 764,551 B (`abebc826…`) from later commits, and every gate passes.
   This is the repo's advertised trust anchor answering the wrong commit.
   Fix options: re-approve H01-LOCK at the real commit, or make the
   currentness check compare against shipped bytes.
2. **Live-success authority (S-02/S-10)** — 134 (manifest) vs 156 (ledger)
   vs 161 (spec) with no documented reconciliation. Decide the authority
   and record it.
3. **Webhook contract (W-03)** — two contradictory typed models ship; a
   live probe must decide. This is consumer-facing API truth.
4. **`ensure.ts` single-flight (W-01)** — verified wrong-entity return for
   different names sharing a `scopeKey`; real impact depends on whether
   CLI/MCP call the public functions with shared keys (search them).
5. **`switchWork` misreport (M-01)** — verified; one-line fix, add the
   no-timer branch test.
6. **Mutation-proof gap (C-1)** — 5 of 35 mutating CLI leaves have no
   behavioral envelope proof while the gate claims all 35.
7. **CI coverage (WF-2)** — performance budgets and the governance surface
   never run in CI.
8. **`balanceAssignment` scoping (W-02)** — a 30th resource silently absent
   from the scoped client; counts disagree across three docs.

## Rules for working in this repo (from the contract; verify before trusting)

- `wrapper/src/**` and `spec/corrected/**` are wiped by sync/copy —
  generated-code fixes belong in `scripts/sdk-codegen/emitter.mjs` or
  `sync-sdk.mjs` (W-04, W-09), spec fixes in GOCLMCP.
- Never run Stryker locally; mutation is GitHub-only (the local
  `make mutation-ci` is just wiring).
- `make perfect-fast` must run solo and with creds blanked;
  performance-budgets flake under CPU contention.
- Do not run `perfect-live`/live campaigns except in the sacrificial
  sandbox with the governed launcher; never against a customer workspace.
- Releases fire from package-prefixed tags only; never push a tag that
  mismatches `package.json`.
- The ledger (`spec/evidence/discrepancies.md`) is the record of record
  for wire truth; use the five-question format when adding entries.
- The `docs/*.json` contracts are load-bearing for gates: if you change a
  surface, the contract and the checker change together (G-1 is the
  failure mode this creates when forgotten).

## Validate before changing anything

1. Re-verify every finding you act on by reading the cited lines — the
   pack is evidence, not verdicts.
2. Run Phase 2 items 11-14 of `15-VERIFICATION-QUEUE.md` first to
   establish a green baseline; a red baseline changes the interpretation
   of every finding.
3. For any fix, run the targeted test file first (red), apply the
   smallest remediation from the ledger, run it again (green), then run
   the package's full suite and type-check. Only then consider
   `perfect-fast`.
4. Where the ledger's verification method says "needs live probe", do not
   convert a hypothesis into a fix without the probe (W-03, S-03, W-08,
   M-04 family).
5. If a finding is falsified, annotate the ledger row (status →
   `falsified` + evidence) rather than deleting it — the pack's value is
   the trail.

## What the audit did NOT establish

- Whether `make contract-gates`/`perfect-fast`/`governance-audit` currently
  pass (no heavy gates were run; parallel-audit policy).
- The live wire shapes listed in `14-DISAGREEMENTS-AND-UNKNOWN.md` items
  1, 9, 16-18.
- Whether the `mcp-v1.0.1` tag exists remotely.
- Line-by-line reading of all 680 generated SDK files (systematic sampling
  + grep surveys; core read fully).
- The `wrapper/docs/api/**` TypeDoc tree (gitignored, absent).

## Finding-ID conventions

- W-01…W-14 wrapper (slice A); M-01…M-16 MCP (slice B); C-1…C-7 CLI
  (slice C); G-1…G-4 gates (slice C); WF-1…WF-4 workflows (slice C, renamed
  from W-1…W-4 to avoid collision); D-01…D-12 docs (slice D); S-01…S-10
  spec/evidence (slice D + S-09 orchestrator); TS-01 type-safety
  (orchestrator). Origins are in the ledger's `origin` column.
