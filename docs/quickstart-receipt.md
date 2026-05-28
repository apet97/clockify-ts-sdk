# Quickstart Receipt

Use this page when a non-coder operator or a fresh agent needs to prove the
SDK, CLI, and MCP are locally understandable before touching live Clockify. This
is not a release proof and not a live proof. It is the first safe receipt in the
workflow.

## What this proves

- The operator knows which surface to use: SDK, CLI, or MCP.
- Local diagnostics are no-network and redacted.
- Mock/replay proof is separate from live sandbox proof.
- The first live probe is explicit and safe.
- Any readiness claim has a receipt shape instead of narrative confidence.

## Step 1: Local diagnostics, no network

SDK path:

```bash
cd wrapper
node --input-type=module -e 'import { clockifyDiagnostics } from "./dist/esm/index.js"; console.log(JSON.stringify(clockifyDiagnostics(), null, 2));'
```

Expected receipt fields: `ok`, `readiness`, `checks`, `warnings`, and `next`.
The receipt must not print raw tokens. Use `client.health()` only after local
diagnostics say `ready_for_health`.

CLI path:

```bash
cd cli
node dist/index.js --json doctor
```

Expected receipt fields: `ok`, `readiness`, `checks`, and `next`. This command
must not contact Clockify. Use `clk115 --json status` only after the local
doctor says `ready_for_status`.

MCP path:

```text
Read resource: clockify://mcp/doctor
```

Expected guidance: env vars, Node.js 20+, mock base URL caution, redaction, and
`clockify_status` as the first live probe.

## Step 2: Mock proof before live proof

Use mock/replay proof when credentials are missing or the operator only needs a
deterministic local path:

```bash
make mock-clockify
```

SDK code should use `environment`; CLI and MCP should use `CLOCKIFY_BASE_URL` or
`--base-url` only for mock/replay or private test endpoints. Do not set base URL
overrides for normal Clockify use.

## Step 3: First live probe, sandbox only

Live proof requires a sacrificial Clockify sandbox. Never run live probes against
a customer workspace.

- SDK: `client.health()`
- CLI: `clk115 --json status`
- MCP: `clockify_status`

If credentials are missing, record a live-proof deferral as a draft blocker in
the final proof receipt. Do not treat mock proof as live proof, and do not treat
deferred live proof as final readiness.

## Copy-paste safety

The commands on this page are local diagnostics, mock proof, or explicitly
sandboxed live probes. Do not paste raw tokens, full workspace IDs, bearer
headers, or npm publication commands into a quickstart receipt. Use environment
variables and record only whether secrets were redacted. If a copied command
would mutate Clockify, publish a package, or use a customer workspace, it does
not belong in this quickstart.
## Step 4: Quickstart receipt template

```markdown
# Quickstart Receipt

Date: YYYY-MM-DD
Operator:
Surface used: SDK | CLI | MCP
Local diagnostic command/resource:
Local diagnostic status: ready | incomplete | conflict | unsupported
Raw secrets printed: no
Workspace ID printed raw: no
Mock proof used: yes | no
First live probe attempted: yes | no
Live workspace type: sacrificial sandbox | not run
Next action:
Residual risk:
```

## Stop conditions

Stop and do not run live probes when:

- The diagnostic receipt prints a raw token or full workspace ID.
- The workspace is a customer or production workspace.
- `CLOCKIFY_BASE_URL` points somewhere unexpected.
- Node.js is below version 20.
- Auth diagnostics show both API-key and addon-token conflict.
- The operator cannot explain whether the next command is mock or live.
