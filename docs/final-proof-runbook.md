# Final Proof Runbook

Use this runbook only when the implementation work appears complete and the remaining question is proof. This runbook produces the final proof receipt at `docs/final-proof-receipt.md`. The temporary context file stays through evidence capture, and stays in place until every required command below has a real receipt.

## Automated receipt runner

Prefer the runner when possible because it captures command output
directly into `docs/final-proof-receipt.md`:

```bash
LIVE=1 make final-proof-draft
```

If live proof cannot be run in the current environment, make that risk
explicit:

```bash
DEFER_LIVE_REASON="No sacrificial Clockify sandbox credentials are available in this session." make final-proof-draft
```

The runner still fails if package gates fail or if
`docs/performance-budgets.json` remains `calibrationPolicy.status:
provisional`.

The runner also refuses `--performance-runs` values below
`docs/performance-budgets.json` `calibrationPolicy.requiredSuccessfulRuns`.
When `--performance-runs` is omitted, the runner uses
`calibrationPolicy.requiredSuccessfulRuns` instead of a hard-coded count.

`make final-proof` remains a back-compatible alias for
`make final-proof-draft`. The runner and `make final-proof-receipt-check` both read
`docs/final-proof-receipt-manifest.json`. Update that manifest before
changing final receipt sections, commands, status values, or placeholder
rules.

The runner may write a draft receipt that still contains `NOT COMPLETE:`
markers when budgets are provisional, package gates fail, or the temporary
context file still exists. Those markers are intentionally forbidden by the
manifest and must be replaced with real evidence before final audit.

When `LIVE=1` is used, the runner extracts the
`mcp/scripts/assert-clean-prefixes.mjs` JSON cleanup receipt from
`make perfect-live` output by matching the known cleanup prefix ledger, then
stores only that cleanup JSON under `Sandbox cleanup receipt:`. The draft
fails if that JSON is missing or if its `total` field is not `0`. It also
fails if the cleanup prefix list is missing any known live-test prefix:
`sdk-test-`, `mcp-sandbox-`, `mcp-workflow-`, `mcp-log-`, `mcp-fix-`, or
`DEMO-`.

The runner is also intentionally draft-only for the last final audit step:
`enterprise-audit-final` validates the final receipt, so its output cannot be
truthfully generated and embedded by the same runner pass. Run that command
manually after the temporary context file is removed and paste its exact output
into the receipt.

The runner reports expected final-audit and temporary-context work as draft
blockers, distinct from command failures. A draft blocker still prevents final
completion; resolve every blocker before running `make final-proof-final`.

For a no-network snapshot of current goal state before running proof, use:

```bash
make final-proof-preflight
```

This preflight prints the active-goal status report and release-readiness
preflight report. It reads local file-state signals only. It does not run Git,
npm, Docker, Fern, tests, builds, or Clockify API calls, and it is not proof.
Use the report's `Final blockers` and `Blocking file-state summary` sections
for navigation. The JSON output exposes `finalBlockingSignalIds`,
`finalBlockingRiskIds`, `blockingSignalIds`, and `blockingRiskIds` so a
continuing operator can close the next blocker without treating the preflight
as validation evidence.

For a no-network plan to close the provisional performance-budget blocker, use:

```bash
node scripts/performance-calibration-plan.mjs
```

That plan does not run measurements or calibrate budgets. It only explains the
three-receipt path, tightening rule, stop conditions, and final proof markers.

## Proof sequence

1. Run the artifact audit:

```bash
make enterprise-audit
```

2. Run the axioms contract gate (Axioms contract proof):

```bash
make axioms-contract
```

   This gives the final receipt an explicit rulebook check before the aggregate
   gates. `make perfect-fast` and `make perfect-full` also include
   `make axioms-contract`, but the separate receipt makes axiom regressions
   visible without asking a non-coder operator to expand aggregate Make
   targets.

3. Run the deterministic local gate:

```bash
make perfect-fast
```

4. Record a performance receipt after the package builds:

```bash
make performance-receipt
```

5. Repeat the performance receipt until there are
   `calibrationPolicy.requiredSuccessfulRuns` successful local baseline
   receipts, then tighten `docs/performance-budgets.json` according to
   its `calibrationPolicy.tighteningRule`.
   `docs/final-proof-receipt.md` must say `Budget status: tightened`;
   provisional budgets are not a completed state. Set
   `calibrationPolicy.status` to `calibrated` only after tightening
   the ceilings from real receipts. After setting calibrated budgets, run
   another `make performance-receipt` so the latest JSON receipt embeds
   `calibrationPolicy.status: calibrated` and the current performance-budget
   `schemaVersion` plus budget fingerprint. The final receipt must include at least
   `calibrationPolicy.requiredSuccessfulRuns` performance receipt headings,
   passed results, and zero exit statuses.

6. Run the full generation and pack gate:

```bash
make perfect-full
```

7. Run the live gate only with a sacrificial Clockify sandbox:

```bash
make perfect-live
```

   `docs/final-proof-receipt.md` must say `Live proof status:
   completed` with passing output and a sandbox cleanup receipt from
   `mcp/scripts/assert-clean-prefixes.mjs`. That cleanup receipt must
   include the scanned `prefixes`, every known live-test prefix,
   `"total": 0`, and `leftovers`.
   Use `Live proof status: deferred` only when the final receipt gives
   a concrete reason and owner; a deferred live gate is residual risk,
   not silent success. Deferred live proof must also state that no live
   objects were created by the proof runner. Like carried residual risk,
   `deferred` is a draft state; `make final-proof-receipt-check` accepts
   final completion only when live proof status is `completed`. Deferred
   receipts are still checked for a concrete reason and cleanup no-op marker,
   so draft blockers remain actionable.
   If `LIVE=1 make final-proof-draft` runs `make perfect-live` and that command
   fails, the draft receipt must say `Live proof status: failed`; attempted
   live proof must never be relabeled as `completed` or `deferred`.

8. Copy `docs/final-proof-receipt.template.md` to
   `docs/final-proof-receipt.md`, or use the runner-generated draft, then fill
   in exact command output, failures fixed, remaining risks, and cleanup proof.
   The template intentionally shows `### Receipt N` instead of a fixed final
   receipt count; duplicate that block until the number of successful performance receipts matches `calibrationPolicy.requiredSuccessfulRuns`.
   Every final success section must include command evidence with
   `Exit status: 0` and `Result: passed`; a prose `ok` sentence is not enough.
   Remove every `NOT COMPLETE:` marker before final receipt checking. The
   residual-risk section must explicitly say `Residual risk status: none` with
   `No remaining risks after final proof.`. Draft receipts may use
   `Residual risk status: carried`
   with `Owner:`, `Reason:`, and `Closure gate:` details for every remaining
   risk. `carried` is allowed in draft receipts so blockers are explicit, but
   `make final-proof-receipt-check` accepts final completion only when the
   status is `none`.

9. Remove the temporary context file (final acceptance requires the temporary context file is gone):

```bash
rm docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md
```

10. Run the final-mode artifact audit and capture its output in the receipt:

```bash
make enterprise-audit-final
```

11. Confirm the receipt is filled and no template or runner placeholders remain:

```bash
make final-proof-receipt-check
```

This check also verifies that
`docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` no longer exists on
disk. A receipt that says the file was removed is not enough. Required success
sections must also be internally consistent: explicit failure markers such as
`Result: failed` or non-zero exit statuses are not allowed alongside pass
wording. It also reads the latest performance receipt from
`docs/performance-budgets.json` `calibrationPolicy.receiptPath` and rejects
final acceptance when that JSON receipt has failures, failed measurements, or
an embedded `calibrationPolicy.status` other than `calibrated`, or when its
`budgetsSchemaVersion` or `budgetFingerprint` does not match the current
performance budget contract.
When this check fails, it prints exact failures plus suggested next
actions for common blockers such as placeholders, missing performance proof,
deferred live proof, residual risk, failed command output, and temporary
context cleanup.

12. Run the final-mode artifact audit again as the last completion gate:

```bash
make final-proof-final
```

Only after step 12 passes should this goal be marked complete.

## Completion criteria

- `make enterprise-audit` passes before final cleanup.
- `make axioms-contract` passes and is captured as its own receipt.
- `make perfect-fast` passes.
- `make performance-receipt` has enough successful receipts to tighten
  provisional budgets.
- `make perfect-full` passes.
- `make perfect-live` passes against a sandbox only, and the final receipt
  states `Live proof status: completed`. A deferred live proof can document a
  draft blocker, but it is not final completion evidence.
- `docs/final-proof-receipt.md` exists with exact receipts.
- `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` is removed after the
  receipt is complete.
- `make final-proof-receipt-check` passes after temporary context removal.
- `make final-proof-final` passes.
