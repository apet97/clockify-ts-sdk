# Configuration Precedence Policy

Configuration must be boring and deterministic across SDK, CLI, MCP, examples,
and mock/replay. A user should know exactly which value wins before a request is
sent, especially for auth, workspace, and base URL selection.

## Surface precedence

| Surface | Precedence | Notes |
|---|---|---|
| SDK auth | Explicit `apiKey` or `addonToken` option wins. If neither is provided, CLOCKIFY_API_KEY wins over CLOCKIFY_ADDON_TOKEN. | Passing both explicit auth modes is rejected. Environment fallback is construction-time only. |
| SDK transport | Explicit `environment` / `baseUrl`, `fetch`, headers, timeout, hooks, and retry options flow through the factory options. | `createClockifyClient` installs composed fetch defaults unless callers opt out. |
| CLI auth/workspace/base URL/routing | Command-line flags win over env vars; env vars win over rc files; rc files are lowest precedence. | The rc file is `$CLOCKIFY_HOME/clockifyrc.json` or `$CLOCKIFY_HOME/.clockifyrc.json` when `CLOCKIFY_HOME` is set, otherwise the same names under the home directory. `--region`/`--subdomain` (or `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN`/rc `region`/`subdomain`) follow the same precedence and are mutually exclusive with `--base-url`/`CLOCKIFY_BASE_URL`. |
| MCP auth/workspace/base URL/routing | Process env only: `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, optional `CLOCKIFY_BASE_URL`, optional `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN`. | The server is intentionally one-user and pinned to one workspace. MCP clients should pass env in their server config. `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN` are mutually exclusive with `CLOCKIFY_BASE_URL`. |
| Examples and live proof | Environment variables only unless an example explicitly demonstrates an override. | Live examples and proof must use a sacrificial sandbox workspace. |

## Base URL override rule

`CLOCKIFY_BASE_URL`, CLI `--base-url`, and SDK `environment` overrides are for
mock/replay, private gateways, and controlled tests. They are not normal user
configuration for Clockify production. Documentation must say this wherever the
override is introduced.

### Host allowlist

The override is not unrestricted. `createClockifyClient` (and through it the CLI
`buildClient` and the MCP `loadContext`) enforces a host allowlist on any
resolved base URL via `validateClockifyBaseUrl`:

- Allowed without opt-in: the official Clockify API hosts — `api.clockify.me`,
  `reports.api.clockify.me`, `auditlog-api.api.clockify.me`,
  `developer.clockify.me`, the four approved regional hosts
  (`euc1.clockify.me`, `use2.clockify.me`, `euw2.clockify.me`,
  `apse2.clockify.me`), and any well-formed single-label workspace-subdomain
  host (`<subdomain>.clockify.me`, ROUTE-002/P02-07 — a static suffix-and-label
  trust policy, not a DNS lookup) — plus loopback hosts (`localhost`,
  `127.0.0.1`, `::1`) for local mock/replay. Loopback may use plain `http://`;
  every other host must use `https://`. The prior pto.api.clockify.me entry
  was removed (H02-ROUTING confirmed it dead: zero backing operations, zero
  official-doc mentions — see `docs/service-routing-matrix.json`
  `conflicts[0]`).
- Rejected: any other host, and plain `http://` on a non-loopback host
  (always, regardless of opt-in). This blocks an API-key exfiltration path
  where a tampered `CLOCKIFY_BASE_URL`/`environment` would redirect the
  `X-Api-Key` / `X-Addon-Token` header to an attacker-controlled endpoint.
- Opt-in: the SDK option `allowNonClockifyHttpsHost: true` (surfaced on the MCP as
  `LoadContextOptions.allowNonClockifyHttpsHost`) downgrades a rejected
  *non-Clockify HTTPS* host to a `console.warn` instead of throwing. The CLI
  keeps this off. There is no env var for the opt-in; it is a deliberate,
  code-level decision for a trusted Clockify-compatible proxy.

### Authenticated-host equality

Every authenticated path shares one host allowlist. The constructor override
validator (`validateClockifyBaseUrl` in the hand-written wrapper), the
generated request-time validator (`CLOCKIFY_API_HOSTS` in
`wrapper/src/core/request.ts`, emitted by `scripts/sdk-codegen/emitter.mjs`),
the emitted per-operation `servers` hosts (`reports.api.clockify.me`,
`auditlog-api.api.clockify.me`), and the final authenticated fetch boundary
must trust exactly the same hosts: a host trusted by one authenticated path is
trusted by all of them, and a host rejected by one is rejected by all.
`wrapper/tests/authenticated-host-equality.test.ts` enforces this equality —
including that every emitted per-operation host is a member of the shared
allowlist and that this policy names no host the runtime would reject — and
fails closed on any drift.

## Routing profile selection (ROUTE-002/P02-08)

CLI `--region`/`--subdomain` and MCP `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN` both
build the SDK's typed `ClockifyRoutingOptions` (`wrapper/internal/routing.ts`)
via a small per-surface `buildRoutingOptions(region, subdomain)` helper
(`cli/src/client.ts`, `mcp/src/client.ts`) so all three surfaces construct the
same routing options from the same inputs. `--subdomain`/`CLOCKIFY_SUBDOMAIN`
requires a regional (`eu`/`us`/`uk`/`au`) region to anchor the `regular` host.

Naming a non-`global` region on the command line or in the server's env block
is itself the deliberate act the SDK's `acknowledgeUnconfirmedRegion: true`
flag exists to require, so the CLI/MCP helpers supply it automatically —
neither surface exposes a second confirmation flag. `routing` and
`--base-url`/`CLOCKIFY_BASE_URL` are mutually exclusive; passing both throws
a routing-specific conflict error before a client is constructed.

## Missing configuration errors

- SDK missing auth errors must name `CLOCKIFY_API_KEY` and `CLOCKIFY_ADDON_TOKEN`.
- CLI missing auth errors must name `CLOCKIFY_API_KEY` only — the CLI deliberately accepts credentials from neither argv nor the rc file, and an rc-file `apiKey` is rejected outright.
- CLI missing workspace errors must name the flag, env var, and rc-file field.
- MCP startup errors must name the missing env var and explain the one-workspace pin.
- JSON or MCP error receipts should preserve stable recovery guidance instead of
  leaking secret values.
## Change rules

- Do not add a new configuration source without documenting its precedence.
- Rc files must remain the lowest precedence: flags and env vars always win.
- Do not make MCP silently read CLI rc files; MCP startup must remain explicit.
- `CLOCKIFY_BASE_URL` is a mock/replay/private-gateway lever, not regular configuration.
- Keep `docs/env-contract.json` as the variable inventory and this policy as the
  winner/precedence contract.

## Proof gates

- `make config-precedence` checks this policy and source evidence.
- `make env-contract` checks variable inventory and base URL safety markers.
- `make user-docs` checks the user-facing docs that describe configuration.
- `make cli-contract` and `make mcp-contract` check the command/server surfaces.
