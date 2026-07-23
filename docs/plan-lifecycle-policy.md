# Plan Lifecycle Policy

This policy is the canonical lifecycle for the active 1.0 roadmap and every
roadmap task packet. The machine-readable contract is
[`plan-lifecycle-contract.json`](./plan-lifecycle-contract.json); the exact
Task 21 closure command is `make agent-tasks agent-handoff`.

## Closed state vocabulary

| State | Meaning | Who may enter it | Required evidence |
|---|---|---|---|
| `pending` | No task closure evidence exists. | Maintainer or roadmap owner when planning work. | An exact planned closure command and named future receipt path; neither is proof. |
| `in_progress` | Work has started but is not yet implemented. | Assigned implementer. | A named remaining blocker; no closure claim. |
| `implemented` | The implementation exists, but required evidence or approval is still missing. | Assigned implementer after focused implementation proof. | A named remaining blocker; this state cannot claim closure. |
| `evidence_captured` | The exact closure command exited successfully and the tracked task receipt exists, but an approval, external proof, dependency, or acceptance gate remains open. | Assigned implementer after recording deterministic evidence. | Repo-relative task receipt, exact closure command, `exit 0`, and every remaining blocker. |
| `complete` | Every task-specific command, receipt, dependency-evidence, external-proof, and required independent-approval condition is satisfied. | Maintainer or evidence-only closeout author after the required reviewers approve. | Tracked receipt, exact command and `exit 0`, satisfied direct predecessor evidence, and the required distinct approvals. |
| `archived` | Historical context only; never active proof. | Maintainer after replacement or roadmap retirement. | A historical pointer and an explicit non-active designation. |

Allowed transitions are only `pending -> in_progress`, `pending -> implemented`,
`in_progress -> implemented`, `implemented -> evidence_captured`,
`evidence_captured -> complete`, and `complete -> archived`. A task may omit the
optional `in_progress` working state, but it may never skip `implemented`,
`evidence_captured`, or the proof required for `complete`.

Existing prose maps exactly as follows: `implemented; approvals pending` and
`implemented-awaiting-independent-approvals` map to `evidence_captured` only
when the exact successful command and tracked receipt are present; without
both they map to `implemented`. `closed` maps to `complete`; `planned` maps to
`pending`. Active surfaces must also name the canonical state so this mapping
cannot hide a contradiction.

## Evidence and dependency rules

- A status JSON entry, source/doc marker, inventory row, passing static
  contract, or chat memory is not completion proof.
- An exact task closure command with `exit 0` and the tracked receipt named by
  the roadmap are both mandatory before `evidence_captured` or `complete`.
- A receipt path must be repo-relative, remain below
  `docs/roadmap-1.0-receipts/`, exist, and name its own two-digit task id.
- `implemented` and `evidence_captured` must state every remaining blocker.
  Neither word is interchangeable with `complete`.
- Every `complete` task explicitly records a positive
  `requiredIndependentApprovals` and an exactly matching
  `recordedIndependentApprovals`; omitted or zero-valued requirements never
  default to approval.
- For an execution dependency, an advancing task requires its direct
  predecessor's tracked receipt and successful closure result. Self, missing,
  cyclic, or evidence-incomplete dependencies fail closed.
- Task 1 is the sole explicit exception: its dependency relationship is a
  **final release/acceptance blocker, not an execution prerequisite**. Tasks 2+
  may be implemented and evidence-captured while Task 1 approvals wait for the
  final frozen branch. Task 1 still blocks final roadmap acceptance and release.
- Tasks 8–13 demonstrate the rule: their receipts alone did not manufacture
  completion. Their current `complete` states are backed by two recorded
  independent approvals per task.

## Independent review and evidence-only closeout

Task 1 uses the maintainer-approved pre-close model. Each of two independent
reviewers approves the resolved pre-close head and full range
`ec68c61..<pre-close-HEAD>`. An approval naming only
`e0f44a40de3059c9c2618f56440c0b428702361c`, a stale head, a partial range, or
fewer than two distinct reviewers is invalid.

Task 1 cannot enter `complete` from numeric counts alone. Its concrete
`currentTask1ApprovalRecord` names the tracked receipt and contains two
distinct reviewer identities, each naming that receipt, the resolved reviewed
head, and the same full range. A concrete `currentEvidenceOnlyCloseout` is also
mandatory.

The subsequent closeout commit is strictly evidence-only. It may touch only
the Task 1 approval receipt and the roadmap, status, risk, and directly derived
status-projection surfaces needed to record the result. It must not change
product or package source, generated/snapshot content, API behavior, lifecycle
or dependency semantics, contract semantics, or readiness risk. The receipt
names the reviewed pre-close head/range and uses the symbolic closeout identity
`SELF`. At the closeout moment the production validator resolves `SELF` to the
current Git `HEAD`, requires its parent to equal the reviewed head, and derives
the changed paths and diff from Git before applying the evidence-only path
allowlist; declarative behavior-change booleans are never proof.

Once that closeout lands, pin it with `recordedCloseoutCommit` (full SHA) on
`currentEvidenceOnlyCloseout`. The validator then resolves `SELF` to that
recorded commit instead of `HEAD`, so later post-roadmap product commits do not
re-litigate the evidence-only closeout. Omitting `recordedCloseoutCommit` keeps
the closeout-moment rule (`SELF` = `HEAD`).

A later evidence-only correction uses `SELF` for the correction and names the
prior concrete closeout commit in `priorCloseoutCommit`. Git must show the
correction's parent is that prior commit and the prior closeout's parent is the
reviewed head. The correction explicitly sets `reviewedEvidenceChanged`; a
true value invalidates approval. A later substantive commit without a recorded
closeout pin also invalidates approval because the recorded `SELF` ancestry and
Git-derived diff no longer describe the current head.

The same no-substantive-change rule applies whenever a task is moved from
`evidence_captured` to `complete` by recording required approvals. A closeout
record is evidence, not permission to broaden scope.

## Task packets and handoff

Use [`agent-tasks/execute-roadmap-task.md`](./agent-tasks/execute-roadmap-task.md)
for every active roadmap task. The packet, its index, and its contract must
remain aligned and retain all six required packet sections. Placeholder text,
missing lifecycle/stop rules, or an unindexed packet fails `make agent-tasks`.

Keep all temporary handoff context through evidence capture. Remove it only
immediately before final acceptance, after the exact command result and tracked
receipt are complete. Stop without claiming `complete` whenever a dependency,
receipt, command result, external proof, or approval remains open.

## Validation and stop conditions

`make agent-tasks agent-handoff` is the exact Task 21 closure command. The
handoff checker loads this contract and fails on unknown or skipped states,
invalid dependencies, unsafe receipts, premature completion, invalid Task 1
review ranges, forbidden evidence-only diffs, unsafe guidance, lifecycle packet
drift, or conflicting terminology. `make contract-inventory docs-index-drift
enterprise-audit` checks discovery wiring but is supporting proof, not the Task
21 closure command.

Stop immediately without a completion claim when any validator fails, evidence
is absent, the branch moved after review, a closeout diff is substantive, or a
required reviewer has not approved the resolved range.
