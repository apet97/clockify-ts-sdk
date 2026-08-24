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
| `CLOCKIFY_RUN_LIVE_E2E` | generated | The orchestrator sets the live-suite opt-in; operators must not set it to bypass the root gate. |
| `CLOCKIFY_LIVE_SANDBOX_ACK` | manual probe only | Literal `1` is an additional approval for the standalone project field-omission probe. It does not replace the workspace confirmation. |

For the broad evidence campaign, leave `CLOCKIFY_TEST_USER_ID` and
`CLOCKIFY_TEST_PROJECT_ID` unset so discovery cannot retain a stale fallback.
`CLOCKIFY_LIVE_EVIDENCE_WORKER` and `CLOCKIFY_LIVE_BASE_COMMIT` are owned by the
campaign launcher. Operators must not set them. The root proof also clears
`CLOCKIFY_LIVE_OPTIONAL_DOMAINS`, `CLOCKIFY_LIVE_HIGH_RISK_WORKFLOWS`, and
`CLOCKIFY_LIVE_HAPPY_PATH_CAMPAIGNS`; optional or high-risk GOCLMCP campaigns
remain separate operator actions.

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

The standalone project field-omission probe uses the same fingerprint check,
exclusive lock, bounded client, aggregate prefix cleanup, and zero-leftover
decision. Its extra `CLOCKIFY_LIVE_SANDBOX_ACK=1` is deliberate because it
tests an unresolved live write semantic; never invoke it as an ambient cleanup
shortcut.

### Authenticated remote MCP acceptance

Run the remote live proof only after `make mcp-remote-proof` is green, and run
it serially with `make perfect-live`; both commands own the same exclusive live
lock and must never overlap.

```bash
make mcp-remote-live-proof
```

This gate validates the same fingerprint and exact workspace confirmation,
then creates an ephemeral PostgreSQL database and local OAuth fixture. It pipes
the Clockify key to the admin CLI through stdin, provisions one test principal,
and sends independent stateless JWT and opaque-token HTTP requests. It proves
status, all five report/App paths, deterministic DEMO seed retry, and guarded
cleanup across separate requests. Its `finally` path directly sweeps only the
exact generated prefix, requires zero Clockify leftovers, deletes the test
principal and encrypted credential, and removes all proof-owned local state.
The receipt contains only fixed outcomes and counts—never credentials,
workspace, principal, token, prefix, or object identifiers.

This proof does not rotate a Clockify API key. If a key was exposed outside the
secret boundary, rotate it in Clockify and verify revocation independently
before claiming final acceptance.

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

## Governed live-evidence campaign

The 168-operation evidence manifest has a stricter transaction than
`perfect-live`. Run it only after the deterministic gates are green:

```bash
make live-evidence-campaign
```

The launcher hashes governed inputs before and after rebuilding the SDK with
live credentials blanked, rejects any build-time drift, verifies that the
existing manifest is byte-for-byte equal to the tracked `HEAD` baseline, and
copies only the verified post-build input bytes plus that generated SDK artifact
into an isolated temporary snapshot. The credentialed worker runs from that
snapshot. Root inputs and the artifact are rehashed afterward; drift rejects
the result. Every SDK request, including response-body consumption during
cleanup, has a 30-second timeout with retries disabled. The aggregate
cleanup/rescan and exact-id callbacks share one three-minute
cleanup deadline. Exact-ID fallbacks are registered before mutation, deduplicated
per entity, and retired only after confirmed normal cleanup; the final phase
therefore retries only still-live or uncertain entities. The webhook family
uses a bounded read-only list poll after successful creation because the live
service can briefly return GET 400 / PUT 404 before the new webhook becomes
visible; no mutation is retried. A campaign
timeout or `SIGINT`/`SIGTERM` requests graceful worker cancellation and
reserves a five-minute launcher window before a last-resort hard kill. The
timing invariant allows one active request, one request started just before
the cleanup deadline, and a final minute for receipt assembly and shutdown.
Candidate files are copied to the ignored
`scripts/live/.manifest-work/` directory only after every mutation is cleaned,
the final 17-class rescan reports zero leftovers, the separate
`registered_fallbacks` receipt action passes, and the exclusive live lock is
released.

The campaign does not import or approve its own output. A human must inspect
the reported manifest and campaign-receipt SHA-256 values and explicitly
approve those exact two hashes. That approval is recorded in
`docs/live-evidence-approval.json` with schema version 1, both hashes,
`approvedBy`, and a UTC `approvedAt` later than campaign completion. This local
receipt is an explicit operator-process attestation; it is not cryptographic
identity proof.

Import then requires both expected hashes and the exact approval file:

```bash
node scripts/import-live-evidence-manifest.mjs \
  --source scripts/live/.manifest-work/live-evidence-manifest.candidate.json \
  --sha256 <approved-manifest-sha256> \
  --campaign-receipt scripts/live/.manifest-work/live-evidence-campaign-receipt.candidate.json \
  --campaign-sha256 <approved-campaign-receipt-sha256> \
  --approval docs/live-evidence-approval.json
node scripts/record-live-evidence-currentness.mjs
make live-evidence-currentness
```

Import is canonical, compare-and-swap protected against a changed prior
manifest, and serialized by an exclusive import lock. Never hand-edit the
manifest, campaign receipt, or currentness record to bypass this flow.
