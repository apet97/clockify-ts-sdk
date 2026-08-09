# Agent task: add an MCP tool

**When to use:** you are adding a tool to `@apet97/clockify-mcp-115` — a domain tool
in `mcp/src/tools/*.ts` or a workflow tool in `mcp/src/tools/workflows/`. Adding a
tool moves the count assertions in `mcp/tests` and the generated tool manifest.

## Files to read first

### Required before any edit

- `mcp/src/server.ts` — registration order; how the workflow/domain split is built.
- A close existing tool: `mcp/src/tools/status.ts` (read-only), `clients.ts`
  (destructive delete with `dry_run`/`confirm_token`), or
  `mcp/src/tools/workflows/business.ts` (high-risk workflow).
- `mcp/src/tool-risk.ts` and `mcp/src/result.ts` (risk classes and receipts).
- `docs/mcp-agent-ux-policy.md` — every tool description must convey whether it
  mutates, whether `dry_run` is required, which id/name fields it accepts, and the
  next tool to call.

### Reference (open on demand)

- `AGENTS.md`, `CLAUDE.md`, `mcp/README.md`.
- `mcp/src/output-schema.ts` (structured-output contract).
- `mcp/src/orchestration/confirmation.ts` (the five-minute, one-use stored
  preview token) for guarded writes.
- `docs/mcp-tools.json`, `docs/operation-parity-overrides.json`.

## Files you may edit

- `mcp/src/tools/<group>.ts` or `mcp/src/tools/workflows/<file>.ts` (the tool).
- `mcp/src/server.ts` (register it, if a new group).
- `mcp/tests/server.test.ts` (add the tool name to the sorted list, bump
  `toHaveLength`).
- `docs/mcp-tools.json` (`summary` counts + `workflowTools`/`domainGroups`).
- `mcp/tests/tool-manifest.test.ts` (the second exact-count anchor).
- `docs/operation-parity-overrides.json` (only if the tool maps to an OpenAPI
  operationId).
- `mcp/CHANGELOG.md` (`## [Unreleased]`) and `mcp/README.md` prose count line.

Since 2026-08-09 the contract JSONs (`docs/mcp-contract.json`,
`docs/mcp-agent-ux-contract.json`, `docs/mcp-write-safety-contract.json`) carry
no hand-typed counts — their checkers derive expected counts from
`docs/mcp-tool-manifest.json`, which `make mcp-tool-manifest` regenerates.

## Files you must NOT edit

- `docs/mcp-tool-manifest.json` — generated; run `make mcp-tool-manifest`.
- `mcp/README.md` generated table regions (between the generated headings) — run
  `make readme-tables`.
- `docs/product-surface.json` — generated; run `make product-surface`.
- `wrapper/src/**`, `output/ts-sdk/**`, `spec/corrected/**`, `spec/official/**`.

## Required tests / gates

```bash
npm run type-check -w @apet97/clockify-mcp-115
npm test -w @apet97/clockify-mcp-115          # server.test.ts asserts the exact tool count
make mcp-tool-manifest readme-tables product-surface operation-parity   # regenerate generated surfaces
make mcp-contract mcp-agent-ux mcp-write-safety docs-quality user-docs agent-handoff changelog-drift
make perfect-fast      # plus perfect-full to catch operation-parity-drift
```

## Required docs / changelog updates

- Bump tool counts in the hand anchors: `docs/mcp-tools.json`,
  `mcp/tests/server.test.ts`, `mcp/tests/tool-manifest.test.ts`,
  `mcp/README.md` prose, the `… -tool surface` marker in `mcp/CHANGELOG.md` (kept
  in sync with `docs/docs-quality-contract.json` + `docs/user-docs-contract.json`),
  then `make mcp-tool-manifest docs-counts`.
- Add every tool to `TOOL_RISK_BY_NAME` exactly once. Read/routine writes use
  `defineTool`; business/external/privileged/destructive writes use
  `defineGuardedTool`. The guarded helper owns `dry_run`/`confirm_token`, so do
  not declare those fields in the business schema. Preview must finish all
  validation and resolution and return the exact request plan that execute uses.

## Completion checklist

- [ ] Tool registered and risk-classified; `mcp/tests/server.test.ts` count + name list updated.
- [ ] Description states mutate/dry_run/id-name/next-tool per the agent-UX policy.
- [ ] High-impact writes use `defineGuardedTool`; routine writes remain one-call.
- [ ] Hand anchors bumped, `make mcp-tool-manifest` regenerated, `make docs-counts` green.
- [ ] `make mcp-contract mcp-agent-ux mcp-write-safety` green; `make readme-tables product-surface operation-parity` regenerated.
- [ ] `make perfect-fast` and `make perfect-full` pass; output cited.
