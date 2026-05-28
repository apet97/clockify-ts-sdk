# MCP Agent UX Policy

This policy keeps `@clockify115/mcp-server` usable by agents that have to
choose safe Clockify actions without reading source code. The MCP should feel
like a guided workflow product, not a raw API dump.

## MCP user

The primary MCP user is an agent working for one human in one pinned Clockify
workspace. The agent needs clear defaults, durable receipts, and safe recovery
steps. It may not know Clockify's model, plan limits, or which tools mutate
state.

## Agent UX axioms

1. Status first. Start with `clockify_status` before workflow or domain work so
   credentials, workspace, running timer state, and plan-gated features are
   known before acting.
2. Workflow-first. Use workflow tools before low-level domain tools. Domain
   tools are escape hatches when a workflow tool cannot express the job.
3. Receipt-first. Every important result should expose structured receipts with
   `ids`, `changed`, `warnings`, `next`, stable error codes, and `recovery`.
4. Risky writes use preview. Invoices, expenses, time off, scheduling, and
   webhooks must route agents through `dry_run` and `confirm_token` when the
   operation can create, update, delete, send, schedule, or trigger external
   effects.
5. Names are not durable. Agents should reuse IDs returned by previous receipts
   instead of repeatedly resolving mutable names.
6. Unsupported is honest. Plan-gated, unavailable, or partially supported
   features should return recovery hints, not fake success.
7. Cleanup is explicit. Demo and live-test records must use recognizable
   prefixes and deterministic cleanup receipts.

## Required agent-facing surfaces

- Server instructions must say status-first, workflow-first, receipt-first,
  dry-run/confirm-token, stable error, and recovery rules plainly.
- `clockify://guide/axioms` must summarize the agent operating model in MCP
  resources.
- `clockify://guide/workflows` must point agents to workflow tools before
  domain tools.
- `clockify://guide/safety` must explain dry-run confirmation, cleanup, and
  customer-workspace avoidance.
- `clockify://mcp/doctor` must give agents and operators a no-network diagnostics checklist for env vars, runtime, mock base URLs, redaction, and the first live probe.
- `clockify-workflow-plan` must produce a plan that starts with status, prefers
  workflow tools, names confirmation points, and asks for structured receipts.
- `mcp/README.md` must expose workflow tools, resources and prompts, result
  envelopes, dry-run confirmation, and recovery semantics to humans.
- `docs/mcp-tools.json` remains the generated truth surface for tool counts and
  workflow/domain grouping.

## MCP behavior

MCP behavior should be boring and recoverable:

- Prefer one workflow tool that returns a complete receipt over many domain
  calls with hidden state.
- Preserve `structuredContent` for all tools so agents do not scrape prose.
- Include `content` text for humans, but do not make it the only contract.
- Treat `warnings` as first-class output, not decorative logs.
- Use stable error codes for known failures and include concrete recovery
  instructions.
- Make plan-gated features explicit in receipts and docs.
## MCP success receipt

A good MCP success receipt includes enough information for the next step without
another lookup:

```json
{
  "ok": true,
  "ids": { "projectId": "..." },
  "changed": ["created project"],
  "warnings": [],
  "next": ["run clockify_log_time"],
  "recovery": null
}
```

## MCP recovery receipt

A good MCP recovery receipt lets an agent continue safely:

```json
{
  "ok": false,
  "error": {
    "code": "CLOCKIFY_PLAN_RESTRICTED",
    "message": "This workspace plan does not expose the requested endpoint."
  },
  "changed": [],
  "warnings": ["no Clockify records were changed"],
  "next": ["choose a supported workflow or retry in a workspace with the feature"],
  "recovery": {
    "code": "CLOCKIFY_PLAN_RESTRICTED",
    "action": "report the plan gate and continue with supported tools"
  }
}
```

## Tool metadata

Generated MCP tool metadata lives in `docs/mcp-tools.json` and is checked against the server's registered tools. Domain tools are escape hatches for one-off operations; workflow tools should always be the first choice.

## Proof gates

- `make mcp-agent-ux` — checks the policy and contract.
- `make mcp-contract` — verifies tool counts, resources, prompts, output schema, and tests.
- `make mcp-write-safety` — guards destructive-write tools.

## Gate

Run `make mcp-agent-ux` after changing MCP instructions, resources, prompts,
result envelopes, output schemas, generated tool metadata, or the MCP README.
