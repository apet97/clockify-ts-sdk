# Test Data Lifecycle Policy

Live proof is useful only when every created object is identifiable, paired with
cleanup, and checked after the run. This policy governs SDK, CLI, and MCP test
data in the sacrificial Clockify sandbox. It does not permit customer-workspace
experiments.

## Prefix ledger

| Prefix | Owner surface | Typical objects | Cleanup expectation |
|---|---|---|---|
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
- Final live proof must include the cleanup prefix list, the
  `mcp/scripts/assert-clean-prefixes.mjs` JSON receipt with `"total": 0`,
  and sanitized object IDs only when needed.
- CLI live tests stay read-only until a write+cleanup contract exists for each
  command group.
- Mock/replay tests may use synthetic IDs, but they must not be cited as live
  cleanup proof.

## Cleanup proof

`mcp/scripts/assert-clean-prefixes.mjs` is the post-run cleanup assertion. It
scans known prefixes across clients, projects, tags, time entries, invoices, and
webhooks. A non-zero leftover count fails the gate.

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
