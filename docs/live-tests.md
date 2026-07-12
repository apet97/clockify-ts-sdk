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
| `CLOCKIFY_LIVE_WORKSPACE_CONFIRM` | yes | Must exactly equal the workspace id; the orchestrator refuses every mutation otherwise. |
| `CLOCKIFY_LIVE_PREFIX` | generated | The orchestrator replaces any caller value with one unique `clockify115-live-<timestamp>-<random>-` prefix. |

Do not print, paste, or commit token values. If the environment is not
known to be sandbox-safe, stop and use mock/replay proof instead.

## Live proof commands

```bash
make perfect-live
```

`make perfect-live` first runs the offline live-safety and lifecycle tests, builds
the SDK, then invokes the root orchestrator:

```bash
node scripts/run-live-proof.mjs
```

The orchestrator validates the confirmation without printing either credential,
acquires the exclusive `/tmp/clockify115-live.lock`, creates one run prefix, and
runs the wrapper, CLI, TypeScript MCP, and GOCLMCP suites separately. A failed
surface does not suppress the remaining suites. Cleanup runs in `finally` for
the exact run prefix and the governed legacy families (`clockify115-live-`,
`sdk-test-`, `mcp-sandbox-`, `mcp-workflow-`, `mcp-log-`, `mcp-fix-`, and
`DEMO-`). The broad `clockify115-live-` family lets a later run recover
objects stranded by an earlier root-orchestrator run.

The command prints one sanitized JSON receipt. It contains surface status,
output hashes, per-entity cleanup counts, and the final leftover count; it never
contains a token, workspace identifier, object identifier, or child-process
log. A successful proof requires wrapper and GOCLMCP to pass, CLI and MCP to
pass or report only stable HTTP 402 / `feature_unavailable` entitlement limits,
cleanup to pass, and zero leftovers. Generic HTTP 403 or 404 is a failure.
The aggregate cleanup window is fixed at 2000-01-01 through 2100-01-01;
ambient narrowing variables cannot hide exact-run or governed legacy entries.

The lock is cleared only when its recorded process is gone and it is older than
the governed stale threshold. An active, fresh-dead, changed, or malformed lock
fails closed. Treat the final sanitized JSON receipt as the source of truth,
not an intermediate green line.

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
