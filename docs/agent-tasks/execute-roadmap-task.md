# Execute a roadmap task

Use this packet for one task in `docs/roadmap-1.0.md`. The canonical state
machine is `docs/plan-lifecycle-policy.md`: `pending`, `in_progress`,
`implemented`, `evidence_captured`, `complete`, and `archived` are distinct.

## Files to read first

1. `AGENTS.md` in full.
2. `docs/plan-lifecycle-policy.md` and
   `docs/plan-lifecycle-contract.json`.
3. The active roadmap row, `docs/roadmap-1.0-status.json`, the direct
   predecessor receipt, and the task's binding executor brief.
4. The source-specific policy and tests for the files in scope.

Confirm the predecessor's tracked receipt and successful closure result before
advancing. Task 1 is explicitly a final release/acceptance blocker, not an
execution prerequisite for Tasks 2+.

## Files you may edit

- Only paths named by the task brief and the smallest policy, contract, test,
  discovery, roadmap/status, and receipt surfaces needed for the task.
- Temporary or in-memory fixtures for RED/GREEN proof; they must never rewrite
  the active roadmap.
- The exact task receipt under `docs/roadmap-1.0-receipts/` after the closure
  command succeeds.

Preserve unrelated dirty work. Use small `apply_patch` diffs.

## Files you must NOT edit

- `spec/corrected/**`, `spec/official/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`.
- CI, auth, release, or security settings unless the task explicitly authorizes
  them.
- Product/package source during an evidence-only approval closeout.
- Another task's receipt, or active roadmap evidence merely to make a gate
  green.

Never run local Stryker, `make mutation`, or a package mutation command for the
1.0 roadmap. Never push, tag, publish, release, or integrate to main unless the
maintainer explicitly authorizes that separate action.

## Required tests / gates

1. Capture the required focused RED before implementing the validator or
   behavior.
2. Turn each focused case GREEN with the smallest implementation.
3. Run the exact closure command from the roadmap alone and capture its exit
   code. Supporting discovery checks do not replace it.
4. Run `node scripts/repo-doctor.mjs` and the task-specific diff check named by
   the brief.

For Task 21, the exact closure command is `make agent-tasks agent-handoff`.
`make contract-inventory docs-index-drift enterprise-audit` is supporting
discovery proof only.

## Required docs / changelog updates

- Track the task receipt only after the exact closure command succeeds. Record
  the task base, commands and exact results, files changed, sanitization and
  no-network posture, non-goals, and every remaining blocker.
- Update roadmap and status together without turning a marker, row, inventory,
  or receipt into completion proof.
- Do not update package changelogs for governance-only work.
- Keep temporary handoff context through evidence capture; remove it only
  immediately before final acceptance after command receipts are complete.

## Completion checklist

- [ ] The task id is unique and every dependency is present, acyclic, and
      evidence-satisfied under the lifecycle policy.
- [ ] `implemented` names missing evidence or approval; `evidence_captured`
      names the tracked receipt, exact successful command, and remaining
      blocker.
- [ ] The receipt path is repo-relative, exists, and names the correct task.
- [ ] `complete` is used only after command, receipt, dependency, external
      proof, and required independent approvals all pass.
- [ ] Each approval names the resolved reviewed head and full range; an
      evidence-only closeout contains no substantive change.
- [ ] A later substantive commit invalidates approval; an evidence-only
      correction says whether reviewed evidence changed.
- [ ] Task 1 remains a final release/acceptance blocker until its two valid
      approvals are recorded.
- [ ] The final diff contains no generated-path, mutation, push, tag, publish,
      release, or unrelated change.

Stop without claiming complete when any lifecycle condition, exact command,
tracked receipt, external proof, dependency evidence, or independent approval
remains open. Never declare completion from chat memory, a static marker, or a
status row.
