# Task 20 — unique-claim inventory

## Prerequisite and base

Task 19 was verified complete through its tracked receipt at
`docs/roadmap-1.0-receipts/task-19-aggregate-gates.md`. The Task 20 base is
`bc6aabe`; this repair replaces the sample-only projection reviewed at
`16865ec` without changing Task 20's `0/2` approval state.

## Bounded universe and source rules

The inventory contains exactly 50 current claims:

- 27 roadmap tasks, including state, dependency, closure cell, release-blocker
  posture, and every current structured task-status overlay;
- all 13 current risk-register rows;
- all 6 product-surface workflow availability rows; and
- 4 selected readiness/release posture claims covering static-preflight
  authority, current blocker count, full/live proof, and publish authorization.

Every row has a unique normalized claim key and structured source key, exact
source locations, typed evidence, a boundary, a kind-specific status, one
current source of truth, and a source-specific projection. The checker derives
the current roadmap, risk, and workflow key sets independently and requires
exact equality with both policy and inventory, so source omissions, extras, and
state drift fail closed.

Evidence is limited to an existing Make target, allowlisted contract,
allowlisted generated surface, or existing receipt with an exact anchor.
Receipts are evidence only. Historical receipts and archived plans cannot be
canonical claim sources. Task 20's former pending inventory row now matches the
current roadmap/status state: `implemented (0/2 approvals)`. Task 21 remains
`pending`.

## TDD and deterministic proof

Repair RED: `node --test scripts/check-unique-claim-inventory.test.mjs`
reported 7 passing and 31 failing tests against the rejected sample validator.
The failures covered the missing closed-world source projection, typed
evidence, state semantics, workflow backing, malformed-JSON handling, and Make
wiring checks. A later focused RED for receipt-location promotion reported
`0/1` passing and exit 1 before that guard was implemented.

Initial repair GREEN: the focused test reported 39/39 passing. It deterministically
exercises duplicate IDs/keys/normalized locations; missing, empty, unsafe,
nonexistent, unanchored, and duplicate locations; missing/unsafe/untyped/fake
evidence; invalid or contradictory kind/status combinations; static-only
completion; incomplete workflow backing; roadmap/risk/workflow omissions and
source extras; roadmap/risk state drift; archived/receipt promotion; malformed
and empty JSON; and removed target/checker/aggregate wiring.

Reviewer repair RED: seven focused adversarial tests all failed before the
structured-overlay fix because changing a roadmap status overlay's receipt,
closure command, closure result/exit, approval count, reviewed head, reviewed
range, or next action was ignored. Final GREEN reports 47/47 passing. Each of
the 27 roadmap projections now contains `statusOverlay`: the complete canonical
status object plus its structured key for the 18 tasks with current overlays,
or explicit `null` for the other 9 tasks. Tasks 9–12 each deep-compare the same
complete `task9to12` object through their per-task mapping; the grouped mapping
has its own focused regression test.

The final focused checker reports exactly `50 canonical claims (27 roadmap, 13
risk, 6 workflow, 4 readiness)`. The exact roadmap closure command
`make docs-drift docs-quality` exits 0. The named wiring checks
`make contract-inventory docs-index-drift enterprise-audit` also exit 0.

## Changed files

- `docs/README.md`
- `docs/docs-quality-contract.json`
- `docs/docs-quality-policy.md`
- `docs/quality-gates.md`
- `docs/roadmap-1.0-receipts/task-20-unique-claims.md`
- `docs/unique-claim-inventory-policy.md`
- `docs/unique-claim-inventory.json`
- `scripts/check-docs-quality.mjs`
- `scripts/check-unique-claim-inventory.mjs`
- `scripts/check-unique-claim-inventory.test.mjs`
- `scripts/lib/unique-claim-inventory.mjs`

All validation is deterministic and no-network. It reads repository text only,
captures no environment values, and performs no Clockify mutation. No local
Stryker, package mutation, push, tag, release, or publication command ran.

## Authority and limitation

This remains a deliberately bounded machine projection, not global natural-
language understanding. Inventory rows are evidence maps, not task completion
proof. A row, source marker, passing static checker, or receipt alone cannot
close a roadmap task; the exact closure command, tracked receipt, and required
independent approvals remain authoritative.

## Independent approval closeout

Two independent reviewers returned **APPROVE** for specification compliance
and code quality over the frozen range
`bc6aabed167edb00b7cb643699e56a91bd2d4123..2550b4a4708cb0cb271f1515164731f9e09e0508`.
Task 20 is complete at `2/2` approvals with no remaining findings. This
closeout commit is evidence-only and is not part of the substantive reviewed
implementation range. Task 21 may start; Task 1 and the roadmap remain open.
