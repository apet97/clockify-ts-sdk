# @clockify/mcp-server

TypeScript Model Context Protocol server for [Clockify](https://clockify.me/),
built on [`clockify-sdk-ts`](https://www.npmjs.com/package/clockify-sdk-ts).

Sibling to the Go MCP server in
[`apet97/go-clockify`](https://github.com/apet97/go-clockify) — same
product shape (one user, one pinned workspace, stdio transport).
The Go server is the drift-gated 156-tool reference with workflow
orchestration, recovery hints, change sets, and dry-run / confirm
tokens. This TypeScript sibling ships an **89-tool CRUDL surface**
across every major domain (`@clockify/mcp-server` on npm), runs in
any Node 18.18+ environment without a Go toolchain, and is the right
choice when you want full domain coverage from a pure-JS install but
don't need the Go server's workflow tools or drift gates.

## Install

```sh
npm install -g @clockify/mcp-server
```

Or run via `npx` without installing:

```sh
npx @clockify/mcp-server
```

## Configure an MCP client

The server reads `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` from
its process environment. Configure both in the MCP client's launch
block.

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
    "mcpServers": {
        "clockify": {
            "command": "npx",
            "args": ["@clockify/mcp-server"],
            "env": {
                "CLOCKIFY_API_KEY": "your_key_here",
                "CLOCKIFY_WORKSPACE_ID": "your_workspace_id_here"
            }
        }
    }
}
```

### Claude Code (`~/.claude.json`)

```json
{
    "mcpServers": {
        "clockify": {
            "command": "clockify-mcp",
            "env": {
                "CLOCKIFY_API_KEY": "your_key_here",
                "CLOCKIFY_WORKSPACE_ID": "your_workspace_id_here"
            }
        }
    }
}
```

## Tools

89 tools across 17 resource groups. Naming follows
`clockify_<resource>_<action>` so an agent can mechanically discover the
surface from a single `tools/list` call.

| Resource group | Tools | Highlights |
|---|---|---|
| `status` | 1 | Workspace + user + running timer; the first call to confirm credentials. |
| `clients` | 5 | `list`, `get`, `create`, `update`, `delete`. |
| `projects` | 5 | `list`, `get`, `create`, `update`, `delete`. |
| `tasks` | 5 | `list`, `get`, `create`, `update`, `delete` (project-scoped). |
| `tags` | 5 | `list`, `get`, `create`, `update`, `delete`. |
| `entries` | 5 | `list`, `get`, `log`, `update`, `delete` (current user). |
| `timer` | 2 | `start`, `stop` (404 → ok envelope with note). |
| `invoices` | 7 | `list`, `get`, `create`, `update`, `delete`, `update_status`, `export`. |
| `expenses` + categories | 8 | Expense `list/get/delete` + category CRUDL + `archive`. |
| `webhooks` | 5 | `list`, `get`, `create`, `update`, `delete`. |
| `custom_fields` | 7 | Workspace CRUDL + project-scoped list / update / remove. |
| `time_off` (requests, policies, balances) | 12 | Request `list/get/submit/update_status/delete`, policy CRUDL + `archive`, balances `list/for_user`. |
| `scheduling` | 5 | `list`, `list_per_project`, `create`, `update`, `delete`. |
| `groups` | 8 | CRUDL + `list_members`, `add_member`, `remove_member`. |
| `holidays` | 5 | `list`, `list_in_period`, `create`, `update`, `delete`. |
| `approvals` | 3 | `list`, `submit`, `update_state`. |
| `audit_log` | 1 | `search` (≤31-day window). |

Run `tools/list` against the live server for the full machine-readable
list of inputs per tool; every input schema is generated from the
underlying typed SDK so client-side validation matches the wire
contract.

### Result envelope

Every tool returns a unified text content block:

```json
{
    "ok": true,
    "action": "clockify_projects_list",
    "data": [ /* upstream payload */ ],
    "meta": { "workspaceId": "...", "count": 2, "page": 1, "pageSize": 50, "hasMore": false }
}
```

Errors set `isError: true` on the `CallToolResult` and use the same
shape:

```json
{
    "ok": false,
    "action": "clockify_entries_log",
    "error": { "code": "not_found", "message": "Project not found" },
    "recovery": { "hint": "List projects first and pass the returned ID." }
}
```

Stable error codes: `invalid_request`, `auth_or_permission`,
`not_found`, `conflict`, `rate_limited`, `feature_unavailable`,
`clockify_upstream_error`, `error`.

## Relationship to go-clockify

| | `@clockify/mcp-server` (this) | `go-clockify` (sibling) |
|---|---|---|
| Language | TypeScript / Node 18.18+ | Go 1.25.10 |
| Tools | 89 (CRUDL across all major domains) | 156 (CRUDL + 15 workflow + reports + raw API + demo) |
| Transport | stdio | stdio |
| Drift gates | none — tool list is hand-curated | 7 (catalog, parity matrix, raw allowlist, …) |
| Confirmation tokens for destructive ops | no (lighter MVP) | yes |
| Best for | Quick install in any Node toolchain, casual / agentic everyday use. | Full marketplace coverage, regression-pinned, multi-tier toolsets. |

Reach for the Go server when you need the workflow tools
(`clockify_create_work_package`, `clockify_log_work`,
`clockify_review_week`, etc.), the risk-class rate limiters, the
catalog drift gates, or the raw API fallback. Reach for this
TypeScript server when you want zero-dependency install in a Node
project but still need full domain CRUDL coverage.

## Development

```sh
git clone https://github.com/apet97/clockify-ts-sdk
cd clockify-ts-sdk/mcp
npm install
npm run dev          # tsx; talks JSON-RPC over stdio
npm test             # 12 tests (envelope shape + in-memory MCP transport)
npm run build        # tsc -> dist/
```

Smoke test the binary directly:

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    | CLOCKIFY_API_KEY=... CLOCKIFY_WORKSPACE_ID=... node dist/index.js
```

`clockify-sdk-ts` is referenced as a `file:../wrapper` dev dependency
during local development; the published `@clockify/mcp-server` declares
it as a peer dependency.

## License

MIT
