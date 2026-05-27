# Examples Matrix

Examples are a product surface, not a dumping ground. This matrix ties the SDK
starter scripts, CLI command examples, MCP workflow examples, mock/live safety,
and receipt expectations to the same user jobs described in the product surface
and workflow cookbook.

## Rules

- SDK examples must import `clockify-sdk-ts-115`, never local source paths.
- CLI examples must use `clk115` or `clockify115` commands documented in `cli/README.md`.
- MCP examples must use documented workflow tools from `mcp/README.md` and preserve `structuredContent` receipts.
- Any live write example must name the sandbox-only boundary and cleanup or rollback expectation.
- Any high-risk MCP write example must start with `dry_run:true` and execute only with the returned `confirm_token`.
- Any retry or idempotency example must say that non-idempotent creates are not auto-retried by default.

## Coverage matrix

For a no-network examples plan, run:

```bash
node scripts/examples-plan.mjs --example auth-status
node scripts/examples-plan.mjs --example pagination
node scripts/examples-plan.mjs --example business-admin
node scripts/examples-plan.mjs --example demo-cleanup
```

Use `--example list` to print available IDs or `--format json` for
machine-readable output. `make examples-matrix` shape-checks the generated
all-examples plan for no-network, no-command, and no-env posture, plus required
example IDs, SDK/CLI/MCP paths, safety boundaries, and proof hints. The planner
does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls. It is
a map, not proof.

| User job | SDK example or path | CLI example or path | MCP example or path | Safety boundary |
|---|---|---|---|---|
| Authenticate and construct a client | `wrapper/examples/auth.ts` | `clk115 status` | `clockify_status` | Use environment variables; never commit tokens. |
| Paginate lists | `wrapper/examples/paginate-all.ts`, `wrapper/examples/paginated-list-basic.ts` | `clk115 projects list --json` | list domain tools such as `clockify_projects_list` | Read-only; safe for mock or sandbox. |
| Log and clean up time | `wrapper/examples/log-time-entry.ts` | `clk115 log`, then `clk115 entries delete <id>` | `clockify_log_work`, `clockify_review_day`, `clockify_fix_entry` | Live write requires sandbox and returned IDs. |
| Create or reuse work package objects | `wrapper/examples/create-project.ts` | `clk115 clients create`, `clk115 projects create`, `clk115 tags create` | `clockify_create_work_package` | Prefer reuse receipts and explicit IDs. |
| Business/admin write preview | SDK resource clients plus `withResponse()` | `clk115 invoices create`, `clk115 scheduling create`, `clk115 webhooks create` | `clockify_invoice_client_work`, `clockify_schedule_work`, `clockify_setup_webhook` | MCP uses `dry_run:true` plus `confirm_token`; CLI remains explicit and non-interactive. |
| Retry and idempotency | `wrapper/examples/retry-custom.ts`, `wrapper/examples/idempotency.ts`, `wrapper/examples/pass-idempotency-key.ts` | retry at caller shell level only after checking receipts | MCP recovery hints instead of blind retries | Non-idempotent creates are not auto-retried by default. |
| Observability and support | `wrapper/examples/structured-logging.ts`, `wrapper/examples/middleware-datadog.ts` | `--json` receipts and exit codes | `structuredContent`, `changed`, `warnings`, `next`, `recovery` | Preserve request IDs and stable error codes. |
| Webhook handling | `wrapper/examples/verify-webhook.ts` | `clk115 webhooks list/create/delete` | `clockify_setup_webhook` | Never expose webhook secrets; use sanitized payloads. |
| Demo and cleanup | SDK clients with timestamped slugs | normal create/list/delete commands in sandbox | `clockify_demo_seed`, `clockify_demo_cleanup` | Cleanup receipt and leftover count are proof. |

## Mock versus live

- Mock examples should use `CLOCKIFY_BASE_URL` or SDK `environment` override and synthetic IDs.
- Live read examples may run with `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` in a sandbox workspace.
- Live write examples must create timestamped or prefixed records and delete or archive them in the same flow.
- Customer workspaces are never acceptable for demo, cleanup, mutation, or proof examples.

## Promotion checklist

Before adding a new example:

1. Add it to `wrapper/examples/README.md` when it is an SDK script.
2. Add or update the row in this matrix when the user job is cross-surface.
3. Make sure snippets use placeholders, not committed secrets or real customer data.
4. Decide whether the example is mock-only, live read-only, live write+cleanup, or docs-only.
5. Update the supporting contract if the example changes CLI/MCP command names, receipt fields, or safety boundaries.
