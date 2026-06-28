# MCP examples

`@apet97/clockify-mcp-115` is a stdio MCP server: an agent (Claude, etc.) calls its
tools, so these examples are **tool-call recipes**, not shell scripts. Each block
shows the tool name and the arguments to send.

## Run the server

```jsonc
// Claude Desktop / any MCP client config
{
  "command": "clockify115-mcp",
  "env": {
    "CLOCKIFY_API_KEY": "<sandbox key>",       // a sacrificial workspace only
    "CLOCKIFY_WORKSPACE_ID": "<workspace id>"
    // or set CLOCKIFY_BASE_URL to the mock server for offline runs
  }
}
```

Always call `clockify_status` first. When unsure which tool fits a request, read
the `clockify://guide/which-tool` resource — an intent → first-tool decision tree.

## Recipes (by cross-surface job)

**auth-status** — confirm credentials, workspace, and timer:

```jsonc
{ "tool": "clockify_status", "arguments": {} }
```

**time-entry** — log finished work (resolves project/tag names to ids):

```jsonc
{ "tool": "clockify_log_work",
  "arguments": { "duration": "1h30m", "description": "Sprint planning", "project": "Acme" } }
```

**business-admin** — invoice a client. Risky writes are two-step: preview with
`dry_run: true`, then re-send with the returned `confirm_token`:

```jsonc
// 1) preview — returns a confirm_token, changes nothing
{ "tool": "clockify_invoice_client_work",
  "arguments": { "client": "Acme", "dry_run": true } }
// 2) commit — reuse the EXACT token from the preview
{ "tool": "clockify_invoice_client_work",
  "arguments": { "client": "Acme", "confirm_token": "<token from step 1>" } }
```

**demo-cleanup** — seed demo objects, then remove them by deterministic prefix
(the cleanup result reports the leftover count, which must reach 0):

```jsonc
{ "tool": "clockify_demo_seed", "arguments": {} }
{ "tool": "clockify_demo_cleanup", "arguments": {} }
```

Every tool returns a structured `{ ok, ids, changed, warnings, next, ... }`
envelope (`structuredContent`); inspect `ids`/`changed` rather than re-resolving
names, and surface `next` + the stable error code on failure.

## More in this directory

- [`claude-desktop.json`](./claude-desktop.json) — drop-in Claude Desktop MCP config (sandbox key).
- [`agent-mode.md`](./agent-mode.md) — compact, LLM-context-friendly operating guide.
- [`workflow-transcripts/`](./workflow-transcripts/) — full tool-call transcripts:
  [log yesterday's work](./workflow-transcripts/log-yesterdays-work.md),
  [invoice Acme](./workflow-transcripts/invoice-acme.md),
  [clean demo data](./workflow-transcripts/clean-demo-data.md),
  [recover from not_found](./workflow-transcripts/recover-from-not-found.md).

See [`../../examples/README.md`](../../examples/README.md) for the SDK and CLI
equivalents of these jobs.
