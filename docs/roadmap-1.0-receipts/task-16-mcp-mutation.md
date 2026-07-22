# Task 16 Receipt — MCP safety mutation proof

Date: 2026-07-22

## Implementation state

Task 16's implementation and authoritative GitHub-only MCP mutation proof are recorded at `56b7cbba149b5a4bf9477e7aeb6036167aedd87d`.
The task base is the Task 15 approval closeout `96b674539d2fd286456cf44c5fc7433f87fc3d6d`; Task 15 was complete before Task 16 implementation began.

The substantive Task 16 commits are:

- focused public behavior and static-contract tests: `803164268f798aa88fcc9d7ada8dd7a6167bb568`;
- conservative MCP floor ratchet: `56b7cbba149b5a4bf9477e7aeb6036167aedd87d`.

Task 16 is **complete**. Required independent approvals: **2**. Recorded approvals: **2**. Two independent reviewers approved the corrected frozen range with no remaining Critical, Important, or Minor findings.

## Governed MCP scope and final floors

The committed MCP mutation scope remains exactly these three hand-written sources; no source, exclusion, or pinned test file changed in the floor-ratchet round:

| Positive mutation source | Final floor |
|---|---:|
| `mcp/src/orchestration/confirmation.ts` | 86 |
| `mcp/src/result.ts` | 85 |
| `mcp/src/tool-risk.ts` | 90 |

The MCP global covered-mutant floor is **85**. The four dedicated test files in `mcp/stryker.conf.json` remain:

- `mcp/tests/confirmation-store.test.ts`
- `mcp/tests/result.test.ts`
- `mcp/tests/tool-registration.test.ts`
- `mcp/tests/tool-risk.test.ts`

The shared static validator now proves exact MCP positive-source/module-floor equality and rejects a missing `result.ts` floor, an existing unmutated MCP source, duplicate positive sources, and invalid or package-escaping source and exclusion paths.

## Retained remote-history context

The preflight GitHub run `29886859918` at `98d67b472564232f2f319307819cd2f768af24b5` is explicitly non-closure evidence: it predates completed Task 15 and cannot prove this task's final scope, artifact, review range, or floor-bearing head.

The interim measurement run `29908983968` at `803164268f798aa88fcc9d7ada8dd7a6167bb568` measured the new public behavior before the floors were ratcheted. It is retained calibration evidence only, not authoritative proof. The final run below executes at the floor-bearing commit.

## Authoritative GitHub-only execution

- Workflow run: [GitHub Actions Mutation run 29909385573](https://github.com/apet97/clockify-ts-sdk/actions/runs/29909385573)
- Run ID / attempt / target: `29909385573` / `1` / `mcp`
- Branch: `codex/clockify-1-0-truth`
- Head SHA: `56b7cbba149b5a4bf9477e7aeb6036167aedd87d`
- Conclusion: **success**
- Job ID: `88888400468`
- Job interval: `2026-07-22T09:47:50Z` through `2026-07-22T09:49:25Z`
- Passed steps: MCP mutation execution, MCP floor checker, and retained-artifact upload.

The exact retained artifact is:

- artifact API id: `8525238264`;
- name: `mutation-reports-mcp-1`;
- compressed size: `28152` bytes;
- created: `2026-07-22T09:49:23Z`;
- retention: 14 days;
- expires: `2026-08-05T09:49:23Z`;
- expired at verification: `false`.

The controller downloaded the final JSON only for temporary verification. It is not committed. Verified downloaded report size: `205751` bytes. Verified SHA-256: `2e02418aa787b8e567f6110389d23eed0150fb6d121fdb63071c528263d85c1b`. The report checker passed against all 24 retained mutation-contract history revisions.

## Final measurements

Covered-mutant scoring excludes `NoCoverage` and `Ignored`; `Killed` and `Timeout` count as passing. This report contains no `Timeout` or `Ignored` mutants.

| Final scope | NoCoverage | Killed | Survived | Timeout | Ignored | Covered | Passing | Score | Floor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MCP global | 7 | 247 | 41 | 0 | 0 | 288 | 247 | 85.763889 | 85 |
| `confirmation.ts` | 6 | 76 | 12 | 0 | 0 | 88 | 76 | 86.363636 | 86 |
| `result.ts` | 1 | 153 | 27 | 0 | 0 | 180 | 153 | 85.000000 | 85 |
| `tool-risk.ts` | 0 | 18 | 2 | 0 | 0 | 20 | 18 | 90.000000 | 90 |

Every final score meets its committed floor. The 48 remaining `Survived` or `NoCoverage` entries were inspected from the retained measurement report: optional receipt-field permutations, private confirmation-store integrity/cleanup branches, classifier fallbacks, and existing literal metadata keys were not promoted into low-value or implementation-coupled tests. The retained public gaps were covered by exact invalid-TTL expiry, array-preview, `writeReceipt`, MCP text-block, real SDK 402, and reserved-control registration tests.

## Focused local verification and sanitization

At the floor-ratchet head, the following local no-network checks passed:

```text
jq empty docs/mutation-score-contract.json
node --test scripts/lib/mutation-score-contract.test.mjs
  15 passed
npm run type-check -w @apet97/clockify-mcp-115
  passed
npm test -w @apet97/clockify-mcp-115 -- --run tests/confirmation-store.test.ts tests/result.test.ts tests/tool-registration.test.ts
  3 files passed; 60 tests passed
make mutation-ci
  50 passed; mutation CI workflow contract passed
node scripts/repo-doctor.mjs
  pass: 39, warn: 0, fail: 0
git diff --check
  passed
```

No local Stryker, `make mutation`, package mutation, coverage, `perfect-fast`, `perfect-full`, or live test was run by the implementer. The controller performed the authoritative GitHub workflow dispatch and supplied the final artifact verification; no local gate dispatched it. No push was performed by the implementer for this evidence commit. The retained JSON contains mutation metadata and repository source snippets, not credentials, workspace identifiers, customer data, or live Clockify responses. This receipt records only aggregate counts, hashes, and public workflow identifiers; no secret value was read, printed, or committed.

## Approval closeout and remaining blockers

The two approvals cover the corrected frozen range `96b674539d2fd286456cf44c5fc7433f87fc3d6d..a9e02532c1e6327bc3c5cdbb1ace158716ea1354`, with reviewed head `a9e02532c1e6327bc3c5cdbb1ace158716ea1354`. The closeout commit that records those approvals is evidence-only and is not part of the substantive reviewed implementation range.

The structured retained-run history now preserves Tasks 14 and 15 and adds this Task 16 MCP run. It does not assert aggregate completion: the CLI mutation target and the authoritative aggregate `all` proof/receipt required by Task 18 remain incomplete. Consequently `remote-mutation-proof-pending` stays open and release-blocking; this receipt authorizes neither a tag, publication, release, nor main-branch integration.
