# Task 13 Receipt — Manual governance receipt (exact-artifact)

Date: 2026-07-22
Task base: `29fed6b` (Tasks 9–12 closure) + `e105470` (governed npm audit
gate).
Closing commit: the commit that introduces this receipt and the
`cross-package-release-proof-asymmetry` closure edits.

## Exact closure command and result

```text
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full pack-smoke release-readiness
```

Run 2026-07-22, solo, on the clean committed tree at `e105470`; **make exit
code 0** (captured as `MAKE-EXIT=0` in the invoking shell immediately after
make returned — the marker lives in the runner transcript, not the make log
itself; the retained log ends at normal completion with no `make: ***`
line, unlike both failed prior attempts). Every `perfect-full` stage
passed: the full prerequisite gate suite, `verify full` (codegen +
codegen-drift + generated-edit check, wrapper build, three package lints,
type-checks, full test suites, build, pack-snapshot-check,
performance-budgets, governed npm audit gate), then GOCLMCP drift,
spec-sync-drift, codegen-determinism, build-determinism,
generator-comparison, pack-smoke, coverage
(`coverage floor check passed (3 packages, 4 metrics each)`), and
mutation-ci — ending in `verify full: OK`. The explicit `pack-smoke` goal
re-ran the exact-artifact engine, and `release-readiness` reported
`Release readiness contract passed (12 evidence areas checked)`.

## Canonical exact-artifact digests (SDK, CLI, MCP)

```text
exact-artifact wrapper (clockify-sdk-ts-115): clockify-sdk-ts-115-0.12.1.tgz sha512-6YAU7jZF5g6phtyIHCq611xWQ/BlkOBL4wPRFS9q/q6bUV4S95SWuxXE6NaoGOrM+BZgTca7TTForZI1ENMOrg==
exact-artifact cli (@apet97/clockify-cli-115): apet97-clockify-cli-115-0.3.1.tgz sha512-9RGOnH38TiQmgwRvi3nBdu7yi0gXwWOFEBAJol/DffmOE1Ozz+ES913gVuBLLiPuiB1VhwfgIj5mdBRe9m5SXA==
exact-artifact mcp (@apet97/clockify-mcp-115): apet97-clockify-mcp-115-0.6.2.tgz sha512-RO3w73stvLLrNAm2WV37NODQSOIV0oJ6N7q/f2hN9nkF2rerLS//8TtDnfu7uU5SNYAXZFSJZgendTs9w9AA4Q==
0.3.1
mcp stdio smoke ok: 140 tools listed over stdio
packed consumer smoke passed for SDK, CLI, and MCP
```

Both pack-smoke executions in the closure run (inside `verify full` and as
the explicit goal) printed identical digests, re-confirming pack
determinism. The wrapper digest differs from the Task 10 receipt because the
committed `e105470` prose fix changed wrapper source that compiles into the
packed dist; the CLI and MCP digests are unchanged from Tasks 11–12.

Consumer outputs proven in the same run: SDK ESM+CJS import smoke (root,
`/iter`, `/webhooks`, `/errors`), CLI packed-bin `--version` → `0.3.1`, MCP
packed-subpath imports plus stdio `initialize` → `tools/list` → 140 tools.

## Recovery record (what it took to get here truthfully)

Two prior attempts at this closure failed and were fixed at root cause, not
worked around:

1. Newly published npm advisories turned the bare `npm audit --omit=dev`
   step red (high `fast-uri`, moderate `hono`, moderate
   `@hono/node-server`). In-range fixes were applied via `npm audit fix`;
   the remaining `@hono/node-server` advisory (GHSA-frvp-7c67-39w9) has no
   upstream fix and is unreachable from this stdio-only product, so the bare
   audit call was replaced by the governed fail-closed gate
   (`scripts/check-npm-audit.mjs` + `docs/npm-audit-exceptions.json`, commit
   `e105470`) — a documented, expiring, stale-detected exception register,
   not a weakened gate.
2. The npm lock surgery left a partial root `vitest` install
   (`cli-write-safety` MODULE_NOT_FOUND); fixed with a clean `npm ci`, which
   also end-to-end validated the lock CI will use.

## Governance boundary

Passing `release-readiness` validates the release-readiness contract. It
does **not** authorize a release, and no release, tag, publish, or
main-branch integration happened. The `cross-package-release-proof-asymmetry`
risk is closed by this receipt per its closure gate;
`remote-mutation-proof-pending` remains the open readiness blocker until
Task 18.

## Sanitization statement

The closure ran with blanked Clockify credentials; no secrets, workspace
ids, or customer data appear in the run log or this receipt.

## Limitations

- Digests identify the packed bytes at `e105470`; any future source change
  that reaches the packed output changes them (pack itself is
  deterministic).
- `make release-readiness` appeared as "Nothing to be done" in the combined
  invocation because make had already executed it as a `perfect-full`
  prerequisite in the same run; the passing output line quoted above is from
  that execution.

## Closure status

**Complete.** Exact closure command passed with exit 0; receipt tracked at
the exact roadmap path; risk flip recorded in the same commit.

Two independent reviewers approved the frozen range
`29fed6b50e03a23b7e8166ae53bcf8ba13a760c4..dd9a0c5a7b30f5c3639afa9849ab63981330df2f`
with no blocking findings. Task 13 is complete at 2/2 approvals.
