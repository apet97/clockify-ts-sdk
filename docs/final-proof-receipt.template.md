# Final Proof Receipt

Fill this file after running the final proof sequence. Do not copy this
template into `docs/final-proof-receipt.md` until real command evidence
exists.

This template is checked against `docs/final-proof-receipt-manifest.json`.
Update that manifest before changing required sections, commands, status
values, or placeholder rules.
Every final success section must paste command evidence that includes
`Exit status: 0` and `Result: passed`; prose success summaries are not enough.

## Summary

- Date:
- Operator:
- Branch or checkout:
- Goal:

## No-network preflight

Command:

```bash
make final-proof-preflight
```

Result:

```text
PASTE OUTPUT HERE
```

## Artifact audit

Command:

```bash
make enterprise-audit
```

Result:

```text
PASTE OUTPUT HERE
```

## Axioms contract proof

Command:

```bash
make axioms-contract
```

Result:

```text
PASTE OUTPUT HERE
```

## Deterministic local proof

Command:

```bash
make perfect-fast
```

Result:

```text
PASTE OUTPUT HERE
```

## Performance receipts

- Budget status: tightened

Commands:

```bash
make performance-receipt
```

Receipts:

Paste one numbered receipt block per successful local receipt. The required
count is `docs/performance-budgets.json`
`calibrationPolicy.requiredSuccessfulRuns`; repeat this numbered receipt block until the configured count is met. Each block must include `Exit status: 0` and
`Result: passed`.

The latest JSON receipt at `docs/performance-budgets.json`
`calibrationPolicy.receiptPath` must also be a successful receipt with
measurements, no `failures`, no failed measurement entries, and embedded
`calibrationPolicy.status: calibrated` plus a `budgetsSchemaVersion` matching
the current `docs/performance-budgets.json` schema and a `budgetFingerprint`
matching the current budget contract. Pasted output alone is not enough for
final acceptance.

### Receipt 1

```text
PASTE OUTPUT HERE
```

### Receipt N

```text
PASTE OUTPUT HERE
```

Budget tightening performed:

```text
Set docs/performance-budgets.json calibrationPolicy.status to calibrated after tightening ceilings from real receipts.
Run make performance-receipt again after calibration so docs/performance-baseline-latest.json embeds calibrationPolicy.status: calibrated, the current budgetsSchemaVersion, and the current budgetFingerprint.
```

## Full generation and pack proof

Command:

```bash
make perfect-full
```

Result:

```text
PASTE OUTPUT HERE
```

## Live sandbox proof

- Live proof status: completed
- Live deferral reason:

Command:

```bash
make perfect-live
```

Result:

```text
PASTE OUTPUT HERE
```

Sandbox cleanup receipt:

```text
PASTE CLEANUP RECEIPT HERE
```

Completed live proof cleanup must include the
`mcp/scripts/assert-clean-prefixes.mjs` JSON receipt with `prefixes`,
`"total": 0`, `leftovers`, and the known live-test prefixes:
`sdk-test-`, `mcp-sandbox-`, `mcp-workflow-`, `mcp-log-`, `mcp-fix-`,
and `DEMO-`.

## Temporary context cleanup

Removed:

```text
docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md
```

Final audit:

```bash
make enterprise-audit-final
```

Result:

```text
PASTE OUTPUT HERE
```

## Residual risk

- Residual risk status: none
- No remaining risks after final proof.
