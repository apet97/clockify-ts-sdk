# @clockify/mcp-server

TypeScript Model Context Protocol server for [Clockify](https://clockify.me/),
built on [`clockify-sdk-ts`](https://www.npmjs.com/package/clockify-sdk-ts).

Sibling to the Go MCP server in
[`apet97/go-clockify`](https://github.com/apet97/go-clockify) — same
product shape (one user, one pinned workspace, stdio transport),
focused on the high-leverage everyday flows. The Go server is the
larger, drift-gated 156-tool reference; this package is a leaner
13-tool TypeScript surface that ships as `@clockify/mcp-server` on
npm and runs in any Node 18.18+ environment without a Go toolchain.

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

| Tool | Purpose | Read-only |
|---|---|---|
| `clockify_status` | Workspace ID + current user + running timer. The first call to confirm credentials. | ✅ |
| `clockify_projects_list` | Paginated list of projects (filter by name / archived / clientId). | ✅ |
| `clockify_projects_create` | Create a project. | |
| `clockify_clients_list` | Paginated list of clients. | ✅ |
| `clockify_clients_create` | Create a client. | |
| `clockify_tasks_list` | Paginated list of tasks under a project. | ✅ |
| `clockify_tags_list` | Paginated list of tags. | ✅ |
| `clockify_tags_create` | Create a tag. | |
| `clockify_entries_list` | Paginated list of the current user's time entries. | ✅ |
| `clockify_entries_log` | Log a finished entry (explicit start+end, or duration+end). | |
| `clockify_entries_delete` | Delete a time entry. *(destructive hint)* | |
| `clockify_timer_start` | Start a running timer. | |
| `clockify_timer_stop` | Stop the running timer (404 → ok envelope with note). | |

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
| Tools | 13 (everyday surface) | 156 (full domain coverage) |
| Transport | stdio | stdio |
| Drift gates | none — tool list is hand-curated | 7 (catalog, parity matrix, raw allowlist, …) |
| Confirmation tokens for destructive ops | no (lighter MVP) | yes |
| Best for | Quick install in any Node toolchain, casual / agentic everyday use. | Full marketplace coverage, regression-pinned, multi-tier toolsets. |

Reach for the Go server when you need the full 156-tool surface, the
risk-class rate limiters, or the catalog drift gates. Reach for this
TypeScript server when you want zero-dependency install in a Node
project or just the everyday flows.

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
