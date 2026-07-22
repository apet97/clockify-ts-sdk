# Task 15 Receipt — Wrapper replacement mutation proof

Date: 2026-07-22

## Implementation state

Task 15's replacement implementation and remote mutation measurement are
complete at `e65ec4da4c11a1e2d1bd91ac13a73f19908c4343`. The monotonic-checker
correction described below is complete in the current evidence-patch `HEAD` but
was not part of that earlier remote run. Independent review is still pending:
**0 of 2 required approvals are recorded**, so this receipt does not close the
review requirement.

The Task 15 base is the Task 14 approval closeout
`afdcac212def82209fbc3a0dfb1e92ab6e5e6eee`. The substantive commits are:

- calibration scope: `a13ee5b0497f3a27df70ddece6e71a7d88c343a1`;
- focused replacement tests and initial measured floors:
  `998d642b19afcb67da6ec8e81b04399c53cbc2f1`;
- final conservative floor ratchet:
  `e65ec4da4c11a1e2d1bd91ac13a73f19908c4343`.
- committed-floor checker correction: resolve the current evidence-patch
  `HEAD` immediately before review.

The evidence patch containing this receipt must be included in the independent
review range. Immediately before recording an approval, resolve its head and
review `afdcac212def82209fbc3a0dfb1e92ab6e5e6eee..HEAD`.

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

The Mutation workflow now checks out two commit generations. An isolated
end-to-end Git-repository suite proves that committed and uncommitted decreases
fail, committed unchanged and raised floors pass, the explicit root bootstrap
and first-contract introduction pass, and invalid predecessor JSON plus a
depth-one shallow checkout fail closed. Current source-scope and mutation-report
validation remain unchanged.

Reviewer A's approval of the earlier range predates this correction and is not
counted for the corrected frozen range. Both independent reviewers must review
`afdcac212def82209fbc3a0dfb1e92ab6e5e6eee..HEAD` again; the recorded state
therefore remains **0/2**.

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

## Approvals and remaining blockers

- Required independent approvals: **2**.
- Recorded independent approvals: **0**.
- Review state: pending over the complete Task 15 evidence range.
- Task 15 implementation/evidence state: complete; approval closeout pending.
- Task 18 aggregate approved-target proof remains incomplete.
- `remote-mutation-proof-pending` remains `open`, final-readiness blocking, and
  requires the Task 18 all-approved-target receipt before closure.

This receipt does not authorize a tag, publish, release, or main-branch
integration.
