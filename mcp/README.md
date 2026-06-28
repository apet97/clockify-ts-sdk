# @apet97/clockify-mcp-115

TypeScript stdio MCP server for Clockify, built on
`clockify-sdk-ts-115`. It is the Node sibling to
[`apet97/go-clockify`](https://github.com/apet97/go-clockify): one
local user, one pinned `CLOCKIFY_WORKSPACE_ID`, workflow tools first,
domain CRUD second.

This package now advertises 135 tools: 22 workflow tools plus 113
domain tools across Clockify's major resources. It is
unpublished by default in this repo, but keeps npm metadata and
`prepublishOnly` gates so a later publisher inherits the right checks.

Product posture: this is the pure-Node, SDK-vendor-style MCP sibling to
the Go reference server. Keep it workflow-first, easy to install, and
strict about receipts (`ids`, `changed`, `next`, stable errors,
recovery). For the repo-level quality bar, see
[`docs/product-north-star.md`](../docs/product-north-star.md).

New here? See [how this compares to other Clockify MCP servers and the first-run path](./POSITIONING.md).

## Install

The fastest path is the one-click bundle. A manual MCP-client config and a
build-from-source flow follow for other setups.

### One-click (recommended)

The `.mcpb` bundle has no GitHub Release asset attached yet, so build it from a
clone (or `npm i -g @apet97/clockify-mcp-115` for just the `clockify115-mcp`
binary — unofficial, under the `@apet97` scope):

```sh
make mcpb
```

This writes `mcp/clockify115-mcp-<version>.mcpb`, a self-contained bundle you can
open with Claude Desktop the same way.

Maintainers should run `make mcpb-smoke` before attaching the bundle to a GitHub
Release. Routine local gates run `make mcpb-validate`, which checks the manifest
without producing the binary bundle.

### Manual MCP client config

If your MCP client reads an `mcpServers` config instead of an `.mcpb`, use the
JSON block in [Configure](#configure). Note that `"command": "clockify115-mcp"`
requires the binary to be on your `PATH` first — install the package globally or
`npm link` it from a source build (below). Otherwise point `command` at an
absolute path: `node /absolute/path/to/mcp/dist/index.js`.

### Build from source

For development, or to produce the `clockify115-mcp` binary for the manual config
above:

```sh
cd mcp
npm install
npm run build
npm link
```

This builds the server against `clockify-sdk-ts-115` and links the
`clockify115-mcp` binary onto your `PATH`.

### Where to get your two values

- **API key**: Clockify -> Profile -> **API**, then generate a key.
- **Workspace id**: the 24-character id in your Clockify URL after
  `/workspaces/`.

### Verify it works

Ask your assistant to call `clockify_status`. It should report your user, your
workspace, and any running timer.

## Configure

The server reads `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` from
its process environment. `CLOCKIFY_BASE_URL` is optional and should
only be used for mock/replay gateways or private test environments.

```json
{
    "mcpServers": {
        "clockify": {
            "command": "clockify115-mcp",
            "env": {
                "CLOCKIFY_API_KEY": "your_key_here",
                "CLOCKIFY_WORKSPACE_ID": "your_workspace_id_here"
            }
        }
    }
}
```

## Workflow Tools

<!-- BEGIN generated:mcp-workflow-tools -->
| Tool | Purpose |
|---|---|
| `clockify_status` | Confirm user, workspace, and running timer. |
| `clockify_doctor` | Live preflight: validate the API key, workspace pin, base-URL posture, and clock skew (read-only). |
| `clockify_tools_guide` | Show workflow groups and when to use domain tools. |
| `clockify_plan_change` | Explain which tools a change will use, in order, before mutating (read-only). |
| `clockify_docs_search` | Search compact SDK/CLI/MCP guidance for agents (read-only). |
| `clockify_operation_guide` | Map a task, operation, or tool to recommended paths (read-only). |
| `clockify_sdk_snippet` | Return a compact SDK, CLI, or MCP snippet for a task (read-only). |
| `clockify_create_work_package` | Create or reuse client, project, task, and tag objects. |
| `clockify_log_work` | Log a finished time entry from names or IDs. |
| `clockify_start_work` | Start a running work timer. |
| `clockify_stop_work` | Stop the current running timer. |
| `clockify_switch_work` | Stop current work and start another timer. |
| `clockify_review_day` | Review daily totals, gaps, running timers, and missing fields. |
| `clockify_review_week` | Review weekly totals and issues. |
| `clockify_fix_entry` | Find one entry and update selected fields. |
| `clockify_invoice_client_work` | Create a draft invoice for a client. |
| `clockify_record_expense` | Prepare or record an expense with resolved names. |
| `clockify_request_time_off` | Create a time-off request from a policy name or ID. |
| `clockify_schedule_work` | Create a scheduling assignment from user/project names or IDs. |
| `clockify_setup_webhook` | Create a validated HTTPS webhook subscription. |
| `clockify_demo_seed` | Create deterministic demo objects. |
| `clockify_demo_cleanup` | Clean deterministic demo entries and objects by prefix. |
<!-- END generated:mcp-workflow-tools -->

## Workflow Examples

Create reusable work objects:

```json
{
    "name": "clockify_create_work_package",
    "arguments": {
        "client": "Acme",
        "project": "Website",
        "task": "Implementation",
        "tag": "Deep Work",
        "billable": true
    }
}
```

Log finished work:

```json
{
    "name": "clockify_log_work",
    "arguments": {
        "start": "2026-05-26T09:00:00Z",
        "end": "2026-05-26T10:15:00Z",
        "description": "Implemented Clockify workflow tools",
        "project_id": "PROJECT_ID",
        "task_id": "TASK_ID",
        "tag_ids": ["TAG_ID"]
    }
}
```

Start, stop, and switch timers:

```json
{ "name": "clockify_start_work", "arguments": { "project": "Website", "description": "Bugfixing" } }
{ "name": "clockify_stop_work", "arguments": {} }
{ "name": "clockify_switch_work", "arguments": { "project": "API", "description": "Review" } }
```

Review and fix:

```json
{ "name": "clockify_review_day", "arguments": { "date": "2026-05-26", "include_entries": true } }
{ "name": "clockify_review_week", "arguments": { "week_start": "2026-05-26" } }
{ "name": "clockify_fix_entry", "arguments": { "entry_id": "ENTRY_ID", "new_description": "Corrected description" } }
```

Business/admin workflows are two-step writes. Run with `dry_run:true`
first; the preview returns a short-lived, single-use `confirm_token`.
Re-run the same call with that token to execute the preview.

```json
{
    "name": "clockify_invoice_client_work",
    "arguments": {
        "client": "Acme",
        "currency": "USD",
        "issued_date": "2026-05-26",
        "due_date": "2026-06-09",
        "dry_run": true
    }
}
```

```json
{
    "name": "clockify_record_expense",
    "arguments": {
        "amount": 42.5,
        "category": "Travel",
        "project": "Website",
        "notes": "Taxi to customer site",
        "dry_run": true
    }
}
```

```json
{
    "name": "clockify_request_time_off",
    "arguments": {
        "policy": "Vacation",
        "start": "2026-06-01",
        "end": "2026-06-03",
        "note": "Family trip",
        "dry_run": true
    }
}
```

```json
{
    "name": "clockify_schedule_work",
    "arguments": {
        "user": "alice@example.com",
        "project": "Website",
        "start": "2026-05-27",
        "end": "2026-05-31",
        "hours_per_day": 6,
        "dry_run": true
    }
}
```

```json
{
    "name": "clockify_setup_webhook",
    "arguments": {
        "name": "Time entry audit",
        "url": "https://example.com/clockify",
        "webhook_event": "NEW_TIME_ENTRY",
        "dry_run": true
    }
}
```

Demo fixture helpers:

```json
{ "name": "clockify_demo_seed", "arguments": { "run_id": "smoke" } }
{ "name": "clockify_demo_cleanup", "arguments": { "run_id": "smoke" } }
```

`clockify_demo_seed` and `clockify_demo_cleanup` ship by default rather
than behind a flag: they back `npm run verify:live-cleanup`, the
sandbox proof that the server leaves no objects behind. `demo_seed`
creates only prefix-namespaced objects, and `clockify_demo_cleanup` is
`destructiveHint`-guarded so a client surfaces it as a destructive
action before running it.

## Resources and Prompts

The server exposes guide resources for agent discovery:

- `clockify://guide/axioms` — product axioms and safety boundaries.
- `clockify://guide/workflows` — workflow-first guidance and tool sequencing.
- `clockify://guide/safety` — write-safety rules including dry_run and confirm_token.
- `clockify://guide/agent-mode` — when to use the read-only discovery tools.
- `clockify://guide/which-tool` — intent → first-tool decision tree across time tracking, billing, and admin.
- `clockify://mcp/doctor` — No-network diagnostics checklist for local readiness.

The read-only `clockify_docs_search`, `clockify_operation_guide`, and
`clockify_sdk_snippet` tools help an agent pick the smallest correct SDK, CLI,
or MCP path before touching live data.

Prompts:

- `clockify-workflow-plan` — interactive workflow plan for time tracking and admin flows.
- `clockify-getting-started` — first-run setup walkthrough from API key and workspace to your first logged entry.

## Naming

Tools follow two grammars. **Workflow tools** read as action
verb-phrases (`clockify_log_work`, `clockify_review_day`,
`clockify_create_work_package`) so an agent picks them by intent.
**Domain tools** follow `clockify_<group>_<action>`
(`clockify_projects_create`, `clockify_entries_delete`) to mirror the
underlying Clockify resource. The canonical rules — and how they map to
SDK methods, CLI commands, and OpenAPI operations — live in
[`docs/naming-taxonomy-policy.md`](../docs/naming-taxonomy-policy.md),
the source of truth.

## Domain Tools

<!-- BEGIN generated:mcp-domain-tools -->
| Resource group | Count | Tools |
|---|---:|---|
| `clients` | 5 | list, get, create, update, delete |
| `projects` | 6 | list, get, create, update, delete, set_member_rate |
| `tasks` | 6 | list, get, create, update, delete, set_rate |
| `tags` | 5 | list, get, create, update, delete |
| `entries` | 6 | list, get, log, update, delete, mark_invoiced |
| `timer` | 2 | start, stop |
| `invoices` | 8 | list, get, create, update, delete, update_status, export, import_time |
| `expenses` | 10 | expense list/get/create/update/delete; category CRUD plus archive |
| `webhooks` | 5 | list, get, create, update, delete |
| `custom_fields` | 7 | workspace CRUD plus project field list/update/remove |
| `time_off` | 12 | requests, policies, and balances |
| `users` | 7 | list, member_profile_get, grant_role, revoke_role, set_member_rate, invite, member_profile_update |
| `scheduling` | 7 | assignments list/create/update/delete plus publish and capacity |
| `reports` | 4 | summary, detailed, weekly, attendance |
| `shared_reports` | 5 | list, view, create, update, delete |
| `groups` | 8 | CRUD plus membership tools |
| `holidays` | 5 | list/create/update/delete |
| `approvals` | 4 | list, submit, update state, resubmit |
| `audit_log` | 1 | search |
<!-- END generated:mcp-domain-tools -->

## Result Envelope

Every tool returns JSON in both `content[0].text` and
`structuredContent`. Every advertised tool also carries the shared
output schema for this envelope so MCP clients can validate the shape
before calling tools.

Success:

```json
{
    "ok": true,
    "action": "clockify_create_work_package",
    "entity": "work_package",
    "ids": { "workspaceId": "...", "projectId": "...", "taskId": "..." },
    "data": {},
    "meta": { "workspaceId": "..." },
    "changed": {
        "created": [{ "type": "project", "id": "...", "name": "Website" }],
        "reused": [{ "type": "tag", "id": "...", "name": "Deep Work" }]
    },
    "next": [
        {
            "tool": "clockify_log_work",
            "args": { "project_id": "...", "task_id": "..." },
            "reason": "Log finished work against this package."
        }
    ]
}
```

Name resolution (`clarification`): when a name is passed where a
user/group/project id is expected and it is ambiguous or unknown, the
tool returns a success-shaped receipt that asks for disambiguation
instead of calling Clockify. `candidates` carries the real ids the
agent should pick from.

```json
{
    "ok": true,
    "action": "clockify_groups_add_member",
    "clarification": {
        "question": "Multiple users match \"Bob\". Which one?",
        "field": "userId",
        "candidates": [
            { "type": "user", "id": "...", "name": "Bob Lee" },
            { "type": "user", "id": "...", "name": "Bob Ng" }
        ]
    }
}
```

Recoverable error:

```json
{
    "ok": false,
    "action": "clockify_log_work",
    "error": { "code": "invalid_request", "message": "end is required" },
    "recovery": {
        "hint": "Check entry, project, task, tag, and time fields; use returned IDs or exact names.",
        "tool": "clockify_review_day"
    }
}
```

Stable error codes:

| Code | Meaning |
|---|---|
| `invalid_request` | Local validation or Clockify 400. |
| `auth_or_permission` | Clockify 401/403. |
| `feature_unavailable` | Plan-gated or unavailable Clockify feature. |
| `not_found` | Missing ID or unresolved exact match. |
| `conflict` | Clockify 409. |
| `rate_limited` | Clockify 429. |
| `clockify_upstream_error` | Clockify 5xx. |
| `error` | Unknown local/runtime error. |

## Telemetry

`loadContext()` accepts SDK `composedFetch` hooks, so hosted callers or
tests can wire OpenTelemetry without forking the MCP server:

```ts
import { buildServer } from "@apet97/clockify-mcp-115/server";
import { loadContext } from "@apet97/clockify-mcp-115/client";
import { otelHooks } from "clockify-sdk-ts-115/otel-hooks";

const ctx = loadContext(process.env, {
    hooks: otelHooks({
        startSpan: (name, attrs) => tracer.startSpan(name, { attributes: attrs }),
    }),
});

const server = buildServer(ctx);
```

## TypeScript vs Go MCP

| | `@apet97/clockify-mcp-115` | `go-clockify` |
|---|---|---|
| Language | TypeScript / Node 20+ | Go |
| Transport | stdio | stdio |
| Tools | 135 | 156 |
| Strength | Node install, SDK-vendor style workflows, full domain CRUD | Drift gates, reports, raw API fallback, broader live evidence |
| Use when | You want a pure-JS Clockify MCP with workflow-complete daily use | You need the canonical, drift-gated reference server |

## Development

```sh
cd mcp
npm install
npm run type-check
npm test
npm run build
npm pack --dry-run
```

After live sandbox tests, assert deterministic test/demo objects were
not left behind:

```sh
CLOCKIFY_API_KEY="$CLOCKIFY_API_KEY" CLOCKIFY_WORKSPACE_ID="$CLOCKIFY_WORKSPACE_ID" \
  npm run verify:live-cleanup
```

Runtime tool-count smoke:

```sh
node dist/index.js <<<'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | jq '.result.tools | length'
```

## License

MIT
