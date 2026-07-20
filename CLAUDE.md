# CLAUDE.md

Concise Claude Code guide for `apet97/clockify-ts-sdk`. The canonical
contract is [`AGENTS.md`](./AGENTS.md); read it before edits.

Independent, community-built project — **not affiliated with or endorsed by
CAKE.com or Clockify** (the `-115` / `115` suffixes are deliberate trademark
distance; see [`NOTICE.md`](./NOTICE.md)).

## Agent skills

Repo-local Claude Code skills in [`.claude/skills/`](./.claude/skills/) auto-activate
to capture the conventions below — prefer the matching one over re-deriving:

- **`clockify-sdk-verify`** — pick the right gates; run `perfect-fast` safely (blank
  creds, run solo) before claiming a change green.
- **`clockify-sdk-navigate`** — which file to edit (SDK/CLI/MCP/spec) + the
  generated-vs-hand-written boundary + hard stops.
- **`clockify-sdk-add-mcp-tool`** — the full tool-count/contract/test/doc cascade.
- **`clockify-sdk-publish`** — the tag-gated CI release flow (`wrapper-v*`/`cli-v*`/`mcp-v*`).

## Current Hardening Checkpoint (2026-07-12)

- **Coordinated package truth:** the SDK is `0.12.1`, the CLI is `0.3.1`, and the
  TypeScript MCP is `0.6.2`. `version-consistency` reconciles all three package
  manifests with release-please, generated runtime constants, CLI/MCP SDK peer
  ranges, and the MCP bundle manifest.

- **Adversarial-review plan 011 landed (2026-06-29):** all 47 proven
  findings from `plans/011-adversarial-review-findings.md` are
  implemented and `perfect-fast` + `perfect-full` are both green. This
  fixed the HIGH `clockify_fix_entry` PUT-replace data-loss, the
  `ci.yml` packsnapshot self-overwrite false-green, and the codegen
  `(A | B)[]` mis-parse; hardened several false-green
  `scripts/check-*.mjs` gates (write-safety name-based delete backstop,
  `changelog-drift` now enforces vs the base ref, generated-edit /
  aggregate-wiring / mock-contract / version-consistency checks); and
  added webhook-SSRF + demo-cleanup-guard safety. MCP tool count is
  unchanged at 140. New per-gate test scripts live next to their gates
  (`scripts/*.test.mjs`, `scripts/lib/`).
- `main` is the integration branch. Before a direct push, verify the
  branch is even with `origin/main`, make one focused commit, push, and
  watch the resulting GitHub Actions runs.
- Keep local proof laptop-safe. Use focused package/doc gates or
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`
  for deterministic local proof; do not start local mutation,
  coverage, or `perfect-full` while the machine is already loaded.
- Mutation score proof is GitHub-hosted for routine use. `make
  perfect-full` checks the manual **Mutation** workflow wiring via
  `make mutation-ci`; local `make mutation` is opt-in and capped by
  the Stryker configs.
- Never hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`. API-truth changes start in `../GOCLMCP/`, then
  flow through this repo's generator/sync gates.

## Product Shape

This standalone repo ships three sibling packages:

| Folder | Package | Current surface |
|---|---|---|
| `wrapper/` | `clockify-sdk-ts-115` | v0.12.1 SDK; dual ESM/CJS; public names and subpaths governed by `docs/sdk-public-api.json` |
| `cli/` | `@apet97/clockify-cli-115` | v0.3.1 CLI; bins `clockify115` and `clk115`; command metadata is generated into the product surface; `--output table\|json\|ndjson`/`--compact`/`--select` controls |
| `mcp/` | `@apet97/clockify-mcp-115` | v0.6.2 stdio MCP; bin `clockify115-mcp`; tool/resource counts are generated into the product surface |

The `-115` / `115` suffix and the personal `@apet97` scope are
intentional trademark distance. These three are published to npm as
unofficial, community-built packages via CI tag-push. Keep
`publishConfig` and `prepublishOnly` gates intact; do not change release
auth or workflow triggers unless explicitly asked.

The sister repo `../GOCLMCP/` owns the canonical Clockify OpenAPI
generator. Spec-shape changes start there, then flow into this repo's
`spec/corrected/clockify.corrected.openapi.yaml` snapshot. Do not edit
that snapshot by hand.

## First Reads

1. `AGENTS.md`
2. `README.md`
3. `wrapper/README.md`
4. `mcp/README.md`
5. `docs/product-north-star.md`
6. `spec/evidence/discrepancies.md`

## Verify Gates

Preferred root gates:

```bash
make contract-gates # CI-enforced readiness and doc/contract drift suite
make perfect-fast   # local deterministic SDK/CLI/MCP package proof
make perfect-full   # GOCLMCP drift + local codegen/build determinism + package/coverage/pack smoke + mutation-ci
make perfect-live   # explicit sandbox/live cleanup proof
```

Pre-push proof has three tiers: `make contract-gates` is the CI-enforced
readiness/docs-drift suite, `make perfect-fast` is runtime/package proof, and
`make perfect-full` adds heavy proof. `make perfect-live` remains separate
credentialed sandbox proof.

Running `perfect-fast` cleanly (read before your first run):

- **Blank the creds:** `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`.
  With creds set, the live `sandbox.test.ts` suites run and **fail (401) on an
  expired/absent sandbox key**; blanked, they self-skip (`describe.skip`), so the
  run is offline and deterministic. `perfect-fast` is "deterministic" only this way.
- **Run it solo.** The `performance-budgets` sub-gate measures CLI/MCP **startup
  time** (`cli-version` ≤600ms, `mcp-tools-list` ≤1200ms); under CPU contention it
  flakes 6–10× over budget → false reds (not regressions). Don't run other agents or
  heavy commands concurrently. These startup-time checks live ONLY in
  `make perfect-fast` / `make performance-budgets`, not in the focused gates below.
- **Fast inner loop = focused gates** (below); they skip the load-sensitive startup
  budgets. Reserve one full solo `perfect-fast` for the final proof. Note
  `perfect-fast` also runs `lint` (incl. mcp eslint), which the per-package
  `type-check`/`test`/`build` do NOT — run `npm run lint -w <pkg>` before claiming green.
- `make perfect-full` adds slow proof that does not belong in the fast loop:
  GOCLMCP drift, `make codegen-determinism`, `make build-determinism`,
  packed-consumer smoke, coverage, and `make mutation-ci` workflow
  wiring. It does not run local Stryker mutation.
- **`perfect-full` gate-order trap — FIXED.** `performance-budgets` is now the
  **last** prerequisite in both `perfect-full` and `perfect-fast` (it used to run
  *before* pack-smoke/coverage/mutation-ci, so a flake aborted the run and the heavy
  proofs **never ran**). With it last, a load-sensitive startup-time flake can no
  longer skip those proofs. It is still a **fatal** prereq (file-size +
  import/startup-crash budgets block), and it relies on GNU make's serial,
  left-to-right, abort-on-first-failure order — don't pass `-j` (a comment above
  the targets records this). The budget can still flake red on its own under CPU
  contention; when it does, the heavy proofs already ran, so a red there means
  only the startup-time budget flaked — validate solo with `make
  performance-budgets` (and `make mutation`/`make coverage`/`make pack-smoke` if
  needed). Run `perfect-full`/`perfect-fast` solo to avoid the flake.
- `make perfect-fast` runs the make exit code last; capture it directly (a
  `make ... ; echo $?` compound masks make's real status).

No-network operator helpers all route through `scripts/plan.mjs`:

```bash
node scripts/plan.mjs <topic>            # default: markdown to stdout
node scripts/plan.mjs <topic> --format json
```

Topics: `acceptance`, `change-impact`, `examples`, `maintenance`,
`onboarding`, `workflow`, `performance-calibration`,
`release-decision`, `contract-inventory`, `risk-status`. The
individual `scripts/<topic>-plan.mjs` / `<topic>-report.mjs` modules
are libraries now (no standalone CLI). These print plans/reports;
they never run proof gates.

Focused package gates (npm workspaces — root install once, then run
each workspace's scripts):

```bash
npm ci                                                       # root install all 3 workspaces

make sdk-codegen                                             # populate output/ts-sdk/ and wrapper/src/

cd wrapper && npm run type-check && npm test && npm run build && npm run build:smoke && npm pack --dry-run
cd ../cli   && npm run type-check && npm test && npm run build && npm pack --dry-run
cd ../mcp   && npm run type-check && npm test && npm run build && npm pack --dry-run
```

Or from the repo root, equivalently:

```bash
npm run type-check -w clockify-sdk-ts-115
npm test -w @apet97/clockify-cli-115
npm run build -w @apet97/clockify-mcp-115
```

For aggregate live sandbox proof, confirm the sacrificial workspace and
run from the repo root so the shell env is inherited:

```bash
export CLOCKIFY_LIVE_WORKSPACE_CONFIRM="$CLOCKIFY_WORKSPACE_ID"
make perfect-live
```

The root orchestrator generates the run prefix, executes SDK/CLI/MCP/GOCLMCP
separately, always performs dependency-ordered cleanup, and prints one
sanitized JSON receipt. Do not invoke a package live suite directly with
credentials; armed suites require the orchestrator prefix and confirmation.

Docs-only changes still need:

```bash
make docs-drift
```

## Current Gotchas

### Workspace, build & generated paths

- The repo is wired as **npm workspaces** from a root `package.json`
  (`workspaces: ["wrapper", "cli", "mcp"]`) with a single root
  `package-lock.json`. Run `npm ci` at the root, then per-package
  scripts work from either the root (`-w <name>`) or the package dir.
- **Transient tsserver diagnostics during/after `npm install` are not real.**
  Consumers resolve wrapper *types* from `wrapper/dist/**`; while npm re-links the
  workspace (or after `make sdk-codegen` regenerates `wrapper/src/**`), the IDE
  briefly reports `"clockify-sdk-ts-115/requests" has no exported member
  ClockifyRequestBody`, `entityId` missing, or `Promise<ResolvedContext>` on every
  tool. Rebuild the wrapper (`npm run build -w clockify-sdk-ts-115`) and run
  `npm run type-check -w <pkg>` — a clean type-check is the source of truth; the
  squiggles clear once `dist` is current. Note cli/mcp `type-check` scope `src/`
  (tests are checked at runtime), so a stale-typed test file shows in the IDE but
  not in `npm run type-check`.
- `output/ts-sdk/**` and `wrapper/src/**` are **gitignored**. A fresh
  clone needs `make sdk-codegen` before SDK package gates can pass.
  The local generator reads `spec/corrected/clockify.corrected.openapi.yaml`
  and does not require Docker, Fern, a hosted SDK-generator account, or
  Clockify credentials.
  Validators (schema-quality, generator-comparison) skip gracefully
  with a clear warning when `wrapper/src/` isn't populated yet.
- `wrapper/src/**` and `output/ts-sdk/**` are generated. Do not edit.
- **CLI/MCP request assertions are a zero baseline.** Run `make
  consumer-cast-budget`; it uses TypeScript symbol provenance and bounded
  request-bound dataflow for all potentially reaching receiver-qualified
  variable/property writes (including computed keys), ordered receiver aliases,
  parameter defaults, compound/destructuring assignments, nested/defaulted/rest
  bindings, called same-file/imported helper side effects (including nested
  receivers and synchronous `call`/`apply`/`bind`), named/aliased synchronous
  array callback effects on statically recoverable non-empty receivers (`forEach`,
  `map`, `filter`, `every`, `some`, `find`, `findIndex`, `flatMap`, `reduce`,
  and `reduceRight`) with reducer-return propagation and bounded return-aware
  short-circuiting across conditional/logical/sequence receiver alternatives,
  aliased/destructured `Object.assign`/`Reflect.set` plus
  `Object.defineProperty`/`Object.defineProperties`/`Reflect.defineProperty`
  effects with bounded
  left-to-right patch/spread/factory/descriptor provenance, getter returns,
  mutually exclusive descriptor paths, unresolved-map wildcard ordering, and
  definite same-key overwrite semantics across sequential unconditional calls,
  accessors,
  contributing expressions/spreads, direct/chained/
  structural assertions, declaration-only/imported/transitive generic helpers,
  Function `call`/`apply`/`bind`, and symbol-provenance calls erased through
  receivers, methods, helper parameters/results, or holder properties to `any`,
  including later holder writes and exact `Function.call` trampolines.
  Literal and reaching const-literal element access to governed `Object` and
  `Reflect` members preserves built-in symbol identity; overwritten keys and
  shadow/local lookalikes remain non-effects.
  Governed built-ins are normalized through direct/aliased/computed Function
  `call`, bounded static tuple/array `apply` (including statically resolvable
  spreads), and later-invoked `bind` captures before effect classification.
  Mixed local/bound alternatives remain distinct; recursive
  `bind.call`/`bind.apply` adapters are modeled only when the returned function
  is invoked and the reaching member retains native `Function.prototype.bind`
  identity rather than an exact-callable custom/overwritten property; sibling
  callable writes stay isolated. Assignment, `Object.assign`,
  `Object.defineProperty`, `Reflect.defineProperty`, and `Reflect.set` bind-member
  writes are ordered; captured-native or canonical `Function.prototype.bind`
  restoration resumes native normalization even though `Function.prototype`
  itself is not callable. Invoked custom binders contribute synchronous body
  effects before their returned callable; captured receiver effects and later
  definite-write dominance retain runtime order. Immediate nested calls carry
  explicit binder-body then returned-callable phases even at one source
  position. Immediately invoked returned callables are followed recursively
  with incremented phases and refined alternative-path leaves; bounded
  depth/work/alternative exhaustion and unresolved invoked returns fail closed,
  while merely returning a callable remains a non-effect. Mixed native/custom
  bind paths retain normalized write identity, and non-returning custom-binder
  branches keep their path and fail closed only when invoked. Request-
  contributing helper trace-depth exhaustion fails closed; deep uncalled helpers
  and non-contributing helper arguments remain non-effects. Phase cutoff requires
  equivalent receiver/name-qualified definite
  writes on every registered alternative path. Lifted direct assignments retain
  original within-phase sequence and are definite only on unconditional paths
  without a preceding function exit.
  Global-provenance direct/aliased/computed `Reflect.apply` is normalized through
  the same bounded static/spread argument-list path only while its ordered
  reaching member is native; restoration and captured-native aliases remain
  native. Unresolved/invalid governed apply lists fail closed; uninvoked binds
  remain non-effects.
  Receiver-producing calls follow bounded return provenance, not all call
  arguments. Exported/default-exported/escaped callables keep defaults
  reachable; asynchronous, known-empty, unknown-emptiness, and definitely
  short-circuited callbacks are not treated as pre-request effects.
  Alternative, synthetic-invocation, and work overflow fail closed with stable
  governance errors.
  Discarded comma operands are not request contributors. Build generated requests directly and use
  `ClockifyRequestBody<T>` for typed bodies. The canonical CLI/MCP exception
  arrays must remain empty; any future exception needs the full location,
  generated type, discrepancy, open risk, evidence, and closure record. The
  existing Task 6 public-package fixture owns the no-`any` adapter proof, and
  this Make target executes its compiler gate after SDK codegen/build, pinning
  exact `IsAny` semantics, the unshadowed `Parameters` built-in across local and
  all import-clause binding forms, both public
  adapter import/type-argument aliases, and all six callback operands. Local
  structural/built-in counterfeits and comment-only Make prerequisites/recipes
  do not satisfy the check.
- `spec/corrected/clockify.corrected.openapi.yaml` is generated upstream by
  GOCLMCP. The only accepted diff here is a straight copy from
  `../GOCLMCP/docs/openapi/clockify-openapi.yaml` after GOCLMCP's generator
  and drift gates pass; in that handoff, run the final full proof as
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_ALLOW_GENERATED_DIFF=1 make perfect-full`.
### Spec & live-API reality

- Some operations live on non-default Clockify hosts (reports →
  `reports.api.clockify.me/v1`, audit-log → `auditlog-api.api.clockify.me/v1`,
  shared/expense reports). The corrected OpenAPI carries a per-operation
  `servers` override and the generator emits `OperationSpec.baseUrl`, so the
  typed SDK methods reach the right host; an explicit `baseUrl`/`environment`
  override still wins (mock/replay). Hand-written code must not assume the
  default host for those resources.
- **Generated response types must match the live wire, not just the official spec.**
  The GOCLMCP generator resolves schema-name collisions *first-writer-wins*, so a thin
  hand-authored schema in `clockify-api-probe-lab/openapi.yaml` shadows richer fragments
  and silently drops live fields. This dropped `Client.ccEmails`/`currencyId`, broke the
  `SharedReport` response shape (it used `public`/`url`; the wire is `isPublic`/`link`),
  and dropped `Webhook.deliveryEnabled`/`planEnabled`. The same `SharedReport` mismatch
  made the CLI/MCP `--public`/`public` a silent no-op (the wire field is `isPublic`).
  When adding or auditing a schema, diff the generated type against the **live wire**.
  `make spec-sync-drift` (perfect-full only; skips if `../GOCLMCP` absent) now guards that
  `spec/corrected` stays byte-identical to the GOCLMCP canonical — no other gate compared
  the two.
- Not every documented operation is live. Some routes return HTTP 404
  ("No static resource") and are deferred, not shipped as tools
  (`scheduling.calculateUsersTotals`, `projects.archive` — archiving is done via
  project update). Probe a write route's existence with a fake-id request (404
  vs 405) before adding a tool; record dead endpoints in
  `spec/evidence/discrepancies.md`.
- **Probe the live wire before promoting/paginating.** The corrected spec's
  `x-clockify-live-status: live-success` count is evidence-gated (135/169 as of
  2026-06-23 — the 2026-06-23 surface refresh quarantined 17 live-404/405 spec ops,
  added 2 missing official ops, and promoted 6 stragglers, moving the op set 184 → 169
  and live-success 129 → 135/169. The prior 129/184 API-key wave promoted 18 ops
  (workspace/user/project-user rates, invoice settings + status, manager-role
  grant/revoke, member-profile, time-off balance, the entity-info reads, webhook logs +
  addon-webhooks) and flagged ~21 live-404/405 spec ops + 2 missing official ops in
  `spec/evidence/discrepancies.md`;
  the prior 111/184 came from a 2026-06-22 24-op CRUD-probe wave promoting invoices CRUD + items,
  time-off policy CRUD, project template/estimate, task rates, expense update +
  category delete, per-user time-entries, and read-only filters/export, all
  Leftovers:0; an earlier 2026-06-22 wave added time-off request create/delete, expense
  delete + category archive, and project-membership PATCH/POST from live probes
  with Leftovers:0; the 2026-06-21 wave added createExpense +
  user-group/webhook/custom-field write CRUD + updateHoliday + shared-reports
  write CRUD; up from 46 — the
  46→67 wave shipped on
  `2026-06-20`; see the per-package CHANGELOGs and `spec/evidence/discrepancies.md`
  `Re-verified 2026-06-20` lines). Before adding a list op to GOCLMCP's
  `PAGINATED_LIST_OPS`, confirm the live wire honors `page`/`page-size`: expenses
  and invoices DO (added); the **webhooks list IGNORES them** (non-paginated
  envelope — left out on purpose). Creating a time-off request is policy-unit
  dependent: a DAYS-unit policy wants `period:{start,days}` (a `start`/`end` span
  400s "number of days is not allowed"), an HOURS-unit policy wants
  `period:{start,end}` (RFC3339, non-millisecond). The submit tool + CLI now make
  `end` optional and require one of `{end, days}` (see
  `time-off.submit.period-shape-is-policy-type-dependent`). A REJECTED time-off
  request is terminal (no API delete path), so live status-PATCH probes leave a
  residue. `changeTimeOffRequestStatus`'s `note` is live-verified OPTIONAL and, as
  of 2026-06-21, the generated type marks it `note?` (GOCLMCP
  `apply_live_overrides!` drops it from `required[]`), so the tool binds the clean
  body-envelope form — the `wireBody<T>()` escape was dropped.
### MCP tools & write-safety

- `mcp/src/tools/workflows/` holds the workflow-first MCP surface
  (`index.ts` registers the tools; `business`/`review`/`run`/
  `time-tracking`/`resolve`/`plan`/`demo` carry the logic). The
  `mcp/src/tools/workflows.ts` file is just a re-export barrel.
- MCP receipts should include useful `ids`, `changed`, `warnings`,
  `next`, stable error codes, and recovery hints. Domain
  create/update/delete tools populate `entity` + `changed` via the
  `writeReceipt` helper in `mcp/src/result.ts` (read-only tools stay
  receipt-free).
- `defineTool(...)` and `defineGuardedTool(...)` in `mcp/src/result.ts`
  are the only registration seams (no raw `server.registerTool` calls
  in `mcp/src/tools/**`). `defineTool` accepts only `read` and
  `routine_write` names; `defineGuardedTool` accepts only
  `business_write`, `external_side_effect`, `privileged`, and
  `destructive` names from `mcp/src/tool-risk.ts`. Both derive protocol
  annotations and runtime risk metadata. Guarded tools store one
  canonical preview for five minutes and execute that exact stored
  preview once; token calls never recompute resolution or state. If
  semantics change, update `docs/mcp-write-safety-contract.json`,
  `scripts/check-mcp-write-safety.mjs`, tests, and `mcp/README.md`
  together.
- The holidays, timeOff (policy/request/balance), scheduling, groups
  `add_member`, users grant/revoke-role, and expenses category MCP
  tools resolve supported names **before any write**, via the `resolve`
  SDK subpath and the workflow resolver helpers. A 24-hex id passes
  through; unresolved or ambiguous names stop before mutation as either
  a grounded `clarification` receipt or a structured error, depending
  on the resolver path. Read-filter slots stay list-free. This wiring
  added no tools.
- MCP arg-shape forgiveness: list fields accept a bare string
  (`"Bob"` -> `["Bob"]`) and number fields a numeric string
  (`"75"` -> `75`, never `""` -> `0`), via `zStringList` / `zNumberLike`
  in `mcp/src/arg-shapes.ts`. The `z.preprocess` wrappers unwrap before
  validation, so the model-visible JSON Schema (and `docs/mcp-tools.json`
  and the tool count) is unchanged.
- The `errors` SDK subpath gained `mapAddonTokenRestriction(err, { authScheme,
  method?, path? })` + the `AddonTokenRestrictionError` class (`wrapper/errors.ts`):
  a pure **catch-site** helper that names an add-on-token 401 hitting an endpoint
  outside the token's reach (body says "API is not accessible"); API-key 401s pass
  through raw. It is opt-in, not automatic — the SDK error doesn't record the auth
  scheme — mirroring the existing `promoteApiError`. Do not wire it into generated
  code or `createClockifyClient`.
- `clockify_setup_webhook` validates callback URLs through
  `mcp/src/orchestration/webhook-url.ts` before dry-run preview or
  creation. The guard is offline: it rejects non-HTTPS, embedded
  credentials, private/loopback/link-local/CGNAT/metadata IPs (incl.
  IPv4-mapped and NAT64 `64:ff9b::/96` embeddings — `wrapper/webhook-url.ts`
  decodes both), and localhost-ish hostnames, but not DNS rebinding.
  Dotless/hex/octal IPv4 literals are NOT a bypass — Node's WHATWG `URL`
  normalizes them to dotted-decimal before the guard sees the host.
### Live-evidence behaviors & active-entity deletes

- **Live-evidence behaviors (2026-06-21):** the single-project scheduling totals
  GET (`scheduling.listOnProject`) **requires** `start`/`end` — it 400s (code
  3001) without them, so `clockify_scheduling_assignments_list_per_project`
  forwards them on the `projectId` branch. A wrong/missing id 400s with `code:501`
  "doesn't belong to Workspace" and now classifies `not_found` (a status-first
  branch in `wrapper/errors.ts` ahead of the generic 400→`invalid_request`; the
  shared `errorText()` matches message OR body). The time-off submit period is
  policy-unit dependent (DAYS = `start`+`days`, HOURS = `start`+`end`), so
  `clockify_time_off_requests_submit` makes `end` optional and requires one of
  `{end, days}`. See `spec/evidence/discrepancies.md`.
- Deleting an ACTIVE project/task/client 400s (live-verified). The
  project and client archive-then-delete sequences (GET name → archive →
  DELETE, plus the empty-name guard) live once in the wrapper helpers
  `archiveThenDeleteProject` / `archiveThenDeleteClient`
  (`clockify-sdk-ts-115/ensure`); both the CLI (`clk115 projects/clients delete`)
  and MCP (`clockify_projects_delete` / `clockify_clients_delete`) call them.
  The client path is the subtle one: the generated `clients.update` FLATTENED
  form drops `archived` and `clients.archive` 404s, so the helper archives via
  the `clients.update` body envelope (`{...,body:{name,archived:true}}`), which
  bypasses the field whitelist via `core.bodyFromRequest`. `clockify_tasks_delete`
  still marks DONE inline (`tasks.update({status:"DONE"})`) — a different
  replace-PUT shape, not folded into the helper. See
  `spec/evidence/discrepancies.md` (`deletes.archive-first.*`).
### Live creds, sandbox & MCP scope filters

- `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` are live sandbox env
  values. Check presence, never print values. `make sandbox-key-health`
  is the optional live preflight; it exits 0 when creds are blank and
  never prints the key.
- `mcp/src/scope-filter.ts` builds the `{contains, ids, status}`
  user/group scope filter for holidays and time-off. The `status` arg
  splits: time-off **policies** scope `status:"ACTIVE"`
  (`mcp/src/tools/timeOff.ts`), holidays keep the `"ALL"` default
  (`mcp/src/tools/holidays.ts`) — matching the live-verified addon. See
  `spec/evidence/discrepancies.md`
  (`time-off.policies.scope.status-active-not-all`).
### Generated docs, pack snapshots & their make-targets

- `wrapper/.packsnapshot`, `cli/.packsnapshot`, and `mcp/.packsnapshot`
  must be the sorted `npm pack --dry-run --json` file lists. Run
  `make pack-snapshot-check` before push when package contents or CI
  pack steps change.
- `docs/product-surface.json` and `docs/product-surface.md` are generated
  by `scripts/generate-product-surface.mjs`; run `make product-surface`
  after package, workflow, or parity metadata changes.
- `docs/error-codes.md` is generated from `docs/error-codes.json`; run
  `make error-docs` after changing SDK/CLI/MCP recovery semantics.
- `docs/openapi-operations.json` and `docs/openapi-operations.md` are
  generated from `spec/corrected/clockify.corrected.openapi.yaml`; run
  `make openapi-operations` after refreshing the snapshot.
- `docs/operation-dispositions.json`, `docs/operation-parity.json`, and
  `docs/operation-parity.md` are generated by joining the OpenAPI inventory,
  local codegen receipt, governed 14-row operationId-derived naming registry,
  separately reviewed complete discrepancy-anchor inventory, independent
  pagination/route/schema semantic expectations, derived 169-row operation-
  evidence audit, TS MCP tool names, and GOCLMCP tool catalog names; run
  `make operation-parity` after SDK naming or MCP tool changes. Curated MCP
  joins live in `docs/operation-parity-overrides.json`.
- `make openapi-lint` checks local corrected-OpenAPI invariants such
  as operation count, SDK naming coverage, pagination, and Last-Page
  stamps.
- `make generator-independence` checks that generated output remains
  isolated behind wrapper/package seams.
- `make generator-comparison` compares corrected OpenAPI SDK stamps to
  generated TypeScript client methods.
- CLI/MCP README command/tool tables are generated from
  `docs/cli-commands.json` and `docs/mcp-tools.json`; run
  `make readme-tables` after command or tool documentation changes.
### Gates: coverage, mutation, performance, determinism

- `make changelog-drift` checks that touched package scopes update
  their package changelog.
- `make performance-budgets` checks built package file-size and
  startup/import budgets after package build gates. Budgets are
  marked `calibrated` in `docs/performance-budgets.json`. File-size
  ceilings are intentionally tight against current built artifacts
  (the MCP stdio entrypoint is capped at 1250 bytes); startup-time
  ceilings carry more headroom on purpose because shared CI runners
  show meaningful per-run variance. Recalibrate with
  `make performance-receipt` after material runtime changes.
- `make cassettes` replays committed, redacted response cassettes
  through the typed SDK client and local mock server.
- `make mutation` runs Stryker against the hand-written wrapper helper
  modules and the MCP safety-critical modules
  (`mcp/src/orchestration/confirmation.ts`, `mcp/src/result.ts`,
  `mcp/src/tool-risk.ts`), then
  enforces the `docs/mutation-score-contract.json` floors. The MCP run
  mutates the existing Vitest 4 suite — Stryker's vitest-runner accepts
  vitest >=2.0.0, so the unified vitest ^4 across wrapper/cli/mcp is
  supported without extra handling. The contract is two
  packages (wrapper + mcp); floors ratchet monotonic-up.
- **Run Stryker from the repo ROOT** (`make mutation`), never
  `cd wrapper && npx stryker run`: `wrapper/stryker.conf.json`'s
  `mutate`/`configFile`/`tempDirName` paths are repo-root-relative, so from
  `wrapper/` they resolve to `wrapper/wrapper/…` — the run mutates nothing useful
  and leaves a stale `wrapper/wrapper/.stryker-tmp` plus an unchanged
  `wrapper/reports/mutation/mutation.json`. To prove a single mutant flips, apply
  it by hand (sed the source), build, run the test, revert — faster + unambiguous.
- **Coverage floors re-baseline only via a commit.**
  `scripts/check-coverage-floor.mjs` reads the prior floor from
  `git show HEAD:docs/coverage-contract.json` and rejects any downward move, so a
  sanctioned re-pin (e.g. a vitest-major bump's stricter AST-aware counting) reds
  `make coverage` until it is committed — after which the monotonic ratchet
  resumes from the new floors. Lower a floor only after a real measurement change,
  in BOTH the package `vitest.config.ts` AND `docs/coverage-contract.json`.
- `make build-determinism` builds the wrapper twice and hashes
  `wrapper/dist/**`; it is wired into `perfect-full`, not
  `perfect-fast`.
### Operator docs & docs-index drift

- `make docs-index-drift` checks `docs/README.md` links and required
  generated surfaces.
- `docs/install-personas.md`, `docs/migration-guide.md`, and
  `docs/dependency-policy.md` are operator-facing hand-written docs.
- `docs/troubleshooting.md` is generated from `docs/error-codes.json`;
  run `make troubleshooting` after error registry changes.
### Release, CI & handoff

- `make agent-handoff` checks `AGENTS.md`, this file, generated-path
  boundaries, and stale package/tool counts.
- Release-please tracks wrapper, CLI, and MCP package identities and versions.
  `release.yml` still publishes only on a pushed wrapper tag whose version
  matches `wrapper/package.json`; that guard is load-bearing.
- The retired final-readiness receipt make-target family (the former
  `make` targets for draft/check/final receipts and the goal-status report)
  was removed on 2026-05-28; only `make enterprise-audit` remains, and
  `scripts/check-enterprise-hardening.mjs` lost its `--final` mode and the
  `audit.wiring.finalMakeTarget` assertion. The residual textual references
  across `docs/risk-register.md`, `docs/release-readiness-checklist.md`,
  `docs/maintenance-playbook.md`, and the `scripts/*-plan.mjs` plan emitters
  have now been removed and the cross-validating audit/contract markers were
  updated in lockstep. Only the historical
  `docs/superpowers/plans/2026-05-26-enterprise-sdk-hardening.md` and
  `docs/decisions/0004-sandbox-only-live-proof.md` records retain the old
  terminology. Restoring or further changing the release workflow is a
  maintainer call.

## Where To Change Things

| Goal | File |
|---|---|
| SDK wrapper helper/export | root files in `wrapper/`, never `wrapper/src/**` |
| Scoped `Workspace` method (`ensure*`, `iterProjects`/`iterTags`/`iterClients`) | `wrapper/scoped-client.ts` (class methods, not root exports — no `rootSymbols` change) |
| CLI command | `cli/src/commands/*.ts`, wired in `cli/src/index.ts` |
| CLI name→id resolution (`start`/`log`) | `cli/src/commands/resolve-refs.ts` (shared) |
| MCP domain tool | `mcp/src/tools/*.ts`, wired in `mcp/src/server.ts` |
| MCP workflow | `mcp/src/tools/workflows/index.ts` (+ siblings) + `mcp/tests/workflows.test.ts` |
| Aggregate live proof + lock/receipt | `scripts/live/orchestrator.mjs` |
| Dependency-ordered live cleanup | `scripts/live/cleanup.mjs` |
| Spec/live discrepancy | `spec/evidence/discrepancies.md` |
| Product direction | `docs/product-north-star.md` |

## Hard Stops

- No `npm publish` from a laptop (publication is via CI tag-push only).
- No `git push --force`.
- No live tests against customer workspaces.
- No edits to `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`.
- No CI/CD, auth, or release-setting changes unless explicitly asked.
