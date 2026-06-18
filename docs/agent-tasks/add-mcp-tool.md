# Agent task: add an MCP tool

**When to use:** you are adding a tool to `@clockify115/mcp-server` — a domain tool
in `mcp/src/tools/*.ts` or a workflow tool in `mcp/src/tools/workflows/`. Adding a
tool moves every count assertion and several contracts in lockstep.

## Files to read first

- `AGENTS.md`, `CLAUDE.md`, `mcp/README.md`.
- `mcp/src/server.ts` — registration order; how the 21 workflow + 113 domain split
  is built.
- A close existing tool: `mcp/src/tools/status.ts` (read-only), `clients.ts`
  (destructive delete with `dry_run`/`confirm_token`), or
  `mcp/src/tools/workflows/business.ts` (high-risk workflow).
- `mcp/src/result.ts` and `mcp/src/output-schema.ts` (receipt envelope).
- `mcp/src/orchestration/confirm-guard.ts` (the `dry_run` → `confirm_token`
  handshake) for any mutating tool.
- `docs/mcp-tools.json`, `docs/mcp-contract.json`, `docs/mcp-agent-ux-contract.json`,
  `docs/mcp-write-safety-contract.json`, `docs/operation-parity-overrides.json`.
- `docs/mcp-agent-ux-policy.md` — every tool description must convey whether it
  mutates, whether `dry_run` is required, which id/name fields it accepts, and the
  next tool to call.

## Files you may edit

- `mcp/src/tools/<group>.ts` or `mcp/src/tools/workflows/<file>.ts` (the tool).
- `mcp/src/server.ts` (register it, if a new group).
- `mcp/tests/server.test.ts` (add the tool name to the sorted list, bump
  `toHaveLength`).
- `docs/mcp-tools.json` (`summary` counts + `workflowTools`/`domainGroups`).
- `docs/mcp-contract.json`, `docs/mcp-agent-ux-contract.json`,
  `docs/mcp-write-safety-contract.json` (counts + any new marker).
- `docs/operation-parity-overrides.json` (only if the tool maps to an OpenAPI
  operationId).
- `mcp/CHANGELOG.md` (`## [Unreleased]`) and `mcp/README.md` prose count line.

## Files you must NOT edit

- `mcp/README.md` generated table regions (between the generated headings) — run
  `make readme-tables`.
- `docs/product-surface.json` — generated; run `make product-surface`.
- `wrapper/src/**`, `output/ts-sdk/**`, `spec/corrected/**`, `spec/official/**`.

## Required tests / gates

```bash
npm run type-check -w @clockify115/mcp-server
npm test -w @clockify115/mcp-server          # server.test.ts asserts the exact tool count
make readme-tables product-surface operation-parity     # regenerate generated surfaces
make mcp-contract mcp-agent-ux mcp-write-safety docs-quality user-docs agent-handoff changelog-drift
make perfect-fast      # plus perfect-full to catch operation-parity-drift
```

## Required docs / changelog updates

- Bump tool counts everywhere: `docs/mcp-tools.json`, `docs/mcp-contract.json`,
  `docs/mcp-agent-ux-contract.json`, `mcp/tests/server.test.ts`,
  `mcp/README.md` prose, the `… -tool surface` marker in `mcp/CHANGELOG.md` (kept
  in sync with `docs/docs-quality-contract.json` + `docs/user-docs-contract.json`),
  then `make docs-counts`.
- Destructive tools: keep `dry_run`/`confirm_token` in the input schema and route
  through `requireConfirmation`; update `docs/mcp-write-safety-contract.json`.

## Completion checklist

- [ ] Tool registered; `mcp/tests/server.test.ts` count + name list updated.
- [ ] Description states mutate/dry_run/id-name/next-tool per the agent-UX policy.
- [ ] Mutating tools use the `dry_run` → `confirm_token` guard.
- [ ] Counts bumped in every count file + `make docs-counts` green.
- [ ] `make mcp-contract mcp-agent-ux mcp-write-safety` green; `make readme-tables product-surface operation-parity` regenerated.
- [ ] `make perfect-fast` and `make perfect-full` pass; output cited.
