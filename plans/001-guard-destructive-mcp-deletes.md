# Plan 001: Route every destructive MCP domain delete through the dry_run → confirm_token guard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9839a72..HEAD -- mcp/src/tools docs/mcp-write-safety-contract.json mcp/tests/server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9839a72`, 2026-06-16

## Why this matters

The MCP server exposes a `dry_run` → `confirm_token` handshake so an LLM caller
must preview a destructive write and pass back a single-use token before anything
is deleted. Today only **6** domain deletes are wired to that guard
(`clockify_entries_delete`, `_projects_delete`, `_clients_delete`, `_tags_delete`,
`_tasks_delete`, `_webhooks_delete`). **Nine other tools carry
`destructiveHint: true` but delete immediately with no handshake** — including
`clockify_invoices_delete` (billing data) and `clockify_time_off_requests_delete`
(leave data). An LLM that ignores the annotation can destroy those records with a
single call and no preview. This plan closes that asymmetry by routing all nine
through the same shared guard, so the server-side contract — not the client's good
behavior — enforces the preview.

## Current state

- `mcp/src/orchestration/confirm-guard.ts` — exports `requireConfirmation(ctx, toolName, riskClass, args, preview)`. On `dry_run: true` it returns a `CallToolResult` carrying a preview + `confirm_token`; when a valid `confirm_token` is passed it returns `null` (caller proceeds); otherwise it returns an error result. **The handler must `return` the value when it is truthy and only mutate when it is `null`.**
- `mcp/src/tools/clients.ts` — the exemplar already-guarded delete. Its shape (this is the pattern to replicate exactly):

  ```ts
  server.registerTool(
      "clockify_clients_delete",
      {
          title: "Delete a client",
          description:
              "Permanently delete one client by ID. Run dry_run first, then retry with the returned confirm_token.",
          inputSchema: {
              clientId: z.string().min(1),
              dry_run: z.boolean().optional(),
              confirm_token: z.string().optional(),
          },
          annotations: { destructiveHint: true },
      },
      async (args) => {
          try {
              const preview = { action: "delete", entity: "client", id: args.clientId };
              const confirmation = requireConfirmation(ctx, "clockify_clients_delete", "client_delete", args, preview);
              if (confirmation) return confirmation;
              await ctx.client.clients.delete({ workspaceId: ctx.workspaceId, clientId: args.clientId });
              return successResult(
                  "clockify_clients_delete",
                  { deleted: true, clientId: args.clientId },
                  { workspaceId: ctx.workspaceId, clientId: args.clientId },
              );
          } catch (err) {
              return errorResult("clockify_clients_delete", err);
          }
      },
  );
  ```

- **The nine unguarded destructive tools** (each currently has `annotations: { destructiveHint: true }` but **no** `dry_run`/`confirm_token` in its `inputSchema` and **no** `requireConfirmation(...)` call). Grep each file for `server.registerTool("<name>"` to find the exact block:

  | File | Tool name(s) | Suggested `riskClass` |
  |---|---|---|
  | `mcp/src/tools/customFields.ts` | `clockify_custom_fields_delete` | `custom_field_delete` |
  | `mcp/src/tools/customFields.ts` | `clockify_project_custom_fields_remove` | `project_custom_field_remove` |
  | `mcp/src/tools/holidays.ts` | `clockify_holidays_delete` | `holiday_delete` |
  | `mcp/src/tools/groups.ts` | `clockify_groups_delete` | `group_delete` |
  | `mcp/src/tools/groups.ts` | `clockify_groups_remove_member` | `group_member_remove` |
  | `mcp/src/tools/expenses.ts` | `clockify_expenses_categories_delete` | `expense_category_delete` |
  | `mcp/src/tools/expenses.ts` | `clockify_expenses_delete` | `expense_delete` |
  | `mcp/src/tools/invoices.ts` | `clockify_invoices_delete` | `invoice_delete` |
  | `mcp/src/tools/scheduling.ts` | `clockify_scheduling_assignments_delete` | `scheduling_assignment_delete` |
  | `mcp/src/tools/timeOff.ts` | `clockify_time_off_requests_delete` | `time_off_request_delete` |

- `docs/mcp-write-safety-contract.json` — `confirmationGuardedDomainTools` currently lists exactly the 6 guarded tools. `check-mcp-write-safety.mjs` iterates that array and asserts each listed tool's registration contains the `domainDeleteRequiredMarkers` (`dry_run: z.boolean().optional()`, `confirm_token: z.string().optional()`) and a `requireConfirmation(ctx, "<name>"` call. Adding a tool to that array makes the gate enforce the guard on it.
- `mcp/tests/server.test.ts` — asserts the exact set of 126 (now 127 if Plan from a prior change landed; read the current `toHaveLength(N)` and the sorted name list) tool names and that each tool has a non-empty title + a description ≥ 40 chars. **Adding `dry_run`/`confirm_token` args does not change tool names or counts** — but the new descriptions must stay ≥ 40 chars.

Conventions to match: use `z` (already imported in each file), keep `annotations: { destructiveHint: true }`, wrap the body in `try/catch` returning `errorResult(...)`, and keep the existing delete call + any pre-steps (some deletes may archive-first or pre-fetch — preserve that logic; only wrap it with the guard).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck MCP | `npm run type-check -w @clockify115/mcp-server` | exit 0, no errors |
| MCP tests | `npm test -w @clockify115/mcp-server` | all pass (live `sandbox.test.ts` skips cleanly if `CLOCKIFY_API_KEY` is unset) |
| Write-safety gate | `make mcp-write-safety` | `MCP write-safety contract passed (N destructive tools checked).` |
| MCP contract + UX | `make mcp-contract mcp-agent-ux` | both `passed` |
| Full proof | `make perfect-fast` | exit 0 |

## Scope

**In scope** (modify only these):
- `mcp/src/tools/customFields.ts`, `holidays.ts`, `groups.ts`, `expenses.ts`, `invoices.ts`, `scheduling.ts`, `timeOff.ts` — add the guard to the nine tools above.
- `docs/mcp-write-safety-contract.json` — add the nine tool names to `confirmationGuardedDomainTools`.
- `mcp/CHANGELOG.md` — add an `## [Unreleased]` entry (touching `mcp/` requires it for `make changelog-drift`).

**Out of scope** (do NOT touch):
- The 6 already-guarded tools or any non-destructive tool.
- `mcp/src/orchestration/confirm-guard.ts` / `confirmation.ts` — the guard itself is correct; only call it.
- Tool *counts* / `docs/mcp-tools.json` / `mcp/tests/server.test.ts` name list — you are adding args, not tools.
- Any archive-first or pre-fetch logic already inside a delete handler — preserve it; only wrap with the guard.

## Git workflow

- Branch: `advisor/001-guard-destructive-mcp-deletes`
- Commit message style: conventional commits (repo uses `chore(...)`, `feat(...)`); e.g. `fix(mcp): require dry_run→confirm_token for all destructive domain deletes`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the guard to each of the nine tools

For each tool in the table, in its file:
1. Add `dry_run: z.boolean().optional(),` and `confirm_token: z.string().optional(),` to its `inputSchema`.
2. As the first lines inside the handler `try` block, build a `preview` object (`{ action: "delete", entity: "<entity>", id: <theIdArg> }`) and call
   `const confirmation = requireConfirmation(ctx, "<toolName>", "<riskClass>", args, preview); if (confirmation) return confirmation;`
   **before** the existing delete/remove call. Use the `riskClass` from the table.
3. Ensure `requireConfirmation` is imported in the file (`import { requireConfirmation } from "../orchestration/confirm-guard.js";` — match the relative path used by `clients.ts`). If the description is now < 40 chars or doesn't mention the handshake, extend it like the exemplar ("Run dry_run first, then retry with the returned confirm_token.").

**Verify**: `npm run type-check -w @clockify115/mcp-server` → exit 0.

### Step 2: Register the nine tools in the contract

In `docs/mcp-write-safety-contract.json`, append the nine tool names to `confirmationGuardedDomainTools` (keep it valid JSON). The array goes from 6 to 15 entries.

**Verify**: `make mcp-write-safety` → `MCP write-safety contract passed (...)`. If it fails naming a tool, that tool's registration is missing a required marker — fix Step 1 for that tool.

### Step 3: Changelog

Add an `## [Unreleased]` → `### Fixed` bullet to `mcp/CHANGELOG.md` describing that all destructive domain deletes now require the dry_run→confirm_token handshake.

**Verify**: `make changelog-drift` → `changelog coverage is current for touched package scopes`.

### Step 4: Full proof

**Verify**: `npm test -w @clockify115/mcp-server` → all pass; then `make perfect-fast` → exit 0.

## Test plan

- The existing `make mcp-write-safety` gate now structurally proves all 15 tools carry the guard (this is the primary regression check — no new unit test is strictly required).
- Optional but recommended: add one unit test per newly guarded tool family in `mcp/tests/` (model after the existing destructive-tool tests if present, or `mcp/tests/workflows.test.ts`) asserting that calling the tool **without** `dry_run`/`confirm_token` returns an error envelope (`ok: false`) and **with** `dry_run: true` returns a `confirm_token` in `data`. If you add tests, run `npm test -w @clockify115/mcp-server`.
- Verification: `make mcp-write-safety` → passes with 15 guarded tools.

## Done criteria

ALL must hold:
- [ ] `npm run type-check -w @clockify115/mcp-server` exits 0.
- [ ] Each of the nine tools' `inputSchema` contains `dry_run` and `confirm_token`, and its handler calls `requireConfirmation(ctx, "<name>", ...)` before the delete (`grep -c "requireConfirmation" mcp/src/tools/{customFields,holidays,groups,expenses,invoices,scheduling,timeOff}.ts` each ≥ 1).
- [ ] `docs/mcp-write-safety-contract.json` `confirmationGuardedDomainTools` has 15 entries.
- [ ] `make mcp-write-safety` passes.
- [ ] `mcp/CHANGELOG.md` `## [Unreleased]` updated; `make changelog-drift` passes.
- [ ] `make perfect-fast` exits 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:
- A tool's registration doesn't match the exemplar shape (e.g. the id arg isn't a simple `z.string()`, or the delete is part of a multi-call workflow) — report which tool and how it differs.
- `make mcp-write-safety` fails for a reason other than a missing marker you can add by following Step 1.
- Adding the guard would require changing a tool's name, its count, or `mcp/tests/server.test.ts`'s name list (it should not).
- Any tool's delete handler has archive-first/pre-fetch logic you're unsure how to preserve while wrapping with the guard.

## Maintenance notes

- After this lands, Plan 002 adds a gate that *enforces* this invariant for all future destructive tools — land 002 next so the asymmetry can't silently return.
- Reviewer should scrutinize: that the `requireConfirmation` call is *before* the mutation in every handler, and that no archive-first logic was dropped.
- The `riskClass` strings are free-form labels used for telemetry/rate-limit bucketing; keep them `<entity>_<verb>` for consistency with the existing 6.
