# Task 20 — unique-claim inventory

Task 19's tracked receipt at
`docs/roadmap-1.0-receipts/task-19-aggregate-gates.md` was checked at base
commit `bc6aabe`. This task uses the bounded current readiness/release posture,
accepted/open risks, active roadmap state/dependencies/closure requirements,
and product-surface workflow availability universe; archived plans and historical
receipts are excluded except as evidence for current claims.

The inventory validates normalized unique claim keys, exact source markers,
evidence paths and Make targets, boundaries, statuses, source ownership, and
workflow backing. It is deterministic, no-network, and sanitizes no credentials
because it reads only repository files. Rows are evidence maps, not task
completion proof; Task 20 closes only with its exact roadmap command and this
tracked receipt.

TDD RED: `node --test scripts/check-unique-claim-inventory.test.mjs` failed
before implementation with `ERR_MODULE_NOT_FOUND` for the validator. GREEN:
the same command passed 4/4, including normalized duplicate, conflicting
location, unsafe/unanchored evidence, invented Make target, and incomplete
workflow backing cases.

Focused checks passed: `make unique-claim-inventory`; `make docs-drift
docs-quality`; and `make contract-inventory docs-index-drift enterprise-audit`.
No local mutation/Stryker command, release, tag, publish, or Clockify mutation
ran. Remaining limitation: this is a bounded declared claim universe, not a
free-form prose crawler. This implementation awaits the roadmap's independent
review lifecycle before evidence-only closeout.
