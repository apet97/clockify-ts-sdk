# Task 17 Receipt — CLI mutation proof

Date: 2026-07-22

## Implementation state

Task 17 governs the CLI command-risk, reference-resolution, and receipt
modules. Its floor-bearing implementation is
`9dfc3bfa0c204cc3118efba9eea15f109cf0874b`; the task base is the Task 16
approval closeout `37c3138a0fa66b7626572972c1fdad2efc44b06c`.

The substantive Task 17 commits are:

- CLI mutation-target and calibration governance:
  `35256b9530dc75a6ac3575e8844118620fe24e61`;
- public CLI edge tests:
  `fe6d4cda88f6cd7d97a11c9c9ce4f4178a978ed2`;
- conservative floor ratchet:
  `9dfc3bfa0c204cc3118efba9eea15f109cf0874b`.

Task 17 is **complete**. Required approvals: **2**. Recorded approvals:
**2**. Two independent reviewers approved the corrected frozen range with no
remaining Critical, Important, or Minor findings. This receipt does not
complete Task 18, a release, a tag, or publication.

## Governed CLI scope and final floors

| Positive mutation source | Final floor |
|---|---:|
| `cli/src/commands/leaf-command.ts` | 95 |
| `cli/src/commands/resolve-refs.ts` | 95 |
| `cli/src/receipt.ts` | 100 |

The global covered-mutant floor is **96**. The pinned test files remain:

- `cli/tests/command-risk.test.ts`
- `cli/tests/mutation-leaves.test.ts`
- `cli/tests/receipt.test.ts`
- `cli/tests/resolve-refs.test.ts`

The temporary `globalCalibrationPending` and `calibrationPending` fields are
absent. Static tests reject their reintroduction and any zero CLI module floor.

## Non-authoritative measurement history

- Calibration run `29912033512`, target `cli`, at
  `35256b9530dc75a6ac3575e8844118620fe24e61`, was only the zero-floor
  calibration input. It must not be used as closure proof.
- Post-test measurement run `29912616222`, target `cli`, at
  `fe6d4cda88f6cd7d97a11c9c9ce4f4178a978ed2`, justified the positive floors
  but predates the floor-bearing commit. It is measurement evidence only.

## Authoritative GitHub-only execution

- Workflow run: [GitHub Actions Mutation run 29913220026](https://github.com/apet97/clockify-ts-sdk/actions/runs/29913220026)
- Run ID / attempt / target: `29913220026` / `1` / `cli`
- Branch: `codex/clockify-1-0-truth`
- Head SHA: `9dfc3bfa0c204cc3118efba9eea15f109cf0874b`
- Conclusion: **success**
- Job ID: `88900864671`
- Job interval: `2026-07-22T10:47:03Z` through `2026-07-22T10:48:03Z`

The retained artifact is `mutation-reports-cli-1` (API id `8526772929`):

- compressed size: `18058` bytes;
- created: `2026-07-22T10:47:59Z`;
- expires: `2026-08-05T10:47:58Z`;
- expired at verification: `false`.

The final JSON was downloaded only for temporary verification and is not
committed. Its verified size is `123286` bytes and SHA-256 is
`5b9422e3ff3f77dc6abe39a1ab1ae082923eb70f11ea1efcedf9fb300dee5be8`.
The report checker passed against all 26 retained mutation-contract history
revisions.

## Final measurements

Covered-mutant scoring excludes `NoCoverage` and `Ignored`; `Killed` and
`Timeout` count as passing. The final report has no timeout or ignored mutant.

| Final scope | NoCoverage | Killed | Survived | Timeout | Ignored | Covered | Passing | Score | Floor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CLI global | 4 | 121 | 5 | 0 | 0 | 126 | 121 | 96.031746 | 96 |
| `leaf-command.ts` | 2 | 47 | 2 | 0 | 0 | 49 | 47 | 95.918367 | 95 |
| `resolve-refs.ts` | 2 | 57 | 3 | 0 | 0 | 60 | 57 | 95.000000 | 95 |
| `receipt.ts` | 0 | 17 | 0 | 0 | 0 | 17 | 17 | 100.000000 | 100 |

Every final score meets its committed floor. The remaining `Survived` and
`NoCoverage` entries are the previously reviewed private post-registration
guard, optional/default-literal normalization, and noun-literal cases. No
implementation-coupled test was added for them; receipt has no open mutants.

## Approval closeout and remaining blocker

The two independent approvals cover exactly
`37c3138a0fa66b7626572972c1fdad2efc44b06c..3fdf27913470b09a79149fc4e2518e7837164c90`,
with reviewed head `3fdf27913470b09a79149fc4e2518e7837164c90`. The commit
recording those approvals is evidence-only and is not part of the substantive
reviewed implementation range.

## Local verification and remaining blocker

At the floor-ratchet head, `make mutation-ci`, `make risk-register
docs-index-drift agent-handoff`, the four pinned CLI test files (86 tests),
CLI type-check, JSON parsing, and `git diff --check` passed. No local Stryker,
`make mutation`, coverage, live test, push, tag, release, or publication was
run by the implementer.

The retained-run history includes the authoritative CLI proof alongside Tasks
14–16. Individual wrapper, MCP, and CLI mutation proofs are recorded, and
Task 17's two independent approvals are complete. The
`remote-mutation-proof-pending` blocker stays open solely because Task 18
still needs the authoritative aggregate `all` proof and receipt. This receipt
authorizes neither release nor main integration.
