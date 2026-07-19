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

## 0. Current hardening checkpoint (2026-06-27)

- `main` is the integration branch. For direct pushes, first verify a
  clean worktree and `HEAD...origin/main` is even, then make one focused
  commit, push, and watch the resulting GitHub Actions runs.
- Keep local proof laptop-safe. Prefer focused package/doc gates or
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`
  for deterministic local proof. Do not start local mutation, coverage,
  or `perfect-full` while the machine is under load.
- Pre-push proof has three tiers: `make contract-gates` is the CI-enforced
  readiness/docs-drift suite, `make perfect-fast` is runtime/package proof,
  and `make perfect-full` adds heavy proof. `make perfect-live` remains
  separate credentialed sandbox proof.
- Mutation score proof is GitHub-hosted for routine use. The manual
  **Mutation** workflow runs on `workflow_dispatch` with `target=all`,
  `wrapper`, or `mcp`; `make mutation-ci` verifies that wiring and is
  included in `make perfect-full`.
- Local `make mutation` remains an opt-in maintainer gate. It runs
  wrapper + MCP Stryker only after SDK codegen and is capped by the
  package Stryker configs.
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
  interface on top of the SDK. **59 commands** across 21 top-level
  groups including `reports`, `shared-reports`, `users`, `doctor`, `completion`, the
  scriptable `api` raw command, and the workflow shortcuts (`start`, `stop`, `status`, `log`,
  `entries`, `projects`, `clients`, `tasks`, `tags`, `webhooks`,
  `invoices`, `expenses`, `timeoff`, `scheduling`, `audit-log`). The
  resource groups carry full CRUD (`list`/`create`/`get`/`update`/`delete`,
  with archive-then-delete for active projects/clients/tasks).
  Output controls: `--output table|json|ndjson`, `--compact`,
  `--select <dot-path>`. Local build artefact: `cli/dist/`.
- **`mcp/`** → `@apet97/clockify-mcp-115` — stdio Model Context Protocol
  server, sibling to the Go MCP in GOCLMCP. **140 tools**: 22
  workflow/orientation tools plus 118 domain tools across 19 resource groups.
  Workflow tools cover daily time tracking, work-package setup,
  review/fix, invoices, expenses, time off, scheduling, webhooks,
  and demo seed/cleanup; read-only orientation tools
  (`clockify_docs_search`, `clockify_operation_guide`,
  `clockify_sdk_snippet`) help an agent pick the smallest correct
  surface. Domain tools provide broad CRUDL coverage including the four
  report tools; the raw API fallback remains the Go MCP's niche. Local
  build artefact: `mcp/dist/`.
  MCP write-safety is part of this product contract: every tool has a
  governed runtime risk class in `mcp/src/tool-risk.ts`; business,
  external-side-effect, privileged, and destructive writes use the
  exact-stored-preview `dry_run` -> `confirm_token` registration path in
  `mcp/src/result.ts` and `mcp/src/orchestration/confirmation.ts`, while
  `clockify_setup_webhook` validates callback URLs through
  `mcp/src/orchestration/webhook-url.ts` before either preview or
  creation. That webhook guard is intentionally offline and covers
  literal URL/host/IP risks, not DNS rebinding.

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
     `x-fern-sdk-group-name` + `x-fern-sdk-method-name` on 155 ops
     across 27 modules
   - `PHANTOM_PATHS` + `phantom_path?` — 27 quarantined live-404/405
     routes (3 round-1 timeOff legacy, 3 round-2 G.1 edge cases,
     plus bare `/balance` × 2, `/scheduling/capacity` × 1, and
     `/time-entries/stop` × 1)
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
GOCLMCP/docs/openapi/clockify-openapi.yaml  (canonical, 169 ops, 27 quarantined sources)
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
        │  npm run build:smoke   (verifies ESM + CJS expose 92 names + 28 subpaths;
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
| Deterministic runtime/package proof | `make perfect-fast` |
| Full GOCLMCP + local SDK codegen + package + packed-consumer proof | `make perfect-full` |
| Explicit sandbox/live cleanup proof | `make perfect-live` |
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
| Replay redacted typed cassettes | `make cassettes` |
| Check manual GitHub mutation workflow wiring | `make mutation-ci` |
| Opt-in local wrapper + mcp mutation-score gate | `make mutation` |
| Check package tarball snapshots | `make pack-snapshot-check` |
| Optional sandbox key preflight | `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make sandbox-key-health` |
| Check future-agent guidance parity | `make agent-handoff` |
| Print a no-network operator plan/report | `node scripts/plan.mjs <topic>` — topics: `acceptance`, `change-impact`, `contract-inventory`, `examples`, `maintenance`, `onboarding`, `performance-calibration`, `release-decision`, `risk-status`, `workflow`. Per-topic modules under `scripts/<topic>-plan.mjs` / `<topic>-report.mjs` are libraries — do not add a new standalone CLI; add a topic to `plan.mjs` instead. |

**Run `perfect-fast` solo and with creds blanked:**
`CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`. With creds set the
live `sandbox.test.ts` suites run and 401 on an expired/absent key; blanked they
self-skip, so the run is deterministic and offline. The `performance-budgets`
startup-time checks (`cli-version` ≤600ms, `mcp-tools-list` ≤1200ms) flake under CPU contention —
don't run other heavy work alongside the gate, or you'll see false reds. For a fast
inner loop use the per-package gates (they skip the startup budgets); `perfect-fast`
also runs `lint` (incl. mcp eslint), which the per-package `type-check`/`test`/`build`
do not — run `npm run lint -w <pkg>` before claiming green.

| Change scope | Run |
|---|---|
| Generator (`../GOCLMCP/scripts/gen-clockify-openapi`) | `make gen-openapi` + all 4 drift gates + `go test ./internal/tools/...` |
| Upstream sources (`GOCLMCP/docs/openapi/sources/`) | same as generator |
| `spec/corrected/` snapshot only | never — see §5 |
| `scripts/generate-sdk-from-openapi.mjs` | `make sdk-codegen` + `make sdk-codegen-drift` + `make sdk-codegen-test` + `make generator-comparison` + `cd wrapper && npm run type-check && npm test && npm run build && npm run build:smoke` |
| `spec/fern/{generators.yml, fern.config.json}` | historical/fallback config only; do not restore it as the active TS generation path without maintainer approval |
| `wrapper/src/**` | not allowed — wiped by `npm run sync` |
| `wrapper/scripts/sync-sdk.sh` | run `npm run sync` and verify the synced file count is sensible (it tracks the generated tree, so the exact number moves with each regen) |
| `wrapper/*.ts` root files (hand-written modules; currently 29, excluding `vitest.config.ts`) | `npm run type-check` + `npm test` + `npm run build` + `npm run build:smoke` + `npm pack --dry-run`. After adding a new hand-written module: add it to `tsconfig.{json,esm.json,cjs.json}` `include`, a subpath entry in `package.json` `exports` (both `import` + `require` conditions, each with `types` + `default`), and the expected-names array in `wrapper/scripts/verify-dual-build.sh`. |
| `wrapper/CHANGELOG.md` | edit-only, no gates — runs alongside whatever change prompted the entry |
| `wrapper/{package.json, tsconfig*.json, README.md, LICENSE, vitest.config.ts, tests/**, examples/**}` | `npm run type-check` + `npm test` + `npm pack --dry-run`. Examples are type-checked via `tsconfig.json` `include` — drift in the synced SDK that breaks an example signature fails the type-check. |
| `cli/**` | `cd cli && npm run type-check && npm test && npm run build && npm pack --dry-run`. Live tests skip without sandbox env. |
| `mcp/**` | `cd mcp && npm run type-check && npm test && npm run build && npm pack --dry-run`. For behavior changes, also run a stdio or in-memory MCP probe that exercises `tools/list`, at least one success envelope, one recovery envelope, and cleanup. |
| `docs/product-north-star.md` or `docs/superpowers/plans/**` | Markdown-only. Run `git diff --check -- docs AGENTS.md CLAUDE.md README.md` and, when the prompt changes code expectations, skim the referenced package READMEs for drift. |
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
    builds a TypeScript Program for `cli/src` and `mcp/src`; symbol provenance
    plus bounded request-bound dataflow conservatively traces all potentially
    reaching receiver-qualified variable/property writes (including literal and
    unresolved computed keys), ordered receiver aliases, parameter defaults,
    compound/destructuring assignments, nested/defaulted/rest bindings,
    called same-file/imported helper side effects (including nested receivers
    and synchronous `call`/`apply`/`bind`), named/aliased synchronous array
    callbacks on statically recoverable non-empty receivers (`forEach`, `map`,
    `filter`, `every`, `some`, `find`, `findIndex`, `flatMap`, `reduce`, and
    `reduceRight`) with reducer-return propagation and bounded return-aware
    short-circuiting across conditional/logical/sequence receiver alternatives,
    aliased/destructured `Object.assign`/`Reflect.set` effects with bounded
    left-to-right patch/spread/factory provenance and definite same-key
    overwrite semantics across sequential calls, accessors,
    expressions, and spreads. Receiver-producing calls follow bounded return
    provenance rather than treating every argument as an origin. Exported,
    default-exported, or escaped callables keep parameter defaults reachable;
    asynchronous, known-empty, unknown-emptiness, and definitely
    short-circuited callbacks do not become pre-request effects. Deterministic
    alternative/invocation/work overflow becomes a stable governance failure
    rather than expanding without bound. It rejects
    direct, chained, structural, angle-bracket, `as never`,
    annotated/assigned `any`, helper-hidden generic, declaration-only,
    imported/transitive, Function `call`/`apply`/`bind`, and symbol-provenance
    request calls whose receiver, method, helper parameter/result, or holder
    property was erased to `any` (including later holder writes and exact
    `Function.call` trampolines), without treating
    arbitrary local `*Request` names or unrelated `any` parameters as request
    values. Discarded comma-expression operands are not request contributors.
    Construct generated request unions directly,
    using `ClockifyRequestBody<T>` for typed bodies. Both canonical
    exception arrays are empty. A future temporary exception requires
    an exact file/range or stable marker, generated request type,
    discrepancy id, open risk id, evidence path/anchor, and exact closure
    target; changing the canonical-zero baseline is an explicit
    maintainer decision. Keep the Task 6 public no-`any` adapter fixture
    in `wrapper/tests/types/breaking-changes.test-d.ts`; do not add a
    second public-type gate. The cast-budget Make target executes that compiler
    proof itself after SDK codegen/build; the gate pins the exact `IsAny`
    definition, the unshadowed TypeScript `Parameters` built-in across local and
    every import-clause binding form, both public
    adapter imports and type arguments, and all six callback operands. Local
    structural/built-in counterfeits and marker/Make comments are not proof.

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
├── scripts/
│   ├── sync-sdk.sh           ← rsync from ../output/ts-sdk/ → src/; chains gen-resource-docs.ts
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
│   └── api/                  ← TypeDoc output (gitignored; published to gh-pages by docs.yml on tag push)
├── typedoc.json              ← entry points: index.ts + src/api/resources (expand strategy)
├── .prettierrc + .prettierignore ← 4-space, double quotes, trailing commas, 100-char width. Ignore
│                                excludes src/, dist/, docs/, package-lock.json. `npm run format` /
│                                `npm run format:check`.
├── .packsnapshot             ← baseline of `npm pack --dry-run` paths; mirrored by cli/mcp package snapshots
├── tests/                    (one file per behavior area; representative subset listed below — run `npm test -w wrapper` for the live count)
│   ├── pagination.test.ts        ← page/page-size validation + RangeError matrix
│   ├── create-client.test.ts     ← env-var fallback matrix + debug:true console.debug
│   ├── iter.test.ts              ← iterAll/iterPages + Last-Page header + 14-entry KNOWN_PAGINATED_METHODS drift assertions
│   ├── paginated-list.test.ts    ← PaginatedList<T> async-iterable + toArray({limit}) early-stop
│   ├── webhooks.test.ts          ← Clockify-Signature-Token verification
│   ├── webhook-fixtures.test.ts  ← canonical webhook payload fixtures
│   ├── webhook-events.test.ts    ← 50-event ClockifyWebhookEvent discriminated union
│   ├── composed-fetch.test.ts    ← UA/req-id + hooks + retry policy
│   ├── with-response.test.ts     ← HttpResponsePromise → flat {data, headers, requestId, status}
│   ├── errors.test.ts            ← per-status subclasses + promoteApiError + getErrorCode +
│   │                                ClockifyConnectionError + ClockifyAbortError
│   ├── scoped-client.test.ts     ← client.workspace(id) Proxy + workspaceId auto-inject
│   ├── otel-hooks.test.ts        ← OTel semantic-convention span attrs (zero @otel/api dep)
│   ├── health.test.ts            ← client.health() preflight + latency + serverTime
│   ├── rate-limit.test.ts        ← X-RateLimit-* header parser + getRateLimitFromError
│   ├── axioms-checklist.test.ts  ← regression gate: one assertion per row of `docs/axioms.md`
│   ├── deprecation.test.ts       ← warnOnce convention
│   ├── diagnostics.test.ts       ← no-network `clockifyDiagnostics` redaction + readiness
│   ├── dual-build.test.ts        ← ESM + CJS surface assertion
│   ├── mock-clockify.test.ts     ← scripts/mock-clockify-server.mjs–backed deterministic flows
│   ├── generated-retry-delay.test.ts ← generator template guard for capped+jittered retry delay
│   ├── errors.property.test.ts   ← property checks for error-code stability
│   ├── iter.property.test.ts     ← property checks for bounded page iteration
│   ├── webhook-url.property.test.ts ← property checks for callback URL guard rejects
│   └── sandbox.test.ts           ← 7 live (round-trip + paginate + iterAll + withResponse + …);
│                                    describe.skip without env creds
├── src/                      ← gitignored; populated by sync-sdk.sh
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
provenance: true }` for the legacy release path. Because that would
publish publicly with sigstore provenance, do not trigger it without
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
  surface-local prefix for an armed run.
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

## 8. Known deferred / blocked items

Tracked in `spec/evidence/discrepancies.md` with full repro:

1. `fern.x-fern-pagination.bare-array-unsupported` — Fern CLI
   5.37.9 rejects `results: $response` for bare-array responses.
   The wrapper's hand-written `paginate<T>` / `iterAll` / `iterPages`
   are the supported pagination surface. Re-evaluate on every Fern
   CLI bump. Upstream issue drafted at
   `spec/evidence/fern-issues/bare-array-pagination-results-path.md`
   (internal evidence only — not filed).
2. `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`
   — historical Fern limitation where both `apiKey` and `addonToken`
   were typed as required even though Clockify accepts exactly one.
   The local generator now emits mutually-exclusive auth options; keep
   the discrepancy entry as migration evidence only.
   Issue drafted at
   `spec/evidence/fern-issues/addonToken-or-security-required-fields.md`
   (internal evidence only — not filed).
3. `fern.x-fern-sdk-method-name.drops-resource-modules` — resolved
   in v0.5.0 by pairing `x-fern-sdk-group-name` +
   `x-fern-sdk-method-name`. Coverage: 155 ops / 27 modules /
   91.7% of the 169-op live surface. The other 14 ops use governed
   operationId-derived group/method names. All 169 are generated and
   reachable according to `output/ts-sdk/codegen-receipt.json`; the
   exact 155 explicit / 14 derived split is enforced by the names-only
   `docs/sdk-operation-naming-classifications.json`; every discrepancy anchor
   is reviewed in `docs/operation-evidence-anchor-inventory.json`, and its
   operation attribution or explicit no-applicable-evidence decision is
   checked against source/schema-derived expectations in
   `docs/operation-evidence-semantic-contract.json` before being materialized
   across all 169 rows in `docs/operation-evidence-map.json`. Naming and evidence
   are materialized together for every operation in
   `docs/operation-dispositions.json`.

Re-attempt item 1 only after the upstream gating concern resolves
(Fern issue acknowledged or workaround discovered).

### Shipped live-success waves

Each wave probed the sacrificial sandbox with `Leftovers:0`; full per-op wire-facts
and evidence live in `spec/evidence/discrepancies.md`. Historical denominators are
184 (the op set before the 2026-06-23 surface refresh); the current op set is 169.

| Date | Wave | live-success | Highlights |
|---|---|---|---|
| 2026-06-20 | structural | 46 → 67/184 | 21 read-side GET promotions; expenses + invoices joined `PAGINATED_LIST_OPS` (webhooks left out — non-paginated); consumer `as never` 27 → 7; vitest unified `^4` + re-pinned coverage floors; ten mutation survivors killed |
| 2026-06-21 | write CRUD | 67 → 81/184 | `createExpense` + user-group/webhook/custom-field write CRUD, `updateHoliday`, shared-reports write CRUD; `note` dropped from `ChangeTimeOffRequestStatusRequest.required`; scheduling-totals GET now requires `start`/`end` (400 code 3001 without); `expenses/categories` paginated; webhook SSRF guard blocks NAT64 `64:ff9b::/96` |
| 2026-06-22 | generator + writes | 81 → 87/184 | `$ref` query params restored (`ensure_path_parameters!`) — fixed `scheduling.list` + schedule-totals GETs needing `start`/`end`; `clockify_time_off_requests_delete` rewired to `timeOff.withdraw`; time-off request create/delete, expense delete + category archive, project-membership PATCH/POST |
| 2026-06-22 | CRUD probe | 87 → 111/184 | invoices CRUD + items, time-off policy CRUD, project template/estimate, task rates, expense update + category delete, per-user time-entries, users filter, scheduling user-capacity totals; `/time-entries/invoiced/bulk` deferred (live 404); paginated count 10 → 23 (`$ref` page params) |
| 2026-06-23 | API-key probe | 111 → 129/184 | workspace/user/project-user rates, invoice settings + status, manager-role grant/revoke, remove-user-from-group, member-profile PATCH, time-off balance PATCH, entity-info reads, webhook logs + addon webhooks; flagged ~21 live-404/405 spec ops + 2 missing official ops |
| 2026-06-23 | surface refresh | 184 → 169 ops; 129 → **135/169** | quarantined 17 confirmed-wrong ops via `PHANTOM_PATHS`, added 2 missing official ops (`getWebhookEventStatusesWithLatestLog` live, `addLimitedUsersWithInfo` documented), promoted 6 stragglers; cascaded to the wrapper (dropped dead `.policies` accessor) and CLI/MCP scheduling-create (repointed to live `createRecurring`, since `POST /scheduling/assignments` 404s) |
| 2026-06-23 | schema fidelity | **135/169** (unchanged) | Live-wire audit fixed three response schemas a thin probe-lab schema had shadowed via the generator's first-writer name race: restored `Client.ccEmails`/`currencyId`; corrected `SharedReport` (`isPublic`/`link` + `reportAuthor`/`visibleToUsers`/`visibleToUserGroups`/`fixedDate`/`workspaceId`/`userId`; dropped phantom `url`/`createdAt`/`updatedAt`/`workspace`); added `Webhook.deliveryEnabled`/`planEnabled`. Fixed CLI/MCP shared-reports create/update sending the API-ignored `public` (wire is `isPublic`, live-proved). Added `spec-sync-drift` (SDK↔GOCLMCP byte-parity gate) + a GOCLMCP manifest reverse-completeness check; `secret-hygiene` now catches bare `KEY=value`/`.env` |

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
  > `feat(gen): stamp page+page-size on 18 list endpoints`
- Never push to `main` from a feature branch via PR-merge UI without
  CI green on the PR head. Direct pushes to `main` are reserved for
  hotfixes you can defend in writing.
- Do not amend a published commit. Add a new commit on top.
- Do not skip hooks (`--no-verify`) or bypass signing
  (`--no-gpg-sign`). If a hook fails, fix the underlying issue.

## 11. Doc maintenance

- The retired final-readiness receipt make-target family (the former
  draft/check/final receipt targets and the goal-status report) was removed
  on 2026-05-28. `make enterprise-audit` remains; and
  `scripts/check-enterprise-hardening.mjs` no longer carries a `--final` mode
  or asserts `audit.wiring.finalMakeTarget`. The residual textual references
  across `docs/risk-register.md`, `docs/release-readiness-checklist.md`,
  `docs/maintenance-playbook.md`, and the `scripts/*-plan.mjs` emitters have
  now been removed, with the cross-validating audit/contract markers updated
  in lockstep. Only the historical
  `docs/superpowers/plans/2026-05-26-enterprise-sdk-hardening.md` and
  `docs/decisions/0004-sandbox-only-live-proof.md` records retain the old
  terminology. Restoring or further changing the release workflow is a
  maintainer call — do not invent the targets back without one.
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
- `docs/product-north-star.md` and `docs/superpowers/plans/**` are
  planning/guidance artifacts. Keep them executable: exact files,
  exact commands, explicit non-goals, and no placeholder phrases.
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
   mutually exclusive (see §6, §8.2); the cast is archived Fern-era
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
