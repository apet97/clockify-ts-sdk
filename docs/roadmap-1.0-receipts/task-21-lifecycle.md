# Task 21 — plan lifecycle

## Prerequisite and task base

Task 20 is verified complete through the tracked receipt
`docs/roadmap-1.0-receipts/task-20-unique-claims.md`, which records 2/2
independent approvals. Task 21 starts from
`fa1706b487274489bb812c0fa030447ab6adfb9b`.

## Approved lifecycle

The closed vocabulary is `pending`, `in_progress`, `implemented`,
`evidence_captured`, `complete`, and `archived`. Allowed transitions are
`pending -> in_progress`, `pending -> implemented`, `in_progress ->
implemented`, `implemented -> evidence_captured`, `evidence_captured ->
complete`, and `complete -> archived`.

An exact successful closure command and tracked task receipt are both required
before evidence capture can be reported. `implemented` and
`evidence_captured` name every remaining blocker; neither is completion.
`complete` additionally requires dependency evidence, external proof, and all
required independent approvals. Historical `archived` material is never
active proof.

Task 1 is explicitly a final release/acceptance blocker, not an execution
prerequisite. Tasks 2+ may be implemented and evidence-captured while Task 1
approval waits for the final frozen branch. This records the maintainer's
decision; it does not fabricate Task 1 approval.

## Task 1 approval-range decision

Two independent reviewers must approve the resolved pre-close head and full
`ec68c61..<pre-close-HEAD>` range. The subsequent closeout commit is strictly
evidence-only and names the reviewed commit/range plus symbolic `SELF`. The
checker resolves `SELF` to the current Git `HEAD`. It may touch
only the Task 1 approval receipt and the roadmap/status/risk or directly
derived status-projection surfaces needed to record that result. It cannot
change product, generator, API, contract, dependency, lifecycle, or readiness-
risk semantics. A later substantive commit invalidates approval and requires
fresh review. A later evidence-only correction states whether the reviewed
evidence changes; changed evidence invalidates approval.

Task 1 remains `implemented` with 0/2 approvals. Task 21 remains implemented
with evidence captured and 0/2 approvals until its own independent review;
Task 22 remains `pending`.

## TDD proof

The first focused RED exited 1 because
`scripts/lib/plan-lifecycle-contract.mjs` did not exist. Three later RED slices
exited 1 with 1/3, 3/6, and 6/9 passing tests before the corresponding minimal
validation was added. A further RED surfaced during integration: the exact
closure command `make agent-tasks agent-handoff` exited 2 because the guidance
scanner flagged the packet's own prohibition line ("Never declare completion
from chat memory...") as a forbidden completion rule. The scanner was refined to
be negation-aware — an affirmative permission of the anti-pattern is rejected,
but a prohibition of it is not — with a locking regression test
(`accepts guidance that prohibits early context removal or weak-evidence
completion`). The original focused GREEN reported 13/13 passing tests and the
closure command exited 0.

The fixtures are in-memory JavaScript objects. They never write or rewrite the
active roadmap. They fail closed on unknown/skipped state; duplicate task id;
self, missing, cyclic, or evidence-incomplete dependency; premature complete;
missing blockers; unsafe, absent, or wrong-task receipts; invalid Task 1
approval range/head/count; substantive evidence-only closeout; correction
ambiguity; lifecycle packet drift/placeholders; unsafe guidance; and
conflicting canonical terminology.

The reviewer-fix RED then exited 1 with 12/19 passing and seven focused
failures: implicit or mismatched approval counts, absent concrete Task 1
records, ungrounded closeout declarations, invalid correction ancestry,
sentence-external guidance negation, and cross-surface lifecycle drift. A
separate unique-claim RED rejected the annotated Task 2 dependency because its
parser dropped `1 (final acceptance only)`. The final focused lifecycle GREEN
reports 19/19. The unique-claim parser now preserves that dependency and the
inventory checker reconciles all 50 claims.

For a future Task 1 completion, numeric 2/2 fields are insufficient:
`currentTask1ApprovalRecord` must contain two distinct identities with the
tracked receipt and identical reviewed head/range, while
`currentEvidenceOnlyCloseout` uses `SELF`. The production checker resolves
`SELF` from Git and validates its parent, changed paths, and diff. A correction
uses `SELF`, names its prior concrete closeout, and declares whether reviewed
evidence changed. Both current records remain `null` because Task 1 remains
`implemented` at 0/2.

## Exact closure and supporting proof

The Task 21 closure command is exactly:

```text
make agent-tasks agent-handoff
```

The final authoritative rerun exits 0. Supporting discovery checks
`make contract-inventory docs-index-drift enterprise-audit` also exit 0 but do
not replace the closure command. `node scripts/repo-doctor.mjs`, the focused
Node lifecycle test, and `git diff --check -- docs AGENTS.md CLAUDE.md Makefile`
also exit 0.

## Changed files

- `docs/plan-lifecycle-policy.md`
- `docs/plan-lifecycle-contract.json`
- `scripts/lib/plan-lifecycle-contract.mjs`
- `scripts/plan-lifecycle-contract.test.mjs`
- `docs/agent-handoff-policy.md`
- `docs/agent-handoff-contract.json`
- `scripts/check-agent-handoff.mjs`
- `docs/agent-tasks/execute-roadmap-task.md`
- `docs/agent-tasks/README.md`
- `docs/agent-tasks-contract.json`
- `scripts/check-agent-tasks.mjs`
- `docs/README.md`
- `docs/docs-index-contract.json`
- `docs/quality-gates.md`
- `docs/contract-inventory.json`
- `docs/enterprise-hardening-audit.json`
- `docs/roadmap-1.0.md`
- `docs/roadmap-1.0-status.json`
- `docs/unique-claim-inventory-policy.md`
- `docs/unique-claim-inventory.json`
- `scripts/lib/unique-claim-inventory.mjs`
- `scripts/check-unique-claim-inventory.test.mjs`
- `docs/roadmap-1.0-receipts/task-21-lifecycle.md`

## Boundaries and retained blockers

All validation is deterministic, no-network, and repository-text-only. It
captures no credentials, customer data, environment values, or unsanitized
command output. No local Stryker, `make mutation`, package mutation, live API,
push, tag, publish, release, or main-integration command ran.

At the frozen implementation head, the implementation commits were substantive
and were not themselves an evidence-only approval closeout. Task 1 retained
0/2 approvals and the roadmap remained open.

## Independent approval closeout

Two independent reviewers returned **APPROVE** for specification compliance
and code quality over the final frozen range
`fa1706b487274489bb812c0fa030447ab6adfb9b..13481e7f904bdd157d227ae296cd5a3c2ce1175c`.
Task 21 is complete at `2/2` approvals with no remaining findings. This
closeout commit is evidence-only and is not part of the substantive reviewed
implementation range. Task 22 may start; Task 1 and the roadmap remain open.
