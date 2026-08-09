---
name: clockify-sdk-add-mcp-tool
description: Add a tool to the @apet97/clockify-mcp-115 MCP server in clockify-ts-sdk, with the full count/contract/test/doc cascade that a new tool moves. Use when adding or removing an MCP tool, or when a tool-count gate (mcp-contract / mcp-agent-ux / docs-counts) reds.
---

# Adding an MCP tool

A new tool moves the tool count, which cascades into ~10 files. The MCP tool count
and the live-success-ops figure are DIFFERENT metrics that have collided on the same
number before — read the collision warning below.

## 1 · Implement the tool

Add a `defineTool(server, "clockify_<group>_<action>", {…}, async (args) => {…})` to the
existing `register<Group>Tools(server, ctx)` in `mcp/src/tools/<group>.ts`. Mirror a
sibling tool exactly:

- Read / routine-write tools: register with `defineTool(server, "clockify_<group>_<action>", {…}, handler)`
  from `mcp/src/result.ts`; call `ctx.client.<resource>.<method>(...)`; return
  `successResult(name, data, { workspaceId: ctx.workspaceId, count, ... })` (writes also merge in
  `writeReceipt(...)`).
- `business_write` / `external_side_effect` / `privileged` / `destructive` tools: register with
  `defineGuardedTool(server, ctx, "clockify_<group>_<action>", {…}, { preview, execute })` from
  `mcp/src/result.ts`. `preview` computes and returns the exact plan without mutating anything;
  `execute` receives only that stored preview and performs the mutation. The one-use
  `dry_run` → `confirm_token` handshake is backed by `ConfirmationTokenStore` in
  `mcp/src/orchestration/confirmation.ts`, which stores exactly one canonical preview for five
  minutes and executes that exact stored preview once.

Adding to an existing `register*Tools` needs **no** `server.ts` change (it's already
called). A brand-new resource group needs a new `register*Tools` wired in `mcp/src/server.ts`.

## 2 · Bump the version (a new tool is a feature)

`mcp` is hand-versioned (not release-please). Bump all three in lockstep:
`mcp/package.json` version, `mcp/manifest.json` version, and the **`version:` literal in
`mcp/src/server.ts`** (a test pins it to package.json). Add an `mcp/CHANGELOG.md` entry
under a `## [X.Y.Z]` heading (version-policy requires both `[Unreleased]` and the current
`[X.Y.Z]` heading). Then `npm install` so `package-lock.json` matches (else
`dependency-boundary` reds).

## 3 · Update the hand-maintained catalog + contracts

- `docs/mcp-tools.json` (NO writer script — hand-edit): bump `summary.totalTools` /
  `domainTools`, and update the resource group's `{resourceGroup, count, tools}` entry
  (the `tools` field is a comma-separated string of verb suffixes). The domainGroup
  counts must sum to `domainTools`.
- `docs/mcp-contract.json`, `docs/mcp-agent-ux-contract.json`, and
  `docs/mcp-write-safety-contract.json` carry NO hand counts (since 2026-08-09):
  their checkers derive expected counts from the regenerated
  `docs/mcp-tool-manifest.json`. Do not re-add `expected` count blocks.
- `mcp/tests/server.test.ts`: add the tool name to the (`.sort()`ed) array + bump
  `toHaveLength(N)`. `mcp/tests/setup-required.test.ts`: bump `toBe(N)`.
  `mcp/tests/tool-manifest.test.ts`: ratchet the `>=` floors.

## 4 · Regenerate, then update prose counts

```bash
npm run build -w @apet97/clockify-mcp-115
make mcp-tool-manifest readme-tables product-surface operation-parity
```

`docs/mcp-tool-manifest.json` regenerates from the *running* server (proves the live
count). Then update prose tool counts in `CLAUDE.md`, `AGENTS.md`, `README.md`,
`mcp/README.md`, `docs/product-north-star.md`, and `docs/decisions/0006-mcp-tool-surface-scope.md`
(its contract marker is "<N>-tool TS surface is a deliberate product decision" — keep
`docs/decision-records-contract.json` in sync). Mark the row shipped in `docs/mcp-backlog.md`.

## ⚠️ The count-collision trap

The MCP **tool count** and the live-success-ops headline are unrelated metrics
that once collided on the same number ("135"). When you bump the tool count,
update tool-count prose everywhere — but **never hand-edit the live-success
headline**: `docs/docs-counts-contract.json` `liveSuccessProse` derives it from
the corrected spec and pins it in BOTH `CLAUDE.md` and `AGENTS.md`. It moves only
when the spec's `x-clockify-live-status` markers change, which starts in
`../GOCLMCP/`. Read the current value out of `make docs-counts`; never type it.

## 5 · Verify (incl. live, if you have a sandbox)

```bash
npm run type-check -w @apet97/clockify-mcp-115 && npm run lint -w @apet97/clockify-mcp-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w @apet97/clockify-mcp-115
make mcp-contract mcp-agent-ux mcp-write-safety docs-counts decision-records agent-handoff changelog-drift
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast   # solo
```

Best proof: drive the new tool through the in-memory MCP client against a sandbox
(`loadContext(process.env)` → `buildServer` → `InMemoryTransport` → `client.callTool`)
and confirm it returns `ok` on the live wire. Then publish via the `clockify-sdk-publish`
skill (push an `mcp-vX.Y.Z` tag). Authoritative how-to: `docs/agent-tasks/add-mcp-tool.md`.
