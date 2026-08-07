# 02 — ARCHITECTURE OBSERVATIONS

Actual control flow and dependency direction, with citations. Observations
are labeled; contradictions are recorded, not smoothed.

## The generation chain (top to bottom, observed)

```text
../GOCLMCP/scripts/gen-clockify-openapi   (canonical generator, Ruby)
  → ../GOCLMCP/docs/openapi/clockify-openapi.yaml   (canonical, 168 ops)
  → cp → spec/corrected/clockify.corrected.openapi.yaml   (frozen snapshot;
      byte-identical to canonical at GOCLMCP HEAD 7d26f48 — sha256 abebc826…)
  → scripts/sdk-codegen/generate-sdk-from-openapi.mjs   (repo-owned TS emitter)
  → output/ts-sdk/**   (gitignored; wiped on regen)
  → wrapper/scripts/sync-sdk.mjs   (atomic staged copy)
  → wrapper/src/**   (gitignored; wiped on sync)
  → wrapper/dist/{esm,cjs}/**   (twin tsc; finalize-cjs.sh writes
      dist/cjs/package.json {type: commonjs})
```

Key stamps the generator emits per operation: `x-fern-sdk-group-name` +
`x-fern-sdk-method-name` (149 ops), `OperationSpec.baseUrl` from per-op
`servers` (11 ops), `service: "regular"|"reports"|"audit"`,
`x-clockify-live-status`, `x-clockify-risk`,
`x-clockify-last-page-header` (18), `page`+`page-size` (21).

Contradiction: the source lock (`docs/openapi-source-lock.json`) and the
live-evidence manifest attest GOCLMCP commit `1dc0392` (736,890 B,
sha256 `aa59a076…`), but the shipped snapshot is 764,551 B (`abebc826…`)
from later commits `ea7eb23` + `d15ce1e`. The currentness gates compare
manifest↔lock only, never lock↔shipped bytes (S-01). The sync path is
therefore: locked provenance says X, tree bytes are Y, and all gates pass.

## SDK internal architecture (observed)

- `createClockifyClient` (`wrapper/create-client.ts`) enforces exactly-one
  auth via a discriminated union (`apiKey` XOR `addonToken`), reads env when
  both omitted, auto-wraps `fetch` with `composedFetch`, and takes a typed
  `routing` option (mutually exclusive with legacy `environment`/`baseUrl`;
  validated synchronously via `validateRoutingOptions`).
- Routing is two layers (`wrapper/internal/routing.ts` +
  `docs/service-routing-matrix.json`, kept in lockstep by
  `wrapper/tests/routing-matrix-equality.test.ts`):
  1. per-operation: `OperationSpec.baseUrl` (reports/auditlog hosts);
  2. client-level: region | subdomain | custom profiles.
  Dispatch precedence: `suppliedBaseUrl > suppliedEnvironment >
  serviceBaseUrl > operationBaseUrl > default`. Only `global` is
  live-confirmed; other regions require `acknowledgeUnconfirmedRegion: true`.
  `pto.api.clockify.me` is deliberately NOT allowlisted (H02-ROUTING).
- `composedFetch` (`wrapper/composed-fetch.ts`): User-Agent + X-Request-Id
  injection, lifecycle hooks, retry policy (Retry-After / X-RateLimit-Reset
  aware). RETRY-001: only GET/HEAD/OPTIONS auto-retry; POST/PATCH excluded
  permanently; PUT/DELETE opt-in via `retryMutationMethods`. When a
  `retryPolicy` is set, the factory passes `maxRetries: 0` to the generated
  client to avoid nested retry loops.
- Generated request runtime (`wrapper/src/core/request.ts`): validates base
  URL at the dispatch boundary (`validatedBaseUrl`), merges
  `requestOptions.queryParams` over typed query params, executes
  timeout+abort handling in `executeRequest`/`dispatchTemplate`.
- Pagination: `iterAll`/`iterPages` (`wrapper/iter.ts`) consume the
  Last-Page header on 18 endpoints via `withRawResponse`; `paginate`
  (`wrapper/pagination.ts`) is the callback iterator that delegates to
  `iterAll`-style walking but loses the header (W-13).
- `Workspace` scoped client (`wrapper/scoped-client.ts`): proxy that injects
  `workspaceId` into calls; request bodies are whitelist-filtered so the
  injection cannot corrupt bodies (verified). It exposes 29 resource getters;
  the generated client exposes 30 — `balanceAssignment` is missing from the
  scoped surface (W-02).
- `ensure.ts`: `findOrCreate` single-flight map keyed by caller-supplied
  `scopeKey` alone; two different names sharing a key coalesce onto the first
  entity (W-01, verified by repro). `Workspace`-level ensure calls are safe
  because they build a key that includes client-token + workspaceId + noun +
  name (`scoped-client.ts:179-207`).

## MCP internal architecture (observed)

- `buildServer()` (`mcp/src/server.ts`) registers tools via
  `defineTool`/`defineGuardedTool` (`mcp/src/result.ts`); guarded tools carry
  the exact-stored-preview `dry_run` → `confirm_token` handshake backed by
  `ConfirmationTokenStore` (`mcp/src/orchestration/confirmation.ts`): one
  canonical preview, five-minute TTL, one-use execution, scope-bound.
- Every tool has a governed risk class in `mcp/src/tool-risk.ts`; the
  registered set and the risk registry are byte-identical (162/162, verified
  by diff). Risk metadata is emitted as MCP annotations
  (`io.github.apet97.clockify115/risk`, `/confirmation`) plus
  `idempotentHint`/`readOnlyHint`/`destructiveHint`/`openWorldHint`.
- `clockify_setup_webhook` validates callback URLs through
  `mcp/src/orchestration/webhook-url.ts` (offline literal URL/host/IP guard;
  DNS rebinding documented as out of scope). Verified sound against Node URL
  canonicalization bypass spellings.
- SDK delegation: every tool calls `ctx.client.<group>.<method>` on the
  generated client; all 162 delegations were cross-checked against the
  generated method + body whitelists (slice B) — all consistent.
- Workflow tier (`mcp/src/tools/workflows/*`) composes domain tools
  (`stopWork`/`startWork` in `time-tracking.ts`); `switchWork` reads the
  envelope instead of `data` when detecting the stopped-timer outcome
  (M-01, verified by repro).

## CLI internal architecture (observed)

- Commander program built in `cli/src/index.ts`: 22 top-level groups, 9
  global flags, exit-code contract 0/1/2 enforced by
  `cli/tests/exit-contract.test.ts`. `--region`/`--subdomain` validate lazily
  at client build (exit 1) rather than parse-time (exit 2) and are silently
  ignored by client-less commands (C-3).
- `leafCommand` (`cli/src/commands/leaf-command.ts`) classifies every leaf
  into read/write/destructive; the classification is introspected by
  `scripts/check-cli-write-safety.mjs` against the built commander tree.
- Writes produce receipts (`cli/src/receipt.ts`) with
  `ok/action/entity/ids/…`; `printSuccess` in `output.ts` is dead code
  (C-7).
- Config precedence flags > env > rc; rc `apiKey` rejected as legacy secret.
- `clk115 api` raw passthrough (`cli/src/commands/api.ts`) covers any
  endpoint through the SDK client (universal fallback for all 168 ops).

## Cross-surface dependency direction (observed)

```text
spec/corrected/*.yaml ──► scripts/sdk-codegen ──► wrapper/src (generated)
wrapper (generated + hand-written) ◄── cli/src   (typed requests; zero casts)
wrapper ◄── mcp/src                              (typed requests; zero casts)
docs/*.json contracts ◄── scripts/check-*.mjs ◄── Makefile ◄── CI workflows
docs/*.json ◄── scripts/*.mjs generators (update-readme-tables, mcp-tool-manifest, …)
```

- CLI and MCP never construct requests by hand: they build the generated
  request unions and pass them to the generated client. The
  consumer-cast-budget gate (`make consumer-cast-budget`) enforces zero
  escape hatches via symbol-provenance dataflow over `cli/src` + `mcp/src`.
- One documented exception exists: `cli/src/commands/webhooks.ts:169-172`
  passes the `type` filter through an untyped `requestOptions` query seam with
  a comment claiming the generated request "does not own the filter" — the
  generated `ListWebhooksRequest.type` exists and would work (C-5).

## Gates and CI (observed)

- `contract-gates` = the CI-enforced readiness/docs-drift suite (a Make
  aggregate). `perfect-fast` = runtime/package proof; `perfect-full` adds
  heavy proof; `perfect-live` = credentialed sandbox proof; `release-proof`
  = coverage/compat/cast-budget. `verify.mjs` orchestrates the fast/full
  plans with a tracked-file mutation guard.
- CI (`ci.yml`) runs per-package lint/type-check/test/build + a hand-decomposed
  subset of `perfect-fast` members; it never runs `perfect-fast` itself,
  `performance-budgets`, `governance-audit`, or `verify.mjs` (W-2).
- Mutation is GitHub-only (`mutation.yml`, `workflow_dispatch`); the Makefile
  gates `make mutation` on `$GITHUB_ACTIONS=true`.
- ~80 of ~90 gates are marker-only contract checks (G-3): contract JSON
  declares marker strings; checker asserts they appear in declared evidence
  docs. A minority execute real proof (listed in slice C inventory).

## Contradictions and uncertainties (recorded)

1. S-01 — provenance lock attests a commit whose bytes are not shipped;
   gates cannot see it.
2. S-02 — manifest attests 134/168 live-success; spec stamps + headline say
   161/168; no documented reconciliation.
3. W-03 — two contradictory webhook payload models ship in one package
   (flat `event`-union vs `{webhookEvent, payloadType, payload}` envelope);
   both test suites green.
4. W-02/W-11 — resource counts: README 29 vs docs 30 vs generated client 30
   vs scoped client 29.
5. W-04 — README browser claim vs unguarded `process.versions.node`
   (`wrapper/src/core/index.ts:17`) and unconditional `node:crypto` /
   `node:os` / `Buffer` imports in the root barrel.
6. G-1 — `docs/cli-contract.json` `globalFlags` (7) omits the two flags added
   in 1.0.1 (`--region`, `--subdomain`).
7. W-1 — `docs.yml` tag trigger `v*.*.*` matches no tag the repo creates.
8. D-04 — ADR 0006 addenda tool-count sequence is arithmetically
   self-contradictory (144→162→147→162).
9. M-06 — 64/168 parity rows carry `tsMcp: null` with `overrideReason: null`
   (coverage decision not recorded where the gate reads it).
10. D-02 — the gotcha doc's stale "135/163" headline survives `docs-counts`
    (denylist gap).
