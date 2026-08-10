# Naive instruction walkthrough — 2026-08-10

This receipt records a read-only baseline of the repository instructions. It
does not claim that an implementation or a gate ran.

## Baseline identity

| Field | Value |
|---|---|
| Repository commit | `93e19373a05fb9772d75b3066aa196f975ad219a` |
| Branch | `codex/e2-instruction-baseline-20260810` |
| Subject session | `019fe96d-7e22-7682-a3cb-dd3e140f55c8` |
| Subject state | Fresh, ephemeral, read-only Codex session |
| Checkout | Clean isolated worktree |
| Credential posture | Nine named Clockify, npm, and GitHub variables blank |
| Network/live posture | No network, live Clockify, GitHub, fetch, or install action |

The harness used `env -i` and an empty task-specific `ZDOTDIR`. The empty
`ZDOTDIR` prevented the login shell from loading user startup files. The
subject saw only this checkout and its repository instructions.

This receipt becomes stale when `AGENTS.md`, `CLAUDE.md`,
`docs/agent-tasks/**`, or `docs/gotchas/**` changes materially. Re-run the
walkthrough with a new naive subject before citing it after such a change.

## Task text

The subject stopped before implementation and walked these seven packet tasks:

1. Change existing wrapper helper behavior without adding a public symbol.
2. Add a new public wrapper export or subpath.
3. Add one CLI command.
4. Add one MCP tool.
5. Handle official OpenAPI drift.
6. Handle a live API discrepancy.
7. Execute one roadmap task through its lifecycle.

The subject then walked every data row in the `Change scope | Run` table in
`AGENTS.md` section 4. The live inventories contained seven packets and 16
change-scope rows.

Ratings mean:

- **PASS:** the current instructions were sufficient without broad hunting.
- **PARTIAL:** the instructions were safe, but required extra discovery or
  external context.
- **FAIL:** the task could not finish inside the stated checkout-only boundary.

## Packet walkthroughs

| # | Task | Result | Instruction path and stop boundary |
|---:|---|---|---|
| 1 | Existing wrapper helper behavior | **PASS** | Read `AGENTS.md`, `CLAUDE.md`, `wrapper/README.md`, the helper, and its nearest test. Edit the helper, tests, and changelog only. Do not edit generated SDK/spec paths or public-name contracts. Run wrapper type-check/tests, `make sdk-public-api`, then `make perfect-fast`. Stop if the public name set changes; use the public-export packet instead. (`docs/agent-tasks/fix-sdk-helper.md:3-56`) |
| 2 | New public wrapper export or subpath | **PASS** | Read the SDK public API contract/checker, a comparable helper, wrapper manifests/tsconfigs, the dual-build verifier, and package contract. Keep exports, aliases, smoke names, pack snapshot, product surface, changelog, and headline counts in sync. Do not edit generated SDK/spec paths. (`docs/agent-tasks/update-public-export.md:7-68`) |
| 3 | Add one CLI command | **PASS** | Read command registration, the nearest command, CLI catalog/contracts, and write-safety policy for mutations. Edit command source, registration, tests, catalog, and changelog. Regenerate the README table. Run CLI gates and `make perfect-fast`. (`docs/agent-tasks/add-cli-command.md:6-53`) |
| 4 | Add one MCP tool | **PARTIAL** | The packet correctly covers registration, risk, receipts, exact-count anchors, generated surfaces, package gates, and guarded writes. It does not explicitly require the canonical behavior probe with `tools/list`, one success envelope, one recovery envelope, and cleanup. (`docs/agent-tasks/add-mcp-tool.md:53-83`; `AGENTS.md:409`) |
| 5 | Handle official OpenAPI drift | **FAIL under checkout-only isolation** | The packet safely forbids snapshot edits and routes spec-shape changes through `../GOCLMCP`. The subject could triage the local reports but could not complete upstream work because the harness prohibited sibling-repository reads. (`docs/agent-tasks/handle-official-openapi-drift.md:25-50`) |
| 6 | Handle a live API discrepancy | **PARTIAL** | The packet clearly defines ledger shape, sanitization, forbidden data, and offline gates. Acquiring evidence still needs explicit sandbox authority, endpoint-specific probe design, credentials, and sometimes upstream work. The subject correctly stopped before a live probe. (`docs/agent-tasks/handle-live-api-discrepancy.md:8-57`) |
| 7 | Reconcile a roadmap task | **PARTIAL** | The packet correctly limits work to evidence reconciliation for the completed historical 1.0 campaign. Exact scope depends on the selected row, predecessor receipt, binding brief, external proof, and approvals. It requires the exact closure command and says to stop without claiming completion when any condition remains open. (`docs/agent-tasks/execute-roadmap-task.md:3-96`) |

## Change-scope walkthroughs

| # | Change scope | Result | Required path and primary stop rule |
|---:|---|---|---|
| 1 | GOCLMCP generator | **PARTIAL** | In `../GOCLMCP`, run `make gen-openapi`, all four drift gates, and `go test ./internal/tools/...`. Stop on any failure. The subject could not enter the sibling repository. |
| 2 | GOCLMCP upstream sources | **PARTIAL** | Use the same upstream chain as row 1. Never copy a snapshot downstream before all upstream proof is green. |
| 3 | Corrected snapshot only | **PASS** | Never make a snapshot-only edit. Copy only after upstream proof. |
| 4 | Local TypeScript generator | **PASS** | Run codegen, drift, generator tests, comparison, and all wrapper build gates. Never edit generated output. |
| 5 | Historical Fern config | **PASS** | Keep Fern historical. Do not restore it as the active generator without maintainer approval. |
| 6 | `wrapper/src/**` | **PASS** | Do not edit it. Sync overwrites it. |
| 7 | Wrapper sync script | **PASS** | Run `npm run sync` and inspect the resulting count. Stop if the count or protected scaffolding changes unexpectedly. |
| 8 | Hand-written wrapper root/internal files | **PASS** | Run wrapper type-check, tests, build, build smoke, and pack dry-run. A new module also needs all three tsconfigs, conditional exports, and dual-build names. |
| 9 | Wrapper changelog | **PASS** | Edit with the prompting change. Do not treat changelog text as behavior proof. |
| 10 | Wrapper manifests/config/docs/tests/examples | **PASS** | Run wrapper type-check, tests, and pack dry-run. Stop if examples no longer type-check against the synced SDK. |
| 11 | `cli/**` | **PASS** | Run CLI type-check, tests, build, and pack dry-run. Blank credentials and do not claim live proof. |
| 12 | `mcp/**` | **PARTIAL** | Run MCP type-check, tests, build, and pack dry-run. Behavior changes also need a stdio or in-memory probe with list, success, recovery, and cleanup. The table does not provide an exact probe command. |
| 13 | Documentation guidance | **PASS** | Run the scoped diff check and review referenced package READMEs. Do not let guidance contradict product docs or generated truth. |
| 14 | GitHub workflows | **PARTIAL** | Use `gh workflow view` for lint and stop without explicit authority for CI/auth/security changes. The no-GitHub baseline could not execute this external check. |
| 15 | Dependabot config | **PASS** | Use the configured dependency commit prefixes. GitHub validates later; do not claim local validation. |
| 16 | Wrapper TypeDoc config | **PASS** | Run `npm run docs`. A failure blocks the docs workflow. |

Source: `AGENTS.md:396-413`.

## Findings

1. **MCP packet proof gap.** The add-tool packet omits the success-envelope,
   recovery-envelope, and cleanup probe that `AGENTS.md:409` requires. The
   packet should carry that requirement so a naive contributor does not stop
   after package tests.
2. **Cross-repository boundary.** The official-drift packet correctly routes
   spec changes to sibling GOCLMCP, but a checkout-only subject cannot complete
   that path. A future cross-repo packet must provide the bounded sibling read
   and stop rule.
3. **Live-evidence boundary.** The live-discrepancy packet explains recording
   better than acquisition. A subject still needs explicit sandbox authority,
   endpoint-specific probe instructions, and sanitization review.
4. **Historical roadmap scope.** The roadmap packet is now an evidence
   reconciliation packet. Its title can suggest new execution even though its
   first paragraph correctly forbids it.
5. **External workflow lint.** The workflow row depends on GitHub access. A
   no-GitHub baseline can verify only the stop boundary.

These are baseline findings. This E2 item does not fix them. Later mechanical
items can use this receipt as evidence, but they must keep their own scope and
proof.

## Coverage

| Area | PASS | PARTIAL | FAIL | Total |
|---|---:|---:|---:|---:|
| Packet tasks | 3 | 3 | 1 | 7 |
| Change-scope rows | 12 | 4 | 0 | 16 |
| Combined | 15 | 7 | 1 | 23 |

- Credential variables blank: 9/9.
- Packet tasks walked: 7/7.
- Change-scope rows walked: 16/16.
- Requested workflow rows covered: 23/23.

## Transcript summary

The subject read the repository contract, root and package READMEs, product
north star, contributor guide, discrepancy ledger, packet index, all seven
packets, lifecycle policy, and the relevant historical roadmap/status
references. It used those files to derive each row above. It did not read the
mandated sibling generator because the baseline prohibited files outside this
checkout.

Git printed macOS temporary-cache and fsmonitor warnings inside the read-only
sandbox. `git status --porcelain` stayed empty. No gate, test, build, generator,
package, documentation, network, live, or GitHub command ran.
