# SDK CLI MCP Workflow Cookbook

This cookbook turns the product surface into user jobs. If a workflow is
easy in MCP, the related SDK and CLI path should also be obvious.

For a no-network workflow plan, run:

```bash
node scripts/plan.mjs workflow --workflow first-run-support
node scripts/plan.mjs workflow --workflow time-tracking
node scripts/plan.mjs workflow --workflow work-package
node scripts/plan.mjs workflow --workflow business-workflows
node scripts/plan.mjs workflow --workflow demo-and-cleanup
node scripts/plan.mjs workflow --workflow recovery
```

Use `--workflow list` to print available IDs or `--format json` for
machine-readable output. The planner does not run Git, npm, Docker, Fern, tests,
builds, or Clockify API calls. It is a map, not proof.

## First-run diagnostics and support handoff

Use this when a user needs to diagnose setup, auth, runtime, or support-readiness
issues before mock proof, live sandbox proof, or final acceptance.

| Surface | Path |
|---|---|
| SDK | `clockifyDiagnostics()` plus the quickstart receipt template. |
| CLI | `clk115 doctor --json`, `clk115 status --json`, `make quickstart-receipt`, and `make support-bundle`. |
| MCP | `clockify://mcp/doctor` as the diagnostic resource. |

Safety notes:

- Keep this workflow no-network until an operator deliberately runs mock or
  sandbox proof.
- Support bundles preserve `readinessContext` and `safeCommandHints`; they must
  not capture env values, tokens, workspace IDs, raw logs, probes, cookies, shell
  history, or `.env` files.
- Use the generated support bundle before asking a non-coder to paste logs,
  retry live calls, mutate Clockify data, or publish packages.

## Daily time tracking

Use this when a user wants to start, stop, switch, log, review, fix, or
delete work entries.

| Surface | Path |
|---|---|
| SDK | `createClockifyClient()` with `client.timeEntries`, `iterAll`, and `iterPages`. |
| CLI | `clk115 start`, `clk115 stop`, `clk115 log`, `clk115 entries list`, and `clk115 entries delete <id>`. |
| MCP | `clockify_start_work`, `clockify_stop_work`, `clockify_switch_work`, `clockify_log_work`, `clockify_review_day`, `clockify_review_week`, and `clockify_fix_entry`. |

Safety notes:

- Prefer returned IDs over name lookups when updating or deleting.
- CLI delete commands require explicit IDs.
- MCP workflow tools return `changed` and `next` receipts when useful.

## Work package setup

Use this when a user needs a client, project, task, and tags before
tracking work.

| Surface | Path |
|---|---|
| SDK | `client.clients`, `client.projects`, `client.tasks`, and `client.tags`. |
| CLI | `clk115 clients list`, `clk115 clients create`, `clk115 projects list`, `clk115 projects create`, `clk115 tasks list`, `clk115 tags list`, and `clk115 tags create`. |
| MCP | `clockify_create_work_package` first, then domain tools such as `clockify_clients_*`, `clockify_projects_*`, `clockify_tasks_*`, and `clockify_tags_*`. |

Safety notes:

- Reuse existing objects when the workflow returns a `reused` receipt.
- Keep generated SDK resource docs as reference, but make product
  examples point at the public SDK package.

## Business and admin workflows

Use this when a user handles invoices, expenses, time off, scheduling,
webhooks, or audit logs.

| Surface | Path |
|---|---|
| SDK | `client.invoices`, `client.expenses`, `client.timeOff`, `client.scheduling`, `client.webhooks`, and `client.auditLogReport`. |
| CLI | `clk115 invoices list`, `clk115 invoices create`, `clk115 expenses list`, `clk115 timeoff list`, `clk115 timeoff submit`, `clk115 scheduling list`, `clk115 scheduling create`, `clk115 webhooks list`, `clk115 webhooks create`, and `clk115 audit-log search`. |
| MCP | `clockify_invoice_client_work`, `clockify_record_expense`, `clockify_request_time_off`, `clockify_schedule_work`, and `clockify_setup_webhook`. |

Safety notes:

- MCP business/admin writes require `dry_run:true` and the returned
  `confirm_token` before execution.
- CLI writes remain non-interactive and scriptable; users review command
  arguments before running them.
- SDK callers should use `withResponse()` or composed-fetch hooks when
  they need request IDs and headers for support.

## Demo and cleanup

Use this for deterministic examples, smoke tests, and live sandbox demos.

| Surface | Path |
|---|---|
| SDK | `client.clients`, `client.projects`, `client.tasks`, `client.tags`, and `client.timeEntries`. |
| CLI | No dedicated demo command; use normal create/list/delete commands in a sacrificial workspace. |
| MCP | `clockify_demo_seed` followed by `clockify_demo_cleanup`. |

Safety notes:

- Live demo objects must use identifiable prefixes.
- Cleanup receipts are part of proof, not optional log noise.
- Do not run demo or live proof against a customer workspace.

## Recovery pattern

All surfaces share the same recovery vocabulary:

| Surface | Recovery hook |
|---|---|
| SDK | `classifyClockifyError()`, `getStableErrorCode()`, typed error classes, and `getRateLimitFromError()`. |
| CLI | `--json` errors include `code`, `recovery`, and `retryable`. |
| MCP | Error envelopes include stable `error.code`, `recovery`, and retry hints. |

When a workflow fails, keep the request ID or tool envelope, report the
stable error code, and use the recovery hint before broadening behavior.
