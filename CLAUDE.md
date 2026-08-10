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

## Open Follow-Ups (2026-08-10)

These remain open after 5.0.1. Each says who can close it.

- **Rotate the sandbox API key — human only.** The key is in `origin/main`
  history under `.pi-subagents/` and again in `be78c1c2` as a fixture. History
  is not rewritten here and force-push is forbidden, so rotation is the only
  fix. `docs/rejected-findings.md` records the story; add the date when done.
- **Stale probe residue on the sacrificial workspace.** 13 `codex-live-*`
  clients and tags from 2026-05-14 survive there. The 2026-08-09 campaign left
  none. Archive-then-delete them, and verify, when convenient.
- **GOV-1 is a policy question, not a task.** Whether to drop anchor-checking
  from the meta-contract tier needs a maintainer decision, not an agent edit.
  See `docs/rejected-findings.md`.

**A trap the 5.0.0 release created, worth not repeating:** releasing mid-session
and then merging more work leaves later commits filed under the released
changelog heading. PR #90 landed after `mcp-v5.0.0` was tagged, so its entries claimed
fixes the published package did not contain. Check
`git merge-base --is-ancestor <commit> <tag>` before filing anything under a
released version.

## Current Hardening Checkpoint

- **Coordinated package truth:** the SDK is `5.0.1`, the CLI is `5.0.1`, and the
  TypeScript MCP is `5.0.1`. `version-consistency` reconciles all three package
  manifests with the retained `.release-please-manifest.json` (release-please
  itself is retired — see *Release, CI & handoff* below), generated runtime
  constants, CLI/MCP SDK peer ranges, and the MCP bundle manifest.

- **Current surface:** 163 MCP tools (23 workflow/orientation plus 140
  domain), 66 CLI commands, 95 SDK public names across 28 subpaths.
  Never hand-bump a count in prose — regenerate it (`make product-surface`,
  `make readme-tables`) and let `make docs-counts` prove it.
- **The gates are adversarially hardened, and that is load-bearing.** A
  2026-06-29 review found 47 real bugs, several of which were *false-green
  gates* — checks that passed while the thing they guarded was broken. The
  fixes live in the gates themselves and in per-gate test scripts beside them
  (`scripts/*.test.mjs`, `scripts/lib/`). Consequence for you: when a gate
  blocks you, the default assumption is that the gate is right. If you
  genuinely must change one, change it to be *more* precise, never merely
  quieter, and add a test that fails without your fix.
- `main` is the integration branch. Before a direct push, verify the
  branch is even with `origin/main`, make one focused commit, push, and
  watch the resulting GitHub Actions runs.
- Keep local proof laptop-safe — see **Running `perfect-fast` cleanly** below
  before your first run; it is stated once, in full, there.
- Mutation score proof is **GitHub-only**: dispatch the manual **Mutation**
  workflow. Never run Stryker locally (`make mutation` / `npx stryker`).
  `make perfect-full` checks that workflow's wiring via `make mutation-ci`.
  Dispatch it **after every substantive wave**, not only at release: the weekly
  scheduled run (Mondays 05:00 UTC, `target=all`) is a safety net, not a
  substitute, so a regression can still hide for days. One five-day gap
  cost the SSRF guard ~9.5 points and 14 uncovered mutants.
- **A spec re-snapshot invalidates the live-evidence attestation.**
  `spec/corrected/**` is a governed campaign input, so `live-evidence-currentness`
  reds until you re-run `make live-evidence-campaign` (needs
  `CLOCKIFY_LIVE_WORKSPACE_CONFIRM`). Follow the exact approval, import, and
  currentness steps in
  [`docs/maintenance-playbook.md`](./docs/maintenance-playbook.md#live-evidence-campaign-approval-and-import).
  `approvedAt` must fall between campaign completion and now. Batch **every**
  governed edit — spec, versions, `Makefile`, `package-lock.json` — before the
  campaign, or you pay for it twice.
- Never hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`. API-truth changes start in `../GOCLMCP/`, then
  flow through this repo's generator/sync gates.

## Product Shape

This standalone repo ships three sibling packages:

| Folder | Package | Current surface |
|---|---|---|
| `wrapper/` | `clockify-sdk-ts-115` | v5.0.1 SDK; dual ESM/CJS; public names and subpaths governed by `docs/sdk-public-api.json` |
| `cli/` | `@apet97/clockify-cli-115` | v5.0.1 CLI; bins `clockify115` and `clk115`; command metadata is generated into the product surface; `--output table\|json\|ndjson`/`--compact`/`--select` controls |
| `mcp/` | `@apet97/clockify-mcp-115` | v5.0.1 stdio MCP; bin `clockify115-mcp`; tool/resource counts are generated into the product surface |

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
make governance-audit # governance, inventory, and process checks
make release-proof   # release-only coverage, breaking-change, and cast-budget proof
make perfect-fast   # local deterministic SDK/CLI/MCP package proof (does NOT include contract-gates)
make perfect-full   # contract-gates + GOCLMCP drift + local codegen/build determinism + package/coverage/pack smoke + mutation-ci
make perfect-live   # explicit sandbox/live cleanup proof
```

**`perfect-full` runs `contract-gates`; `perfect-fast` does not.** The contract
suite is grouped into four semantic bundles, so the active root has only the
bundle prerequisites and no literal leaf mirror. The internal
`scheduled_governance` name is a tier label, not a cron schedule.
`make governance-audit` runs that tier in CI or on demand. `make release-proof`
runs the three release-blocking proof targets kept out of ordinary PR feedback.

One narrow exception in `docs/aggregate-gates-contract.json` keeps the full
aggregate honest, and it is not an amnesty:

- `dualSurfaceTargets` — five targets are reached by both `contract-gates` and
  the verify plan's own recursive Make invocations, so they genuinely *execute*
  twice. Each carries a written reason, is held to **exactly two** executions,
  and is required to still double; a declaration that goes stale reds the gate.
  Any target not declared there still fails on its second execution.

Do not add an entry to the map to silence a duplicate — add one only when
the duplication is real and you can write down why.

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
  the whole `contract-gates` suite, GOCLMCP drift, `make codegen-determinism`,
  `make build-determinism`, packed-consumer smoke, coverage, and
  `make mutation-ci` workflow wiring. It does not run local Stryker mutation.
- **The canonical verify plan owns aggregate order — not the Makefile's
  layout.** `scripts/lib/verify-plan.mjs` (consumed by `scripts/verify.mjs`)
  keeps `performance-budgets` fatal, exactly once, and *last*, after package
  proof and the heavy full-only gates. Make prerequisites only provide setup;
  never infer execution order from where a target appears in the Makefile.
  The exact-once contract across the reached Make DAG lives in
  `docs/aggregate-gates-contract.json`.
- **Run the aggregates solo and without `-j`.** Parallel make lets
  prerequisite setup contend with the startup-time measurements. A budget
  flake is still a red gate — re-validate it alone with
  `make performance-budgets` once the machine is idle, don't wave it through.
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

Every script also runs from the repo root as `npm run <script> -w <package-name>`.

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

9 topic files under [`docs/gotchas/`](./docs/gotchas/) carry the situational
detail. They are reference material — read the one that matches what you are
touching rather than all of them. Everything a session needs *every* time is
already above this line.

| If you are touching… | Read |
|---|---|
| the workspace layout, builds, or a generated path | [workspace, build & generated paths](./docs/gotchas/workspace-build-generated-paths.md) |
| the spec, a response type, or live-API behavior | [spec & live-API reality](./docs/gotchas/spec-live-api-reality.md) |
| an MCP tool, a receipt, or a write guard | [MCP tools & write-safety](./docs/gotchas/mcp-tools-write-safety.md) |
| a delete path or live-evidence behavior | [live-evidence & active-entity deletes](./docs/gotchas/live-evidence-and-deletes.md) |
| live credentials, the sandbox, or a scope filter | [live creds, sandbox & scope filters](./docs/gotchas/live-creds-sandbox-scope-filters.md) |
| a generated doc or a pack snapshot | [generated docs & pack snapshots](./docs/gotchas/generated-docs-and-pack-snapshots.md) |
| coverage, mutation, performance, or determinism | [gates: coverage, mutation, performance](./docs/gotchas/gates-coverage-mutation-performance.md) |
| an operator doc or the docs index | [operator docs & docs-index drift](./docs/gotchas/operator-docs-and-index-drift.md) |
| a release, CI, or the handoff contract | [release, CI & handoff](./docs/gotchas/release-ci-handoff.md) |

Two facts are load-bearing often enough to keep here rather than behind a link:

- The corrected spec's `x-clockify-live-status: live-success` count is
  evidence-gated at **161/168**, and `make docs-counts` derives that headline
  from the spec itself — so a re-snapshot that moves it reds the gate until this
  prose is updated. Never hand-type it.
- Never hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**`.
  API-truth changes start in `../GOCLMCP/`, then flow through this repo's
  generator/sync gates.

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
