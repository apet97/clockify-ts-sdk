# Audit Slice C — CLI (`cli/`), gate/script layer (`scripts/`), Makefile, CI workflows (`.github/`)

Auditor slice C of four parallel auditors. Date: 2026-08-06 (repo HEAD `49462f5`).
This report contains **candidate findings only** — nothing was fixed, refactored, or declared correct.
All claims carry file:line or symbol evidence. Confirmed = reproduced by a cheap read-only run or exact source inspection; verified = executed live (read-only commands only, except one accidental read-only API GET noted in C-2).

---

## 1) Scope and commands run

### Inspected (read in full or line-by-line)

- **CLI source (all 35 files)**: `cli/src/{index,client,config,output,error-codes,receipt,duration,completions}.ts`, `cli/src/generated/version.ts`, and all 25 files under `cli/src/commands/` (api, approvals, auditlog, balanceAssignment, clients, doctor, entries, expenses, helpers, invoices, leaf-command, log, projects, reports, resolve-refs, scheduling, sharedReports, start, status, stop, tags, tasks, timeoff, types, users, webhooks).
- **CLI tests (all 40 files)**: read fully or line-by-line: sandbox, exit-contract, entrypoint, command-risk, mutation-leaves, wire-body-migration, read-commands.* (7), crud, crud-create-get, api-command, approvals, archived-flag-help, auditlog, balance-assignment, client, completions, config, doctor, duration, entries, index, invoices, live-sandbox-support(.test), log, mock-clockify, numeric-flags, output, promote-date-boundary, receipt, reports, resolve-refs, sdk-narrow, start, status, stop, timeoff, webhooks. Test names enumerated for every file; full reads of the ones bearing on findings.
- **CLI package files**: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.lint.json`, `vitest.config.ts`, `README.md`, `CHANGELOG.md`, `.packsnapshot`, `.gitignore`, `eslint.config.mjs`, `stryker.conf.json`, `examples/*.sh` (6 scripts).
- **Makefile**: every target line; wiring of `contract-gates` / `perfect-fast` / `perfect-full` / `perfect-live` / `release-proof` / `governance-audit` / `cli-contract` / `cli-write-safety` / `ci-contract` / `coverage` / `mutation*` / `performance-budgets` and all others; `scripts/verify.mjs` + `scripts/lib/verify-plan.mjs` (the fast/full/live/release command authority).
- **Scripts (266 files)**: read in full: `repo-doctor.mjs`, `plan.mjs`, `check-cli-contract.mjs`, `check-cli-write-safety.mjs`, `check-release-dispatch-guard.mjs`, `check-ci-contract.mjs`, `check-env-contract.mjs`, `check-config-precedence.mjs`, `check-mutation-safety.mjs`, `check-sandbox-key-health.mjs`, `check-performance-budgets.mjs`, `check-tag-hygiene.mjs`, `check-version-consistency.mjs`, `check-aggregate-gates.mjs`, `generate-sdk-from-openapi.mjs`, `sdk-codegen/model.mjs`, `generate-package-versions.mjs`, `import-live-evidence-manifest.mjs`, `run-live-proof.mjs`, `live/orchestrator.mjs`, `live/cleanup.mjs`, `update-readme-tables.mjs`, `verify.mjs`, `lib/gate-targets.mjs`, `lib/verify-plan.mjs`, `lib/mutation-score.mjs`, `check-mutation-score.mjs` (head), `check-docs-counts.mjs` (head), `check-live-evidence-currentness.mjs` (head), `mock-clockify-server.mjs` (head), `change-impact-plan.mjs` (head), `check-ci-contract` semantics; skimmed representative bodies of the uniform marker-based gates (`check-live-safety.mjs`, `check-test-data-lifecycle.mjs`, `check-mock-clockify-contract.mjs`, `check-examples-matrix.mjs`) and `check-cli-release-workflow.test.mjs`, `check-mutation-ci-workflow.mjs` references.
- **Workflows (all 8)**: `ci.yml`, `release.yml`, `ci-cli-release.yml`, `ci-mcp-release.yml`, `docs.yml`, `mutation.yml`, `codeql.yml`, `sandbox-key-health.yml` — full reads.
- **Contract docs consumed by gates**: `docs/cli-contract.json`, `docs/cli-commands.json`, `docs/cli-write-safety-contract.json`, `docs/env-contract.json`, `docs/config-precedence-contract.json`, `docs/ci-contract.json`, `docs/examples-contract.json`, `docs/aggregate-gates-contract.json` (relevant parts), `docs/live-safety-contract.json` (head).

### Commands run (all cheap / read-only except where noted)

```bash
git log --oneline -5; git status --short
find cli -type f | sort; wc -l cli/src/**/*.ts cli/tests/*.ts Makefile
grep -n 'it(\|describe(' cli/tests/*.test.ts          # full test inventory
python3 - <<EOF  (read-only JSON dumps of docs/*-contract.json)
node scripts/plan.mjs contract-inventory --format json   # cheap planner; worked
node cli/dist/index.js --region bogus completion bash    # exit 0 (invalid region silently ignored)
node cli/dist/index.js --region bogus --json status      # exit 1 (needs API key; envelope only, no network)
node cli/dist/index.js --subdomain acme --json status    # exit 1
node cli/dist/index.js --output xml status               # exit 2
node cli/dist/index.js completion read nope              # exit 2
node cli/dist/index.js help; help status                 # exit 0
node cli/dist/index.js entries list --limit 1abc         # exit 0 — made ONE read-only GET to the live sandbox (env creds present); see C-2
```

**NOT run** (per task rules): `make perfect-*`, test suites, builds, packs, Stryker, mutation. `git diff --check` and other heavy gates not run. No files modified; the only writes are this report. One unintended side effect: `entries list --limit 1abc` hit the real sandbox API with a read-only GET (creds were present in the shell env). No data was created or modified.

---

## 2) Inventory observations (facts, not findings)

- **Command surface**: 22 top-level groups registered in `cli/src/index.ts` (api, status, doctor, start, stop, log, entries, projects, clients, tasks, tags, webhooks, invoices, expenses, timeoff, scheduling, audit-log, reports, shared-reports, users, approvals, completion). `index.test.ts` pins the 22 names. `leafCommand` classifies **64** terminal leaves: read=29, write=25, destructive=10 (`docs/cli-write-safety-contract.json`; `cli/tests/command-risk.test.ts:20-33`). `docs/cli-commands.json` documents **66** rows (64 leaves + `clk115 help [command]` + `clk115 --version`), and `docs/cli-contract.json` enforces commandCount=66. Counts are mutually consistent.
- **Global flags (9 implemented)**: `--workspace`, `--base-url`, `--region`, `--subdomain`, `--json`, `--output`, `--compact`, `--select`, `--no-color` (`cli/src/index.ts:61-73`).
- **Exit codes implemented**: 0 success/help/version; 1 runtime error; 2 commander usage error (`cli/src/index.ts:214-226`, `isCommanderUsageError`). Enforced by `cli/tests/exit-contract.test.ts`.
- **Config precedence**: flags > env > rc file; rc apiKey rejected as legacy secret (`cli/src/config.ts`); `CLOCKIFY_HOME` overrides homedir; candidates `clockifyrc.json` then `.clockifyrc.json`.
- **Gate architecture**: ~90 leaf gates, almost all "contract JSON declares marker strings → checker asserts markers appear in declared evidence files + wiring anchors (Makefile target, docs/README.md, quality-gates.md, contract-inventory.json, enterprise-hardening-audit.json)". A minority execute real proof: `check-cli-write-safety.mjs` (introspects the built commander tree via tsx + runs vitest on `command-risk.test.ts`/`mutation-leaves.test.ts`), `check-ci-contract.mjs` (parses workflow YAML, enforces SHA-pinned actions, forbids npm publish in ci.yml), `check-release-dispatch-guard.mjs` (structural validation of the 3 release workflows), `check-performance-budgets.mjs` (real spawn timing + file sizes), `check-mutation-score.mjs` (grades Stryker reports vs monotonic floors), `check-version-consistency.mjs`, `check-tag-hygiene.mjs`, `check-sandbox-key-health.mjs`, `verify.mjs` (runs the fast/full/live/release command plans with a tracked-file mutation guard), `scripts/live/*` (lock, fingerprint, bounded cleanup).
- **Verify plans** (`scripts/lib/verify-plan.mjs`): fast = codegen + generator-comparison + package build/lint/type-check/test ×3 + manifest/write-safety drift + pack-snapshot-check + npm-audit + performance-budgets; full adds goclmcp-drift, spec-sync-drift, codegen-determinism, build-determinism, pack-smoke, size-run, coverage-run, mutation-ci.
- **CI surface**: `ci.yml` runs per-package lint/type-check/test/build (Node 22.13.0 + 24) + contract-gates + an extra make list (sdk-codegen-drift, sdk-codegen-test, codegen-determinism, build-determinism, generator-comparison, pack-smoke, coverage, mutation-ci) + npm-audit. Release workflows (tag-only) add contract-gates + release-proof + exact-artifact pack + registry smoke + attestation. No workflow runs `perfect-fast`/`perfect-full`/`perfect-live`/`governance-audit`/`performance-budgets`/`verify.mjs`/`aggregate-gates`.
- **Mutation**: GitHub-only `workflow_dispatch` (`mutation.yml`), gates `make mutation` on `$GITHUB_ACTIONS=true` (Makefile). `cli/package.json` "mutation" script exists and runs Stryker when invoked.
- **Live proof**: `scripts/run-live-proof.mjs` → `live/orchestrator.mjs` with workspace fingerprint pin, exclusive lock with stale-reap, 3-minute cleanup budget, per-surface (wrapper/cli/mcp/goclmcp) command runs, and `live/cleanup.mjs` (17 entity types, prefix-scoped, deadline-guarded).
- **Known docs-count headline**: spec has 168 operations; 161/168 `live-success` (per AGENTS.md and `check-docs-counts.mjs`); CLI docs table has 66 commands.
- **Repro hygiene**: I discovered the shell has live `CLOCKIFY_API_KEY`/`CLOCKIFY_WORKSPACE_ID` set; all further CLI invocations were avoided after the one accidental read-only list.

---

## 3) Findings table

| ID | Category | Severity | Confidence | One-line claim |
|---|---|---|---|---|
| C-1 | Weak test / coverage drift | medium | high | `mutation-leaves.test.ts` pins "30 mutating CLI leaves" but the write-safety contract says 35; 5 mutating leaves (approvals ×2, balance-assignment ×3) have no behavioral success/failure-envelope proof |
| C-2 | Validation gap | low | verified | `parseIntArg`/`parseFloatArg` accept trailing garbage (`--limit 1abc` → 1, sent to the wire); tests only cover `abc`/`0`/negative |
| C-3 | Validation gap / exit-code consistency | low | verified | `--region`/`--subdomain` validate lazily in `buildClient`: invalid value exits 1 (not 2 like `--output`) and is silently ignored by client-less commands (`completion`, `--version`, `help`) |
| C-4 | Stale/broken example | medium | verified | `cli/examples/daily-timesheet.sh` calls nonexistent `clk115 review` and nonexistent `entries list --date`; no gate covers `cli/examples/*.sh` |
| C-5 | Stale comment / typed-seam bypass | low | verified | `webhooks.ts` list passes `type` via untyped `requestOptions` query seam with a comment claiming the generated request "does not own the filter" — it does (`ListWebhooksRequest.type`, `Client.ts:53`) |
| C-6 | Tautological test assertion | low | verified | `sandbox.test.ts` audit-log assertion `json === null || Array.isArray(json) || typeof json === "object"` is always true for any parsed JSON |
| C-7 | Dead code / stale README | low | high | `printSuccess` (`cli/src/output.ts:66-74`) has no production callers; README "success-only commands emit {ok:true,message}" describes output nothing emits |
| G-1 | Gate weakness (drift-proof gap) | medium | verified | `docs/cli-contract.json` `globalFlags` omits `--region`/`--subdomain`; `check-cli-contract.mjs` can only verify listed flags — removing the two flags from the CLI would pass every gate; exit-code "evidence" is substring-based (`toBe(2)` etc. anywhere in the test file) |
| G-2 | Stale gate message | low | verified | `check-tag-hygiene.mjs` claims `release.yml (on.push.tags: "v*.*.*")` publishes on bare semver; release.yml actually triggers on `wrapper-v*.*.*` |
| G-3 | Marker-only gates prove docs self-consistency, not behavior | medium | high | Uniform pattern across ~80 gates; `check-mutation-safety.mjs` checks only marker strings in a policy doc yet the Makefile help claims it checks SDK retry/CLI write/MCP confirmation rules |
| G-4 | `docs/cli-commands.json` is hand-maintained; nothing generates or verifies it against source | low | high | `update-readme-tables.mjs` consumes it; `check-cli-contract.mjs` only cross-checks README; command descriptions/args can drift from `cli/src/**` help text with all gates green |
| W-1 | Dead workflow trigger | medium | verified | `docs.yml` tag trigger `v*.*.*` matches no tag the repo ever creates (`wrapper-v*`/`cli-v*`/`mcp-v*` only; tag-hygiene forbids bare semver) — docs deploy only on main push |
| W-2 | Gates never run in CI | medium | verified | `performance-budgets`, `governance-audit` (incl. `aggregate-gates`, `docs-counts`, `conformance-drift`, `enterprise-audit`), `perfect-fast`/`perfect-full` plans, and `verify.mjs` are executed by no workflow; "Scheduled governance" (Makefile help) has no schedule anywhere |
| W-3 | Registry-smoke failure swallowed | low | verified | All 3 release workflows wrap `registry-smoke.mjs` in `if … then status passed else status failed; fi` — the step always exits 0; a failed post-publish check only lands in the receipt, relying on the later attestation step to fail |
| W-4 | SBOM step best-effort | low | verified | `release.yml` SBOM step is `continue-on-error: true`; a missing SBOM does not fail the release job (deliberate, but "prove and release" claim is softened) |

---

## 4) Detailed findings

### C-1 — mutation-leaves.test.ts inventory (30) is stale vs the write-safety contract (35)

- **Claim**: `cli/tests/mutation-leaves.test.ts` behaviorally proves every mutating CLI leaf's success and structured-failure paths, but its own pin (`expect(cases).toHaveLength(30)`, line 728, "all 30 mutating CLI leaves" describe title) was not updated when 5 mutating leaves were added; the write-safety gate's "behavioral proof" therefore covers only 30 of the 35 mutating leaves.
- **Evidence**:
  - `docs/cli-write-safety-contract.json`: `expected.mutatingLeaves = 35` (`write: 25` + `destructive: 10`); `behavioralTests: ["cli/tests/command-risk.test.ts", "cli/tests/mutation-leaves.test.ts"]`; write list includes `approvals submit-for-user-with-type`, `approvals submit-with-type`, `timeoff balance-assignment create`, `timeoff balance-assignment update`; destructive includes `timeoff balance-assignment delete`.
  - `grep -c "balance-assignment\|submit-with-type\|submit-for-user" cli/tests/mutation-leaves.test.ts` → `0`.
  - `grep -n 'name: "' cli/tests/mutation-leaves.test.ts` → 30 case names; approvals and balance-assignment absent.
  - `scripts/check-cli-write-safety.mjs` runs `vitest run --root cli cli/tests/command-risk.test.ts cli/tests/mutation-leaves.test.ts` as its "behavioral proof" and prints "…35 mutation handlers behaviorally proved" (console message), which is inaccurate: 30 are proved.
- **Impact**: A defect in the failure-envelope/receipt path of the 5 uncovered leaves (e.g. the two `approvals` submits, whose `periodStart` goes into the body unvalidated, or the three balance-assignment writes) passes `make cli-write-safety`, `make contract-gates`, and `make perfect-fast`. The dedicated `balance-assignment.test.ts`/`approvals.test.ts` cover happy paths and some validation, but not the structured-failure/no-receipt contract the mutation-leaves suite enforces for the other 30.
- **Repro**: `grep -c` above; `python3 -c` dump of `docs/cli-write-safety-contract.json` `expected`.
- **Smallest remediation**: add the 5 cases to the `cases` array (or explicitly scope the describe title and contract `behavioralTests` claim), and rename the pin test.
- **Contradictory evidence**: none found; the write-safety contract's leaf counts match the commander introspection (64/25/10), only the behavioral suite is short.

### C-2 — parseIntArg / parseFloatArg accept trailing garbage

- **Claim**: `cli/src/commands/helpers.ts:23-28` (`Number.parseInt(value, 10)` — `"1abc"` → `1`) and `:38-44` (`Number.parseFloat` — `"1.5x"` → `1.5`) accept malformed numeric flags instead of rejecting them at parse time; the guard's stated purpose ("a non-numeric value … would otherwise serialize … reject it at parse time") is only partially fulfilled.
- **Evidence**: verified by execution: `node cli/dist/index.js entries list --limit 1abc` → exit 0 (and, with live env creds present, issued a real read-only GET with `limit=1`). `cli/tests/numeric-flags.test.ts` covers only `abc`, `0`, `-3` — no trailing-garbage cases; `cli/tests/read-commands-paging-validation.test.ts` likewise.
- **Impact**: surprising acceptance of malformed input; `--days 2x` in `timeoff submit` would send `days: 2`. Low, because the parsed value is still a sane number; medium annoyance in scripted usage where a typo silently changes values.
- **Repro**: `node cli/dist/index.js entries list --limit 1abc; echo $?` (exit 0).
- **Smallest remediation**: validate with a full-string regex (`/^\d+$/`) before `Number.parseInt`/`parseFloat`, or use `Number()` + `Number.isInteger`/`Number.isFinite`.
- **Contradictory evidence**: the guard comment at `helpers.ts:23-27` explicitly documents the NaN case; trailing-garbage acceptance is not documented as intended.

### C-3 — --region/--subdomain validated lazily: wrong exit code class + silent acceptance

- **Claim**: (a) `--region bogus`/`--subdomain x` errors at client-build time (`cli/src/client.ts:36-55` `buildRoutingOptions`) → runtime error → **exit 1**, whereas `--output bogus` is a parse-time `InvalidArgumentError` → **exit 2** (`cli/src/index.ts:84-91` `parseOutputMode`, tested in `exit-contract.test.ts:76-93` "returns 2 for an invalid --output, like every other bad flag value"). The README exit-code table (`cli/README.md` "Exit codes") lists 1 = "validation" and 2 = "commander argument error (unknown flag, missing required arg)", so the exit-1 outcome is arguably *documented*, but the CLI's own `--output` precedent classifies bad flag *values* as exit 2. (b) Commands that never build a client (`completion`, `--version`, `--help`, and `doctor`-free paths) silently ignore invalid region/subdomain values.
- **Evidence** (all verified by execution against `cli/dist/index.js`):
  - `node cli/dist/index.js --region bogus --json status` → exit 1, JSON envelope `{"ok":false,"error":"Unrecognized Clockify region \"bogus\"...","code":"invalid_request",...}`.
  - `node cli/dist/index.js --region bogus completion bash` → **exit 0**, completion script printed, nothing on stderr.
  - `node cli/dist/index.js --subdomain acme --json status` → exit 1 with `--subdomain requires --region (got undefined)`.
  - `node cli/dist/index.js --output xml status` → exit 2.
- **Impact**: scripts can't rely on exit 2 for all bad flag values; a user typo in `--region` on a completion/version invocation is silently ignored rather than flagged. Low severity.
- **Smallest remediation**: attach `parseRegionArg`/`parseSubdomainArg` validators to the commander options in `cli/src/index.ts:67-71` (mirroring `parseOutputMode`), so validation is parse-time and uniform.
- **Contradictory evidence**: `doctor` does validate routing offline (`cli/src/commands/doctor.ts:150-156`), so the gap is specifically the non-client commands; exit-contract tests do not cover `--region`.

### C-4 — cli/examples/daily-timesheet.sh is broken and ungoverned

- **Claim**: `cli/examples/daily-timesheet.sh` cannot run: it invokes `clk115 review day --date "$DAY"` (no `review` command exists anywhere in `cli/src/`; the 22 groups are pinned by `cli/tests/index.test.ts`) and `clk115 entries list --date "$DAY"` (`entries list` exposes `--from/--to`, not `--date` — `cli/src/commands/entries.ts:28-29`). No gate covers `cli/examples/*.sh`: `docs/examples-contract.json` names only `wrapper/examples/*`; `scripts/check-examples-matrix.mjs` checks the matrix doc only; `grep -rn "daily-timesheet\|cli/examples" scripts/` → 0 hits; `docs/examples-matrix.md` has no `cli/examples` row.
- **Evidence**: file content (`cli/examples/daily-timesheet.sh:13-17`); `git log --oneline -- cli/examples/daily-timesheet.sh` → created in `6cba7d9` ("feat: land prior-session WIP …") and never touched again; `grep -rn "review" cli/src/` → 0 hits; `grep -n "cli/examples" docs/examples-*.json` → 0 hits.
- **Impact**: the README's "See `examples/` for runnable scripts" pointer (`cli/README.md` "Shell completion" section) steers users to a script that fails on first line; the other 5 scripts are plausible but also never executed by any gate (mock-run.sh's port is hardcoded to the mock server's dynamic port, which `mock-clockify-server.mjs` prints — a second fragility).
- **Repro**: read the file; `grep -rn "review\|--date" cli/src` (no matches).
- **Smallest remediation**: either delete the file or rewrite it to `clk115 status` + `entries list --from/--to`; optionally add a `cli-examples` row to the examples matrix + a shellcheck/`bash -n` gate.
- **Contradictory evidence**: none.

### C-5 — webhooks list type filter: stale comment + untyped query seam

- **Claim**: `cli/src/commands/webhooks.ts:169-172` sends `--type` via `requestOptions({ queryParams: { type } })` with the comment "The list filter is a typed per-request query seam because this operation's generated request body does not own the filter." The generated request **does** own the filter: `wrapper/src/api/resources/webhooks/client/requests/ListWebhooksRequest.ts:7-8` declares `type?: ClockifyApi.WebhookType`, and `wrapper/src/api/resources/webhooks/client/Client.ts:52-54` emits `queryParams: { "type": request.type }`. The typed path `client.webhooks.list({ workspaceId, type })` would work.
- **Evidence**: files cited; `git log -S "typed per-request query seam" --oneline -- cli/src/commands/webhooks.ts` → `c8a928a` "refactor(cli): replace unsafe request bodies" (the comment likely predates the request type gaining `type`).
- **Impact**: cosmetic in the wire (verified `wrapper/src/core/request.ts:54` merges `requestOptions.queryParams` over the typed map, so `type` lands once), but it is exactly the kind of untyped escape hatch the repo's consumer-cast-budget discipline exists to eliminate, and the comment misleads future maintainers. The CLI-side `WEBHOOK_LIST_TYPES` validation is otherwise correct.
- **Smallest remediation**: delete the `requestOptions` seam; pass `type` in the typed request.
- **Contradictory evidence**: the sandbox test `read-commands-webhooks.test.ts:128` ("list accepts a type filter") passes with either implementation — no test pins the seam.

### C-6 — tautological assertion in cli/tests/sandbox.test.ts

- **Claim**: `cli/tests/sandbox.test.ts:469-472` — `expect(json === null || Array.isArray(json) || typeof json === "object").toBe(true)` — is true for **every** `JSON.parse` result (any JSON value is null, an array, or an object); the audit-log live smoke can never fail on shape. The test asserts nothing about the response.
- **Evidence**: file lines; `runCli` at `sandbox.test.ts:112-124` JSON.parses stdout.
- **Impact**: a regression that changes the audit-log output shape (e.g. prints a string) would fail earlier at `JSON.parse` only if the output stops being JSON; a shape change that remains JSON passes. Low.
- **Smallest remediation**: assert the actual envelope (`payload.entries` array or array) or drop the assertion and keep the 200/exit-code check.
- **Contradictory evidence**: the comment says "Clockify returns either an array or a wrapped envelope; both are valid because the live shape isn't documented" — deliberate looseness, but the chosen predicate is vacuous.

### C-7 — printSuccess is dead code; README documents output it no longer emits

- **Claim**: `cli/src/output.ts:66-74` `printSuccess` has no production callers (`grep -rn "printSuccess" cli/src` → only `output.ts` definition; `cli/tests/output.test.ts` uses it). `cli/README.md` ("Output modes") says "success-only commands emit `{"ok": true, "message": "..."}`" — no command emits that shape anymore; receipts carry `ok/action/entity/ids/…` instead. The CHANGELOG (0.5.0) records that `stop` was "the CLI's only `printSuccess` call site" and was converted to a receipt.
- **Impact**: dead code + stale README claim; harmless. Low.
- **Smallest remediation**: delete `printSuccess` + its tests, or update README wording.

### G-1 — cli-contract gate cannot detect removal of --region/--subdomain; exit-code evidence is substring-based

- **Claim**: `docs/cli-contract.json` `expected.globalFlags` lists 7 flags (`--workspace`, `--base-url`, `--json`, `--output`, `--compact`, `--select`, `--no-color`) — the CLI implements 9 (`--region`, `--subdomain` added in 1.0.1 per CHANGELOG). `scripts/check-cli-contract.mjs:214-216` iterates only the listed flags (`for (const flag of contract.expected.globalFlags ?? [])`), so nothing checks `--region`/`--subdomain`. Separately, the exit-code evidence is `if (!exitContractTest.includes("toBe(2)")) fail(...)` (`check-cli-contract.mjs:218-220`) — the literal string anywhere in the test file passes, even if the assertion were attached to the wrong command or the code under test changed.
- **Evidence**: `docs/cli-contract.json:11-20`; `check-cli-contract.mjs:214-216, 218-220`; `cli/src/index.ts:61-73`.
- **Impact**: drift in the two routing flags (removal, rename) is invisible to `make cli-contract`/`perfect-fast`/CI; the gate's "global flags" claim is weaker than its name. Medium for a repo whose whole thesis is drift-proofing (the 1.0.1 changelog explicitly added the region flags while the contract was not updated).
- **Smallest remediation**: add `--region`/`--subdomain` to `expected.globalFlags`; consider parsing `exit-contract.test.ts` assertions instead of substring search (or extend the contract with a `mustNotList` set).
- **Contradictory evidence**: the README documents `--region`/`--subdomain`, so user-facing drift would be caught by doc review; the completion contract test (`completions.test.ts:34`) only pins top-level groups.

### G-2 — check-tag-hygiene.mjs cites a release trigger that no longer exists

- **Claim**: `scripts/check-tag-hygiene.mjs:6-7` and the failure message (`release.yml (on.push.tags: "v*.*.*") publishes on …`) claim `release.yml` publishes on bare `v*.*.*`. `release.yml:5-7` actually triggers on `"wrapper-v*.*.*"` (and `ci-cli-release.yml` on `cli-v*.*.*`, `ci-mcp-release.yml` on `mcp-v*.*.*`). A bare `v1.2.3` tag would not publish anything; it would trigger only `docs.yml` (see W-1).
- **Impact**: gate rationale is stale; the prohibition itself (no bare semver tags) is still desirable to avoid confusion and matches repo convention, so severity is low. The failure text misleads a maintainer about what a bare tag would do.
- **Smallest remediation**: update the comment and message to name `docs.yml` (the only `v*.*.*` consumer) and the package-prefixed triggers.
- **Contradictory evidence**: none.

### G-3 — the marker-only gate pattern proves docs self-consistency, not behavior

- **Claim**: the dominant gate pattern (contract JSON declares `mustContain` marker strings; checker asserts the markers appear in declared evidence files, plus wiring anchors) verifies that *documents mention strings*, not that *code implements the claimed behavior*. The most egregious example: `make mutation-safety` help text says "Check SDK retry, CLI write, MCP confirmation, receipt, and ambiguous-failure rules" but `scripts/check-mutation-safety.mjs` reads `docs/mutation-safety-policy.md` + `docs/mutation-safety-contract.json` and asserts marker presence only — no source file under `wrapper/`, `cli/`, or `mcp/` is inspected (verified by reading the whole script: it reads policy, contract, docs, Makefile). Same pattern for `check-live-safety.mjs`, `check-test-data-lifecycle.mjs`, `check-mock-clockify-contract.mjs`, `check-env-contract.mjs`, `check-config-precedence.mjs` (marker checks on `cli/src/config.ts` text), and ~40 siblings.
- **Evidence**: `scripts/check-mutation-safety.mjs` (full read: `includesAll(policy, contract.policyDocument.contains, ...)`, `for (const evidence of contract.supportingEvidence) includesAll(...)` — no code inspection); Makefile `mutation-safety:` recipe (`node scripts/check-mutation-safety.mjs` only).
- **Impact**: these gates can pass while the underlying behavior is broken (e.g., retry policy inverted in code, receipt fields dropped) as long as the policy doc and contract haven't changed. This is the "gates that prove less than claimed" category. Severity medium for the aggregate claim; individual gates are still valuable as doc-integrity checks and some do run real proof (see inventory).
- **Counter-evidence / nuance**: several gates in the same family *do* execute real checks: `cli-write-safety` (commander introspection + vitest), `ci-contract` (YAML parse + SHA pins), `release-dispatch-guard`, `performance-budgets` (real spawns), `version-consistency`, `tag-hygiene`, `sandbox-key-health`, `docs-counts` (cross-source counts), `check-docs-drift` (git diff --check). So the weakness is per-gate, not universal.

### G-4 — docs/cli-commands.json is hand-maintained; nothing validates it against the CLI source

- **Claim**: `docs/cli-commands.json` (66 rows with descriptions) is generated by no script (`grep -rln "cli-commands" scripts/` → only `update-readme-tables.mjs` (consumes), `check-docs-counts.mjs`, `check-diagnostics-contract.mjs`, `check-cli-contract.mjs`). `check-cli-contract.mjs` verifies each row's `command` string appears in `cli/README.md` (which is regenerated from the same JSON) — a self-consistency loop. Nothing compares the JSON's descriptions/args to the commander tree's `.description()`/`.option()` text.
- **Evidence**: `scripts/update-readme-tables.mjs:31-43`; `scripts/check-cli-contract.mjs:205-211`; `docs/cli-commands.json`.
- **Impact**: help-text drift (e.g. an option renamed in `cli/src` but not in `cli-commands.json`/README) is green across all gates. Note that *adding/removing* a leaf is caught by `cli-write-safety`'s introspection (64-leaf pin), so the gap is metadata/help drift, not command-count drift. Low.
- **Smallest remediation**: extend `check-cli-contract.mjs` (or a new step in `cli-write-safety`) to compare metadata command names against `collectClassifiedLeaves(buildProgram())` paths.

### W-1 — docs.yml tag trigger is dead

- **Claim**: `.github/workflows/docs.yml:4-6` triggers on `tags: ["v*.*.*"]`. The repo only ever creates `wrapper-v*`, `cli-v*`, `mcp-v*` tags (`git tag` output; `release-please-config.json` `include-component-in-tag: true`; `check-tag-hygiene.mjs` forbids bare `v*.*.*`). `v*.*.*` cannot match `wrapper-v1.0.1` (anchored glob starts with `v`). The workflow's stated purpose ("we always want the latest tag's docs on Pages", `docs.yml:19-21` concurrency comment) is unreachable via tags; docs deploy only on main push.
- **Evidence**: `docs.yml:2-6`; `git tag | tail` (all `wrapper-v*`); `scripts/check-tag-hygiene.mjs:7-11`.
- **Impact**: if a release-tag docs deploy was ever expected, it never fires; main-push deploys still keep Pages current. Low-medium (dead trigger, not a security issue).
- **Smallest remediation**: change the trigger to `wrapper-v*.*.*`, `cli-v*.*.*`, `mcp-v*.*.*` (or drop the tag trigger and the comment).

### W-2 — performance-budgets, governance-audit, perfect-* plans, verify.mjs never run in CI

- **Claim**: no workflow executes `make performance-budgets`, `make governance-audit` (which contains `aggregate-gates`, `docs-counts`, `conformance-drift`, `enterprise-audit`, `contract-inventory`, `decision-records`, `test-matrix`, `maintenance-playbook`, etc.), `make perfect-fast`/`perfect-full`, or `node scripts/verify.mjs`. `grep -rn "performance-budgets\|verify.mjs\|aggregate-gates\|governance" .github/workflows/` → 0 hits (only `pack-snapshot.mjs --pkg= --check` per-package appears in ci.yml). The Makefile help calls `governance-audit` "Scheduled governance, inventory, and process checks", but the only cron jobs in the repo are CodeQL and sandbox-key-health.
- **Evidence**: `Makefile` help lines 50-53; `.github/workflows/ci.yml` jobs; `grep -rn "cron" .github/workflows/*.yml`.
- **Impact**: startup-time regressions (cli-version ≤600ms, mcp-tools-list ≤1200ms) and the entire governance/gate-inventory surface are unguarded in CI — a regression reds only a developer who happens to run `perfect-fast`. The repo's own docs treat these as release-relevant. Medium.
- **Smallest remediation**: add a scheduled workflow (weekly) running `make governance-audit` and add `performance-budgets` to the ci.yml contracts job (with the documented `CLOCKIFY_PERF_TIMING=0` escape for contention, or accept flake risk).
- **Contradictory evidence**: release workflows do run `contract-gates` + `release-proof`, which is the documented "release-blocking" pair; the gap is the fast/full plan steps and governance.

### W-3 — registry-smoke failure is recorded, not fatal

- **Claim**: in all three release workflows, `node scripts/registry-smoke.mjs …` is wrapped: `if …; then release-state registry-smoke --status passed; else release-state … --status failed; fi` — the step itself always exits 0 (`release.yml:160-166`, `ci-cli-release.yml:158-164`, `ci-mcp-release.yml:222-228`). A post-publish smoke failure therefore does not fail the job; the failure is only a receipt field. For the SDK/MCP releases the subsequent `release-attestation.mjs` step will usually fail if the package truly isn't on the registry; for the CLI release the attestation step is tag-guarded and would also run. But a smoke failure that is *not* an absence (e.g. timeout with the package present) leaves a green job with `registry-smoke: failed` in the receipt.
- **Impact**: a publish that never became installable can still exit green if attestation can't distinguish; the receipt is the only record. Low (design is receipt-based and documented in `docs/ci-policy.md` markers), but worth recording as an intentional-looking soft spot.
- **Smallest remediation**: `else exit 1` (or capture the failure into `JOB_STATUS`-style step failure) while keeping the receipt write.

### W-4 — release.yml SBOM is best-effort only

- **Claim**: `release.yml` "Generate SBOM" step has `continue-on-error: true` and its `test -s` failure is inside the step; the GitHub release upload step then prints "No valid SBOM file to attach; skipping upload." A release can complete without an SBOM. Same for the wrapper release's "Create or update GitHub release" step which only attaches SBOM if present.
- **Impact**: "Prove and release" claim softened; SBOM consumers get nothing without anyone noticing. Low.
- **Smallest remediation**: make SBOM generation/attach a required (non-continue-on-error) step, or document SBOM as optional in the release notes.

---

## 5) Contradictions, unknowns, and cross-slice notes

### Contradictions observed

1. **AGENTS.md vs CI reality**: AGENTS.md §4 says "`make perfect-fast` … is the CI-enforced readiness/docs-drift suite" — but CI never runs `perfect-fast`; it runs a hand-decomposed subset (`contract-gates` + 8 extra targets). The decompositions cover most members, but not `performance-budgets` or `verify.mjs`'s tracked-state guard (W-2).
2. **`check-cli-write-safety.mjs` console claim vs actual coverage**: it prints "35 mutation handlers behaviorally proved" while the behavioral suite covers 30 (C-1).
3. **`check-tag-hygiene.mjs` message vs `release.yml` trigger** (G-2).
4. **`cli/src/commands/webhooks.ts` comment vs generated request type** (C-5).
5. **`docs/cli-contract.json` globalFlags vs `cli/src/index.ts`** (G-1).
6. **README "success-only commands emit {ok:true,message}" vs code** (C-7).

### Unknowns / requires execution to verify

- **`expenses create/update --date` wire format**: CLI promotes a bare date to `YYYY-MM-DDT00:00:00Z` (`cli/src/commands/expenses.ts:232,291` via `promoteDateBoundary`); the Clockify expense `date` field may be date-only. Only a live sandbox probe can confirm; the sandbox suite does not exercise `expenses create/update` (only list).
- **`audit-log search` page-size cap of 50** (`cli/src/commands/auditlog.ts:132-135`): asserted in help text from the server contract; not independently verified.
- **`webhooks create` USER_ID_TRIGGER_EVENTS rule** (`webhooks.ts:76-78,199-202`): whether `USER_EMAIL_CHANGED`/`USER_UPDATED` truly require USER_ID sources is a live-only fact.
- **`timeoff submit` with both `--end` and `--days`**: both are accepted (no mutual exclusion) — the API's behavior when both are sent is unknown offline.
- **`--select` on missing path → `null`**: deliberate (tested), but a script distinguishing "empty" from "missing" cannot.
- **`projects update` with `--name ""` + another flag**: `--name ""` is silently dropped (`Boolean(opts.name)` in the hasChanges guard and the body builder); deliberate per comment, but a user passing `--name ""` gets no feedback that the name wasn't cleared.
- **docs.yml `v*.*.*` trigger** could have been intended for a legacy bare-tag era; git history shows only `wrapper-v*` tags ever existed locally (remote tags not auditable offline).
- **`check-docs-counts.mjs` "stale-prose denylist"** coverage: read only in part; the live-success headline derivation (lines 138-160) is real.

### Cross-slice drift observed (adjacent slices' surfaces)

- CLI list commands all use `clampPageSize(opts.limit, 200)` except `expenses list` (client-side `listExpensesFiltered` with pageSize 200/maxPages 1000, `--limit` up to 10000) and `audit-log` (50) and `reports detailed` (1000) — documented in help text, consistent.
- `docs/service-routing-matrix.json` / `wrapper/internal/routing.ts` equality is enforced by a wrapper test (out of this slice); CLI region lists are pinned to the SDK union by `client.test.ts:149-166` (verified present).

---

## 6) Verification queue (for the later stronger model)

Cheap, read-only, or already-verified items marked; the rest need execution:

1. **Run `make cli-write-safety`** and confirm the console output's "behaviorally proved" count vs the 30-case suite (C-1). *(already proven statically by grep)*
2. **`node --test scripts/check-cli-contract.test.mjs`** does not exist as a file — confirm `cli-contract` has no unit test of its own checker (only `check-cli-contract.mjs` itself). *(observed: no `check-cli-contract.test.mjs` in scripts/)*
3. **Live sandbox probe** for `expenses create --date <bare>` wire acceptance (unknown above).
4. **`git ls-remote --tags origin`** to confirm no remote bare `v*` tags exist (would re-validate W-1's "dead trigger" as "never used").
5. **Run `bash -n cli/examples/*.sh`** (syntax only, no execution) and, against the mock server, `make mock-clockify` + `mock-run.sh` to confirm the other 5 examples work (C-4).
6. **`node scripts/plan.mjs change-impact --scope cli`** (cheap) to check the change-impact matrix still names the CLI scope targets.
7. **Compare `docs/cli-commands.json` rows against `node cli/dist/index.js --help` output** for each of the 22 groups (help-text drift; G-4). Could be scripted.
8. **`grep -rn "printSuccess" cli/src`** — re-run after any future change (C-7).
9. **Inspect `check-docs-counts.mjs` denylist** fully; verify the "66 commands" prose is not on it (it isn't — the count is derived).
10. **Confirm `docs/ci-policy.md` documents the registry-smoke soft-fail** (W-3) — the contract requires marker `scripts/registry-smoke.mjs` in the policy; whether the policy documents the swallow is unverified.

---

## Final assessment

The CLI slice is unusually well-instrumented: leaf-risk classification with a structural introspection gate, typed request bodies with a zero-cast budget, receipt-shaped write output, and a genuinely deep CI contract (SHA-pinned actions, tag-only release workflows, exact-artifact packing). The gate/script layer is the strongest part of the repo — several gates execute real proof (commander-tree introspection, workflow parsing, Stryker-score grading, live-proof orchestration with locking and fingerprinting).

The confirmed defects are mostly **drift and proof-gap class**, not correctness failures:

- The one substantive coverage hole is **C-1**: 5 of 35 mutating leaves (approvals ×2, balance-assignment ×3) lack the behavioral success/failure-envelope proof that the write-safety gate claims to run for "every mutation handler".
- The one user-facing breakage is **C-4**: `cli/examples/daily-timesheet.sh` cannot run (nonexistent `review` command, nonexistent `--date` flag) and no gate covers `cli/examples/`.
- The most notable gate weaknesses are **G-1** (the CLI contract's own flag list is missing `--region`/`--subdomain` — the exact flags added in 1.0.1), **G-3** (marker-only gates across ~80 checkers prove doc self-consistency, not behavior), and **W-2** (performance budgets and the entire governance surface never run in CI).
- Workflow findings are minor: a dead tag trigger in docs.yml, a receipt-only registry smoke, and a best-effort SBOM.

No critical (data-loss/security) defects were confirmed in this slice. The `--region` lazy-validation (C-3) and `parseIntArg` laxness (C-2) are low-severity UX/contract consistency issues. Everything above was verified by source inspection or cheap read-only execution; items needing heavier or live runs are in §6.
