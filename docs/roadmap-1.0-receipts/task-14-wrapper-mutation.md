# Task 14 Receipt — Wrapper authentication mutation proof

Date: 2026-07-22

## Commit and dependency state

- Task base (the Task 13 closing head):
  `dd9a0c5a7b30f5c3639afa9849ab63981330df2f`.
- Initial Task 14 mutation-scope commit:
  `98d67b472564232f2f319307819cd2f768af24b5`.
- Final floor-bearing implementation and remote-proof head:
  `af35cf59800f401d04fd293480ae1a06ab3e055c`.
- Dependency Task 13 is implemented. Task 14 is implemented with its remote
  floor proof recorded, but awaits two independent approvals (0/2 recorded).

The final head adds the authenticated-client floors, exact positive-mutate /
module-floor equality validation, adversarial static tests, and a deterministic
`Request.redirect` boundary test. No generated SDK source was edited.

## Exact governed scope and floors

The wrapper global covered-mutant floor remains **82**. The eight positive
`wrapper/stryker.conf.json` source paths have exactly one module floor each:

| Mutated source | Floor |
|---|---:|
| `wrapper/composed-fetch.ts` | 82 |
| `wrapper/create-client.ts` | 67 |
| `wrapper/dates.ts` | 88 |
| `wrapper/errors.ts` | 80 |
| `wrapper/internal/authenticated-boundary-fetch.ts` | 87 |
| `wrapper/iter.ts` | 95 |
| `wrapper/money.ts` | 98 |
| `wrapper/webhook-url.ts` | 83 |

The static contract fails closed on duplicate or invalid positive sources,
empty scopes, invalid exclusions, missing module floors, extra floor paths, and
non-source entries. Existing floors were not lowered.

## Authoritative GitHub-only execution

- Workflow run: [GitHub Actions Mutation run 29890732492](https://github.com/apet97/clockify-ts-sdk/actions/runs/29890732492)
- Run ID / attempt / target: `29890732492` / `1` / `wrapper`
- Branch: `codex/clockify-1-0-truth`
- Head SHA: `af35cf59800f401d04fd293480ae1a06ab3e055c`
- Conclusion: **success**
- Job ID: `88830507671`
- Job interval: `2026-07-22T04:18:55Z` through `2026-07-22T05:04:58Z`
- Proof steps: wrapper mutation execution passed; wrapper floor check passed.

No local Stryker, `make mutation`, package mutation command, coverage command,
`make perfect-fast`, or `make perfect-full` was run for Task 14.

## Retained artifact and downloaded report

- Artifact API ID: `8518815049`
- Exact name: `mutation-reports-wrapper-1`
- Compressed artifact size: `188746` bytes
- Created: `2026-07-22T05:04:56Z`
- Retention: 14 days
- Expires: `2026-08-05T05:04:54Z`
- Expired at verification: `false`
- Downloaded report:
  `/tmp/clockify-task14-final.9wvkqO/wrapper/reports/mutation/mutation.json`
- Downloaded JSON size: `1550515` bytes
- Downloaded JSON SHA-256:
  `222ed10b07886a8cda596d9cb499c0c15f592d5937f0b9867388f5f995505691`

The artifact is retained remote execution evidence; the downloaded JSON is a
temporary local verification input and is not committed.

## Downloaded measurements

The checker uses covered-mutant semantics: `NoCoverage` and `Ignored` are
excluded; `Killed` and `Timeout` pass; `Survived` fails. This report contains no
`Ignored` mutants.

| Scope | NoCoverage | Killed | Survived | Timeout | Covered | Passing | Score | Floor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| wrapper global | 70 | 1545 | 269 | 21 | 1835 | 1566 | 85.340599 | 82 |
| `wrapper/composed-fetch.ts` | 23 | 344 | 57 | 1 | 402 | 345 | 85.820896 | 82 |
| `wrapper/create-client.ts` | 13 | 79 | 38 | 0 | 117 | 79 | 67.521368 | 67 |
| `wrapper/dates.ts` | 6 | 297 | 37 | 0 | 334 | 297 | 88.922156 | 88 |
| `wrapper/errors.ts` | 1 | 318 | 68 | 0 | 386 | 318 | 82.383420 | 80 |
| `wrapper/internal/authenticated-boundary-fetch.ts` | 6 | 87 | 11 | 0 | 98 | 87 | 88.775510 | 87 |
| `wrapper/iter.ts` | 0 | 59 | 0 | 20 | 79 | 79 | 100.000000 | 95 |
| `wrapper/money.ts` | 0 | 12 | 0 | 0 | 12 | 12 | 100.000000 | 98 |
| `wrapper/webhook-url.ts` | 21 | 349 | 58 | 0 | 407 | 349 | 85.749386 | 83 |

Every global and module score is at or above its pinned integer floor. Compared
with calibration, the new `Request.redirect` test killed one authenticated-
boundary survivor: that module moved from 86 Killed / 12 Survived (87.76) to
87 Killed / 11 Survived (88.78).

## Sanitization and focused local verification

The report contains mutation metadata and repository source snippets, not API
credentials, workspace identifiers, customer data, or live Clockify responses.
The receipt records only aggregate counts and hashes. No secret value was read,
printed, or committed.

Focused Round 1 proof at the floor-bearing head:

```text
node --test scripts/lib/mutation-score-contract.test.mjs
  4 passed
make mutation-ci
  19 passed; mutation workflow contract passed
npm test -w clockify-sdk-ts-115 -- --run tests/create-client.test.ts tests/authenticated-boundary-fetch.test.ts
  2 files passed; 56 tests passed
node scripts/repo-doctor.mjs
  pass: 39, warn: 0, fail: 0
git diff --check
  passed
```

Round 2 independently verified the downloaded file size and SHA-256, recomputed
the global and all eight module counts/scores above, and ran:

```text
make mutation-ci
  19 passed; mutation workflow contract passed
make risk-register risk-status-report docs-index-drift
  4 readiness tests passed; 13-risk register passed; exactly one blocking risk
  remains (remote-mutation-proof-pending); docs index current
node --test scripts/lib/mutation-score-contract.test.mjs
  4 passed
node scripts/repo-doctor.mjs
  pass: 39, warn: 0, fail: 0
jq empty docs/roadmap-1.0-status.json
  passed
git diff --check
  passed
```

## Remaining blockers and status

Task 14 is **implemented; independent approvals pending (0/2)**. Task 15 remains
pending and still depends on Task 14. Task 18's aggregate GitHub-only mutation
receipt is not complete, so `remote-mutation-proof-pending` remains open and
release-blocking. This receipt does not authorize a tag, publish, release, or
main-branch integration.

## Review correction

Two independent reviews requested changes before approval:

1. The static equality check accepted a nonexistent path when the positive
   mutate entry and floor key matched, and it did not reject an exact or broad
   exclusion that negated governed sources. The checker now supplies a
   repository-backed regular-file check for every positive and floor path.
   Exclusions must remain within their package and cannot glob-match any
   governed positive source; non-canonical parent-segment paths also fail.
   Existing wrapper and MCP exclusions remain valid.
2. The aggregate roadmap status and risk evidence still said no retained run
   existed. They now record this receipt's Task 14 wrapper run URL/artifact as a
   partial proof and explicitly set aggregate approved-target proof complete to
   `false`. Task 18 and `remote-mutation-proof-pending` remain open.

TDD evidence:

- RED: the mutation contract suite passed its prior 4 cases but failed the new
  nonexistent matching source/floor and exact/broad overlap cases (2 failures).
- GREEN: repo-backed existence and exclusion overlap validation made the suite
  pass; a separate foreign-package exclusion test then failed RED and passed
  GREEN after the minimal package-boundary check. A final parent-segment path
  fixture failed RED and passed after canonical-path validation. Final focused
  suite: 8/8.
- RED: the readiness test first observed the stale
  `no-retained-github-mutation-run-recorded` value. After correcting the data,
  it remained RED because the checker accepted a stale fixture. GREEN: the
  roadmap status contract now rejects stale status, missing Task 14 URL, and
  premature aggregate completion fixtures.

Correction proof:

```text
make mutation-ci
  23 passed; mutation workflow contract passed
make risk-register risk-status-report release-readiness docs-index-drift
  5 readiness tests passed; 13-risk register passed; exactly one blocking risk
  remains; release-readiness contract passed; docs index current
node scripts/repo-doctor.mjs
  pass: 39, warn: 0, fail: 0
jq empty docs/mutation-score-contract.json docs/roadmap-1.0-status.json docs/risk-register.json
  passed
git diff --check
  passed
```

No local Stryker or mutation command ran during the correction. Approval state
remains 0/2 until the reviewers re-review this correction.
