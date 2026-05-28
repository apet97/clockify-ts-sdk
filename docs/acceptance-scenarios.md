# Acceptance Scenarios

Contracts prove important invariants, but an SDK platform is only convincing
when real user journeys are covered end to end. This file defines the minimum
acceptance scenarios that must stay true across the SDK, CLI, MCP, mock server,
live sandbox boundary, receipts, and OpenAPI truth surfaces.

## Scenario rules

- Each scenario must name the SDK, CLI, and MCP path when that surface is meant
  to support the job.
- Each scenario must identify whether mock proof, live proof, or both are
  required before a readiness claim.
- Mutating scenarios must include cleanup, explicit IDs, or confirmation-token
  behavior.
- Recovery scenarios must include stable error codes, retryability, recovery
  text, and request or tool correlation.
- First-run and support-handoff scenarios must prove no-network diagnostics,
  safe command hints, and support-bundle context before any live sandbox proof.
- OpenAPI/generator scenarios must preserve the upstream-first rule: GOCLMCP is
  canonical, local snapshots are downstream, and generated output is not edited
  by hand.
## Scenario matrix

For a no-network proof plan by scenario, run:

```bash
node scripts/plan.mjs acceptance --scenario auth-status
node scripts/plan.mjs acceptance --scenario first-run-diagnostics-support
node scripts/plan.mjs acceptance --scenario time-entry-mutation-cleanup
node scripts/plan.mjs acceptance --scenario business-admin-guarded-write
node scripts/plan.mjs acceptance --scenario package-consumer-install-smoke
```

Use `--scenario list` to print available IDs or `--format json` for
machine-readable output. `make acceptance-scenarios` shape-checks the generated
all-scenarios plan for no-network, no-command, no-env posture plus required
scenario IDs, SDK/CLI/MCP paths, evidence, escalation, and cleanup fields. The
planner does not run Git, npm, Docker, Fern, tests, builds, or Clockify API
calls. It is a map, not proof.

| Scenario | SDK path | CLI path | MCP path | Required evidence |
|---|---|---|---|---|
| Auth and status | `createClockifyClient()`, `client.health()`, and `withResponse()` for metadata | `clk115 status --json` | `clockify_status` | Mock-backed tests plus env/config and observability contracts. |
| First-run diagnostics and support handoff | `clockifyDiagnostics()` and quickstart receipt template | `clk115 doctor --json`, `clk115 status --json` | `clockify://mcp/doctor` | `make quickstart-receipt`, `make diagnostics`, `make support-bundle`, `make issue-intake`, `safeCommandHints`, and `readinessContext`. |
| Paginated list traversal | `paginate`, `iterAll`, `iterPages`, and `PaginatedList` | list commands such as `clk115 projects list --json` | domain list tools such as `clockify_projects_list` | Mock proof for the Last-Page header plus live sandbox coverage for real Clockify pagination. |
| Time-entry mutation and cleanup | time-entry create/list/update/delete resource clients | `clk115 log`, `clk115 entries list`, `clk115 entries delete <id>` | `clockify_log_work`, `clockify_review_day`, `clockify_fix_entry` | Live sandbox flow with returned IDs, cleanup prefix, `changed`, and final leftover count. |
| Work-package setup | clients, projects, tasks, and tags resource clients | `clients create`, `projects create`, `tasks list`, and `tags create` | `clockify_create_work_package` | Reuse/created receipts, explicit IDs, and workflow-cookbook parity. |
| Business/admin guarded write | invoices, expenses, time off, scheduling, and webhook clients | explicit non-interactive create/delete commands | `clockify_invoice_client_work`, `clockify_record_expense`, `clockify_request_time_off`, `clockify_schedule_work`, `clockify_setup_webhook` | MCP `dry_run:true` plus `confirm_token`; CLI write-safety; SDK no blind retry for non-idempotent creates. |
| Recovery and observability | typed errors, stable codes, rate-limit helpers, OTel hooks, and `withResponse()` | `--json` error receipts with `code`, `retryable`, and `recovery` | `structuredContent` error envelope with `recovery` and `next` | Receipt examples, observability contract, support bundle, and data-handling redaction. |
| OpenAPI truth and generated core | generated SDK methods behind durable wrapper seams | CLI uses wrapper semantics instead of inventing API truth | MCP uses wrapper semantics and parity metadata | GOCLMCP drift gates, Fern check/generate, operation coverage, generator comparison, and generated-edit guard. |
| Package-consumer install smoke | packed SDK tarball imports ESM/CJS and subpaths | packed CLI exposes `clockify115` and `clk115` | packed MCP exposes `clockify115-mcp` | `make pack-smoke`, package contract, runtime support, dependency boundary, and supply-chain contract. |

## Evidence escalation

Use the narrowest proof that matches the claim:

1. Contract proof: `make acceptance-scenarios` verifies this scenario map and
   its supporting evidence stays wired.
2. Mock proof: `make mock-contract` and package mock tests prove deterministic
   behavior without credentials.
3. Quickstart/support proof: `make quickstart-receipt`, `make diagnostics`,
   `make support-bundle`, and `make issue-intake` prove the first-run support
   packet before live readiness claims.
4. Package proof: package gates and `make pack-smoke` prove installed artifact
   behavior.
5. Full generation proof: `make perfect-full` proves GOCLMCP, Fern, package,
   and packed-consumer alignment.
6. Live proof: `make perfect-live` proves real Clockify sandbox behavior and
   cleanup. Do not use customer workspaces.

## Change rule

When a scenario gains, loses, or renames a public path, update this file, the
acceptance scenario contract, the workflow cookbook, and the relevant README or
contract surface in the same change. A scenario is incomplete if it only has a
unit test and no user-facing path, or if it has a README example with no receipt
or safety boundary. A first-run or support-handoff scenario is incomplete if it
lacks a no-network diagnostic receipt and support-bundle context.
