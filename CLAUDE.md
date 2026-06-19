# CLAUDE.md

Concise Claude Code guide for `apet97/clockify-ts-sdk`. The canonical
contract is [`AGENTS.md`](./AGENTS.md); read it before edits.

## Product Shape

This standalone repo ships three sibling packages:

| Folder | Package | Current surface |
|---|---|---|
| `wrapper/` | `clockify-sdk-ts-115` | v0.9.0 SDK; dual ESM/CJS; 93 public names; 27 subpaths (incl. `money`, `invoice-body`, `resolve`, `dates`, `ensure`, `requests`, `reports`, `bulk`, `compose`) |
| `cli/` | `@clockify115/cli` | v0.1.0 CLI; bins `clockify115` and `clk115`; 58 commands incl. CRUD for `projects`/`clients`/`tags`/`tasks`/`expenses`, `reports`, `shared-reports`, `users`, `api`, `doctor`, `completion`; `--output table\|json\|ndjson`/`--compact`/`--select` controls |
| `mcp/` | `@clockify115/mcp-server` | v0.3.0 stdio MCP; bin `clockify115-mcp`; 134 tools (21 workflow + 113 domain); 6 resources |

The `-115` / `115` suffix is intentional trademark distance. Default
stance: local/packable packages, not npm publication. Keep
`publishConfig` and `prepublishOnly` gates intact; do not publish or
change release auth unless explicitly asked.

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
make perfect-fast   # local deterministic SDK/CLI/MCP package proof
make perfect-full   # GOCLMCP drift + local codegen/build determinism + package/coverage/mutation/pack smoke
make perfect-live   # explicit sandbox/live cleanup proof
```

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
  packed-consumer smoke, coverage, and wrapper Stryker mutation scoring.
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
npm test -w @clockify115/cli
npm run build -w @clockify115/mcp-server
```

For live MCP sandbox cleanup proof, run from the repo root so the
shell env is inherited:

```bash
cd mcp && npm run verify:live-cleanup
```

Docs-only changes still need:

```bash
make docs-drift
```

## Current Gotchas

- The repo is wired as **npm workspaces** from a root `package.json`
  (`workspaces: ["wrapper", "cli", "mcp"]`) with a single root
  `package-lock.json`. Run `npm ci` at the root, then per-package
  scripts work from either the root (`-w <name>`) or the package dir.
- `output/ts-sdk/**` and `wrapper/src/**` are **gitignored**. A fresh
  clone needs `make sdk-codegen` before SDK package gates can pass.
  The local generator reads `spec/corrected/clockify.corrected.openapi.yaml`
  and does not require Docker, Fern, a hosted SDK-generator account, or
  Clockify credentials.
  Validators (schema-quality, generator-comparison) skip gracefully
  with a clear warning when `wrapper/src/` isn't populated yet.
- `wrapper/src/**` and `output/ts-sdk/**` are generated. Do not edit.
- `spec/corrected/clockify.corrected.openapi.yaml` is generated upstream by
  GOCLMCP. The only accepted diff here is a straight copy from
  `../GOCLMCP/docs/openapi/clockify-openapi.yaml` after GOCLMCP's generator
  and drift gates pass; in that handoff, run the final full proof as
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_ALLOW_GENERATED_DIFF=1 make perfect-full`.
- Some operations live on non-default Clockify hosts (reports →
  `reports.api.clockify.me/v1`, audit-log → `auditlog-api.api.clockify.me/v1`,
  shared/expense reports). The corrected OpenAPI carries a per-operation
  `servers` override and the generator emits `OperationSpec.baseUrl`, so the
  typed SDK methods reach the right host; an explicit `baseUrl`/`environment`
  override still wins (mock/replay). Hand-written code must not assume the
  default host for those resources.
- Not every documented operation is live. Some routes return HTTP 404
  ("No static resource") and are deferred, not shipped as tools
  (`scheduling.calculateUsersTotals`, `projects.archive` — archiving is done via
  project update). Probe a write route's existence with a fake-id request (404
  vs 405) before adding a tool; record dead endpoints in
  `spec/evidence/discrepancies.md`.
- `mcp/src/tools/workflows.ts` is the workflow-first MCP surface.
- MCP receipts should include useful `ids`, `changed`, `warnings`,
  `next`, stable error codes, and recovery hints. Domain
  create/update/delete tools populate `entity` + `changed` via the
  `writeReceipt` helper in `mcp/src/result.ts` (read-only tools stay
  receipt-free).
- `defineTool(server, name, config, handler, recovery?)` in
  `mcp/src/result.ts` is the registration seam every domain and
  workflow tool now uses (no remaining raw `server.registerTool`
  calls in `mcp/src/tools/**`). It forwards the per-tool Zod
  `inputSchema` generic so the handler `args` keep their inferred
  types, wraps the body in the shared `errorResult` catch, and still
  routes through `server.registerTool` so the `output-schema.ts`
  monkeypatch fires. `scripts/check-mcp-write-safety.mjs` matches
  both the `defineTool(server, "...")` and legacy
  `server.registerTool("...")` shapes — keep that matcher in sync if
  the seam's call shape changes.
- `mcp/src/orchestration/confirm-guard.ts` is the shared
  `dry_run` -> `confirm_token` handshake for high-risk workflow
  writes and destructive domain deletes (`entries`, `projects`,
  `clients`, `tags`, `tasks`, `webhooks`). If semantics change,
  update `docs/mcp-write-safety-contract.json`,
  `scripts/check-mcp-write-safety.mjs`, tests, and `mcp/README.md`
  together.
- The holidays, timeOff (policy/request/balance), scheduling, groups
  `add_member`, users grant/revoke-role, and expenses category MCP
  tools resolve supported names **before any write**, via the `resolve`
  SDK subpath and the workflow resolver helpers. A 24-hex id passes
  through; unresolved or ambiguous names stop before mutation as either
  a grounded `clarification` receipt or a structured error, depending
  on the resolver path. Read-filter slots stay list-free. This wiring
  added no tools (the surface is 134).
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
  credentials, private/loopback/link-local/CGNAT/metadata IPs, and
  localhost-ish hostnames, but not DNS rebinding.
- Deleting an ACTIVE project/task/client 400s (live-verified).
  `clockify_projects_delete` archives first (`projects.update({archived:true})`),
  `clockify_tasks_delete` marks DONE (`tasks.update({status:"DONE"})`), and
  `clockify_clients_delete` archives first via the `clients.update` **body envelope**
  (`clients.update({...,body:{name,archived:true}} as never)`) before the DELETE. The
  client path is the subtle one: the generated `clients.update` FLATTENED form drops
  `archived` and `clients.archive` 404s, but the body-envelope form bypasses the field
  whitelist via `core.bodyFromRequest`, so `archived:true` reaches the wire. See
  `spec/evidence/discrepancies.md` (`deletes.archive-first.*`).
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
- `docs/operation-parity.json` and `docs/operation-parity.md` are
  generated by joining OpenAPI operations, SDK method stamps, TS MCP
  tool names, and GOCLMCP tool catalog names; run `make operation-parity`
  after SDK naming or MCP tool changes. Curated joins live in
  `docs/operation-parity-overrides.json`.
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
- `make mutation` runs wrapper-scoped Stryker against hand-written
  helper modules and enforces `docs/mutation-score-contract.json`
  floors. MCP mutation is intentionally not part of this target while
  MCP remains on vitest 2.
- `make build-determinism` builds the wrapper twice and hashes
  `wrapper/dist/**`; it is wired into `perfect-full`, not
  `perfect-fast`.
- `make docs-index-drift` checks `docs/README.md` links and required
  generated surfaces.
- `docs/install-personas.md`, `docs/migration-guide.md`, and
  `docs/dependency-policy.md` are operator-facing hand-written docs.
- `docs/troubleshooting.md` is generated from `docs/error-codes.json`;
  run `make troubleshooting` after error registry changes.
- `make agent-handoff` checks `AGENTS.md`, this file, generated-path
  boundaries, and stale package/tool counts.
- Release-please now files Unreleased→version-bump PRs (the
  `can_approve_pull_request_reviews` repo setting was flipped on
  2026-05-28). `release.yml` still publishes only on a pushed tag
  whose version matches `wrapper/package.json`; that guard is
  load-bearing.
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
| MCP workflow | `mcp/src/tools/workflows.ts` + `mcp/tests/workflows.test.ts` |
| Live cleanup proof | `mcp/scripts/assert-clean-prefixes.mjs` |
| Spec/live discrepancy | `spec/evidence/discrepancies.md` |
| Product direction | `docs/product-north-star.md` |

## Hard Stops

- No `npm publish`.
- No `git push --force`.
- No live tests against customer workspaces.
- No edits to `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`.
- No CI/CD, auth, or release-setting changes unless explicitly asked.
