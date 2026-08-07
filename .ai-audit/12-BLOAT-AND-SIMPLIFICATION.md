# 12 — BLOAT AND SIMPLIFICATION

Candidate dead code, redundancy, and abstraction concerns. Every item
traces callers/exports/tests/docs before recommending deletion. No
deletion is recommended here without that trace; this file records the
candidates and their traced state.

## Dead code (traced)

| Candidate | Trace | ID |
|---|---|---|
| `composed-fetch.ts:601-605` post-loop `return lastResponse`/`throw lastError` + accumulators | Unreachable by control-flow analysis (every iteration returns/throws; final iteration takes the maxRetries branches). `composed-fetch.test.ts:1483` ("exhaustion with neither response nor error") appears to believe it reachable. Deleting requires updating those mutant-focused tests. | W-05 |
| `cli/src/output.ts:66-74` `printSuccess` | Zero production callers (grep: only definition + its test). README still documents the output shape it once produced (C-7). | C-7 |
| `verify-dual-build.sh:18,33,56` `EXPECTED_ROOT_SURFACE_COUNT=93` env var | Never read by the node one-liners it is passed to (the exact-surface check computes expected/actual itself). | W-10 |
| `src/core/base64.ts`, `src/core/file/`, `src/core/form-data-utils/`, `src/core/runtime/` | Zero importers in `src/`; not re-exported by `core/index.ts`; still emitted to `dist/` and present in `.packsnapshot` (pack gate blesses them). ~1 kB dead bytes in the tarball. Fix in `scripts/sdk-codegen/emitter.mjs` or `sync-sdk.mjs`, then update `.packsnapshot`. | W-09 |
| 23 dead `SDK_METHOD_NAMES` entries in GOCLMCP | Method+path pairs absent from the shipped spec (quarantined phantoms); zero runtime impact; misleads maintainers. Prune in GOCLMCP or add a drift check. | S-06 |

## Redundant wrappers / pass-through layers (traced)

| Candidate | Trace | Verdict |
|---|---|---|
| `core/auth/index.ts` re-export shim (`NoOpAuthProvider` re-exported from `../index.js`) | Generated; part of W-09 family (cycle-shaped re-export). | Candidate, low value |
| `wrapper/pagination.ts` `paginate` | Public governed subpath with own tests and docs; the Last-Page doc overclaim (W-13) is doc-only, the delegation itself is the only possible implementation for the callback shape. | Keep; fix doc |
| `wrapper/webhook-url.ts` (not a subpath; reachable via `./webhooks`) | Used by MCP (imports `webhook-url` from wrapper) and CLI? (slice A: reachable only via `./webhooks`); SSRF guard verified sound. | Keep; subpath governance asymmetry is cosmetic |

## Premature abstractions / duplicated utilities (traced)

| Candidate | Trace | ID |
|---|---|---|
| Two 51-event webhook registries in MCP (`workflows/business.ts:30-82`, `tools/webhooks.ts:64-116`) | Sets identical today; only one has an exhaustiveness guard. Derive one from the other or add the guard to both. | M-05 |
| Inline `z.enum(["WEEKLY","SEMI_MONTHLY","MONTHLY"])` in `approvals_resubmit` vs shared `APPROVAL_PERIODS` | Four sibling tools use the constant; the fifth inlines it. | M-12 |
| `docs/cli-commands.json` hand-maintained 66-row table | Consumed by README generation; nothing compares descriptions/args to the commander tree. Not dead, but single-source-of-truth is missing (generator would remove the drift class). | G-4 |
| AGENTS.md + CLAUDE.md dual contracts | Both large, overlapping, disagree on "92 vs 93 names" (D-01). One canonical file + cross-reference would remove a contradiction class. | D-01 |
| `x-clockify-mcp-tools` extension (empty on all 168 ops) | Advertised as provenance; carries no data. Either populate or drop. | S-09 |

## Obsolete compatibility code (traced)

| Candidate | Trace | Verdict |
|---|---|---|
| `spec/fern/` configs + `spec/evidence/fern-issues/` | Retained deliberately as migration evidence (ADR 0005; AGENTS.md §8). | Keep, documented |
| `release-please-config.json` + `.release-please-manifest.json` | Retained-but-retired (2026-07-27 gotcha doc); `make version-consistency` reconciles. | Keep, documented |
| `environment`/`baseUrl` legacy client options | Real compatibility surface (mutually exclusive with `routing`); documented; consumers may rely on it. | Keep |
| `paginated-list.ts` (27th subpath) vs `pagination.ts` vs `iter.ts` | Three pagination surfaces with distinct contracts (low-level callback, header-aware iterators, legacy list wrapper); each has tests and docs. | Keep; overlap is documented in README |

## Oversized / fragmented modules (observed, no action recommended)

- `wrapper/src/core/request.ts` + `dispatchTemplate`/`executeRequest` —
  large but the dispatch boundary with focused tests; the repo's own
  generator-independence gate treats it as replaceable.
- `mcp/src/tools/workflows/business.ts` — large multi-tool module; risk
  registry and tests cover it.
- `spec/evidence/discrepancies.md` at 3,731 lines — a living ledger; the
  repo's anchor inventory machinery exists to keep it navigable (one anchor
  gap: D-11).

## Dependencies whose value is not demonstrated (observed)

- `github-slugger`, `markdown-it`, `qs` (root devDeps) — used by doc/gate
  scripts (update-readme-tables, docs-counts, secret hygiene?); not
  individually audited for value. `qs` is pinned via override for
  `typed-rest-client@2.3.1` (a Go-side/dev tool dependency).
- `@stryker-mutator/*` — used only by the GitHub Mutation workflow and the
  local `mutation-ci` wiring check; value demonstrated by the mutation-score
  gate.
- No runtime dependency bloat was found: SDK 0 runtime deps; CLI 2 (commander,
  picocolors); MCP 2 (@modelcontextprotocol/sdk, zod).

## Simplification candidates that would NOT preserve behavior (rejected)

- Merging the three pagination modules (contracts differ; public subpaths).
- Removing `paginate` in favor of `iterAll` (public API compatibility).
- Replacing the generated core with a hand-written one (contradicts the
  generator-independence design and AGENTS.md §2a ordering).
- Deleting `spec/fern/` (retained as evidence by explicit decision).

## Cross-cutting note

The dominant "bloat" class in this repo is not code but PROSE: stale counts
in hand-maintained docs that the marker-only gate family cannot see
(D-01…D-12, M-02, M-03, C-7, W-11). The smallest systemic remediation is
strengthening `docs-counts` (derived-claim layer over denylist) and adding
cross-checks for the specific stale strings (D-02, D-12), not deleting code.
