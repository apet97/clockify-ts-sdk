# AGENTS.md

Canonical contributor + agent contract for `apet97/clockify-ts-sdk`.
Standalone repo — no parent project. The `addons-me/` prefix you
may see in some absolute paths is one contributor's local workspace
folder; it is not part of the contract.

The sister repository `apet97/go-clockify` (referred to as
**GOCLMCP**, its conventional local clone directory) owns the
canonical Clockify OpenAPI generator. The two are cloned as
siblings so `../GOCLMCP/...` resolves from this repo's root.
Adjust paths if your layout differs.

Read this whole file before touching anything. Every rule below
applies to humans and AI agents equally.

Working in Claude Code? Repo-local skills in `.claude/skills/`
(`clockify-sdk-verify`, `clockify-sdk-navigate`,
`clockify-sdk-add-mcp-tool`, `clockify-sdk-publish`) auto-activate and
distill the gate, navigation, MCP-tool, and release workflows below.
The do-this-exactly counterpart is the task packets in
[`docs/agent-tasks/README.md`](./docs/agent-tasks/README.md): skills
distill this contract, packets script one common change end to end.

## 0. Current hardening checkpoint

- Coordinated package truth: the SDK is `5.1.1`, the CLI is `5.0.3`, and the
  TypeScript MCP is `6.0.0`. `make version-consistency` reconciles all three
  package manifests with the retained `.release-please-manifest.json`
  (release-please itself is retired 2026-07-27 — see
  [`docs/gotchas/release-ci-handoff.md`](./docs/gotchas/release-ci-handoff.md)),
  the generated runtime
  constants, the CLI/MCP SDK peer ranges, and the MCP bundle manifest.
- `main` is the integration branch. For direct pushes, first verify a
  clean worktree and `HEAD...origin/main` is even, then make one focused
  commit, push, and watch the resulting GitHub Actions runs.
- Keep local proof laptop-safe — §4 states the `perfect-fast` discipline once,
  in full (**Run `perfect-fast` solo and with creds blanked**). Do not start
  local coverage or `perfect-full` while the machine is under load.
- Pre-push proof has three tiers: `make contract-gates` is the CI-enforced
  readiness/docs-drift suite, `make perfect-fast` is runtime/package proof,
  and `make perfect-full` runs `contract-gates` **and** adds heavy proof, so it
  is the one aggregate that cannot pass while the contract suite is red.
  `perfect-fast` deliberately does not — run `make -k contract-gates` yourself
  if that is all you ran. `make perfect-live` remains separate credentialed
  sandbox proof.
- **Mutation score proof is GitHub-only. Never run Stryker locally** — not
  `make mutation`, not `npm run mutation -w <pkg>`, not `npx stryker`. Measure
  with the manual **Mutation** workflow (`workflow_dispatch`, `target=all`,
  `wrapper`, `mcp`, or `cli`). `make mutation-ci` verifies that wiring offline
  and is the only mutation gate in `make perfect-full`. A local run is slow,
  saturates the machine, and overwrites the `reports/mutation/mutation.json`
  that `check-mutation-score.mjs` grades — a stale or partial local report
  produces a *wrong* score, not an absent one.
- **Dispatch Mutation after every substantive wave, not only before a release.**
  The weekly scheduled run (Mondays 05:00 UTC, `target=all`) bounds how long a
  regression can hide, but a wave should not wait for Monday.
  Between 2026-07-31 and 2026-08-05 the SSRF guard `wrapper/webhook-url.ts` lost
  ~9.5 points and gained 14 mutants with no test coverage at all, while every
  other gate stayed green.
- Adding a module to a Stryker `mutate` list is GitHub-gated: active mutate
  sources and `moduleFloors` must map one-to-one, so a source without a
  measured floor reds `mutation-ci` and CI. Dispatch the workflow, then commit
  the measured floor. Never guess one.
- Never hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`. API-truth changes start in `../GOCLMCP/`, then
  flow through this repo's generator/sync gates.

## 1. Identity & boundary

This is an independent, community-built project — **not affiliated with,
endorsed by, or sponsored by CAKE.com or Clockify** ("Clockify" is a CAKE.com
trademark, used nominatively; the `-115` / `115` suffixes are deliberate
trademark distance). See [`NOTICE.md`](./NOTICE.md).

This repo ships three sibling npm packages, each from its own
subdirectory:

- **`wrapper/`** → `clockify-sdk-ts-115` — the core TypeScript SDK,
  local-generator output + hand-written ergonomics. The original product.
  Local build artefact: `wrapper/dist/`.
- **`cli/`** → `@apet97/clockify-cli-115` — `clockify115` / `clk115` command-line
  interface on top of the SDK. **66 commands** across 22 top-level
  groups including `reports`, `shared-reports`, `users`, `doctor`, `completion`, the
  scriptable `api` raw command, and the workflow shortcuts (`start`, `stop`, `status`, `log`,
  `entries`, `projects`, `clients`, `tasks`, `tags`, `webhooks`,
  `invoices`, `expenses`, `timeoff`, `scheduling`, `audit-log`). The
  resource groups carry full CRUD (`list`/`create`/`get`/`update`/`delete`,
  with archive-then-delete for active projects/clients/tasks).
  Output controls: `--output table|json|ndjson`, `--compact`,
  `--select <dot-path>`. Local build artefact: `cli/dist/`.
- **`mcp/`** → `@apet97/clockify-mcp-115` — dual-era local stdio and
  authenticated stateless HTTP Model Context Protocol server, sibling to the
  Go MCP in GOCLMCP. **163 tools**: 23
  workflow/orientation tools plus 140 domain tools across 21 resource groups.
  Workflow tools cover daily time tracking, work-package setup,
  review/fix, invoices, expenses, time off, scheduling, webhooks,
  and demo seed/cleanup; read-only orientation tools
  (`clockify_docs_search`, `clockify_operation_guide`,
  `clockify_sdk_snippet`) help an agent pick the smallest correct
  surface. Domain tools provide broad CRUDL coverage including five report
  tools, which share one bounded Reports MCP App; the raw API fallback remains
  the Go MCP's niche. Local build artefact: `mcp/dist/`.
  MCP write-safety is part of this product contract: every tool has a
  governed runtime risk class in `mcp/src/tool-risk.ts`; business,
  external-side-effect, privileged, and destructive writes use the
  exact-stored-preview `dry_run` -> `confirm_token` registration path in
  `mcp/src/result.ts` and `mcp/src/orchestration/confirmation.ts`, while
  `clockify_setup_webhook` validates callback URLs through
  `mcp/src/orchestration/webhook-url.ts` before either preview or
  creation. That webhook guard is intentionally offline and covers
  literal URL/host/IP risks, not DNS rebinding.

### HEADER-001: request headers preserve caller values

`composedFetch` adds the SDK `User-Agent` and a UUID `X-Request-Id` only when
the caller did not supply those headers. A caller-provided value always wins.
Callers can disable either default with `userAgent: false` or
`requestId: false`, or supply a custom User-Agent or request-ID generator.

### PAGE-001: `Last-Page` controls pagination

`iterAll` and `iterPages` treat a parseable `Last-Page` response header as
authoritative. `true` stops the walk. `false` continues after a non-empty page,
even when the page is shorter than the requested size. If the header is absent
or invalid, the iterators use the page length. An empty page always stops the
walk. Callers can set `maxPages` to cap the walk, and the repeated-page guard
stops an exact non-empty page from looping forever.

### Service routing (SDK 0.13.0, ROUTE-002)

Host selection is **two layers**, and conflating them is the usual mistake:

1. **Per-operation.** The corrected OpenAPI carries a `servers` override and the
   generator emits `OperationSpec.baseUrl`, so reports reach
   `reports.api.clockify.me/v1` and audit-log reaches
   `auditlog-api.api.clockify.me/v1` without any caller configuration.
2. **Client-level.** A typed `routing` option on `createClockifyClient` selects
   a profile: a bare `ClockifyRegion` (`global | eu | us | uk | au |
   developer`), a `subdomain` profile (region + workspace subdomain, which
   changes only `reports` routing), or `custom` (an explicit per-`ClockifyService`
   URL map, requiring `allowCustomHttpsHosts: true`).

Dispatch precedence is `suppliedBaseUrl > suppliedEnvironment > serviceBaseUrl >
operationBaseUrl > default`. Because the service map is consulted *below* the
caller's own override but *above* the generated default, a `custom` profile that
names only `regular` never erases another operation's route.

`routing` is mutually exclusive with the legacy `environment`/`baseUrl`, and
`validateRoutingOptions` throws a `TypeError` synchronously at construction, so
plain-JS callers get the same defence as TypeScript ones.

`environment`/`baseUrl` predates `routing` and is not on the two-phase
deprecation track (CONTRIBUTING.md § Deprecating a public symbol) yet — no
`warnOnce` warns callers today. Revisit starting that track at the next SDK
major, once `routing`'s `custom` profile has had a full minor-version soak as
the documented replacement for every `environment`/`baseUrl` use case.

**Only `global` is live-confirmed.** Every other profile requires an explicit
`acknowledgeUnconfirmedRegion: true`. Do not remove that gate to make the API
nicer — `docs/service-routing-matrix.json` records that no regional or
subdomain sacrificial workspace exists to prove them against (2026-07-27).

`pto.api.clockify.me` is **not** allowlisted: H02-ROUTING confirmed it dead
(zero backing operations, zero official-doc mentions). Do not re-add it.

The routing tables live in two places on purpose. `wrapper/internal/routing.ts`
holds a hand-written copy of the approved `docs/service-routing-matrix.json`
rows — runtime code does not import that JSON — and
`wrapper/tests/routing-matrix-equality.test.ts` fails closed if the two drift,
mirroring how `authenticated-boundary-fetch.ts` keeps `CLOCKIFY_PROD_HOSTS` in
sync. Change both together.

CLI surfaces this as `--region`/`--subdomain`; both CLI and local MCP stdio also
read `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN`, and the CLI additionally accepts
rc-file `region`/`subdomain`. Precedence is flag > env > rc, mutually exclusive
with `--base-url`/`CLOCKIFY_BASE_URL`. Local MCP stdio is env-only. Remote MCP
loads each authenticated principal's encrypted credential, workspace, and
routing profile from PostgreSQL and fails startup if local Clockify credential
variables are present; it ignores local routing variables and never falls back
to a process-wide key.

### RETRY-001: retries are read-only by default

Both retry layers — the generated request runtime and `composedFetch`'s
`DEFAULT_RETRY_POLICY` — auto-retry only `GET`/`HEAD`/`OPTIONS`. A network
failure or retryable 5xx *after* a mutation is ambiguous: the server may already
have applied it, so replaying risks a duplicate write.

`PUT`/`DELETE` can opt back in via `retryMutationMethods: true` (client-level or
per-request) or, for `composedFetch`'s own layer, by adding them to
`retryPolicy.retryableMethods`. **`POST`/`PATCH` are excluded from both layers
and cannot be opted in.** This is a deliberate safety default, not an oversight
— do not "fix" it back to retrying mutations.

When `retryPolicy` is present, `createClockifyClient` passes `maxRetries: 0` to
the generated client, so generated retries are off by default. A policy object
uses the `composedFetch` retry layer. `retryPolicy: false` also disables that
wrapper layer. A positive per-request `maxRetries` overrides the client setting
and can re-enable generated retries, so do not combine it with `retryPolicy`.
If `retryPolicy` is absent, `maxRetries` controls the generated layer.

The `-115` / `115` suffix and the personal `@apet97` scope are
intentional trademark distance from Clockify. These are published to npm
as unofficial, community-built packages (not affiliated with CAKE.com or
Clockify); the `publishConfig` blocks + `prepublishOnly` scripts gate
every publish. MCP tool prefixes
(`clockify_status`, etc.) stay because they mirror the Clockify API
and are validated by `../GOCLMCP/` drift gates.

The three packages are wired as npm workspaces from a root
`package.json` (`workspaces: ["wrapper", "cli", "mcp"]`). A single
root `package-lock.json` covers all three; the per-package
lockfiles are gone. Each package keeps its own `package.json`,
`tsconfig.json`, build chain, and tests; you run them either via
`npm run <script> -w <package-name>` from the root or via
`cd <pkg> && npm run <script>` (the latter still works because the
workspace symlinks satisfy local resolutions).

If packed/published, the `wrapper/` package includes:
- `wrapper/dist/**` (built from `wrapper/src/**` via twin tsc)
- `wrapper/README.md`, `wrapper/LICENSE`, `wrapper/package.json`

If packed/published, the `cli/` package includes:
- `cli/dist/**` (built from `cli/src/**` via tsc)
- `cli/README.md`, `cli/LICENSE`, `cli/package.json`

If packed/published, the `mcp/` package includes:
- `mcp/dist/**` (built from `mcp/src/**` via tsc)
- `mcp/migrations/**` (checksum-verified PostgreSQL migrations for remote mode)
- `mcp/README.md`, `mcp/LICENSE`, `mcp/package.json`

Doesn't ship on npm (but lives here for reproducibility):
- `spec/` — corrected OpenAPI snapshot, historical Fern config, and evidence ledger
- `output/ts-sdk/` — local TypeScript generator output, **gitignored**;
  regenerable by running `make sdk-codegen`, which invokes
  `scripts/generate-sdk-from-openapi.mjs` against the corrected OpenAPI
  snapshot and then syncs `wrapper/src/**`.
- `wrapper/{src,dist,node_modules}/` — gitignored; recreated by the build chain
- `cli/{dist,node_modules}/` — gitignored
- `mcp/{dist,node_modules}/` — gitignored
- `node_modules/` (workspace root) — gitignored
- `.github/workflows/` — CI + release pipelines
- `spec/evidence/probes/*.{json,hdr}` — gitignored live API captures

The canonical Clockify OpenAPI is **NOT** in this repo. It's
generated by `scripts/gen-clockify-openapi` in `apet97/go-clockify`
(`../GOCLMCP/`) from a curated source bundle. The file at
`spec/corrected/clockify.corrected.openapi.yaml` is a snapshot,
refreshed by `cp` after every regen in GOCLMCP.

## 2. First reads (in order)

1. `README.md` (this repo) — workflow overview.
2. `wrapper/README.md` — the SDK package README.
3. `mcp/README.md` — the workflow-first MCP user surface.
4. `docs/product-north-star.md` — final-state quality bar for this
   repo as a polished SDK/CLI/MCP product, not just generated code.
5. `spec/evidence/discrepancies.md` — ledger of every divergence
   between Clockify's published spec, live behaviour, and the shape
   we ship. Five-question format per entry (official claim, actual
   behaviour, live evidence, MCP tools affected, open questions,
   status). Read before adding any new annotation, override, or
   workaround — it almost certainly has prior context.
6. `../GOCLMCP/scripts/gen-clockify-openapi` — the Ruby generator.
   Sections to know:
   - `TAG_RENAMES` — collapses singular/plural tag duplicates
   - `PATH_PARAM_PATTERNS` + `stamp_path_param_patterns!` — stamps
     `^[0-9a-fA-F]{24}$` on `expenseId` / `invoiceId` / `assignmentId`
   - `PAGINATED_LIST_OPS` + `ensure_pagination!` — stamps `page` +
     `page-size` on 21 list endpoints
   - `LAST_PAGE_HEADER_OPS` + `stamp_last_page_header!` — stamps
     `x-clockify-last-page-header: true` on 18 endpoints that emit
     the header
   - `SDK_METHOD_NAMES` + `stamp_sdk_method_name!` — pairs
     `x-fern-sdk-group-name` + `x-fern-sdk-method-name` on 149 ops
     across 27 modules
   - `PHANTOM_PATHS` + `phantom_path?` — 56 live-404/405 method+path
     pairs. 35 of them shadow a definition some source still carries,
     so they surface as quarantine records in the corrected spec; the
     rest never had a source to suppress. Each entry carries its probe
     evidence in a comment block directly above it in the array
   - per-operation `servers` overrides on the reports, audit-log, and
     shared/expense-report ops. `scripts/generate-sdk-from-openapi.mjs`
     reads `operation.servers[0].url` and emits `OperationSpec.baseUrl`,
     so `client.reports.*` / `client.auditLogReport.*` reach their real
     hosts (`reports.api.clockify.me`, `auditlog-api.api.clockify.me`)
     instead of the default `api.clockify.me/api/v1`. An explicit
     `baseUrl`/`environment` override still wins.
7. `spec/fern/{fern.config.json,generators.yml}` — historical Fern
   workspace. It is retained for evidence and fallback context only;
   the active TypeScript SDK emitter is
   `scripts/generate-sdk-from-openapi.mjs`.

## 2a. Product north star

This repo should feel like a carefully finished SDK company product,
not a loose generator dump:

- The OpenAPI snapshot is trusted because GOCLMCP generated it from
  curated sources, live probes, drift gates, and explicit discrepancy
  records.
- Generated code is a lower layer. Public ergonomics live in small,
  durable wrappers with focused tests, stable exports, and clear
  examples.
- The SDK, CLI, and MCP speak the same domain language. If a workflow
  is easy in the MCP, the underlying SDK/CLI path should also be
  obvious.
- Agent-facing APIs return structured receipts: ids, `changed`,
  `next`, warnings, stable error codes, and recovery instructions
  where useful. MCP domain create/update/delete tools populate
  `entity` + `changed` via the shared `writeReceipt` helper
  (`mcp/src/result.ts`), matching the workflow tier.
- Documentation is part of the product. README examples must be
  runnable, concise, and current; generated API docs must not
  contradict package READMEs or agent guidance.
- The final quality bar is "would a user believe this came from a
  focused SDK vendor?" If not, remove ceremony, tighten names, add
  proof, or shrink the abstraction until it is obvious.

When coding toward this bar, prefer generator/source fixes first,
hand-written wrapper seams second, deterministic postgen cleanup only
as an escape hatch, and live contract proof last. Do not add broad
frameworks, codegen layers, or AI-helper narration unless they remove
real maintenance cost.

## 3. The build chain (top to bottom)

Each arrow is a script invocation that must succeed for the next
stage to be valid. Never skip a stage; never run a pack/publish gate
without all upstream gates green.

```text
upstream sources (GOCLMCP/docs/openapi/sources/**)
        │
        │  (cd ../GOCLMCP && make gen-openapi)
        ▼
GOCLMCP/docs/openapi/clockify-openapi.yaml  (canonical, 168 ops, 42 quarantined sources)
        │
        │  make {openapi,catalog,selfinspect,raw-allowlist}-drift   ← all 4 must EXIT 0
        │  go test ./internal/tools/...                              ← must pass
        │
        │  cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml \
        │     spec/corrected/clockify.corrected.openapi.yaml
        ▼
spec/corrected/clockify.corrected.openapi.yaml  (frozen snapshot)
        │
        │  node scripts/repo-doctor.mjs                            ← start here: no-network repo-shape check
        │  npm ci                                                   ← from repo root, installs all 3 workspaces
        │  make sdk-codegen                                         ← local generator + wrapper sync
        │  make sdk-codegen-drift                                   ← reproducibility check
        │  make sdk-codegen-test                                    ← fixture/golden generator behavior
        ▼
output/ts-sdk/**  (local generator emits TS files + codegen receipt; gitignored; regen WIPES the tree)
        │
        │  cd wrapper && npm run sync   (rsync into wrapper/src/, skipping local
        │                                package scaffold files; also regens
        │                                wrapper/docs/resources/*.md)
        ▼
wrapper/src/**  (gitignored; populated by sync)
        │
        │  npm run type-check    (tsc --noEmit; covers src/**, hand-written *.ts, tests/**)
        │  npm test              (vitest; full suite, with live sandbox flows gated by
        │                         CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID)
        │  npm run build         (twin tsc passes → dist/{esm,cjs}/**; finalize-cjs.sh
        │                         writes dist/cjs/package.json {type: commonjs})
        │  npm run build:smoke   (verifies ESM + CJS expose 95 names + 28 subpaths;
        │                         wired into prepublishOnly)
        ▼
wrapper/dist/**  (the packable artefact)
        │
        │  npm pack --dry-run    (verifies tarball; compare with the
        │                         current <pkg>/.packsnapshot baseline in CI)
        ▼
clockify-sdk-ts-115@<version>.tgz  (packable; published to npm via CI tag-push)
```

`make sdk-codegen` runs `scripts/generate-sdk-from-openapi.mjs`
locally. It does not require Docker, a hosted SDK-generator account,
or Clockify credentials. Because `output/ts-sdk/**` is gitignored, a
fresh clone needs `make sdk-codegen` before SDK package gates can run;
the validators that depend on `wrapper/src/**` (schema-quality,
generator-comparison) skip with a clear generated-tree warning when
the tree is absent so non-SDK workflows can still run perfect-fast.

## 4. Verify gates (run before every commit)

Root shortcuts for non-coder operation and future-agent handoff:

| Goal | Run |
|---|---|
| See available gates | `make help` |
| Doc/contract drift suite (CI-enforced) | `make contract-gates` |
| Scheduled governance, inventory, and process proof | `make governance-audit` |
| Release-blocking coverage and compatibility proof | `make release-proof` |
| Deterministic runtime/package proof | `make perfect-fast` |
| contract-gates + full GOCLMCP + local SDK codegen + package + packed-consumer proof | `make perfect-full` |
| Explicit sandbox/live cleanup proof | `make perfect-live` |
| Authenticated remote MCP sacrificial-workspace proof | `make mcp-remote-live-proof` |
| Refresh SDK/CLI/MCP product metadata | `make product-surface` |
| Refresh shared error/recovery docs | `make error-docs` |
| Refresh troubleshooting guide from error registry | `make troubleshooting` |
| Refresh corrected OpenAPI operation inventory | `make openapi-operations` |
| Refresh OpenAPI/SDK/MCP operation parity | `make operation-parity` |
| Check corrected OpenAPI contract invariants | `make openapi-lint` |
| Regenerate local TypeScript SDK output | `make sdk-codegen` |
| Check local TypeScript SDK generation drift | `make sdk-codegen-drift` |
| Run local generator fixture/golden tests | `make sdk-codegen-test` |
| Check generated-core replaceability boundaries | `make generator-independence` |
| Compare OpenAPI SDK stamps to generated TS methods | `make generator-comparison` |
| Refresh generated CLI/MCP README tables | `make readme-tables` |
| Check touched package changelog coverage | `make changelog-drift` |
| Check documentation index links | `make docs-index-drift` |
| Check package size/startup budgets | `make performance-budgets` |
| Check wrapper build-output determinism | `make build-determinism` |
| Compare live wire responses to generated types | `make live-differential` |
| Replay redacted typed cassettes | `make cassettes` |
| Check manual GitHub mutation workflow wiring | `make mutation-ci` |
| Mutation-score gate — **GitHub only, never run locally** | Mutation workflow (`workflow_dispatch` + weekly `schedule`) |
| Check package tarball snapshots | `make pack-snapshot-check` |
| Optional sandbox key preflight | `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make sandbox-key-health` |
| Check future-agent guidance parity | `make agent-handoff` |
| Print a no-network operator plan/report | `node scripts/plan.mjs <topic>` — topics: `acceptance`, `change-impact`, `contract-inventory`, `examples`, `maintenance`, `onboarding`, `performance-calibration`, `release-decision`, `risk-status`, `workflow`. Per-topic modules under `scripts/<topic>-plan.mjs` / `<topic>-report.mjs` are libraries — do not add a new standalone CLI; add a topic to `plan.mjs` instead. |

**Run `perfect-fast` by itself and with credentials blanked:**
`CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`. The blank values
make the run deterministic and offline. If live credentials are present, the MCP
sandbox suite fails closed unless the root live orchestrator also supplies its
governed prefix and exact workspace confirmation. Do not invent those values for
an ordinary package run; use `make perfect-live` for credentialed proof. The `performance-budgets`
startup-time checks (`cli-version` ≤600ms, `mcp-tools-list` ≤1200ms) flake under CPU contention —
don't run other heavy work alongside the gate, or you'll see false reds. For a fast
inner loop use the per-package gates (they skip the startup budgets); `perfect-fast`
also runs `lint` (incl. mcp eslint), which the per-package `type-check`/`test`/`build`
do not — run `npm run lint -w <pkg>` before claiming green.

| Change scope | Run |
|---|---|
| Generator (`../GOCLMCP/scripts/gen-clockify-openapi`) | `make gen-openapi` + all 4 drift gates + `go test ./internal/tools/...` |
| Upstream sources (`GOCLMCP/docs/openapi/sources/`) | same as generator |
| `spec/corrected/` snapshot only | never — see [§5](#5-critical-conventions-the-rules-that-bite) |
| `scripts/generate-sdk-from-openapi.mjs` | `make sdk-codegen` + `make sdk-codegen-drift` + `make sdk-codegen-test` + `make generator-comparison` + `cd wrapper && npm run type-check && npm test && npm run build && npm run build:smoke` |
| `spec/fern/{generators.yml, fern.config.json}` | historical/fallback config only; do not restore it as the active TS generation path without maintainer approval |
| `wrapper/src/**` | not allowed — wiped by `npm run sync` |
| `wrapper/scripts/sync-sdk.mjs` | run `npm run sync` and verify the synced file count is sensible (it tracks the generated tree, so the exact number moves with each regen) |
| `wrapper/*.ts` root files (hand-written modules; currently 30, excluding `vitest.config.ts`) and `wrapper/internal/*.ts` | `npm run type-check` + `npm test` + `npm run build` + `npm run build:smoke` + `npm pack --dry-run`. After adding a new hand-written module: add it to `tsconfig.{json,esm.json,cjs.json}` `include`, a subpath entry in `package.json` `exports` (both `import` + `require` conditions, each with `types` + `default`), and the expected-names array in `wrapper/scripts/verify-dual-build.sh`. |
| `wrapper/CHANGELOG.md` | edit-only, no gates — runs alongside whatever change prompted the entry |
| `wrapper/{package.json, tsconfig*.json, README.md, LICENSE, vitest.config.ts, tests/**, examples/**}` | `npm run type-check` + `npm test` + `npm pack --dry-run`. Examples are type-checked via `tsconfig.json` `include` — drift in the synced SDK that breaks an example signature fails the type-check. |
| `cli/**` | `cd cli && npm run type-check && npm test && npm run build && npm pack --dry-run`. Live tests skip without sandbox env. |
| `mcp/**` | `cd mcp && npm run type-check && npm test && npm run build && npm pack --dry-run`. For behavior changes, also run a stdio or in-memory MCP probe that exercises `tools/list`, at least one success envelope, one recovery envelope, and cleanup. |
| `docs/product-north-star.md` and other `docs/**` guidance | Markdown-only. Run `git diff --check -- docs AGENTS.md CLAUDE.md README.md` and, when the prompt changes code expectations, skim the referenced package READMEs for drift. |
| `.github/workflows/**` | the security-guidance hook may block the first `Write` per session; retry once. Lint with `gh workflow view <name>`. |
| `.github/dependabot.yml` | edit-only, no gates (GitHub validates on next poll). Commits with `chore(deps)` / `chore(dev-deps)` / `chore(ci)` prefixes per the file's `commit-message` config. |
| `wrapper/typedoc.json` | `npm run docs` (regenerates `docs/api/`; failures block the docs.yml workflow). |

After any spec or generator change, the FULL chain in §3 must run
end-to-end and green before push. Drift gates are non-negotiable.

## 5. Critical conventions (the rules that bite)

1. **Never edit `spec/corrected/clockify.corrected.openapi.yaml`.**
   It's a regenerable snapshot. Edits land in upstream sources
   (`GOCLMCP/docs/openapi/sources/**`) or in the generator script.
   The only legitimate local diff is a straight copy from
   `../GOCLMCP/docs/openapi/clockify-openapi.yaml` after the GOCLMCP
   generator and drift gates are green; for that handoff, run the final
   full gate with `CLOCKIFY_ALLOW_GENERATED_DIFF=1` and keep the diff to
   the copied snapshot plus regenerated SDK/package surfaces.
1a. **Before auditing a response type, confirm which schema the operation
   actually resolves to.** Chase the `$ref` chain from the operation's `200`
   response rather than assuming the obvious name. `getWorkspaceExpenses` goes
   `WorkspaceExpensesDtoV1` -> `ExpensesWithCountDtoV1` ->
   **`ExpenseHydratedDtoV1`**, not `ExpenseDtoV1` — and the two carry genuinely
   different shapes (the list returns expanded `category`/`project`/`task`
   objects plus `fileName`; `getExpenseById` returns the flat
   `categoryId`/`projectId`/`taskId` and none of those). Widening the wrong one
   would have over-declared on both sides. Sibling operations sharing a
   plausible name are not evidence that they share a schema, and a schema whose
   body is a bare `allOf: [Other]` is a shadowing stub, not a real definition —
   see `spec/evidence/discrepancies.md`
   (`expenses.list.expanded-category-and-project-dropped`).
2. **Never edit `output/ts-sdk/**`.** `make sdk-codegen` wipes
   the tree on every regen. Hand-written code lives in `wrapper/`.
3. **Never edit `wrapper/src/**`.** `npm run sync` wipes + repopulates
   from `output/ts-sdk/`. The sync script intentionally skips
   `package.json`, `tsconfig*.json`, `node_modules/`, lockfiles, and
   `.gitignore` so the wrapper's versions survive.
4. **Never commit raw probe files (`spec/evidence/probes/*.{json,hdr}`).**
   Gitignored already. Promote canonical findings into
   `spec/evidence/discrepancies.md` and reference the probe by
   relative path.
5. **Never run `npm publish` from a developer laptop.** Publication is
   via CI on a pushed version tag (`wrapper-v*`/`cli-v*`/`mcp-v*`);
   changing release triggers, auth, or provenance still needs explicit
   maintainer approval.
6. **Never push a tag that doesn't match `package.json` version.**
   The release workflow's tag-vs-version guard fails the job; the
   consequence is a half-burnt git tag that needs cleanup.
7. **Drift gates must pass after every spec change.** All four:
   `openapi-drift`, `catalog-drift`, `selfinspect-drift`,
   `raw-allowlist-drift`. Skipping any is silent data corruption —
   the GOCLMCP MCP layer derives its tool catalog from the canonical
   spec.
8. **`go test ./internal/tools/...` in GOCLMCP must pass after every
   spec change.** Same reason — the Go tool layer parses the
   canonical YAML.
9. **No `it.skip` / `test.skip` / `xit` / `xdescribe` in `wrapper/tests/`.**
   Use the env-gated `describe.skip` pattern from
   `tests/sandbox.test.ts` for live tests. Never skip silently.
10. **MCP id-slots resolve a name to an id before any write.** The
    holidays, time-off (policy/request/balance/request-policy slots),
    expenses (category slots), scheduling, groups `add_member`, and
    users grant/revoke-role tools resolve supported names before the
    write call. A 24-hex id passes through; unresolved or ambiguous
    names stop before mutation as either a grounded `clarification`
    receipt or a structured error, depending on the resolver path. Read
    filter slots stay list-free. The shared `mcp/src/scope-filter.ts`
    splits its `status`:
    time-off **policies** scope `"ACTIVE"`, holidays keep `"ALL"`
    (`spec/evidence/discrepancies.md`
    `time-off.policies.scope.status-active-not-all`). Adds no tools;
    arg-shape coercion (`zStringList` /
    `zNumberLike` in `mcp/src/arg-shapes.ts`) keeps the
    model-visible JSON Schema unchanged. Change the tool, its test,
    and the ledger together.
11. **CLI/MCP request casts stay at zero.** `make consumer-cast-budget`
    builds a TypeScript Program over `cli/src` and server-reachable `mcp/src`
    (the exact browser-only App exclusions mirror `mcp/tsconfig.build.json`; an
    import from server code brings an excluded file back through TypeScript's
    import closure) and uses symbol
    provenance plus bounded, fail-closed request-bound dataflow to reject every
    escape hatch that would let an untyped value reach a generated request:
    direct/chained/structural/angle-bracket assertions, `as never`,
    annotated or assigned `any`, helper-hidden generics, declaration-only and
    imported/transitive helpers, `Function.call`/`apply`/`bind` trampolines, and
    symbol-provenance calls whose receiver, method, helper parameter/result, or
    holder property was erased to `any`.

    The exhaustive semantics — every alias, spread, rest, descriptor, binder,
    and reconstruction rule the analysis models, and exactly where it fails
    closed — are the `purpose` field of `docs/consumer-cast-budget-contract.json`.
    That contract is the single source of truth; do not restate it here.

    What you must know to work in this repo:

    - Build generated request unions directly, using `ClockifyRequestBody<T>`
      for typed bodies. Do not reach for an assertion.
    - Both canonical exception arrays are **empty** and must stay empty. A
      future temporary exception requires an exact file/range or stable marker,
      the generated request type, a discrepancy id, an open risk id, an
      evidence path/anchor, and an exact closure target. Changing the
      canonical-zero baseline is an explicit maintainer decision.
    - Keep the Task 6 public no-`any` adapter fixture in
      `wrapper/tests/types/breaking-changes.test-d.ts`; do not add a second
      public-type gate. The Make target runs that compiler proof itself after
      SDK codegen/build. Local structural or built-in counterfeits, and
      comment-only Make prerequisites, are not proof.


## 6. The wrapper layout

```
wrapper/
├── package.json              ← clockify-sdk-ts-115 manifest (npm-bound)
├── tsconfig.json             ← type-check (noEmit; covers src/**, hand-written *.ts, tests/**)
├── tsconfig.esm.json         ← ESM emit → dist/esm/ (rootDir `.`; src/ lands under dist/esm/src/)
├── tsconfig.cjs.json         ← CJS emit → dist/cjs/. Paired with scripts/finalize-cjs.sh which writes
│                                dist/cjs/package.json {type: commonjs} so Node treats the subtree as CJS
│                                regardless of the parent's "type": "module".
├── vitest.config.ts          ← test runner (testTimeout 30s)
├── README.md                 ← SDK package README
├── CHANGELOG.md              ← Keep-a-Changelog. NOT in package.json "files" — discoverable via repo URL.
├── LICENSE                   ← MIT
├── index.ts                  ← package root — re-exports synced SDK + hand-written helpers
├── create-client.ts          ← createClockifyClient() factory. Enforces exactly-one auth via a
│                                discriminated-union API; reads CLOCKIFY_API_KEY / CLOCKIFY_ADDON_TOKEN
│                                from env when both options omitted; auto-wraps fetch with composedFetch.
├── composed-fetch.ts         ← fetch wrapper: User-Agent + X-Request-Id injection, lifecycle hooks,
│                                configurable retry policy (Retry-After / X-RateLimit-Reset aware).
│                                When retryPolicy is set the factory passes maxRetries:0 to the
│                                generated client to avoid nested retry loops.
├── iter.ts                   ← iterAll + iterPages per-resource pagination. Consumes the Last-Page
│                                response header on the 18 endpoints that emit it (via the rawResponse
│                                shape from the generated HttpResponsePromise); KnownPaginatedMethod union +
│                                14-entry KNOWN_PAGINATED_METHODS drift assertion catches upstream renames.
├── webhooks.ts               ← verifyClockifyWebhook + constructEvent for the Clockify-Signature-Token
│                                header (simple shared-secret scheme, not HMAC).
├── pagination.ts             ← low-level callback iterator paginate<T> (iterAll is the recommended API).
├── with-response.ts          ← shim that lifts HttpResponsePromise.withRawResponse() into a flat
│                                { data, response, headers, requestId, status } shape.
├── .gitignore                ← drops node_modules/, dist/, src/, *.tsbuildinfo
├── internal/                 ← hand-written host-selection modules: routing.ts, subdomain-label.ts,
│                                authenticated-boundary-fetch.ts. NOT generated (unlike src/); Stryker-governed
│                                with per-module floors, and mirrored by docs/service-routing-matrix.json —
│                                tests/routing-matrix-equality.test.ts fails closed on any drift.
├── scripts/
│   ├── sync-sdk.mjs          ← atomic staged copy from ../output/ts-sdk/ → src/; chains gen-resource-docs.ts
│   ├── finalize-cjs.sh       ← writes dist/cjs/package.json after the CJS tsc pass
│   ├── verify-dual-build.sh  ← smoke: both ESM + CJS imports against dist/ (governed by docs/sdk-public-api.json)
│   └── gen-resource-docs.ts  ← parses src/api/resources/*/client/{Client.ts,requests/*.ts}
│                                → emits docs/resources/<name>.md (committed; one per resource).
├── examples/                 ← runnable starter scripts; each imports from `clockify-sdk-ts-115`
│                                (package self-reference); live-API ones gate on CLOCKIFY_API_KEY.
│                                `sdk-helper-cookbook.ts` is the compile-checked helper cookbook
│                                backing `docs/cookbook.md` snippets.
│                                NOT in the npm tarball.
├── docs/
│   ├── resources/<name>.md   ← per-resource markdown (auto-gen from sync; committed)
│   └── api/                  ← TypeDoc output (gitignored; published to GitHub Pages by docs.yml on main push or manual dispatch)
├── typedoc.json              ← entry points: index.ts + src/api/resources (expand strategy)
├── .prettierrc + .prettierignore ← 4-space, double quotes, trailing commas, 100-char width. Ignore
│                                excludes src/, dist/, docs/, package-lock.json. `npm run format` /
│                                `npm run format:check`.
├── .packsnapshot             ← baseline of `npm pack --dry-run` paths; mirrored by cli/mcp package snapshots
├── tests/                    ← one file per behavior area. The list is deliberately not
│                                inventoried here (it rots); run
│                                `npm test -w clockify-sdk-ts-115` for the live set. Two
│                                conventions matter: `axioms-checklist.test.ts` keeps one
│                                assertion per row of `docs/axioms.md`, and `sandbox.test.ts`
│                                is the env-gated live suite that `describe.skip`s without
│                                credentials.
├── src/                      ← gitignored; populated by sync-sdk.mjs
└── dist/                     ← gitignored; populated by `npm run build`
```

`"files": ["dist", "README.md", "LICENSE"]` in `package.json`
whitelists what `npm pack` includes. Do not add without a
pack/readiness review. `CHANGELOG.md` is intentionally omitted to
keep the tarball lean.

The governed subpaths in `package.json` `exports` (the root `.` plus named entries), each with `import` +
`require` conditions (modern dual-tier shape: `{ types, default }` per condition so
TS resolves ESM vs CJS types correctly). The canonical, governed list lives in
`docs/sdk-public-api.json` (`subpaths` + `tsconfigAliases`), kept in lockstep with
`package.json` exports, the tsconfig path aliases, and `verify-dual-build.sh` by
`make sdk-public-api` — edit there, not by hand-listing here. The 27 named subpaths:
`create-client`, `composed-fetch`, `errors`, `deprecation`, `iter`, `pagination`,
`paginated-list`, `webhooks`, `webhook-events`, `with-response`, `scoped-client`,
`otel-hooks`, `health`, `rate-limit`, `diagnostics`, `request-options`,
`operation-receipt`, `money`, `invoice-body`, `resolve`, `dates`, `ensure`,
`requests`, `reports`, `bulk`, `compose`, and `expense-list`.

`package.json` also carries `publishConfig: { access: public,
provenance: true }` for the tag-gated CI release path. Because a publish
goes out publicly with sigstore provenance, do not trigger one without
explicit maintainer approval.

The local generator models `apiKey` and `addonToken` as mutually
exclusive. Do not reintroduce the historical
`addonToken: (() => undefined) as unknown as () => string` workaround;
that belongs only to the archived Fern discrepancy notes.

## 7. Live tests (env-gated; sandbox-only)

Three live sandbox suites run under `scripts/run-live-proof.mjs`, which
provides `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, an exact matching
`CLOCKIFY_LIVE_WORKSPACE_CONFIRM`, and one generated
`clockify115-live-<timestamp>-<random>-` prefix. They skip cleanly only
when credentials are wholly absent (CI runs without them deliberately);
partially armed, unconfirmed, or unprefixed mutation runs fail closed.

- `wrapper/tests/sandbox.test.ts` — 7 SDK-level flows (CRUD on tags,
  pagination walks via `paginate` / `iterAll` / `iterPages`,
  `withResponse` headers smoke).
- `cli/tests/sandbox.test.ts` — 12 CLI flows invoking `main()` in
  `--json` mode and parsing stdout. Covers timer start/stop/delete, tag
  CRUD, the client/project/task archive-delete chain, an entitled invoice
  draft round trip, and the existing read smokes. Only stable HTTP 402 or
  `feature_unavailable` can limit an entitled flow; 403/404 fail.
- `mcp/tests/sandbox.test.ts` — 12 MCP flows. Uses real
  `loadContext()` + `buildServer()` piped through
  `InMemoryTransport.createLinkedPair()`. Covers `clockify_status`,
  list tools, tag create/delete, work-package create/reuse cleanup,
  derived-start work logging, review-day totals, and fix-entry update
  cleanup, plus one guarded business write through bare rejection,
  dry-run/token preview, and one-use execution.

**Never run live tests against a customer workspace.** Every CRUD
round-trip creates and deletes records on the pinned sandbox.

When adding live flows:
- Pair create with delete in the same `it` block.
- Derive every mutable name from `CLOCKIFY_LIVE_PREFIX`; never invent a
  surface-local prefix for an armed run. The one governed exception is the
  live-evidence webhook name: Clockify's short name limit requires
  `c115-<runId>-`, where `runId` is derived from that exact unique root prefix;
  both forms are included in both campaign sweeps.
- Keep the entity discoverable by the dependency-ordered root cleanup in
  `scripts/live/cleanup.mjs`, which always runs in `finally` and emits only
  count-based receipts.
- `testTimeout: 30_000` is already in `vitest.config.ts` (wrapper)
  and inline on each `it` in cli/mcp suites.
- Treat any 401 / 5xx as a test bug, not a spec bug, until proven
  otherwise. Run the curl equivalent by hand before changing
  assertions.

Run `make perfect-live` only in the sacrificial sandbox. The root
orchestrator runs wrapper, CLI, MCP, and GOCLMCP independently, retains all
four statuses, then requires cleanup success and zero leftovers in one
sanitized JSON receipt.

Run `make mcp-remote-live-proof` only after `make mcp-remote-proof`, and
serialize it with `make perfect-live` because both own the same live lock. The
remote-live gate must provision the Clockify key only through admin-CLI stdin,
exercise JWT and opaque stateless requests, and finish with zero Clockify and
proof-database leftovers. It is never part of an offline aggregate.

The broader 168-operation evidence campaign runs only through
`make live-evidence-campaign`. Its launcher rebuilds the SDK with credentials
blanked, rejects governed input drift across that rebuild, verifies the tracked
prior manifest, and runs from an exact content snapshot. Timeout or operator
interruption first requests worker cancellation and gives `finally` cleanup a
bounded grace window before any hard kill. It emits ignored manifest/receipt candidates only after exact-id
fallbacks, a final 17-class zero-leftover rescan, and lock release. The receipt
records `registered_fallbacks` as a separate action after those 17 entity
classes. Candidate hashes require separate explicit human approval before
import; the campaign must never approve or import its own output.

## 8. Known deferred / blocked items

Tracked in `spec/evidence/discrepancies.md` with full repro:

1. Two Fern-era entries (`fern.x-fern-pagination.bare-array-unsupported`,
   `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`) are
   closed and kept only as migration evidence. Fern is not a dependency
   (ADR 0005): the local generator emits mutually-exclusive auth options, and
   the hand-written `paginate<T>` / `iterAll` / `iterPages` are the permanent
   pagination surface. Reopen them only if a maintainer reopens the
   hosted-generator strategy (§12.3); the detail is in the ledger.
2. `fern.x-fern-sdk-method-name.drops-resource-modules` — resolved
   in v0.5.0 by pairing `x-fern-sdk-group-name` +
   `x-fern-sdk-method-name`. Coverage: 149 ops / 27 modules /
   88.7% of the 168-op surface. The other 19 ops use governed
   operationId-derived group/method names. All 168 are generated and
   reachable according to `output/ts-sdk/codegen-receipt.json`; the
   exact 149 explicit / 19 derived split is enforced by the names-only
   `docs/sdk-operation-naming-classifications.json`; every discrepancy anchor
   is reviewed in `docs/operation-evidence-anchor-inventory.json`, and its
   operation attribution or explicit no-applicable-evidence decision is
   checked against source/schema-derived expectations in
   `docs/operation-evidence-semantic-contract.json` before being materialized
   across all 168 rows in `docs/operation-evidence-map.json`. Naming and evidence
   are materialized together for every operation in
   `docs/operation-dispositions.json`.

### Live-success coverage

**161/168** operations in the corrected spec carry
`x-clockify-live-status: live-success` — each promoted only by a real probe
against the sacrificial sandbox that finished `Leftovers:0`. `make docs-counts`
derives that headline from the spec itself, so a re-snapshot that moves the
count reds the gate until the prose is updated.

The promotion history (six waves between 2026-06-20 and 2026-06-23, which took
the surface from 46 of 184 to 135 of 163 by quarantining 17 confirmed-wrong
ops, adding 2 missing official ops, and promoting the rest) is not repeated
here.
Per-op wire facts, the evidence for every promotion, and the reasoning behind
each quarantine live in `spec/evidence/discrepancies.md`; the package
CHANGELOGs carry the user-visible consequences.

Before promoting an op yourself, read
`docs/agent-tasks/handle-live-api-discrepancy.md` — the probe-then-stamp
sequence is not obvious and skipping a step silently ships a wrong schema.

## 9. Secret hygiene

- `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` belong in the
  developer's shell. Never commit, never echo unredacted, never
  paste in Slack / GitHub comments.
- `make secret-hygiene` catches the bare `KEY=value` / `export KEY=value` form (not
  only quoted), via an optional-quote + digit-lookahead regex, and `.env*` is
  gitignored so a committed `.env` is impossible outright. It is still best-effort
  (defers to gitleaks for deep audits).
- `NPM_TOKEN` lives in the repo's GitHub Actions secrets. Use an
  **automation** token with **Publish** scope, **no expiry** (or
  ≤1 year), and rotate after every npm push.
- `gh auth status` token belongs to one developer machine, not CI.
  CI uses the per-job `GITHUB_TOKEN` for read-only checkout.

## 10. Commit & branch hygiene

- Conventional prefixes: `feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, `test:`, `ci:`. One logical change per commit.
- Subject line ≤ 72 chars. Wrap body at 72.
- Generated code (under `output/ts-sdk/`) is **gitignored**; you regenerate
  it locally with `make sdk-codegen` before running SDK package gates. When a generator
  change touches many files, describe the *change to the generator*, not the
  diff to the generated files. Example:
  > `feat(gen): stamp page+page-size on 21 list endpoints`
- Never push to `main` from a feature branch via PR-merge UI without
  CI green on the PR head. Direct pushes to `main` are reserved for
  hotfixes you can defend in writing.
- Do not amend a published commit. Add a new commit on top.
- Do not skip hooks (`--no-verify`) or bypass signing
  (`--no-gpg-sign`). If a hook fails, fix the underlying issue.

## 11. Doc maintenance

- The final-readiness receipt make-target family (draft/check/final receipts
  and the goal-status report) was **removed on 2026-05-28**. `make
  enterprise-audit` is what remains, and `scripts/check-enterprise-hardening.mjs`
  no longer has a `--final` mode. Do not reinvent those targets from an old
  reference; only `docs/decisions/0004-sandbox-only-live-proof.md` still
  carries the retired terminology, deliberately, as a historical record.
- The completed 1.0-campaign gates (`unique-claim-inventory`, the
  one-point-zero inventory check inside `release-readiness`, and the
  plan-lifecycle half of `check-agent-handoff.mjs`) were **retired on
  2026-08-09** to `docs/roadmap-1.0-receipts/governance-gate-retirement.md`.
  The campaign docs stay as read-only evidence;
  `scripts/check-agent-handoff.retired-lifecycle.test.mjs` fails if the
  retired machinery is rewired.
- Every spec-shape change ships with a `spec/evidence/discrepancies.md`
  entry using the five-question format. An entry is not a substitute
  for fixing the issue; it's a trail that lets the next agent
  understand why the code looks the way it does.
- `wrapper/README.md` is the SDK package README. Update for any
  user-visible change: new method, new auth requirement, changed
  pagination shape, deprecation. Don't duplicate build-chain detail
  there; that lives in this `AGENTS.md` and the workspace `README.md`.
- `mcp/README.md` is the MCP-facing README. Update for any tool
  addition/removal, envelope field, stable error code, confirmation
  flow, or workflow example change. Cross-check the workflow table
  against `tools/list` and GOCLMCP's `docs/tool-catalog.json`.
- `docs/product-north-star.md` and `docs/roadmap-1.0.md` are the
  planning/guidance artifacts. The 1.0 roadmap now records a completed
  historical campaign and retained receipts; current release decisions are in
  `docs/release-decision.md`. Keep planning guidance executable: exact files,
  exact commands, explicit non-goals, and no placeholder phrases. Retire a
  planning doc once its content is absorbed rather than leaving it to rot — a
  stale plan is worse than no plan, because the next agent will believe it.
- `wrapper/CHANGELOG.md` follows Keep-a-Changelog. `[Unreleased]`
  on top; user-visible changes go there between releases. On tag day
  rename `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD` and add a fresh
  empty `[Unreleased]`. Each version entry references the relevant
  `discrepancies.md` anchors for any limitation it inherits or
  closes. `CHANGELOG.md` is intentionally not in `package.json`
  `files` so the npm tarball stays lean.

## 12. Out of scope (FLAG and stop)

These require explicit author approval before any code or config
touches them. If asked to do one without prior buy-in, surface the
request and stop:

1. Editing `../GOCLMCP/scripts/gen-clockify-openapi`'s merge /
   dedup logic (lines ~700–880). One bug there destroyed 26
   request-body interfaces last cycle. Adding entries to
   `PATH_PARAM_PATTERNS`, `PAGINATED_LIST_OPS`, `TAG_RENAMES`,
   `LAST_PAGE_HEADER_OPS`, `SDK_METHOD_NAMES`, or `PHANTOM_PATHS`
   is fine — those are data-only.
2. Renaming the npm package (`clockify-sdk-ts-115`). The repo's git
   name (`clockify-ts-sdk`) and the npm name diverged intentionally.
3. Restoring Fern, Speakeasy, Stainless, or another hosted/paid SDK
   generator as the active TypeScript generation path. That needs a
   maintainer decision and a full regression cycle.
4. Reintroducing the historical `addonToken` workaround cast
   (`addonToken: (() => undefined) as unknown as () => string`) in
   `wrapper/`. The local generator now models `apiKey`/`addonToken` as
   mutually exclusive (see [§6](#6-the-wrapper-layout),
   [§8](#8-known-deferred--blocked-items)); the cast is archived Fern-era
   evidence only, and restoring it needs a maintainer decision and a
   full auth regression cycle.
5. Anything that affects a customer workspace (running tests
   against a non-sandbox API key, posting to a production webhook,
   etc.).
6. Pushing to any `apet97/*` remote with `--force`, deleting any
   branch, or running `git reset --hard origin/main` on `main`.
7. Editing `.github/workflows/release.yml` such that npm publish
   could fire without a tag (e.g. on push to main). The tag gate is
   load-bearing.
