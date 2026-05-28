# Configuration Precedence Policy

Configuration must be boring and deterministic across SDK, CLI, MCP, examples,
and mock/replay. A user should know exactly which value wins before a request is
sent, especially for auth, workspace, and base URL selection.

## Surface precedence

| Surface | Precedence | Notes |
|---|---|---|
| SDK auth | Explicit `apiKey` or `addonToken` option wins. If neither is provided, CLOCKIFY_API_KEY wins over CLOCKIFY_ADDON_TOKEN. | Passing both explicit auth modes is rejected. Environment fallback is construction-time only. |
| SDK transport | Explicit `environment` / `baseUrl`, `fetch`, headers, timeout, hooks, and retry options flow through the factory options. | `createClockifyClient` installs composed fetch defaults unless callers opt out. |
| CLI auth/workspace/base URL | Command-line flags win over env vars; env vars win over rc files; rc files are lowest precedence. | The rc file is `$CLOCKIFY_HOME/clockifyrc.json` or `$CLOCKIFY_HOME/.clockifyrc.json` when `CLOCKIFY_HOME` is set, otherwise the same names under the home directory. |
| MCP auth/workspace/base URL | Process env only: `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, optional `CLOCKIFY_BASE_URL`. | The server is intentionally one-user and pinned to one workspace. MCP clients should pass env in their server config. |
| Examples and live proof | Environment variables only unless an example explicitly demonstrates an override. | Live examples and proof must use a sacrificial sandbox workspace. |

## Base URL override rule

`CLOCKIFY_BASE_URL`, CLI `--base-url`, and SDK `environment` overrides are for
mock/replay, private gateways, and controlled tests. They are not normal user
configuration for Clockify production. Documentation must say this wherever the
override is introduced.

## Missing configuration errors

- SDK missing auth errors must name `CLOCKIFY_API_KEY` and `CLOCKIFY_ADDON_TOKEN`.
- CLI missing auth/workspace errors must name the flag, env var, and rc-file field.
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
