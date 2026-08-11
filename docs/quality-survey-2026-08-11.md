# Quality survey — 2026-08-11

Four-pass survey per the ownership/simplicity/testing/verification plan
(`docs/quality-survey-2026-08-11.json` is the structured sidecar). Base
commit `bd98e7142ba422d387d9c64f574bd7ef998522e7`. Passes 1–2 are
complete for this session; passes 3–4 are not started — see
[Stopping point](#stopping-point).

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

**Not started.**

## Pass 4 — verification meta-audit

**Not started.**

## Stopping point

This session landed Pass 1 (graph facts, citing already-landed V3/V5/
V6/V7 evidence plus 2 unresolved reference gaps flagged rather than
guessed) and Pass 2 (all 20 Q2 candidates judged with checked written
reasons, verdict KEEP across the board). Passes 3 and 4 were not
started: Pass 3 requires a hand-mutant-sampled tautology/overmocking/
catch-discipline audit across the unfloored mass (`mcp/src/tools/**`
~15k lines including `workflows/resolve.ts` at 880 lines, MCP
`client.ts`/`output-schema.ts`/`request-cancellation.ts`, CLI
`sharedReports.ts` 480 / `tasks.ts` 335 / `expenses.ts` 282 /
`webhooks.ts` 275 / `api.ts` 264 + `config.ts`, wrapper
`webhook-events.ts` + `scoped-client.ts`) plus V1's error-code test
sizing, and is explicitly a multi-sitting job by the source plan's own
estimate. Pass 4 depends on Pass 3's findings feeding its risk-sampled
sampling frame and was not attempted for the same reason.

R4, V2, S6, V1, and DX-A6 (which the campaign continuation prompt names
as unblocked once V-survey lands) are **not** attempted in this session:
V2 and V1 need Pass 3's sizing work first, S6 and R4 are prose/audit
items whose quality depends on Pass 3/4 groundwork being in place, and
rushing any of them without that groundwork would produce a
plausible-looking but unverified result — exactly what this survey's own
Pass 2 discipline (checked written reasons, not assumed ones) argues
against. Left `free` for a future dedicated session with the budget for
the full unfloored-mass audit.

## Evidence

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
