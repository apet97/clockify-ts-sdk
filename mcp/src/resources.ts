import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const GUIDE_RESOURCES = [
    {
        name: "clockify-axioms",
        uri: "clockify://guide/axioms",
        title: "Clockify SDK/MCP Axioms",
        description: "Rules for safe SDK, CLI, and MCP use.",
        text: `# Clockify Axioms

- Start with clockify_status so the user, workspace, and running timer state are known.
- Use workflow tools before low-level domain tools.
- Use IDs returned by previous calls instead of re-resolving names.
- Treat writes as receipts: inspect ids, changed, warnings, and next.
- Preserve stable error codes and recovery hints when a call fails.
- For business, external-side-effect, privileged, and destructive tools, run dry_run first and reuse the returned confirm_token.
- Do not use live/customer workspaces for tests, demos, or destructive probes.
`,
    },
    {
        name: "clockify-workflows",
        uri: "clockify://guide/workflows",
        title: "Clockify Workflow Cookbook",
        description: "Recommended first tools for common Clockify tasks.",
        text: `# Clockify Workflow Cookbook

1. Call clockify_status to confirm user, workspace, and running timer state.
2. Use clockify_create_work_package before logging work that needs client, project, task, or tag objects.
3. Use clockify_log_work for finished work and clockify_start_work / clockify_stop_work for timers.
4. Use clockify_switch_work when a user wants to stop the current timer and begin another.
5. Use clockify_review_day and clockify_review_week before fixing timesheets.
6. Use clockify_fix_entry only after reviewing the entry you intend to change.
7. Use domain tools only when a workflow tool does not cover the task.

Common paths:

- "Set up work then log it": clockify_status -> clockify_create_work_package -> clockify_log_work.
- "Start focus work": clockify_status -> clockify_create_work_package -> clockify_start_work.
- "Clean up a timesheet": clockify_status -> clockify_review_day -> clockify_fix_entry.
- "Prepare admin writes": clockify_status -> workflow tool with dry_run:true -> repeat with confirm_token.
`,
    },
    {
        name: "clockify-safety",
        uri: "clockify://guide/safety",
        title: "Clockify MCP Safety Notes",
        description: "Safety and recovery rules for agentic Clockify operations.",
        text: `# Clockify MCP Safety Notes

- Confirm the workspace before writing.
- When confirmation metadata is preview_token, dry_run is required before execution.
- Reuse confirm_token only for the preview it came from.
- Preserve request IDs and stable error codes when reporting failures.
- If a feature is plan-gated, return the recovery hint instead of retrying blindly.
- Do not infer missing IDs from partial names when an exact ID was already returned.
- After demos or tests, run cleanup by deterministic prefix.
- If cleanup cannot be proven, report the leftover object names and IDs.
`,
    },
    {
        name: "clockify-agent-mode",
        uri: "clockify://guide/agent-mode",
        title: "Clockify Agent Mode Guide",
        description: "Compact guidance for choosing SDK, CLI, and MCP surfaces.",
        text: `# Clockify Agent Mode Guide

Start with clockify_status.
Use clockify_docs_search when the task is unclear.
Use clockify_operation_guide before long-tail or risky workflows.
Use clockify_sdk_snippet for compact SDK, CLI, or MCP examples.
Preview every business, external-side-effect, privileged, and destructive write with dry_run, then confirm with confirm_token.
`,
    },
    {
        name: "clockify-which-tool",
        uri: "clockify://guide/which-tool",
        title: "Clockify: Which Tool to Use",
        description: "Intent to the first tool to reach for, across time tracking, billing, and admin.",
        text: `# Which Clockify Tool to Use

Always call clockify_status first. Then match the user's intent to the first tool:

Time tracking
- "log / record N hours of finished work" -> clockify_log_work
- "start / stop a timer", "clock in / out" -> clockify_start_work / clockify_stop_work
- "switch what I'm working on" -> clockify_switch_work
- "what did I do today / this week" -> clockify_review_day / clockify_review_week
- "fix / correct an entry" -> clockify_review_day first, then clockify_fix_entry

Setting up work
- "create or reuse a client / project / task / tag before logging" -> clockify_create_work_package

Billing
- "invoice a client for work" -> clockify_invoice_client_work (dry_run first, then confirm_token)
- "record an expense" -> clockify_record_expense (dry_run first)

People and time off
- "request time off" -> clockify_request_time_off (dry_run first)
- "schedule / assign someone" -> clockify_schedule_work (dry_run first)

Integrations
- "set up a webhook" -> clockify_setup_webhook (validated)

When no workflow tool fits
- Use clockify_operation_guide to map the task to a path, then call the matching domain tool.
- Reach for low-level domain tools (projects, tasks, clients, tags, entries, ...) only then.

Rule of thumb: prefer a workflow tool over assembling domain primitives, and preview every billing or admin write with dry_run, reusing the returned confirm_token.
`,
    },
    {
        name: "clockify-mcp-doctor",
        uri: "clockify://mcp/doctor",
        title: "Clockify MCP Doctor",
        description: "No-network diagnostics checklist for local MCP setup and safe next steps.",
        text: `# Clockify MCP Doctor

This resource is a no-network diagnostics checklist. It does not contact Clockify and does not prove credentials by itself.

Local setup checks:

- Confirm the MCP process has CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID set.
- Confirm CLOCKIFY_BASE_URL is unset for live Clockify work, or intentionally points at a mock/replay server.
- Confirm logs, receipts, and support bundles redact secrets, tokens, and full workspace identifiers.
- Confirm package runtime is Node.js 22.13 or newer.

Safe next steps:

1. Read clockify://guide/axioms and clockify://guide/safety.
2. Call clockify_status as the first live probe.
3. Use workflow tools before low-level domain tools.
4. For every tool whose confirmation metadata is preview_token, run dry_run first and reuse the matching confirm_token.
5. Preserve ids, changed, warnings, next, stable error codes, and recovery hints in the final answer.

If clockify_status fails, report the stable error code, recovery hint, and whether any Clockify records were changed.
`,
    },
] as const;

export function registerClockifyResources(server: McpServer): void {
    for (const resource of GUIDE_RESOURCES) {
        server.registerResource(
            resource.name,
            resource.uri,
            {
                title: resource.title,
                description: resource.description,
                mimeType: "text/markdown",
            },
            async (uri) => ({
                contents: [{ uri: uri.href, mimeType: "text/markdown", text: resource.text }],
            }),
        );
    }
}
