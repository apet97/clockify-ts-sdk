# MCP Write Safety Policy

The TypeScript MCP server is allowed to expose writes only when the
agent contract makes the blast radius obvious. A tool that can create,
delete, archive, remove, or call an external webhook must be boring to
reason about from `tools/list` alone.

## Rules

1. Every tool has one runtime-visible risk class.

   `tools/list` publishes `io.github.apet97.clockify115/risk` and
   `io.github.apet97.clockify115/confirmation` metadata. Read and
   routine-write tools use one-call registration. Business writes,
   external side effects, privileged writes, and destructive writes use
   the guarded registration path. Callers cannot override the annotations
   derived from those classes.

2. Every guarded write requires preview confirmation.

   Billing, expense, time-off, scheduling, and webhook setup workflows
   are included, as are approvals, shared reports, rates, invitations,
   role changes, and all delete/remove paths. The first call with
   `dry_run:true` validates and stores the exact preview, returning a
   single-use `confirm_token`. The token call executes that stored preview;
   it does not recompute state.

3. Confirmation tokens are scoped and one-use.

   Tokens bind the tool name, workspace ID, risk class, business arguments,
   canonical preview hash, and a canonical clone of the preview. A consumed,
   expired, reused, cross-tool, cross-workspace, changed-argument, or
   mismatched token fails before execution. A failed execution does not
   restore the token.

4. Risk classes derive protocol annotations.

   Only `destructive` sets `destructiveHint:true`, only
   `external_side_effect` sets `openWorldHint:true`, and only `read` sets
   `readOnlyHint:true`. Domain delete/archive/remove tools remain ID-scoped
   and return receipts naming what changed.

5. Demo and cleanup writes must be deterministic.

   Demo seed/cleanup flows must use identifiable prefixes, return
   changed receipts, and point to cleanup as the next action.

6. Documentation is part of the safety boundary.

   The README, guide resources, prompts, and output schema must keep
   the same terms: `dry_run`, `confirm_token`, `changed`, `warnings`,
   `next`, and `recovery`.
## Required proof

- `make mcp-write-safety` checks the live 140-tool manifest, exact risk
  distribution, 56 guarded tools, derived annotations, and the centralized
  registration boundary. It does not trust per-tool source markers.
- `make mcp-contract` checks MCP discoverability, guides, prompts, and
  output schema.
- `make perfect-fast` and `make perfect-full` include both gates.
