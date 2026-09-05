# Maintainer notes

Situational detail that does not fit the contributor guide but bites
maintainers regularly. Read the section that matches what you are touching.
The engineering contract is [`CONTRIBUTING.md`](../CONTRIBUTING.md); the gate
catalogue is [`quality-gates.md`](./quality-gates.md).

## Running `perfect-fast` cleanly

- **Blank the credentials:**
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`. With
  credentials set, the live `sandbox.test.ts` suites run and fail (401) on an
  expired or absent sandbox key; blanked, they self-skip (`describe.skip`), so
  the run is offline and deterministic.
- **Run it solo, without `-j`.** The `performance-budgets` sub-gate measures
  CLI/MCP startup time (`cli-version` ≤600ms, `mcp-tools-list` ≤1200ms). Under
  CPU contention it reports false reds 6–10× over budget. These checks live
  only in `make perfect-fast` / `make performance-budgets`, not in the focused
  gates. Budgets are recorded in `docs/performance-budgets.json`; recalibrate
  with `make performance-receipt` after material runtime changes. A budget
  flake is still a red gate: re-validate it alone once the machine is idle.
- **The fast inner loop is the focused gates** (per-package `type-check`,
  `test`, `build`); they skip the startup budgets. Note that `perfect-fast`
  also runs `lint` (including the MCP eslint config), which the per-package
  scripts do not. Run `npm run lint -w <pkg>` before claiming a package green.
- `make perfect-full` adds the whole `contract-gates` suite, GOCLMCP drift,
  `make codegen-determinism`, `make build-determinism`, packed-consumer smoke,
  coverage, and `make mutation-ci` workflow wiring. It does not run Stryker.
- The canonical verify plan (`scripts/lib/verify-plan.mjs`, consumed by
  `scripts/verify.mjs`) owns aggregate order, keeping `performance-budgets`
  fatal, exactly once, and last. Make prerequisites only provide setup; never
  infer execution order from the Makefile layout. The exact-once contract
  across the reached Make graph lives in `docs/aggregate-gates-contract.json`.
- `make perfect-fast` runs the make exit code last; capture it directly. A
  `make ... ; echo $?` compound masks make's real status.
- Transient tsserver diagnostics during or after `npm install` or
  `make sdk-codegen` are not real. Rebuild the wrapper
  (`npm run build -w clockify-sdk-ts-115`) and run `npm run type-check -w <pkg>`;
  a clean type-check is the source of truth. `cli`/`mcp` `type-check` scopes
  `src/` only; tests are checked at runtime.

## Generated versus hand-written paths

- Never hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**`.
  API-truth changes start in the sister repo
  [apet97/go-clockify](https://github.com/apet97/go-clockify), cloned beside
  this repo as `../GOCLMCP`, then flow through this repo's generator and sync
  gates. The only accepted local diff to `spec/corrected/` is a straight copy
  from `../GOCLMCP/docs/openapi/clockify-openapi.yaml` after GOCLMCP's
  generator and drift gates pass; for that handover run
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_ALLOW_GENERATED_DIFF=1 make perfect-full`.
- `make spec-sync-drift` (`perfect-full` only; skips if `../GOCLMCP` is absent)
  guards that `spec/corrected` stays byte-identical to the GOCLMCP canonical.
- `generated-edit-check` fires on `spec/corrected/**` until the change is
  committed; it ignores the ambient `CLOCKIFY_ALLOW_GENERATED_DIFF` bypass on
  purpose. Commit, then re-run.
- The GOCLMCP generator resolves schema-name collisions first-writer-wins, so a
  thin hand-authored schema can shadow a richer fragment and silently drop live
  fields. When adding or auditing a schema, chase the `$ref` chain from the
  operation's `200` response and diff the generated type against the live wire.
  A schema whose body is a bare `allOf: [Other]` is a shadowing stub.
- Hand-written modules live at the `wrapper/` root and in `wrapper/internal/`.
  Adding one means updating `tsconfig.{json,esm.json,cjs.json}` `include`, the
  `package.json` `exports` entry (both `import` and `require` conditions, each
  with `types` + `default`), `wrapper/index.ts`, and the expected-names array
  in `wrapper/scripts/verify-dual-build.sh`. `docs/sdk-public-api.json` governs
  the public names and subpaths; `make sdk-public-api` checks the lockstep.

## Counts are generated

- Tool counts, command counts, public SDK names, and README tables are
  generated: `make product-surface`, `make readme-tables`, `make error-docs`,
  `make troubleshooting`, `make openapi-operations`, `make operation-parity`.
  Each has a matching `*-drift` gate that reds when the checked-in copy is
  stale. Never hand-bump a count in prose; regenerate it and let
  `make docs-counts` prove it.
- The corrected spec marks 161/168 operations
  `x-clockify-live-status: live-success`, each promoted only by a real sandbox
  probe that finished with zero leftovers. `make docs-counts` derives that
  headline from the spec itself, so a re-snapshot that moves it reds the gate
  until the prose is updated.
- Look-alike counts are different metrics. The live-evidence manifest's row
  count, the spec's live-success count, and the operation total each answer a
  different question; never copy one into another's slot.
- `docs/README.md`'s *Generated truth surfaces* table mixes generated and
  hand-maintained files. The `Regenerate` column is authoritative: a command
  means machine-written (never hand-edit); `edit intentionally` means a
  hand-maintained contract you edit alongside its checker and test.
- When the operation total moves, re-pin
  `scripts/lib/operation-parity-contract.mjs`
  (`CANONICAL_SDK_OPERATION_COUNTS`), `scripts/lint-openapi-contract.mjs`,
  `docs/operation-coverage-contract.json`,
  `docs/generator-comparison-contract.json`, `docs/schema-quality-contract.json`,
  `docs/risk-register.json` markers, `docs/openapi-source-lock.json`, and the
  index-based fixtures in `scripts/generate-operation-parity.test.mjs` and
  `scripts/operation-evidence-semantics.test.mjs`.

## A spec re-snapshot invalidates live evidence

`live-evidence-currentness` is in `contract-gates`, so it runs in CI. It binds
the imported manifest, the sanitized receipt, and the operator approval to the
content hashes of every governed input listed in
`docs/live-evidence-currentness-contract.json`. Those inputs include
`spec/corrected/**`, `Makefile`, `package.json`, `package-lock.json`, the
wrapper package manifest and tsconfigs, and the codegen and live scripts.
Changing any of them reds the gate until you re-run the sandbox evidence run
and a human approves the exact artifact hashes.

- Batch every governed edit — spec, versions, `Makefile`, `package-lock.json`
  — before the run, or you pay for it twice.
- Follow the exact approval, import, and currentness steps in
  [`maintenance-playbook.md`](./maintenance-playbook.md#live-evidence-campaign-approval-and-import).
  `make live-evidence-campaign` writes both candidates to
  `scripts/live/.manifest-work/` (gitignored) and prints their SHA-256 values.
  `approvedAt` must fall between run completion and now.
- Staleness is fixed only by a fresh run and exact artifact approval, never by
  editing `docs/live-evidence-currentness.json` to match.
- `docs/openapi-source-lock.json` needs its own approval only when its content
  moves (a re-snapshot that changes the upstream commit or `sourceSha256`).

## Mutation score is GitHub-only

- Never run `make mutation`, `npm run mutation -w <pkg>`, or `npx stryker`
  locally. Dispatch the manual **Mutation** workflow (`workflow_dispatch`,
  target `all`/`wrapper`/`mcp`/`cli`). A local run costs 30+ minutes, pins two
  cores, and writes the report that `scripts/check-mutation-score.mjs` reads,
  so a stale or partial local report yields a wrong score, not a missing one.
  `make mutation-ci` verifies the wiring offline and is the only mutation gate
  in `perfect-full`.
- Dispatch the workflow after every substantive change, not only at release.
  The weekly scheduled run (Mondays 05:00 UTC, `target=all`) is a safety net,
  not a substitute.
- Floors in `docs/mutation-score-contract.json` ratchet monotonic-up. Kill an
  equivalent mutant by proving it (`// Stryker disable next-line` with the
  argument in the comment), never by lowering a floor. To prove a single
  mutant flips, apply it by hand, run that one test, and revert.
- Adding a module to a `mutate` list is a two-step change: dispatch the
  workflow first, then commit the measured floor. `check-mutation-score.mjs`
  requires an exact one-to-one mapping between active mutate sources and
  `moduleFloors`.
- Coverage floors (`docs/coverage-contract.json`) re-baseline only via a
  commit; `scripts/check-coverage-floor.mjs` reads the prior floor from
  `git show HEAD:` and rejects any downward move. Pin floors to the measured
  baseline minus a small margin, in both the package `vitest.config.ts` and
  the contract.
- Comments ship in `dist`, so documentation moves `size-run` (`size-limit`
  measures the emitted bundle). `size-run` is `perfect-full`-only, so a
  doc-only commit can red an aggregate nothing else runs. Raise a ceiling with
  the reason written down.
- A `x !== undefined ? {x} : {}` mapper is a coverage trap: test it with the
  field populated, asserting the value reaches the request body.

## MCP tools and write safety

- `mcp/src/tools/workflows/` holds the workflow-first surface (`index.ts`
  registers the tools). `defineTool(...)` and `defineGuardedTool(...)` in
  `mcp/src/result.ts` are the only registration seams; no raw
  `server.registerTool` calls in `mcp/src/tools/**`. `defineTool` accepts only
  `read` and `routine_write`; `defineGuardedTool` accepts `business_write`,
  `external_side_effect`, `privileged`, and `destructive` from
  `mcp/src/tool-risk.ts`.
- Guarded tools store one canonical preview for five minutes and execute that
  exact stored preview once; token calls never recompute resolution or state.
  If semantics change, update `docs/mcp-write-safety-contract.json`,
  `scripts/check-mcp-write-safety.mjs`, the tests, and `mcp/README.md`
  together. See [`mcp-write-safety-policy.md`](./mcp-write-safety-policy.md).
- Receipts carry `ids`, `changed`, `warnings`, `next`, stable error codes, and
  recovery hints. Domain create/update/delete tools populate `entity` and
  `changed` via `writeReceipt`; read-only tools stay receipt-free.
- Adding or removing a tool moves the tool count through `docs/mcp-tools.json`,
  `docs/product-surface.json`, the README tables, and the `mcp-contract` /
  `mcp-agent-ux` / `docs-counts` gates. Two scripts regex-scan registration
  shape; `operation-parity-drift` is `perfect-full`-only.
- `clockify_setup_webhook` validates callback URLs through
  `mcp/src/orchestration/webhook-url.ts`. The guard is offline: it rejects
  non-HTTPS, embedded credentials, private/loopback/link-local/CGNAT/metadata
  IPs (including IPv4-mapped and NAT64 `64:ff9b::/96` embeddings), and
  localhost-ish hostnames, but not DNS rebinding.
- Deleting an ACTIVE project, task, or client 400s. The archive-then-delete
  sequences live once in `archiveThenDeleteProject` /
  `archiveThenDeleteClient` (`clockify-sdk-ts-115/ensure`); the CLI and MCP
  call them. See `spec/evidence/discrepancies.md` (`deletes.archive-first.*`).

## Live credentials, sandbox, and scope filters

- `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` are live sandbox values.
  Check presence, never print values. `make sandbox-key-health` is the optional
  preflight; it exits 0 when credentials are blank and never prints the key.
- Live suites require the orchestrator prefix and
  `CLOCKIFY_LIVE_WORKSPACE_CONFIRM` equal to the workspace id. Never invoke a
  package live suite directly with credentials. `sha256(workspaceId)` must
  match `docs/live-sandbox-fingerprint.json`; `CLOCKIFY_BASE_URL` must be
  unset for the evidence run.
- `make live-differential` is credentialed and not in any aggregate. It fails
  both on new drift and when a recorded `knownDrift` record stops reproducing,
  so remove an entry after fixing its cause upstream. Over-declaration is
  warn-only; read the receipt's `schemaOnlyCount`.
- `mcp/src/scope-filter.ts` builds the `{contains, ids, status}` user/group
  scope filter for holidays and time-off. Time-off **policies** scope
  `status:"ACTIVE"`; holidays keep the `"ALL"` default. See
  `spec/evidence/discrepancies.md`
  (`time-off.policies.scope.status-active-not-all`).
- A date window is a wall clock, not an instant: the core host re-reads a
  UTC instant in the account's timezone, so a whole-day UTC window is correct
  and a sub-day window is shifted. The reports host honours a `timeZone`
  request field and renders `timeInterval` in it. Never take a day from a
  reports-host timestamp by string slicing.
- Some documented routes are not live (`scheduling.calculateUsersTotals`,
  `projects.archive`). Probe a write route with a fake-id request (404 vs 405)
  before adding a tool; record dead endpoints in
  `spec/evidence/discrepancies.md`. The webhooks list ignores `page`/`page-size`.

## Generated docs and pack snapshots

- `wrapper/.packsnapshot`, `cli/.packsnapshot`, and `mcp/.packsnapshot` must be
  the sorted `npm pack --dry-run --json` file lists. `make pack-snapshot-check`
  is a CI-only pack step, not part of `contract-gates`; run it locally whenever
  package contents change.
- `make changelog-drift` reads the working tree locally but the committed diff
  in CI (via `GITHUB_EVENT_BEFORE` / `GITHUB_BASE_REF`). A commit that touches
  `wrapper/**` without its own `wrapper/CHANGELOG.md` line passes locally and
  reds CI. The scope rule is a path prefix with no exclusions, per commit.
- `make docs-quality` owns parser-backed Markdown integrity (links, images,
  heading fragments, path case, repository escapes, symlink boundaries).
  `node scripts/check-doc-links.mjs --format=json` prints the receipt; exit 1
  reports findings, exit 2 means the scanner failed. Links into `docs/api/**`
  are excluded (gitignored TypeDoc output). `make docs-index-drift` checks
  `docs/README.md` links and required generated surfaces.
- `docs/troubleshooting.md` is generated from `docs/error-codes.json`; run
  `make troubleshooting` after error-registry changes.
- Every non-retired `docs/contract-inventory.json` entry must have its
  `contracts[]` read by some script (`contracts-have-a-reading-script` in
  `check-contract-inventory.mjs`).

## Release ordering

- Tags are package-prefixed (`wrapper-v*` / `cli-v*` / `mcp-v*`); a bare
  `vX.Y.Z` tag is rejected by `make tag-hygiene`. `release.yml` publishes only
  on a tag whose version matches `wrapper/package.json`.
- Tag the SDK first. Both consumers declare a `clockify-sdk-ts-115` peer floor
  matching the SDK surface they import (`^5.2.0`), so `cli-v*` and `mcp-v*`
  must follow `wrapper-v*` on the registry.
- A red release run usually means the publish worked: the workflow's
  registry-propagation check can 404 before npm catches up. Query
  `npm view <pkg> dist.integrity` before reacting; never re-tag on that signal.
- Releasing mid-stream and then merging more work files later commits under
  the released changelog heading. Check
  `git merge-base --is-ancestor <commit> <tag>` before filing anything under a
  released version.
- release-please is retired. `.release-please-manifest.json` and
  `release-please-config.json` stay because `version-consistency` reconciles
  them with the package manifests; never merge a release-please PR.
- `docs/ci-contract.json` is enforced by `check-ci-contract.mjs`
  (`policyDocument`, `workflows[]`, `supportingDocs[]`, `retiredWorkflows[]`,
  `actionPinning`). `actionPinning.enforcedFor` ∪ `knownUnpinned` must name
  every file in `.github/workflows`; the pin regex matches both `uses:` and
  `- uses:`.

## The `dualSurfaceTargets` exception

`docs/aggregate-gates-contract.json` requires every target reached by an
aggregate to execute exactly once. One narrow exception keeps the full
aggregate honest: `dualSurfaceTargets` lists the targets reached by both
`contract-gates` and the verify plan's own recursive Make invocations, so they
genuinely execute twice. Each carries a written reason, is held to exactly two
executions, and is required to still double; a stale declaration reds the
gate. Do not add an entry to silence a duplicate; add one only when the
duplication is real and you can write down why.
