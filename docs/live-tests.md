# Live Test Safety

Live Clockify proof is valuable because it catches auth, permission,
pagination, and cleanup behavior that a mock server cannot prove. It
is also dangerous because the tests create and delete real Clockify
objects. Use this page before running any live gate.

## Absolute rule

Never run live gates against a customer workspace. Use only the pinned
sacrificial sandbox workspace for `CLOCKIFY_API_KEY` and
`CLOCKIFY_WORKSPACE_ID`.

## Required environment

| Variable | Required | Purpose |
|---|---:|---|
| `CLOCKIFY_API_KEY` | yes | Authenticates the SDK, CLI, and MCP live clients. |
| `CLOCKIFY_WORKSPACE_ID` | yes | Selects the sacrificial workspace. |
| `CLOCKIFY_CLEANUP_START` | optional | Narrows MCP cleanup scans for time entries. |
| `CLOCKIFY_CLEANUP_END` | optional | Narrows MCP cleanup scans for time entries. |

Do not print, paste, or commit token values. If the environment is not
known to be sandbox-safe, stop and use mock/replay proof instead.

## Live proof commands

```bash
make perfect-live
```

The TS MCP live cleanup path runs:

```bash
cd mcp && npm run verify:live-cleanup
```

That script builds the MCP package and runs
`mcp/scripts/assert-clean-prefixes.mjs`. The cleanup assertion scans
for known test prefixes such as `sdk-test-`, `mcp-sandbox-`,
`mcp-workflow-`, `mcp-log-`, `mcp-fix-`, and `DEMO-`.

If `../GOCLMCP` is present, `make perfect-live` also delegates to the
Go MCP live proof. Treat the final cleanup receipt as the source of
truth, not an intermediate green line.

## Deferring live proof

If sandbox credentials are unavailable, record an explicit deferral in the
release-decision packet with a `DEFER_LIVE_REASON`, for example:

```text
DEFER_LIVE_REASON="No sacrificial Clockify sandbox credentials are available in this session."
```

A deferral is residual risk. It is allowed only in a draft or decision
packet that states the reason, owner, and closure gate clearly. Completed
command receipts must replace the deferral with live sandbox proof from
`make perfect-live`.

## Mock alternative

For deterministic local development, use `CLOCKIFY_BASE_URL` or the
SDK `environment` option against the local mock server:

```bash
make mock-clockify
```

Mock/replay proof never replaces live sandbox proof for broad release
or readiness claims.