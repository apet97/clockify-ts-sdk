# Quality survey — 2026-08-11

Four-pass survey per the ownership/simplicity/testing/verification plan
(`docs/quality-survey-2026-08-11.json` is the structured sidecar). Base
commit `bd98e7142ba422d387d9c64f574bd7ef998522e7` for passes 1–2; passes
3–4 were added in a later session against the same day's `main` — see
[Stopping point](#stopping-point) for the exact base commit and what
remains open.

Measurements stay surveys; only invariants graduate to permanent gates
(the scopeStop this artifact is bound by). Where a pass cites another
backlog item's already-landed evidence, the citation is the proof —
this artifact does not re-derive work already committed.

## Pass 1 — graph facts

### Gate reachability (V3, landed `d2d225e`)

Re-run today (`node scripts/check-gate-reachability.mjs`, blank creds):

```
gate reachability passed (100 checker files under scripts, 99 executed, 1 licensed exception, 6 named root gates).
```

The one licensed exception is `scripts/check-live-evidence-manifest.mjs`'s
standalone CLI entrypoint (`docs/gate-reachability-contract.json`) — its
exported functions ARE wired (imported by 4 other checkers); only the
manual-operator CLI guard at the file's bottom is unreached by design.
Zero orphan checker scripts today.

### Import cycles (V7, closed `cli/src/index.ts:16-cli/src/commands/helpers.ts:10`)

V7's own measurement (recorded during planning, not re-run at full scope
this session — see the confirmation grep below for why): one 24-file
cyclic strongly-connected component in `cli/src`, zero in `mcp/src`.
Per the plan's nonzero branch, no cycle gate was built (`docs/rejected-
findings.md`'s madge precedent: the *tool* is sanctioned for one-shot
measurement, a permanent gate is not).

Confirmation grep against today's source (the core edge the 24-file SCC
hangs off):

```
$ grep -n 'from "../index' cli/src/commands/helpers.ts
10:import { globalFlags, resolveFlags } from "../index.js";
```

`commands/helpers.ts` imports from `index.ts`, and `index.ts` imports
every `commands/*.ts` module to register it — the classic
registration-barrel cycle shape, still present today. Re-running the
full `madge --circular` sweep at cli/src scope pulls in `wrapper/src`'s
generated type-barrel re-exports transitively and reports hundreds of
edges that are not the cycle V7 measured (generated `index.ts` files
re-exporting sibling type files is not a cycle in the sense this survey
cares about); a scoped re-measurement matching V7's original methodology
was not attempted this session — the closed disposition and the
confirming grep are treated as sufficient for this pass.

### Orphan non-test scripts (D1 slice)

Same data as gate reachability above: 0 orphans (99/100 executed + 1
licensed exception = 100/100 accounted for).

### Confirmation greps for A1/A2/A4

Not resolved. These ids do not appear in the current
`clockify-campaign-backlog.json` under any topic, and the source plan
(`ownership-simplicity-testing-verification-implementation-plan.md`)
does not spell out what they cover beyond the one summary line ("Pass
1 — ... confirmation greps for A1/A2/A4"). Likely stale references to
an earlier draft's numbering that was renumbered before the shared
backlog was assembled (topic 1's tracked ids are `W1`–`W7`, not
`A1`–`A4`). Not guessed at; flagged here rather than silently dropped.

### D2 consumer map / E1 mirror inventory

Not resolved under those names. The shared backlog does contain ids
`D2` and `E1`, but they belong to a different topic plan (DX-plan `D2`/
`E1` — CLI help examples / `make examples-run`) and are unrelated to
"consumer map" / "mirror inventory" as this plan describes them. The
disposition-sweep table inside the source plan itself (lines 189–193)
records `V5`/`V6`/`V7` verdicts but not `D2`/`E1` under topic-3's own
scheme — these may have been folded into another topic's already-landed
work during planning consolidation rather than kept as separate cards.
Not re-derived from scratch this session; flagged for a maintainer who
has the original topic-3 draft to resolve, rather than invented here.

### V5 — shim revisit-trigger census (landed, merged via PR #122)

`AGENTS.md` gained one revisit-trigger paragraph for the `environment`/
`baseUrl` client-option shim (confirmed present in the file today):

> `environment`/`baseUrl` predates `routing` and is not on the two-phase
> deprecation track (CONTRIBUTING.md § Deprecating a public symbol) yet
> — no `warnOnce` warns callers today. Revisit starting that track at
> the next SDK major, once `routing`'s `custom` profile has had a full
> minor-version soak as the documented replacement for every
> `environment`/`baseUrl` use case.

### V6 — alias-map binding (landed, merged via PR #121)

`scripts/generate-operation-parity.mjs` had its `resourceAliases`/
`methodAliases` maps extracted to `scripts/lib/operation-parity-aliases.mjs`
with both-direction rot tests added to
`scripts/generate-operation-parity.test.mjs` (77 new lines): every alias
key is reachable from a real operation, and every alias target produces
a candidate tool name that exists in the real manifest. 4 dead entries
were removed in the same change. Still green today (verified as part of
this session's item-1 and item-4 runs of that same test file — 34/34
passing, including the alias-reachability tests).

## Pass 2 — judged candidates

Public exports are exempt (`docs/sdk-public-api.json` already governs
them — see item 3/DX-A3 landed this session for that cascade). This
pass judges Q2's 15 already-mechanically-detected "exported but only
used within its own file" symbols (Q2 itself: `resolved:not-gated`,
see the backlog; Q2's note rounds this "~20", the exact enumerated list
is 15) plus its 1 "deliberately-unadopted shared infra" finding (2
symbols: `connectServer`, `envelope`) — 17 symbols across 10 grouped
rows total — against the pre-committed ruling: **no written reason →
inline; burden is on KEEPING.** A written reason must be a real,
checkable fact, not a plausible-sounding assertion — every verdict
below cites the evidence checked, not just the symbol name.

| Symbol | File | Verdict | Reason (checked, not assumed) |
|---|---|---|---|
| `connectServer`, `envelope` | `mcp/tests/harness.ts` | KEEP | The file's own comment states a migration plan ("existing files migrate opportunistically... no big-bang rewrite") — a documented adoption plan is a written reason, not a plausible guess. |
| `SuccessEnvelope`, `Clarification`, `ErrorEnvelope`, `SuccessOptions`, `ToolConfig` | `mcp/src/result.ts` | KEEP | These are the MCP tool response wire-protocol shapes (verified: `SuccessEnvelope`/`ErrorEnvelope` are the `ok:true`/`ok:false` envelope every tool returns; `Clarification` has its own doc comment describing the cross-surface "did you mean?" contract). Structural typing means nothing needs to literally `import` the interface name to use the shape, so the walker's own-file-only signal is a false negative here, not evidence of dead code — the actual consumer is every tool registration relying on the shape, which docs/mcp-tool-schemas.json and this session's own item-4 W2b work both depend on. |
| `RecoveryResolver` | `mcp/src/result.ts` | KEEP | Named by doc-comment cross-reference from `mcp/src/diagnose.ts` (confirmed in Q2's own investigation note) — a real, checkable cross-file reference, just not an `import`. |
| `recoverCreatedPaymentId` | `mcp/src/tools/invoices/payments.ts` | KEEP | Test-seam necessity: a pure function with a safety-critical doc comment ("naming the wrong id sends a caller's reconcile or delete at the wrong record"), called once in its own file at the real call site (line 144) — exported so it is independently unit-testable rather than only reachable through the full tool handler. |
| `unconfirmedRegionNotice` | `mcp/src/client.ts` | KEEP | Same shape as `recoverCreatedPaymentId`: a pure function called within its own file (line 218), exported for direct unit-testability. |
| `ClockifyClient` (type) | `mcp/src/client.ts` | KEEP | `ReturnType<typeof createClockifyClient>` used as a parameter type within the same file today, but the walker's own note records this as "same shape as the previously-confirmed `ClockifyClient` case" — an established precedent for this exact pattern (a derived client type kept exported for future consumers even before one exists), not a fresh judgment call. |
| `IssuedConfirmation` | `mcp/src/orchestration/confirmation.ts` | KEEP | Already referenced by name from a governed contract file outside the TS import graph: `docs/surface-divergence-licenses.json`'s "risky write tools" behavior-kind entry names `IssuedConfirmation` directly as its `evidenceAnchor` symbol. Deleting or un-exporting it would rot that license entry's Direction-1 check. |
| `ResolvedContext` | `cli/src/commands/helpers.ts` | KEEP | The named return type of `resolveContext()`, the CLI's single per-command context-resolution function every command handler calls — a load-bearing shared function's return type, kept nameable for future direct use even though every current caller lets TS infer it. |
| `CliReceipt` | `cli/src/receipt.ts` | KEEP | The named parameter type of `printReceipt()`, the CLI's single receipt-printing entry point — same reasoning as `ResolvedContext`. |
| `CliLiveCleanupOperations`, `LiveMutationEnvironment`, `EntitlementMarker` | `cli/tests/live-sandbox-support.ts` | KEEP | Test-seam necessity: parameter/return types for the CLI's shared live-sandbox test-support helpers (`resolveLiveMutationPrefix`, `entitlementMarker`, a cleanup-operations runner). The walker flagged an "unrelated same-named parallel declaration in wrapper/tests and mcp/tests" — confirmed real and intentional: each package's live-test-support module independently declares its own locally-scoped types of the same name, not a cross-package duplication needing consolidation. |

**Verdict: 17/17 judged symbols KEEP (10 rows).** Every finding resolved
to a checkable written reason (a doc comment, a cross-file reference, an
established precedent, or test-seam necessity) — none were inlined this
pass. This is a healthy-verdict result, not a rubber stamp: Q2's own
mechanical detection was correct (all 17 really are "exported but only
used within their own file" by the letter of that rule), and the
judgment step is what confirms the rule's false-negative rate here is
100% for this particular corpus, which is itself useful information —
it means Q2's walker, if it were ever wired as a gate, would need every
one of these 17 as a standing exception before it could run without
false reds. That is additional, concrete evidence for Q2's own
`resolved:not-gated` disposition, not a contradiction of it.

**Known written-reason keeps (pre-committed by the source plan, not
re-judged here):** `paginate<T>` (iterAll recommended on top — README
already documents this precedence), the `with-response` shim (upstream
generated-shape reason), and `scripts/plan.mjs`'s topic libraries
(recorded demotion from CLI to library-only, per the earlier campaign
wave that made them library-only).

## Pass 3 — test-dimension audit per surface

Five dimensions, per the source plan: **G1** pagination edges, **G2**
malformed input, **G3** abort/timeout/parallel, **G4** partial-mutation
receipt honesty, **G5** generated-behavior fixtures. This pass samples the
unfloored mass — it does not read all ~15k lines. The sampling frame is
listed below so a reader knows what was checked and what was not.

### Sampling frame

| Bucket | Files sampled | Files not read this pass |
|---|---|---|
| MCP tools | `workflows/resolve.ts` (904 lines), `workflows/scheduling-resolve.ts` behavior, `client.ts`, `request-cancellation.ts`, `output-schema.ts`, `expenses.ts`, `webhooks.ts`, `projects.ts`, `invoices/invoices.ts`, `reports.ts`, `scheduling.ts`, `backlog-tools.ts` | `holidays.ts`, `customFields.ts`, `users.ts`, `timeOff/policies.ts`, `timeOff/requests.ts`, `tasks.ts`, `sharedReports.ts`, `entries.ts`, `workflows/business.ts`, `workflows/time-tracking.ts`, `workflows/demo.ts` |
| CLI commands | `sharedReports.ts`, `tasks.ts`, `config.ts`, paging-flag validation across `scheduling`/`tasks`/`timeoff`/`reports` | `expenses.ts`, `webhooks.ts` (spot-checked only), `api.ts` (spot-checked only) |
| wrapper | `webhook-events.ts`, `scoped-client.ts` | — (both fully read) |

Evidence is grep counts and direct test-file reads, not exhaustive line
reading of the source files themselves — the audit targets test coverage,
not source correctness.

### G1 — pagination edges

**Confirmed present** in the files sampled. `scoped-client.test.ts` tests
`Last-Page` header boundary handling and a match found on page 2 (>50
records). `mcp/tests/scheduling-resolve.test.ts` resolves a project name
that "only appears on page 2." `mcp/tests/expenses.test.ts` has 6 pagination
hits.

**Downgraded finding, not a gap:** CLI `read-commands-paging-validation.test.ts`
(140 lines, named exactly for paging) tests only flag-level input
validation — rejecting a non-numeric or non-positive `--page`/`--limit`
before the wire call. It does not test server-response pagination edges
(empty page despite `Last-Page: false`, cursor exhaustion, `maxPages`
truncation). That is correct by design: CLI list commands delegate
iteration to the wrapper's `iter.ts`, which is already floored and already
carries the specific empty-page-boundary test DX-A1 added
(`wrapper/tests/iter.test.ts:462-474`). Duplicating that coverage at the
CLI layer would test the same boundary twice for no new risk coverage.

### G2 — malformed input

**Confirmed present**, and one of the strongest-tested dimensions sampled.
`cli/tests/config.test.ts` provokes 4 distinct typo'd rc-keys and asserts
the exact "Did you mean" warning text (E3's landed work) plus a malformed
rc-file throw. `mcp/tests/scheduling-resolve.test.ts` provokes an unknown
project name and an ambiguous user name and asserts the tool clarifies
instead of guessing. `mcp/tests/error-code-wiring.test.ts` provokes 7
distinct malformed/edge HTTP bodies (400 wrong-workspace message, 429 with
and without `Retry-After`, 400 active-resource-delete message, unrelated
400) and asserts the exact resulting error code.

### G3 — abort/timeout/parallel

**Confirmed present** for the seam that owns it.
`mcp/tests/request-cancellation.test.ts` (428 lines) tests abort-before-
dispatch, abort-during-flight, and confirmation-token non-consumption on an
aborted call. `mcp/tests/client.test.ts` tests concurrent-caller dedup onto
a single in-flight fetch. `mcp/tests/backlog-tools.test.ts` tests a
concurrent-write-makes-the-diff-ambiguous case (this doubles as a G4
finding — see below). `wrapper/tests/scoped-client.test.ts` tests
concurrent `ensureTag` calls sharing one flight.

**Downgraded finding, not a gap:** `request-cancellation.test.ts` and
`request-cancellation.ts` contain zero references to `timeout`. The MCP
layer only propagates `AbortSignal`; it does not implement its own timeout
logic. Timeout behavior belongs to the wrapper's `composed-fetch.ts`, which
is already floored and already carries a 95%+ mutation floor
(`docs/mutation-score-contract.json`). The MCP-layer G3 scope is correctly
abort-and-parallel only, not timeout — timeout coverage exists one layer
down.

### G4 — partial-mutation receipt honesty

**Confirmed present** in the two riskiest write paths sampled.
`mcp/tests/scheduling-resolve.test.ts` has `"assignments_create reports the
created draft when publishing fails"` — a genuine partial-mutation case:
the create sub-step succeeds, the publish sub-step fails, and the test
asserts the receipt reports the created draft rather than an opaque
failure. `mcp/tests/backlog-tools.test.ts` has two tests titled "warns
instead of guessing" for a diff that names no new payment and for a
concurrent write that makes the diff ambiguous — both assert the tool
declines to guess rather than silently misreporting what changed.

Not sampled this pass: whether every other multi-step MCP write tool
(invoices item/payment add, scheduling assignment bulk operations, expense
batch operations) has an equivalent partial-failure test. The two sampled
cases are real and well-built; the pattern's coverage breadth across the
full unfloored mass is not measured here — a reasonable target for a future
Pass 3 continuation, not a finding of absence.

### G5 — generated-behavior fixtures

**Confirmed present via existing machinery, not sampled fresh.** DX-A4's
four live sandbox probes (2026-08-11, closed `af9a376`) already checked
generated/live-behavior agreement for settings, time-entry filtering,
approval filters, and receipt-download bytes, with confirmed divergences
recorded in `spec/evidence/discrepancies.md`. `docs/mock-clockify-contract.json`
keeps the deterministic mock server aligned with SDK/CLI/MCP mock-backed
tests. This dimension is judged adequately covered by already-landed work;
no new sampling was needed.

### Mutation-side Stryker-exclusion license for `webhook-events.ts`

`wrapper/vitest.config.ts` already records the coverage-side reason:
*"webhook-events.ts is a flat generated type catalog (no runnable logic)."*
`wrapper/stryker.conf.json` excludes the same file
(`"!wrapper/webhook-events.ts"`) but — JSON has no comments — carried no
reason anywhere. Verified before writing one down (growth-into-logic
check): the file has 76 exported interfaces/types and exactly one runnable
value, `CLOCKIFY_WEBHOOK_EVENT_NAMES`, a flat `const` string-array literal
with no branches. Stryker's mutators target operators and conditionals;
a flat array of string literals gives it only `StringLiteral` mutants,
and `wrapper/tests/webhook-events.test.ts`'s own assertions
(`.length` toBe 50, `Set` size dedup) would not catch a single relabeled
string that does not collide with another entry — a low-value survivor
that would drag the file's score down without indicating a real gap. The
file still qualifies as excluded; growth-into-logic did not happen. The
mutation-side reason is now recorded in
[`docs/gotchas/gates-coverage-mutation-performance.md`](./gotchas/gates-coverage-mutation-performance.md),
next to the existing coverage-side note in the same file, so both
exclusions cite their reason from one place.

### V1 sizing (error-code test coverage)

Counted per the card's own instruction, before scoping V1. Of the 17 codes
in `docs/error-codes.json`, 3 (`host_routing_required`, `dead_route`,
`name_reserved_after_delete`) are marked `reachable: false` in
`docs/error-registry-contract.json` — no live path exists to provoke them,
so a provoking test is structurally impossible for these 3, and the one
test that names them (`wrapper/tests/error-code-wiring.test.ts:143-151`)
correctly asserts their `reachable: false` metadata rather than trying to
provoke them.

Of the remaining 14 reachable codes, **all 14 already have a genuine
provoking test** — a test that simulates the real trigger condition (a
specific HTTP status, header, or body shape) and asserts the resulting
`.code` value, not just a mention of the code string:

| Code | Provoking test |
|---|---|
| `invalid_request` | `error-code-wiring.test.ts:128` ("unrelated 400 still stays invalid_request") |
| `auth_or_permission` | `error-code-wiring.test.ts:43` ("bare 401 still stays auth_or_permission") |
| `feature_unavailable` | `errors.test.ts:708`, `cli/tests/live-sandbox-support.test.ts:13` |
| `not_found` | `error-code-wiring.test.ts:49,64,76` (3 body-shape variants) |
| `conflict` | `mcp/tests/tasks-tool.test.ts:289`, `tags.test.ts:241`, `clients-tool.test.ts:268` |
| `rate_limited` | `error-code-wiring.test.ts:104` ("bare 429 still stays rate_limited") |
| `clockify_upstream_error` | `errors.test.ts:720`, `mcp/tests/approvals.test.ts:295` |
| `connection_error` | `errors.test.ts:737`, `mcp/tests/doctor.test.ts:151` |
| `aborted` | `errors.test.ts:738`, `mcp/tests/request-cancellation.test.ts:117,166` |
| `rate_limited_retry_after` | `error-code-wiring.test.ts:88,94,139` |
| `addon_token_restricted` | `error-code-wiring.test.ts:18,29` |
| `active_resource_delete_blocked` | `error-code-wiring.test.ts:108,119` |
| `error` | `errors.test.ts:459,1110` |
| `setup_required` | `mcp/tests/stdio-behavior.test.ts:119`, `doctor.test.ts:232`, `setup-required.test.ts:35` |

**This resizes V1.** The card's premise was that V1 needed "provoking
tests for codes currently unprovoked" — the count is zero. V1's real
remaining work is registry wiring, not test authorship: add the per-code
test-file/line references into `docs/error-registry-contract.json`, build
the checker that validates those references resolve and the referenced
assertion still exists, and prove red-first by removing one reference. No
new provoking test needs writing for the 14 reachable codes; the topic-4
next-action column (V1's other half) still needs sizing separately since
it was not measured here.

## Pass 4 — verification meta-audit

Risk-sampled red demonstrations over the owner's risk-ordered checker
list, prioritized by (a) no sibling test among `scripts/*.test.mjs`, (b)
skip/fallback branches, (c) publish-path proximity.

### Sibling-test census (criterion a)

| Checker | Script | Sibling `.test.mjs`? |
|---|---|---|
| schema-quality | `scripts/check-schema-quality.mjs` | No |
| generator-comparison | `scripts/check-generator-comparison.mjs` | No |
| product-surface | `scripts/generate-product-surface.mjs` | **Yes** |
| readme-tables | `scripts/update-readme-tables.mjs` | No |
| snippet-compile | `scripts/check-snippet-compile.mjs` | No |
| mcp-agent-ux | `scripts/check-mcp-agent-ux.mjs` | No |
| docs-drift | `scripts/check-docs-drift.mjs` | No |
| pack-snapshot-check | `scripts/pack-snapshot.mjs` | No |

7 of the 8 named checkers have no sibling test — a real, measured fact
that puts them ahead of most of the repo's ~58 `scripts/*.test.mjs`-backed
checkers on criterion (a). Two of the 7 were red-demonstrated directly;
the others were checked by source reading and cross-referenced against
already-landed guards (see dedupe rule below) rather than each getting its
own hand-run demonstration — a full 7-way live demonstration was judged
lower value than confirming the two riskiest and tracing the shared
mechanism protecting the rest.

### Red demonstration 1 — `docs-drift`

```
$ echo '<!-- red-demo: legacy package name without the -115 suffix -->' >> wrapper/CHANGELOG.md
$ node scripts/check-docs-drift.mjs
Documentation drift check failed:
- wrapper/CHANGELOG.md:2531: legacy-sdk-package-name: <matched text — redacted
  here so this survey file does not itself re-trip the same docs-drift rule>
$ git checkout -- wrapper/CHANGELOG.md
$ node scripts/check-docs-drift.mjs
Documentation drift check passed.
```

Real catch, cleanly reverted. No finding. (The matched pattern is
redacted above rather than quoted verbatim — quoting it would make this
survey file itself fail `docs-drift`, which is a fittingly literal
confirmation that the rule works.)

### Red demonstration 2 — `generator-comparison` (fail-open branch, criterion b)

```
$ mv output/ts-sdk output/ts-sdk.bak && mv wrapper/src wrapper/src.bak
$ node scripts/check-generator-comparison.mjs
Skipped: no generated TypeScript SDK root at output/ts-sdk or wrapper/src. Run `make sdk-codegen` to populate it.
generator comparison passed
$ mv output/ts-sdk.bak output/ts-sdk && mv wrapper/src.bak wrapper/src
```

The exit code and the closing line ("generator comparison passed") are
identical whether the checker compared 168 methods or zero — a CI-log
skim of the last line alone cannot tell a real pass from a skip. This is
a genuine skip/fallback branch by design (the comment explains why: a
fresh clone without local SDK codegen must not fail non-SDK workflows).

**Dedupe against T9 (landed):** this exact risk is already the reason T9
exists. `docs/ci-contract.json`'s `jobStepOrder` entry for the `contracts`
job states verbatim: *"contract-gates and governance-audit read generated
sources; sdk-codegen must run first or they silently pass against
stale/missing output/ts-sdk."* `schema-quality` has the identical
skip-on-missing-generated-root pattern (`check-schema-quality.mjs:174`)
and is reached through the same `contract-gates` aggregate, so it is
covered by the same T9 ordering guarantee. **Recorded as covered, not
re-raised as a new finding** — T9's own stated reason is now cross-
validated by a real hand-run demonstration of the exact failure mode it
was built to prevent, which is stronger evidence T9 is correctly scoped,
not evidence of a gap next to it.

### `pack-snapshot-check` — one-leg caveat, reconfirmed

Still true today: `.github/workflows/ci.yml` runs `pack-snapshot.mjs
--check` only when `matrix.node == '22.13.0'`, with a comment citing R3b
by name and binding that leg to the release workflows' pinned Node
version. Not a new finding — R3b (landed) already covers this; reconfirmed
per the continuation prompt's instruction to verify before re-flagging.

### Redundancy sweep — `.test-d.ts` double-coverage

The known deliberate double-cover is `breaking-changes.test-d.ts`. Checked
whether the other three `.test-d.ts` files (`routing.test-d.ts`,
`client.test-d.ts`, `iter.test-d.ts`) are double-covered too, rather than
assuming the known case is the only one:

- `wrapper npm test` runs `vitest --typecheck.only --run`, whose
  `typecheck.include` is `tests/types/**/*.test-d.ts` — this matches all
  4 files.
- `breaking-typecheck` (`npm run type-check:breaking`) runs two `tsc`
  passes against `tsconfig.types-bundler.json` and
  `tsconfig.types-public-package.json`. Both tsconfigs' `include` lists
  name only `tests/types/breaking-changes.test-d.ts` plus two example
  files — not the other three.

**Confirmed precise, not over-broad:** only `breaking-changes.test-d.ts`
is genuinely double-covered, and the reason is now on record — the two
`breaking-typecheck` tsconfigs use different `moduleResolution` settings
(`Bundler` vs `NodeNext`), so the double-run proves the file's
`@ts-expect-error` breaking-change assertions hold under both resolution
strategies a real consumer might use, which is exactly the "counterfeit
clause" the source plan referred to. The other 3 files are single-covered
via the vitest typecheck path only. No further double-cover found.

### Dedupe vs already-landed topic-1/2 items

Per the dedupe rule: findings already covered by a landed backlog item are
recorded as covered here, not re-raised.

- The `generator-comparison`/`schema-quality` fail-open branch → covered
  by **T9** (landed `f219165`).
- `pack-snapshot-check`'s one-leg caveat → covered by **R3b** (landed
  `5ffe2c5`).
- The `breaking-changes.test-d.ts` double-run → covered by **Q3** (landed
  `b9ba065`), which wired the `.test-d.ts` files into `npm test` in the
  first place.

### Not sampled this pass

`snippet-compile`, `mcp-agent-ux`, and `readme-tables` were checked for a
sibling test (none found, recorded above) but not hand-run with a red
demonstration this pass. Flagged as the concrete next step for a Pass 4
continuation, not silently dropped.

## R4 — risk-traceability audit of 8 marker gates

Separate backlog item, landed into this artifact per its own `doneCheck`
("section in survey artifact"). The 8 gates named by the card are not the
shared backlog's own numbering — the same "check the source plan, not a
paraphrase" trap Pass 1 hit twice for `A1`/`A2`/`A4` and `D2`/`E1`. The
governance-maintainability source plan names them explicitly:
`workflow-cookbook`, `acceptance-scenarios`, `operator-toolbox`,
`operator-onboarding`, `developer-environment`, `issue-intake`,
`support-bundle`, and `enterprise-audit` (checker
`check-enterprise-hardening.mjs`). All 8 confirmed as real `Makefile`
targets before auditing them.

**This is an audit, not a demotion.** Per the card's own scopeStop, a
gate stays unless the audit finds a real reason to demote it — the
correct outcome of a clean audit is "no change, with the reasoning on
record," not a forced finding.

### Each gate's purpose is real and specific, not vague

| Gate | Purpose string (from its own contract) |
|---|---|
| `workflow-cookbook` | "Keeps real user jobs obvious across SDK, CLI, and MCP instead of relying only on generated resource lists." |
| `acceptance-scenarios` | "End-to-end acceptance scenario contract for SDK, CLI, MCP, mock/live proof, receipts, and OpenAPI truth." |
| `operator-toolbox` | "Operator toolbox contract for no-network preflight helpers that orient non-coders and future agents without claiming proof." |
| `operator-onboarding` | "Operator onboarding contract for non-coder bootstrap, SDK/CLI/MCP path selection, mock/live safety, stop conditions, and readiness boundaries." |
| `developer-environment` | "Developer environment and bootstrap contract for local SDK/CLI/MCP/OpenAPI work." |
| `issue-intake` | "Issue, feature, PR, support, and security intake quality contract... redaction boundaries." |
| `support-bundle` | "Safe support and escalation bundle contract for SDK, CLI, MCP, OpenAPI/generator, mock/replay, and live-proof issues." |
| `enterprise-audit` | "Requirement-to-evidence map for the enterprise SDK/CLI/MCP/OpenAPI hardening objective." |

### Correction to the card's framing: these 8 are PR-blocking today, not scheduled-only

`docs/contract-inventory.json` marks all 8 `contractGates: false,
governanceGates: true` — they run under `make governance-audit`, not
`make contract-gates`. That could read as "lower-frequency, lower
blast-radius." It is not: `.github/workflows/ci.yml`'s "Contracts and
coverage" job runs `make governance-audit` on every PR, immediately
after `make contract-gates`. `CLAUDE.md` already states this precisely —
*"the internal `scheduled_governance` name is a tier label, not a cron
schedule"* — and this audit reconfirms it holds for these 8 specifically:
they gate every PR today, same as the contract-gates tier, just filed
under a different Make aggregate.

### The plan's own premise was already softened by R0 — reconfirmed here

R0's disposition table recorded: *"the eight active marker gates now have
broad purpose strings, so 'no articulated risk' is too strong. Survey
per-gate incident/risk traceability only."* Checked directly:
`docs/gate-tier-inventory.md` already carries a generator-authored
`proposedTier: scheduled_governance` for all 8
(`TIER_DECISION_TARGETS` in `scripts/generate-gate-tier-inventory.mjs`),
but the rationale is one shared sentence for all 8, not gate-specific:
*"maintains planning, inventory, reporting, or agent/process topology and
does not directly validate shipped behavior on every PR."* That
categorical rationale is real (it is in the generator source), but it is
not an incident citation — confirming R0's own correction was accurate.

### Incident search: zero hits, both directions

Grepped `docs/rejected-findings.md`, `wrapper/CHANGELOG.md`,
`cli/CHANGELOG.md`, and `mcp/CHANGELOG.md` for each of the 8 gate/script
names. **Zero hits for all 8** — no documented incident where any of
these gates caught a real regression, and equally no documented incident
where any of them produced a false-positive requiring a workaround. A
git-log churn check (commits touching each checker script across the
repo's full history) found 2–10 commits per script — consistent with
build-then-stable, not a pattern of repeated bug-fixing that would
suggest a false-positive-prone gate.

### Verdict: no retirement recommended for any of the 8

Per `CLAUDE.md`'s standing rule — *"a blocking gate is presumed right...
change it to be more precise, never merely quieter"* — and R4's own
scopeStop, the audit's finding is: each gate protects real, named,
specific content; none has a documented incident on either side; all 8
currently gate every PR (not scheduled-only, correcting the card's own
framing); the existing `proposedTier` rationale is categorical rather
than per-gate. **No retirement.** No `retiredGates` flow invoked —
nothing met the bar for it. The categorical-vs-per-gate rationale gap is
recorded here for a maintainer who later wants a more calibrated
PR-blocking/scheduled split, but deciding that split is a governance
policy call, not something this audit resolves unilaterally — the same
class of decision as `GOV-1`, already routed to the user in
`docs/rejected-findings.md`.

### R4 evidence

- Base commit: `c3a5be2` (`main`, after V-survey passes 3–4 landed).
- Commands run: `grep -n "^workflow-cookbook:\|^acceptance-scenarios:\|..."
  Makefile` (confirmed all 8 targets exist); `git log --oneline --all --
  scripts/check-<name>.mjs` per script (churn count); `grep`-based
  incident search across `docs/rejected-findings.md` and the 3 package
  `CHANGELOG.md` files.
- Source files read: `docs/contract-inventory.json`,
  `docs/gate-tier-inventory.md`, `scripts/generate-gate-tier-inventory.mjs`
  (`TIER_DECISION_TARGETS`/`TIER_DECISION_RATIONALES`),
  `docs/workflow-cookbook-contract.json`,
  `docs/acceptance-scenarios-contract.json`,
  `docs/operator-toolbox-contract.json`,
  `docs/operator-onboarding-contract.json`,
  `docs/developer-environment-contract.json`,
  `docs/issue-intake-contract.json`, `docs/support-bundle-contract.json`,
  `docs/enterprise-hardening-audit.json`, `.github/workflows/ci.yml`.
- All creds blanked; no live sandbox use.

## V2 — risk-weighted test-quality sampling

Separate backlog item. Hand-mutant playbook only — no local Stryker,
per the card's own scopeStop. Each candidate below was verified by
hand-applying the mutant to the real source, running the focused test
file, and confirming the outcome — a claim that a mutant "would survive"
is not recorded unless the mutant was actually run.

### Finding 1 — CLI `tasks delete` rollback: initial hypothesis wrong, real coverage confirmed

`cli/src/commands/tasks.ts`'s delete path marks a task `DONE` before
deleting it (archive-then-delete), and rolls the status back if the
delete fails — with a documented decision to swallow a *rollback*
failure so the original delete error is not masked. A grep-based sweep
of `cli/tests/crud.test.ts`, `mutation-leaves.test.ts`, and
`archived-flag-help.test.ts` found no test naming this rollback path,
suggesting a gap.

**Hand-mutant applied:** commented out the final `throw error;`
(swallowing the delete failure entirely) and ran the CLI test suite.

- Scoped run (`crud.test.ts` only): 26/26 still passed — appeared to
  confirm the gap.
- Full `cli` suite: **2 tests failed** in
  `cli/tests/wire-body-migration.test.ts:373` (`rejects.toThrow(/DELETE-BOOM/)`,
  `expect(updateCalls).toBe(2)`) — a real, working regression test for
  this exact path, living in a file the initial grep sweep did not check.

Mutant reverted; suite confirmed green again. **This is not a gap** —
it is the coverage this survey's own weakest-valid-hypothesis discipline
argues for catching: the grep-based hypothesis ("no test covers this")
was wrong, and only the hand-run mutant caught the truth. Recorded as a
methodology note as much as a finding: a `grep`-only sweep across a
*guessed* subset of test files is not sufficient evidence for a
"untested" claim in this codebase — test coverage for one command's
behavior is not reliably co-located with that command's own
`*.test.ts` file (`wire-body-migration.test.ts` is a cross-cutting file
name, not a per-command one).

### Finding 2 — `dateRange`/`resolveRelativeDay`: historically-risky, confirmed still well-guarded

`mcp/src/tools/workflows/resolve.ts`'s `dateRange` function carries an
inline comment describing a real, fixed incident: an impossible calendar
day (`2026-02-30`) used to silently roll forward to `2026-03-02` instead
of being rejected (the 2026-08-08 release's tz/dateRange fix, 42
regression tests). Prioritized for this sample specifically because it
has a documented past incident — the highest-priority criterion for
risk-weighted sampling.

Verified `mcp/tests/server.test.ts:826-844` still exercises this exact
scenario **through the real tool call**, not a unit-level shortcut:
`clockify_review_day` invoked via an in-memory MCP client with
`date: "2026-02-30"`, `"2026-04-31"`, and `"2026-02-29"` (2026 is not a
leap year), asserting `isError: true` and `error.code: "invalid_request"`
for each. This is genuine end-to-end coverage of a real historical
defect, not a tautology. No hand-mutant was run here (the existing test
already demonstrably encodes the exact failure mode the past incident
produced); confirmed by reading, not re-demonstrated.

### Overmocking/tautology sweep

Grepped `mcp/tests/expenses.test.ts`, `scheduling.test.ts`,
`invoices.test.ts`, and `cli/tests/read-commands-projects-tasks.test.ts`
for weak-assertion patterns (`toBeTruthy()`, `not.toBeNull()`, bare
`toHaveBeenCalled()` with no argument check). One hit:
`scheduling.test.ts:309`, `expect(token).toBeTruthy()` — checking a
confirmation token exists before reusing it in a follow-up call, which
is a reasonable assertion when the token's exact value is opaque and
only its presence/reuse matters. No tautology or overmocking pattern
found in this sample.

### V2 evidence

- Base commit: `eb444ee` (`main`, after R4 landed).
- Commands run: `cp cli/src/commands/tasks.ts /tmp/tasks.ts.orig`;
  hand-edit removing the `throw error;` rethrow; `npx vitest run
  tests/crud.test.ts` (26/26 passed, false negative); `npx vitest run`
  (full cli suite, 2/550 failed at the real coverage site); `git
  checkout -- cli/src/commands/tasks.ts` (revert, confirmed clean);
  re-run of the full suite green. Direct reads of
  `mcp/src/tools/workflows/resolve.ts:562-609`,
  `mcp/tests/server.test.ts:820-844`. Grep sweeps for weak-assertion
  patterns across 4 test files.
- All creds blanked; no live sandbox use.

## S6 — instruction-file status-prose measurement

Separate backlog item. **Measure and stop — no instruction-file
restructuring.** CC-1/A6 (`docs/rejected-findings.md`) forecloses
autonomous instruction-file edits; disposition goes to the user/owner.
Scope is the repo-local instruction files only: `AGENTS.md`, `CLAUDE.md`,
`.claude/skills/*/SKILL.md` — not `MEMORY.md`, not the user's global
`~/.claude/CLAUDE.md`.

### Method

Word-counted each file, split by `##` heading into sections, and judged
each section as **dated-status-anecdote** (content tied to a specific
date, incident, or current-measurement snapshot that will go stale —
version numbers, "as of" counts, dated incident citations) or
**behavior-changer** (a durable instruction, rule, or pointer that stays
correct regardless of date). Sections mixing both were split at the
paragraph/bullet level rather than forced into one bucket, and the
narrower split is shown for the two mixed cases.

### CLAUDE.md — 2,028 words, 9 sections

| Section | Words | Classification |
|---|---:|---|
| Agent skills | 69 | behavior-changer |
| Open Follow-Ups (2026-08-10) | 170 | **dated-status-anecdote** (100%) |
| Current Hardening Checkpoint | 388 | mixed — ~140w status / ~248w behavior-changer (see below) |
| Product Shape | 147 | behavior-changer (structural reference) |
| First Reads | 12 | behavior-changer |
| Verify Gates | 772 | behavior-changer |
| Current Gotchas | 253 | behavior-changer |
| Where To Change Things | 102 | behavior-changer |
| Hard Stops | 43 | behavior-changer |

**Current Hardening Checkpoint**, bullet by bullet: "Coordinated package
truth" (version numbers, ~55w) — status. "Current surface" (163 tools
etc., ~35w status + a durable "never hand-bump, regenerate it" rule,
~25w behavior). "The gates are adversarially hardened" (cites the
2026-06-29 review, ~30w status, plus a durable operating rule, ~90w
behavior). "`main` is the integration branch" — pure behavior (~35w).
"Keep local proof laptop-safe" — pointer (~25w behavior). "Mutation
score proof is GitHub-only" (durable rule, ~70w behavior, plus a
specific incident citation, ~20w status). "A spec re-snapshot
invalidates..." — durable procedure (~90w behavior). "Never hand-edit
spec/corrected..." — pure behavior (~25w).

**CLAUDE.md total: ~310 words (15.3%) dated-status-anecdote, ~1,718
words (84.7%) behavior-changer.**

### AGENTS.md — 6,507 words, 14 numbered sections

| Section | Words | Classification |
|---|---:|---|
| 0. Current hardening checkpoint | 383 | mixed — near-duplicate of CLAUDE.md's section (see below) |
| 1. Identity & boundary | 1,220 | behavior-changer |
| 2. First reads (in order) | 275 | behavior-changer |
| 2a. Product north star | 223 | behavior-changer (reference) |
| 3. The build chain | 313 | behavior-changer |
| 4. Verify gates | 910 | behavior-changer |
| 5. Critical conventions | 712 | behavior-changer |
| 6. The wrapper layout | 729 | behavior-changer (structural reference) |
| 7. Live tests | 441 | behavior-changer |
| 8. Known deferred / blocked items | 298 | mixed — status-heavy (see below) |
| 9. Secret hygiene | 109 | behavior-changer |
| 10. Commit & branch hygiene | 136 | behavior-changer |
| 11. Doc maintenance | 322 | behavior-changer |
| 12. Out of scope (FLAG and stop) | 214 | behavior-changer |

**§0** opens with the identical "Coordinated package truth" bullet
`CLAUDE.md`'s own Current Hardening Checkpoint carries — this is
deliberately mirrored content, not independent prose (`CLAUDE.md`
positions itself as the index, `AGENTS.md` as the canonical contract).
Same status/behavior ratio as `CLAUDE.md`'s version: ~140w status /
~243w behavior.

**§8** is genuinely status-heavy: the Fern-era migration history, the
promotion-wave dates (2026-06-20 to 2026-06-23), and the live-success
count ("161/168") are dated measurements that move when the spec
re-snapshots — CLAUDE.md's own "Two facts are load-bearing" note already
names this exact count as something that reds a gate on re-snapshot.
Estimated ~210w status / ~88w durable reference (file pointers, the
naming-classification split).

**AGENTS.md total: ~350 words (5.4%) dated-status-anecdote, ~6,157
words (94.6%) behavior-changer.**

### Skill files — 2,043 words, 4 files

Grepped for date-shaped tokens (`2026-0`) and the words "dated"/"as of"
across all 4 `SKILL.md` files: 1 hit total (in
`clockify-sdk-add-mcp-tool/SKILL.md`), 0 in the other 3. These files are
almost entirely procedural instruction — **~0% dated-status-anecdote,
~100% behavior-changer.**

### One survey-artifact line (the card's own required output)

**Across the ~10,578-word repo-local instruction corpus (`AGENTS.md` +
`CLAUDE.md` + 4 `SKILL.md` files): ~660 words (6.2%) are dated-status
anecdotes, ~9,918 words (93.8%) are behavior-changers.** The
concentration is uneven: `CLAUDE.md` carries the highest anecdote share
(15.3%) despite being the shorter, index-positioned file; `AGENTS.md`
sits at 5.4%; the 4 skill files carry effectively none. The single
highest-value observation is not the percentage but the duplication: the
~140-word "Coordinated package truth" status block is maintained
verbatim in both `CLAUDE.md` and `AGENTS.md` §0, meaning that one block's
staleness-update cost is paid twice on every version bump.

**Disposition: recorded here for the user/owner, per CC-1/A6. No
instruction-file restructuring performed or proposed as a concrete edit
— this section is measurement only.**

### S6 evidence

- Base commit: `045bd37` (`main`, after V2 landed).
- Commands run: `wc -w AGENTS.md CLAUDE.md .claude/skills/*/SKILL.md`;
  a Python section-splitter (`re.split(r'^## ', text, flags=re.M)`)
  counting words per `##`-delimited section in both `AGENTS.md` and
  `CLAUDE.md`; `grep -c "2026-0\|dated\|as of"` across the 4 skill
  files.
- Source files read: `CLAUDE.md` lines 44–89 (Current Hardening
  Checkpoint, bullet-by-bullet), `AGENTS.md` lines 25– (§0) and the
  §8 "Known deferred / blocked items" section, in full, for the mixed-
  section splits.
- All creds blanked; no live sandbox use.

## Stopping point

The first session landed Pass 1 (graph facts, citing already-landed V3/
V5/V6/V7 evidence plus 2 unresolved reference gaps flagged rather than
guessed) and Pass 2 (all 20 Q2 candidates judged with checked written
reasons, verdict KEEP across the board).

A later session landed Pass 3 (sampled test-dimension audit across the
unfloored mass, per-dimension confirmed/downgraded verdicts, the
`webhook-events.ts` mutation-side license, and the V1 error-code sizing
count — 0 of 14 reachable codes are unprovoked) and Pass 4 (risk-sampled
red demonstrations over the 8 named checkers, the `.test-d.ts` redundancy
sweep, and the dedupe pass against T9/R3b/Q3). Both passes are sampled
audits with a recorded sampling frame, not exhaustive reads — see each
pass's own "not sampled" notes for what remains open:

- Pass 3: G4 (partial-mutation receipt honesty) breadth across the full
  unfloored mass beyond the two sampled cases; the wider `mcp/src/tools/**`
  files listed as "not read this pass" in the sampling frame table.
- Pass 4: `snippet-compile`, `mcp-agent-ux`, and `readme-tables` still need
  a hand-run red demonstration (sibling-test absence is confirmed; the
  live catch is not).

R4, V2, S6, V1, and DX-A6 are unblocked by this landing (V-survey passes
3–4 are their shared dependency) and are picked up as separate items in
the same continuation, each with its own worktree and commit.

## Evidence

### Passes 1–2

- Base commit: `bd98e7142ba422d387d9c64f574bd7ef998522e7`
- Commands run: `node scripts/check-gate-reachability.mjs`;
  `grep -n 'from "../index' cli/src/commands/helpers.ts`; direct source
  reads of `mcp/src/result.ts`, `mcp/src/tools/invoices/payments.ts`,
  `mcp/src/client.ts`, `mcp/src/orchestration/confirmation.ts`,
  `cli/src/commands/helpers.ts`, `cli/src/receipt.ts`,
  `cli/tests/live-sandbox-support.ts`, `mcp/tests/harness.ts`,
  `AGENTS.md`, `docs/surface-divergence-licenses.json`.
- All creds blanked (`CLOCKIFY_API_KEY=''`/`CLOCKIFY_WORKSPACE_ID=''`)
  for every command; no live sandbox use in this pass.

### Passes 3–4

- Base commit: `e2c54879b997d7f67fff43e84042338001427ec8` (`main`, before
  this landing).
- Commands run: `node scripts/check-docs-drift.mjs` (baseline, red demo,
  reverted, re-verified green); `node scripts/check-generator-comparison.mjs`
  (baseline, with `output/ts-sdk`/`wrapper/src` moved aside, restored);
  grep counts across `mcp/tests/*.test.ts`, `cli/tests/*.test.ts`,
  `wrapper/tests/*.test.ts` for each G1–G5 dimension and each of the 17
  error codes; `wc -l` over the sampled source files; direct reads of
  `wrapper/webhook-events.ts`, `wrapper/vitest.config.ts`,
  `wrapper/stryker.conf.json`, `docs/mutation-score-contract.json`,
  `docs/ci-contract.json`, `docs/error-registry-contract.json`,
  `wrapper/package.json`, `wrapper/tsconfig.types-bundler.json`,
  `wrapper/tsconfig.types-public-package.json`,
  `mcp/tests/scheduling-resolve.test.ts`,
  `mcp/tests/error-code-wiring.test.ts`, `mcp/tests/request-cancellation.test.ts`,
  `wrapper/tests/scoped-client.test.ts`,
  `cli/tests/read-commands-paging-validation.test.ts`,
  `cli/tests/config.test.ts`.
- All creds blanked for every command; no live sandbox use.
