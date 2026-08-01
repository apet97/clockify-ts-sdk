# MCP tools & write-safety

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- `mcp/src/tools/workflows/` holds the workflow-first MCP surface
  (`index.ts` registers the tools; `business`/`review`/`run`/
  `time-tracking`/`resolve`/`plan`/`demo` carry the logic). The
  `mcp/src/tools/workflows.ts` file is just a re-export barrel.
- MCP receipts should include useful `ids`, `changed`, `warnings`,
  `next`, stable error codes, and recovery hints. Domain
  create/update/delete tools populate `entity` + `changed` via the
  `writeReceipt` helper in `mcp/src/result.ts` (read-only tools stay
  receipt-free).
- `defineTool(...)` and `defineGuardedTool(...)` in `mcp/src/result.ts`
  are the only registration seams (no raw `server.registerTool` calls
  in `mcp/src/tools/**`). `defineTool` accepts only `read` and
  `routine_write` names; `defineGuardedTool` accepts only
  `business_write`, `external_side_effect`, `privileged`, and
  `destructive` names from `mcp/src/tool-risk.ts`. Both derive protocol
  annotations and runtime risk metadata. Guarded tools store one
  canonical preview for five minutes and execute that exact stored
  preview once; token calls never recompute resolution or state. If
  semantics change, update `docs/mcp-write-safety-contract.json`,
  `scripts/check-mcp-write-safety.mjs`, tests, and `mcp/README.md`
  together.
- The holidays, timeOff (policy/request/balance), scheduling, groups
  `add_member`, users grant/revoke-role, and expenses category MCP
  tools resolve supported names **before any write**, via the `resolve`
  SDK subpath and the workflow resolver helpers. A 24-hex id passes
  through; unresolved or ambiguous names stop before mutation as either
  a grounded `clarification` receipt or a structured error, depending
  on the resolver path. Read-filter slots stay list-free. This wiring
  added no tools.
- MCP arg-shape forgiveness: list fields accept a bare string
  (`"Bob"` -> `["Bob"]`) and number fields a numeric string
  (`"75"` -> `75`, never `""` -> `0`), via `zStringList` / `zNumberLike`
  in `mcp/src/arg-shapes.ts`. The `z.preprocess` wrappers unwrap before
  validation, so the model-visible JSON Schema (and `docs/mcp-tools.json`
  and the tool count) is unchanged.
- The `errors` SDK subpath gained `mapAddonTokenRestriction(err, { authScheme,
  method?, path? })` + the `AddonTokenRestrictionError` class (`wrapper/errors.ts`):
  a pure **catch-site** helper that names an add-on-token 401 hitting an endpoint
  outside the token's reach (body says "API is not accessible"); API-key 401s pass
  through raw. It is opt-in, not automatic — the SDK error doesn't record the auth
  scheme — mirroring the existing `promoteApiError`. Do not wire it into generated
  code or `createClockifyClient`.
- `clockify_setup_webhook` validates callback URLs through
  `mcp/src/orchestration/webhook-url.ts` before dry-run preview or
  creation. The guard is offline: it rejects non-HTTPS, embedded
  credentials, private/loopback/link-local/CGNAT/metadata IPs (incl.
  IPv4-mapped and NAT64 `64:ff9b::/96` embeddings — `wrapper/webhook-url.ts`
  decodes both), and localhost-ish hostnames, but not DNS rebinding.
  Dotless/hex/octal IPv4 literals are NOT a bypass — Node's WHATWG `URL`
  normalizes them to dotted-decimal before the guard sees the host.
