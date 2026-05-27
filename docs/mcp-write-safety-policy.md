# MCP Write Safety Policy

The TypeScript MCP server is allowed to expose writes only when the
agent contract makes the blast radius obvious. A tool that can create,
delete, archive, remove, or call an external webhook must be boring to
reason about from `tools/list` alone.

## Rules

1. High-risk workflow writes require preview confirmation.

   Billing, expense, time-off, scheduling, and webhook setup workflows
   must expose `dry_run` and `confirm_token`. The first call previews
   the write and returns a single-use token. The second call must reuse
   that token with the same stable payload before the write executes.

2. Confirmation tokens are scoped and one-use.

   Tokens must include the tool name, workspace ID, risk class, stable
   args, and preview body. A consumed, expired, or mismatched token must
   fail with a recovery hint instead of widening execution.

3. Low-level destructive tools must advertise the danger.

   Domain delete/archive/remove tools must set `destructiveHint: true`,
   use ID-scoped inputs, and return a receipt that names what changed.
   These tools are lower-level escape hatches; agent-facing workflows
   should prefer the preview-confirm path when business state or
   external side effects are involved.

4. Demo and cleanup writes must be deterministic.

   Demo seed/cleanup flows must use identifiable prefixes, return
   changed receipts, and point to cleanup as the next action.

5. Documentation is part of the safety boundary.

   The README, guide resources, prompts, and output schema must keep
   the same terms: `dry_run`, `confirm_token`, `changed`, `warnings`,
   `next`, and `recovery`.

## Contract-shape rule

MCP write-safety contract shape is part of agent write safety. `make mcp-write-safety` must fail before trusting MCP README, resources, prompts, output schema, workflow registrations, destructive tool discovery, or policy evidence when `docs/mcp-write-safety-contract.json` has an invalid schema version, missing purpose, missing explicit invariants, unsafe repo-relative evidence paths, malformed destructive-tool thresholds, malformed workflow tool lists, malformed required-file markers, malformed workflow marker contracts, malformed forbidden policy markers, or malformed Make/docs/inventory/audit wiring.

## Required proof

- `make mcp-write-safety` checks the contract in this file.
- `make mcp-contract` checks MCP discoverability, guides, prompts, and
  output schema.
- `make perfect-fast` and `make perfect-full` include both gates.
