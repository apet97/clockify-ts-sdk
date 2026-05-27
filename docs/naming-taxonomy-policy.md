# Naming and Taxonomy Policy

This repo ships three user-facing surfaces, but it should feel like one Clockify platform with One Clockify vocabulary. SDK methods, CLI commands, MCP tools, docs, examples, error names, and OpenAPI operation mappings must use that one vocabulary instead of three local dialects.

## Canonical vocabulary

| Concept | Canonical wording | Surface shape |
|---|---|---|
| Time entries | `entries` for CLI/MCP user-facing groups; `timeEntries` for generated SDK resource clients. | CLI `clk115 entries ...`, MCP `clockify_entries_*`, SDK `client.timeEntries`. |
| Workflows | Action-oriented verbs: `start`, `stop`, `switch`, `log`, `review`, `fix`, `create_work_package`. | MCP workflow tools are `clockify_<verb>_<object>` or `clockify_<action>`. |
| Business workflows | `invoices`, `expenses`, `timeoff`, `scheduling`, `webhooks`, `audit-log`. | CLI groups use concise nouns; MCP workflow tools explain the business action. |
| Recovery | `code`, `retryable`, `recovery`, `requestId`, `changed`, `warnings`, `next`. | SDK helpers, CLI JSON, and MCP envelopes use the same receipt terms. |
| Generated API truth | OpenAPI `operationId`, SDK `client.<group>.<method>`, TS MCP `clockify_<group>_<action>`, Go MCP same where present. | `docs/operation-parity.json` maps the surfaces and curated exceptions. |

## Rules

- Public docs must say `clockify-sdk-ts-115`, `@clockify115/cli`, and `@clockify115/mcp-server` exactly.
- CLI commands use `clk115 <group> <verb>` except top-level workflow shortcuts such as `clk115 start`, `clk115 stop`, and `clk115 log`.
- MCP tool names keep the `clockify_` prefix and snake_case resource/action names.
- SDK docs point users to public wrapper helpers before generated internals.
- Operation parity overrides must explain any non-mechanical name mapping or intentional absence.
- New resource groups must update product surface metadata, generated README tables, workflow cookbook, examples matrix, and parity overrides when inference is not enough.
- Do not introduce aliases that preserve stale names unless a migration guide explains the deprecation path.

## Drift signals

These are vocabulary drift, not cosmetic noise:

- A README mentions an old package name or unsuffixed npm link.
- A CLI command and MCP workflow describe the same job with unrelated nouns.
- An MCP domain tool name no longer matches its generated resource group.
- Operation parity loses an SDK, TS MCP, or Go MCP mapping without an override reason.
- Examples teach names that are absent from the CLI/MCP README tables.

## Proof gates

- `make naming-taxonomy` checks this vocabulary contract.
- `make product-surface-drift`, `make operation-parity-drift`, and `make readme-tables-drift` keep generated naming surfaces current.
- `make sdk-public-api`, `make cli-contract`, and `make mcp-contract` check the public package surfaces.
- `make examples-matrix` and `make workflow-cookbook` check user-job wording across SDK, CLI, and MCP.
