# Test Data Lifecycle Policy

Live proof is useful only when every created object is identifiable, paired with
cleanup, and checked after the run. This policy governs SDK, CLI, and MCP test
data in the sacrificial Clockify sandbox. It does not permit customer-workspace
experiments.

## Prefix ledger

| Prefix | Owner surface | Typical objects | Cleanup expectation |
|---|---|---|---|
| `clockify115-live-<timestamp>-<random>-` | Root orchestrator | Every object created by the current SDK, CLI, MCP, and GOCLMCP run | Same-test cleanup first; aggregate cleanup and rescan always run in `finally`. |
| `sdk-test-` | SDK live tests | tags and other low-risk SDK round trips | Create and delete in the same test. |
| `mcp-sandbox-` | MCP domain live tests | tags and low-risk domain objects | Create and delete in the same test. |
| `mcp-workflow-` | MCP workflow package tests | clients, projects, tasks, tags | Cleanup package IDs in `finally`. |
| `mcp-log-` | MCP work logging tests | projects, tasks, tags, time entries | Delete time entry, then cleanup package IDs. |
| `mcp-fix-` | MCP fix-entry tests | projects and time entries | Delete time entry, then cleanup package IDs. |
| `DEMO-` | MCP demo seed/cleanup | demo clients, projects, tasks, tags, entries | Cleanup through `clockify_demo_cleanup` and final leftover scan. |

## Lifecycle rules

- Every live create must use a timestamped or clearly prefixed slug.
- Every live create must have same-test cleanup or a documented cleanup tool.
- Cleanup code must tolerate partial creation and ambiguous failures.
- Wrapper, CLI, and MCP mutations require the root-generated prefix and an
  exact `CLOCKIFY_LIVE_WORKSPACE_CONFIRM` match before the first write.
- CLI timer, tag, client/project/task, and invoice round trips clean up through
  SDK calls in `finally`; the root cleanup remains the last-resort sweep.
- Final live proof must include one sanitized JSON receipt with per-entity
  counts and `"leftovers": 0`. Object and workspace identifiers are never
  included.
- Mock/replay tests may use synthetic IDs, but they must not be cited as live
  cleanup proof.

## Dependency order

The tested root cleanup library processes dependencies in this exact order:

1. Time entries (running and finished).
2. Scheduling assignments.
3. Pending time-off requests.
4. Expenses.
5. Draft invoices.
6. Shared reports.
7. Webhooks.
8. Tasks.
9. Projects.
10. Clients.
11. Tags.

Each row records `sanitizedIdCount`, `deletedCount`, `failedCount`, and
`remainingCount`. Discovery failures are incomplete results, never an empty
success, and later entity types are still attempted.

## Cleanup proof

`scripts/live/cleanup.mjs` is the dependency-ordered cleanup and post-delete
rescan library. `scripts/live/orchestrator.mjs` invokes it in `finally` for the
exact run prefix and all governed legacy prefixes. Any failed deletion,
incomplete discovery, malformed server state, or non-zero leftover count fails
the gate.

## Stop conditions

Stop instead of widening live proof when:

- The workspace is not known to be sacrificial.
- A live test cannot identify the records it creates.
- A write path lacks cleanup or rollback behavior.
- A cleanup scan returns leftovers that are not understood.
- The proof would expose customer names, user emails, invoice lines, expense
  receipts, webhook secrets, or token values.
## Proof gates

Before claiming test-data lifecycle readiness, run or cite:

- `make test-data-lifecycle`
- `make live-safety`
- `make mock-contract`
- `make mutation-safety`
- `make support-bundle`
- `make perfect-live` only with sacrificial sandbox credentials
