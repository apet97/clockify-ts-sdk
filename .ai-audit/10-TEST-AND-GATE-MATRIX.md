# 10 — TEST AND GATE MATRIX

What each verification surface genuinely proves. "Marker-only" means the
gate asserts contract-JSON marker strings appear in declared evidence docs
(G-3) — doc self-consistency, not behavior.

## Test suites (observed)

| Suite | Files | Genuinely proves |
|---|---|---|
| wrapper `tests/` | 56 runnable + 4 `.test-d.ts` + live-sandbox-support | Dual-build names (ESM+CJS), drift-source-literal equality vs generator (routing matrix, authenticated hosts, generated baseUrl), wire shapes via mock clockify, error decoding, iter/pagination incl. Last-Page fallback, ensure semantics (same-key-same-name only — W-01 gap), compose/bulk receipts, money/date properties, webhook URL guard (property tests), webhook events (flat model) AND fixtures (envelope model) — the two never cross-assert (W-03), axioms one-assertion-per-row |
| wrapper `tests/sandbox.test.ts` | env-gated live | 7 SDK flows on the sacrificial sandbox; skipped when creds wholly absent; fails closed on 403/404 vs 402 |
| cli `tests/` | 40 files | Exit-code contract, command inventory (22), leaf risk classification, mutation-leaves behavioral envelopes (30 of 35 — C-1 gap), wire-body migration (typed requests), numeric flags (no trailing-garbage cases — C-2 gap), config precedence, receipts, api raw command, sandbox live (12 flows; one vacuous assertion — C-6) |
| mcp `tests/` | 78 files | 162-tool manifest equality, risk totals, confirm-guard matrix (33 guarded tools × full sequence), SSRF guard incl. IPv6, confirmation store one-use/TTL/hash, cancellation, setup_required, agent-docs catalog, sandbox live (12 flows), operation-parity behavioral stamps; `tool-manifest.test.ts` skips `idempotentHint` (M-14) |
| `scripts/sdk-codegen` tests | `test:codegen` (node --test) | Generator fixture/golden behavior, safe-output, atomic sync |
| Type tests | wrapper `.test-d.ts` incl. `breaking-changes.test-d.ts` | Public-type compatibility (Task 6 fixture); run via `test:types`, excluded from default `npm test` (not run in this audit) |

## Make gates (observed; authority: `Makefile` + `scripts/verify.mjs` +
`scripts/lib/verify-plan.mjs`)

| Gate family | Examples | What it genuinely proves |
|---|---|---|
| contract-gates (CI-enforced aggregate) | ~90 leaf gates | Mix: real proof + marker-only doc checks (G-3). Real: cli-write-safety (commander introspection + vitest), ci-contract (YAML parse, SHA-pinned actions, no-publish-in-ci), release-dispatch-guard, performance-budgets (real spawns), version-consistency, tag-hygiene, sandbox-key-health, docs-counts (cross-source counts), openapi-lint, sdk-public-api, consumer-cast-budget (compiler dataflow), pack-snapshot-check |
| governance-audit | aggregate-gates, docs-counts, conformance-drift, enterprise-audit, contract-inventory, decision-records, test-matrix, maintenance-playbook | Mostly marker-only; "Scheduled" per Makefile help but NO schedule exists in any workflow (W-2) |
| release-proof | coverage, breaking-change review, cast budget, compat contract | Coverage floors (per-package), cast budget, compat evidence |
| perfect-fast | codegen + generator-comparison + package gates + pack + npm-audit + performance-budgets | Deterministic runtime/package proof; deliberately excludes contract-gates |
| perfect-full | contract-gates + GOCLMCP drift + codegen + package + packed-consumer + mutation-ci | The only aggregate that cannot pass while the contract suite is red |
| perfect-live | wrapper/cli/mcp/GOCLMCP live suites under `run-live-proof.mjs` | Sandbox-only credentialed proof with lock, fingerprint, cleanup, zero-leftover rescan |
| live-evidence-campaign | isolated campaign runner | 168-op evidence campaign; requires explicit human approval before import |
| mutation-ci | wiring check | Verifies the GitHub Mutation workflow wiring offline; never runs Stryker locally |

## Behavior-to-test mapping gaps (candidate)

1. **C-1** — 5 of 35 mutating CLI leaves (approvals submit-with-type ×2,
   balance-assignment create/update/delete) have no behavioral
   success/failure-envelope proof; `mutation-leaves.test.ts` pins 30 and the
   write-safety gate prints "35 mutation handlers behaviorally proved".
2. **W-01** — ensure single-flight collision (different names, same key)
   untested; only same-key-same-name coalescing covered.
3. **W-03** — the two webhook-model suites never cross-assert; a shape
   contradiction ships green.
4. **W-06** — unsound narrowing direction (base error → subclass) untested.
5. **M-01** — no-timer branch of `switchWork` untested (only stop-succeeded
   branch).
6. **M-04** — custom-date demo seed vs default cleanup window untested.
7. **M-13** — the 50-page scan cap has no test.
8. **M-14** — `idempotentHint` not asserted by the manifest gate.
9. **C-2** — trailing-garbage numeric flags untested (`1abc`).
10. **C-3** — `--region`/`--subdomain` exit-code class untested by
    exit-contract.
11. **C-4** — `cli/examples/*.sh` not covered by any gate (and one is broken).
12. **G-1** — `--region`/`--subdomain` not in the contract's `globalFlags`,
    so their removal passes every gate; exit-code evidence is a substring
    search.
13. **G-4** — `docs/cli-commands.json` descriptions/args never compared
    against the commander tree (only command-name counts are pinned).
14. **S-01** — no gate compares the source lock / manifest hash to the
    shipped spec bytes.
15. **D-02** — the docs-counts denylist misses "135/163" (stale gotcha
    survives).
16. **M-06** — nothing verifies that a `tsMcp: null` parity row is
    justified (`overrideReason` all null).
17. **W-2** — performance budgets + governance surface never run in CI.

## Weak assertions / tautologies (observed)

- C-6 — `cli/tests/sandbox.test.ts:469-472` audit-log shape predicate is
  vacuously true.
- W-10 — `EXPECTED_ROOT_SURFACE_COUNT=93` env var never read by the smoke
  script; dual-build test comment says 17 for an 18-entry array.
- G-1 — substring-based `toBe(2)` evidence in `check-cli-contract.mjs`.
- M-14 — manifest gate omits the one config-dependent annotation.
- W-3 — release workflows record `registry-smoke` failure but never fail
  the job on it.

## Excessive mocking (observed)

None found in the dominant pattern: the suites use a fake `fetch`/mock
Clockify server and assert wire-level request shapes (method, URL, query,
body) plus envelope shapes — the correct level for an SDK whose contract is
the wire. Live suites are genuinely live and env-gated.

## Flaky assumptions (observed)

- `performance-budgets` startup timings (cli-version ≤600ms,
  mcp-tools-list ≤1200ms) flake under CPU contention — documented in
  AGENTS.md; one reason parallel-heavy runs were avoided in this audit.
- MCP live flows depend on `userId` presence in `listInProgress` rows
  (unknown 3).
- `clockify_demo_seed`'s pinned 2026 dates become stale-by-design after
  2026-12-31 (M-04 family).

## Commands still to run (execution-gated; see `15-VERIFICATION-QUEUE.md`)

`npm test` ×3 workspaces, `npm run test:types`, `make contract-gates`,
`make perfect-fast` (solo, creds blanked), `make governance-audit`,
`make release-proof`, `make sdk-codegen-drift` / `-test`,
`make operation-parity` (regenerate), `make check-live-evidence-currentness`,
`npm run build` + `npm pack --dry-run` ×3, `make mutation-ci`, GitHub
Mutation workflow dispatch, `make openapi-source-lock` (network),
`make live-differential` / `perfect-live` (creds, sandbox only).
