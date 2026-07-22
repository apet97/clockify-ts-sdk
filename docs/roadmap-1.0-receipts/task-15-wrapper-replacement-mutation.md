# Task 15 Receipt — Wrapper replacement mutation proof

Date: 2026-07-22

## Implementation state

Task 15's replacement implementation and remote mutation measurement are
complete at `e65ec4da4c11a1e2d1bd91ac13a73f19908c4343`. The final
complete-history ratchet correction is complete at
`ed8baa188e88ed65faf24a49374491cf373aa9b2` and was not part of that earlier
remote run. Two independent reviewers approved the exact corrected frozen range
`afdcac212def82209fbc3a0dfb1e92ab6e5e6eee..ed8baa188e88ed65faf24a49374491cf373aa9b2`
with no remaining Critical, Important, or Minor findings. Task 15 is complete
with **2 of 2 required approvals recorded**.

The Task 15 base is the Task 14 approval closeout
`afdcac212def82209fbc3a0dfb1e92ab6e5e6eee`. The substantive commits are:

- calibration scope: `a13ee5b0497f3a27df70ddece6e71a7d88c343a1`;
- focused replacement tests and initial measured floors:
  `998d642b19afcb67da6ec8e81b04399c53cbc2f1`;
- final conservative floor ratchet:
  `e65ec4da4c11a1e2d1bd91ac13a73f19908c4343`;
- committed-floor correction:
  `d63e0fecc3c2d117a623dd26175560902cb00428`;
- retained governed-scope correction:
  `2a49b82b8284749af78f845f998991a859aef0f0`;
- complete first-parent history correction:
  `ed8baa188e88ed65faf24a49374491cf373aa9b2`.

The approval-closeout commit that records these review results is strictly
evidence-only. It is outside the substantive frozen range above and does not
alter the implementation, configuration, workflow, or mutation checker.

## Review correction — committed-floor ratchet

The first independent review found that the original monotonic check read
`HEAD:docs/mutation-score-contract.json` even when the checked-out contract was
already committed at `HEAD`. In that state it compared every floor with itself,
so the successful remote run proved the measured scores met the final floors but
did **not** provide end-to-end evidence that a committed floor decrease would be
rejected.

The correction chooses the baseline from repository state:

- if the worktree contract differs from committed `HEAD`, compare it with
  `HEAD`, preserving pre-commit protection;
- if the worktree contract equals `HEAD`, compare it with first-parent
  `HEAD^1`, protecting the committed CI state;
- allow no baseline only for a verified non-shallow root commit or the first
  introduction of the contract with no earlier first-parent history;
- fail closed on a shallow missing parent and on unexpected Git, read, or parse
  failures.

That first correction gave the Mutation workflow two commit generations. Its
isolated end-to-end Git-repository suite proved that committed and uncommitted
decreases failed, committed unchanged and raised floors passed, the explicit
root bootstrap and first-contract introduction passed, and invalid predecessor
JSON plus a depth-one shallow checkout failed closed. Per-package current
positive-source/floor equality and mutation-report validation remained
unchanged. The complete-history correction below supersedes that checkout
depth.

Reviewer A's approval of the earlier range predates this correction and is not
counted for the corrected frozen range. Both independent reviewers subsequently
approved the final exact range through `ed8baa188e88ed65faf24a49374491cf373aa9b2`,
as recorded in the closeout below.

## Second review correction — retained scope and shallow history

The next corrected-range review found two additional bypasses in the first
correction:

1. A depth-two clone could contain `HEAD` and `HEAD^1` while the first-parent
   commit lacked the contract. Its truncated path history appeared empty, so a
   historical contract could be deleted and reintroduced at a lower floor as a
   false first-introduction bootstrap.
2. Monotonic comparison iterated only current module-floor entries. Removing a
   governed source from both the current Stryker positive scope and current
   `moduleFloors` preserved their exact equality and skipped the predecessor
   floor entirely.

Both exact reproductions failed before the fix: the isolated suite reported
8 passes and 2 failures. That second correction rejected every missing
first-parent contract in a shallow repository; only complete, verified
non-shallow history could establish first introduction. Before package-specific
report validation it also validated the predecessor floor shape and required
every predecessor governed package and module path to remain present with an
equal-or-higher numeric floor. New packages and modules remained allowed. The
regression controls also covered governed-package deletion, malformed/empty
predecessor floors, and successful additions. The complete-history correction
below supersedes the immediate-predecessor comparison.

Neither disposition from either earlier review range counts toward this new
corrected frozen range. Both independent reviewers subsequently approved the
final exact range through `ed8baa188e88ed65faf24a49374491cf373aa9b2`, as
recorded in the closeout below.

## Third review correction — complete first-parent ratchet history

The controller audit found that immediate-parent comparison was still
insufficient because the Mutation workflow is dispatch-only. A floor could be
lowered in a commit where the workflow was not run, followed by an unrelated
commit; checking the later `HEAD` against only `HEAD^1` then compared the lower
contract with itself and forgot the earlier maximum. The same adjacency gap
could hide a governed source/floor deletion followed by reintroduction.

TDD reproduced both exact bypasses before implementation: the isolated suite
had 18 cases, with 16 passes and the skipped-workflow decrease plus historical
deletion/reintroduction cases failing because the checker incorrectly passed
them. The correction now:

- rejects every shallow repository and requires a complete first-parent graph;
- uses `git log --first-parent --reverse` scoped to the mutation contract, so it
  reads only contract-changing revisions while retaining complete history;
- parses and validates every used historical contract, then enforces the
  maximum global/module floors and union of governed packages/module paths at
  every revision and against a dirty worktree contract;
- permits genuine root and first-contract-introduction bootstrap only when the
  complete non-shallow history proves there was no earlier contract;
- preserves one exact immutable historical replacement at commit
  `0392e6943f9277dc91179328e61dd01d7c3c8d9e`: MCP
  `mcp/src/orchestration/confirm-guard.ts` floor 70 became
  `mcp/src/tool-risk.ts` floor 70. No configurable exception was added, and the
  retired path cannot be reintroduced;
- allows legitimate new packages/modules and floor raises while retaining all
  other historical scope; and
- changes the Mutation workflow and its machine contract to `fetch-depth: 0`.

The final isolated suite has 19 passing cases. It covers a lower commit followed
by an unchanged commit, source/floor deletion followed by reintroduction,
historical maxima with legitimate additions/raises, shallow depths one and two,
invalid historical JSON/floors, non-target package enforcement, and the real
repository history beginning with wrapper-only contract
`f8578a7ebf7a7fd76c5292c8c9242f426aa52153`. The real-history control also
proves the immutable 0392 replacement remains accepted while later governed
scope is retained.

Neither prior reviewer disposition counts for this corrected range. Both
independent reviewers approved the final exact range through
`ed8baa188e88ed65faf24a49374491cf373aa9b2`. Task 18 remains open with aggregate
proof false and the release-blocking risk open.

## Governed wrapper scope and final floors

The wrapper global covered-mutant floor remains **82**. Every positive source in
`wrapper/stryker.conf.json` has exactly one floor; all Task 14 sources and floors
were preserved.

| Positive mutation source | Final floor |
|---|---:|
| `wrapper/money.ts` | 98 |
| `wrapper/dates.ts` | 88 |
| `wrapper/errors.ts` | 80 |
| `wrapper/iter.ts` | 95 |
| `wrapper/composed-fetch.ts` | 82 |
| `wrapper/webhook-url.ts` | 83 |
| `wrapper/create-client.ts` | 67 |
| `wrapper/internal/authenticated-boundary-fetch.ts` | 87 |
| `wrapper/ensure.ts` | 94 |
| `wrapper/invoice-body.ts` | 93 |

The temporary zero floors and `calibrationPending` list were removed before the
authoritative run. The static contract requires exact positive-source/floor
equality and permits zero only while the same active source is named exactly
once by a non-empty `calibrationPending` list.

## Focused replacement proof

The replacement tests are:

- `wrapper/tests/ensure.test.ts` — successful and failed single-flight cleanup,
  ambiguity/name guards, exact get-current -> replacement archive -> delete
  ordering, project and client already-archived bypass, and failure
  short-circuiting;
- `wrapper/tests/invoice-body.test.ts` — every editable field, exclusion of
  read-only/computed and invalid optional fields, GET tax/discount/tax2 `/100`
  conversion, patch precedence, finite number/string/date requirements,
  visible-zero-field validation, supported tax types, and the exact exported
  percent-field mapping.

The focused suite passed with **2 files / 45 tests**. Every calibration
`Survived` and `NoCoverage` mutant in the two new modules was inspected directly.
Tests were added for replacement integrity, ordering, data-loss, and public
mapping survivors. Behaviorally equivalent survivors were documented in the
Task 15 implementation report; no line-count or implementation-shape test was
added.

## Calibration history — not closure proof

The first GitHub-only run measured the new sources while their machine-governed
floors were zero:

- run: [29894347455](https://github.com/apet97/clockify-ts-sdk/actions/runs/29894347455),
  attempt `1`, target `wrapper`, head
  `a13ee5b0497f3a27df70ddece6e71a7d88c343a1`, conclusion `success`;
- job `88841237242`, `2026-07-22T05:38:22Z` through
  `2026-07-22T06:30:42Z`;
- artifact API id `8520344940`, name `mutation-reports-wrapper-1`, compressed
  size `199572` bytes, created `2026-07-22T06:30:40Z`, expires
  `2026-08-05T06:30:40Z`, expired `false`, retention 14 days;
- downloaded report size `1656320` bytes, SHA-256
  `79415c0f47306ebc3b1fc9418666e4617f15cfc26ae65fefe01555be9592c8bf`.

| Calibration scope | NoCoverage | Killed | Survived | Timeout | Covered | Passing | Score | Floor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| wrapper global | 71 | 1725 | 312 | 22 | 2059 | 1747 | 84.847013 | 82 |
| `wrapper/ensure.ts` | 1 | 61 | 11 | 1 | 73 | 62 | 84.931507 | 0 |
| `wrapper/invoice-body.ts` | 0 | 118 | 33 | 0 | 151 | 118 | 78.145695 | 0 |

After focused tests, run
[29897495482](https://github.com/apet97/clockify-ts-sdk/actions/runs/29897495482)
at `998d642b19afcb67da6ec8e81b04399c53cbc2f1` succeeded with initial floors
84/78. It measured `ensure.ts` at 94.594595 and `invoice-body.ts` at 93.377483.
Because those floors no longer ratcheted the improvements, this run is retained
improvement evidence, not authoritative closure proof. Its artifact API id was
`8521586206`; downloaded report size was `1668504` bytes and SHA-256 was
`bab5a61a5147ab4349c05e7360407df06a1a7afffb3b2681980a71fa84dbe7c1`.

## Authoritative final GitHub-only execution

- Workflow run:
  [GitHub Actions Mutation run 29900533134](https://github.com/apet97/clockify-ts-sdk/actions/runs/29900533134)
- Run ID / attempt / target: `29900533134` / `1` / `wrapper`
- Branch: `codex/clockify-1-0-truth`
- Head SHA: `e65ec4da4c11a1e2d1bd91ac13a73f19908c4343`
- Conclusion: **success**
- Job ID: `88860048163`
- Job interval: `2026-07-22T07:31:51Z` through `2026-07-22T08:19:28Z`
- Step results: wrapper mutation execution passed; wrapper floor check passed;
  irrelevant full/MCP steps skipped; artifact upload passed.

The exact retained artifact is:

- artifact API id: `8522864155`;
- name: `mutation-reports-wrapper-1`;
- compressed size: `200930` bytes;
- created: `2026-07-22T08:19:25Z`;
- retention: 14 days;
- expires: `2026-08-05T08:19:24Z`;
- expired at verification: `false`.

The controller downloaded the report to the temporary evidence-only path
`/tmp/clockify-task15-authority.2K2XLT/wrapper/reports/mutation/mutation.json`.
It is not committed. Its verified size is `1672045` bytes and SHA-256 is
`7f972ae97cd56f44990e7bbf4423b7c6db86173981e219f0b01586dead757083`.

## Final measurements

Covered-mutant scoring excludes `NoCoverage` and `Ignored`; `Killed` and
`Timeout` pass, while `Survived` fails. The final report contains no `Ignored`
mutants.

| Final scope | NoCoverage | Killed | Survived | Timeout | Covered | Passing | Score | Floor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| wrapper global | 70 | 1753 | 283 | 24 | 2060 | 1777 | 86.262136 | 82 |
| `wrapper/ensure.ts` | 0 | 69 | 4 | 1 | 74 | 70 | 94.594595 | 94 |
| `wrapper/invoice-body.ts` | 0 | 141 | 10 | 0 | 151 | 141 | 93.377483 | 93 |

Every final score is at or above its pinned integer floor. The repository
checker `node scripts/check-mutation-score.mjs --package wrapper` passed against
this exact downloaded artifact. As noted above, the run's report and floor
validation remain valid, while its then-current self-comparison did not prove
the monotonic-history property; that property is covered by the correction's
isolated committed-history regression suite.

## Local commands and safety boundary

Focused local proof for Task 15 included:

```text
npm test -w clockify-sdk-ts-115 -- --run tests/ensure.test.ts tests/invoice-body.test.ts
node --test scripts/lib/mutation-score-contract.test.mjs
node --test scripts/check-mutation-score.e2e.test.mjs
npm run type-check -w clockify-sdk-ts-115
make mutation-ci
make risk-register risk-status-report
node scripts/repo-doctor.mjs
jq empty docs/mutation-score-contract.json docs/roadmap-1.0-status.json docs/risk-register.json
git diff --check
```

No local Stryker, `make mutation`, package mutation command, coverage command,
`perfect-fast`, or `perfect-full` was run. All mutation execution was GitHub-only.

## Sanitization

The retained reports contain mutation metadata and repository source snippets,
not API credentials, workspace identifiers, customer data, or live Clockify
responses. No secret value was read, printed, or committed. The receipt records
only repository paths, aggregate counts, public GitHub workflow identifiers,
artifact metadata, hashes, and test commands. Temporary downloaded report paths
are evidence references only.

## Independent approval closeout and remaining blockers

- Required independent approvals: **2**.
- Recorded independent approvals: **2**.
- Reviewed head:
  `ed8baa188e88ed65faf24a49374491cf373aa9b2`.
- Exact reviewed range:
  `afdcac212def82209fbc3a0dfb1e92ab6e5e6eee..ed8baa188e88ed65faf24a49374491cf373aa9b2`.
- Result: both independent reviewers approved the corrected frozen range with
  no remaining Critical, Important, or Minor findings.
- Task 15 implementation/evidence state: **complete; approvals recorded 2/2**.
- Task 18 aggregate approved-target proof remains incomplete.
- `remote-mutation-proof-pending` remains `open`, final-readiness blocking, and
  requires the Task 18 all-approved-target receipt before closure.

The commit that records this approval closeout is evidence-only. It is not part
of the substantive reviewed implementation or the frozen reviewed range above.

This receipt does not authorize a tag, publish, release, or main-branch
integration.
