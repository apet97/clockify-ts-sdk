# Examples

Runnable, copy-paste examples for all three surfaces of this repo, organized by
the cross-surface jobs in [`docs/examples-matrix.md`](../docs/examples-matrix.md).
Pick your surface:

- **SDK** (`clockify-sdk-ts-115`) — 18 runnable TypeScript scripts in
  [`wrapper/examples/`](../wrapper/examples/README.md).
- **CLI** (`@clockify115/cli`) — runnable shell scripts in
  [`cli/examples/`](../cli/examples/).
- **MCP** (`@clockify115/mcp-server`) — agent tool-call recipes in
  [`mcp/examples/`](../mcp/examples/README.md).

All examples are safe to read offline and never contain secrets. Live runs use a
**sacrificial** sandbox workspace only (set `CLOCKIFY_API_KEY` +
`CLOCKIFY_WORKSPACE_ID`), or point at the mock server via `CLOCKIFY_BASE_URL`.

## Job → surface map

| Job | SDK script | CLI | MCP tool |
|---|---|---|---|
| **auth-status** — confirm credentials + workspace | `wrapper/examples/auth.ts` | `clk115 status` | `clockify_status` |
| **pagination** — walk every page | `wrapper/examples/paginate-all.ts`, `paginated-list-basic.ts` | `clk115 projects list --json` (one page); `clk115 api GET … --all` (all pages) | `clockify_*` list tools |
| **time-entry** — log finished work | `wrapper/examples/log-time-entry.ts` | `clk115 log` | `clockify_log_work` |
| **business-admin** — invoice a client | — | `clk115 invoices create` | `clockify_invoice_client_work` (`dry_run:true` first) |
| **retry-idempotency** — safe retries | `wrapper/examples/retry-custom.ts`, `idempotency.ts` | — | non-idempotent creates are not auto-retried |
| **observability** — structured logging | `wrapper/examples/structured-logging.ts`, `middleware-datadog.ts` | `--output ndjson` | `structuredContent` envelopes |
| **demo-cleanup** — seed then clean up | `wrapper/examples/bulk-archive.ts` | — | `clockify_demo_seed` → `clockify_demo_cleanup` |

## Shared helpers (any surface)

Names resolve to ids and dates resolve server-side via the SDK's
`clockify-sdk-ts-115/resolve` and `clockify-sdk-ts-115/dates` subpaths — the CLI
and MCP both use them, so `clk115 start --project "Acme"` (case-insensitive) and
`--date "yesterday"` work without you holding ids or computing dates. See
`wrapper/examples/auth.ts` for the client setup every example shares.
