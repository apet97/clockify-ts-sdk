# 0005: Temporary context remains until final proof replaces it

## Status

Accepted.

## Context

The hardening goal is long-running and spans SDK, CLI, MCP, OpenAPI,
docs, contracts, mock proof, live proof, and performance calibration.
Chat memory is not a durable project artifact. A temporary context file
keeps continuation state visible while implementation and proof are
still incomplete.

That temporary context file is intentionally temporary. Keeping it after
final proof would make stale planning state look canonical.

## Decision

Keep `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` until real
proof evidence has been captured and `docs/final-proof-receipt.md` is
complete. Remove the temporary context immediately before final acceptance,
then run `make final-proof-final`.

## Consequences

- The temporary context file is allowed while the goal is active.
- The goal is not complete while final proof is missing, budgets remain
  provisional, or temporary context is still present.
- Permanent docs and decision records must carry durable guidance after
  the temporary file is removed.

## Proof

- `make final-proof-draft`
- `make final-proof-receipt-check`
- `make final-proof-final` (and `make enterprise-audit-final` for the post-temporary-context audit gate)
