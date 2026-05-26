# CLAUDE.md

Pointer for Claude Code. The canonical 12-section contributor +
agent contract is [`AGENTS.md`](./AGENTS.md) — read it first.
Every rule there applies to Claude Code work.

## We work on two repos in lockstep

This repo (`apet97/clockify-ts-sdk`) ships **three** npm packages
side by side, all built on the core SDK:

| Folder | Package | Status |
|---|---|---|
| `wrapper/` | `clockify-sdk-ts-115` | v0.9.0 — published |
| `cli/` | `@clockify115/cli` | v0.1.0 — unpublished (needs `@clockify` npm org access) |
| `mcp/` | `@clockify115/mcp-server` | v0.1.0 — unpublished |

`apet97/go-clockify` (GOCLMCP, conventionally cloned at `../GOCLMCP/`)
ships the canonical Go MCP server + the canonical OpenAPI generator.
Spec-shape changes start in GOCLMCP and flow down through the
corrected snapshot; SDK-shape changes (errors, pagination, ergonomics)
live here. Audits + cross-repo plans land in `../GOCLMCP/docs/audits/`.

## Tactical gotchas (the things that bite mid-session)

- **Standalone repo.** `apet97/clockify-ts-sdk`. The `addons-me/`
  prefix in some absolute paths is one contributor's local
  workspace folder; treat the repo root as the contract.
- **Sister repo.** `apet97/go-clockify`, cloned conventionally as
  `../GOCLMCP/`. The canonical Clockify OpenAPI generator
  (`scripts/gen-clockify-openapi`) lives there. Any spec-shape
  change starts there, not here.
- **Bash PATH.** Tool calls land in a sandbox where `python3` /
  `node` / `curl` / `bash` / `npm` resolve only via explicit
  `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` or
  absolute paths (`/usr/bin/curl`, `/opt/homebrew/bin/npm`). Use
  absolute paths in CI scripts.
- **System Python lacks `yaml`.** Use `/usr/bin/ruby -ryaml` for
  spec inspection, or a virtualenv. The generator itself is Ruby.
- **Workflow Write hook.** The security-guidance plugin's
  `security_reminder_hook.py` **blocks the first `Write` of any
  `.github/workflows/*.yml`** per session. **Retry the same Write
  once** — the second attempt succeeds.
- **LSP.** `ENABLE_LSP_TOOL=1` is set globally; `LSP` is faster
  than grep for definitions / references inside `wrapper/src/**`
  (after `npm run sync`). The synced SDK has many `index.ts`
  re-exports — `goToDefinition` is essential.
- **Live API env.** `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID`
  are set in the shell. Check without echoing:
  `[ -n "$CLOCKIFY_API_KEY" ] && echo present || echo absent`.
- **fern check.** Always use `--from-openapi`. The legacy parser
  fires 8 documented warnings for literal-vs-`{id}` siblings that
  are OpenAPI 3.0.3 §4.8.5.4 conformant. Evidence:
  `spec/evidence/discrepancies.md` →
  `fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings`.
- **`npm run build` is twin `tsc`.** ESM (`tsconfig.esm.json` →
  `dist/esm/`) + CJS (`tsconfig.cjs.json` → `dist/cjs/`), then
  `scripts/finalize-cjs.sh` writes `dist/cjs/package.json`
  `{ "type": "commonjs" }`. Hand-written entrypoints at v0.9.0:
  `index.ts`, `create-client.ts`, `composed-fetch.ts`,
  `errors.ts`, `deprecation.ts`, `iter.ts`, `pagination.ts`,
  `paginated-list.ts`, `webhooks.ts`, `webhook-events.ts`,
  `with-response.ts`, `scoped-client.ts`, `otel-hooks.ts`,
  `health.ts`, `rate-limit.ts`. Emit flat at
  `dist/{esm,cjs}/<name>.js`; the synced SDK at
  `dist/{esm,cjs}/src/**`. `npm run build:smoke` (wired into
  `prepublishOnly`) verifies both formats resolve 38 public
  names + 14 subpaths from `dist/`.
- **Test files (18, ~214 unit + 7 live sandbox):**
  `pagination` · `create-client` (incl. env-var fallback + debug
  mode) · `iter` (incl. 6 `Last-Page` header cases + 19 drift
  assertions) · `paginated-list` · `webhooks` · `webhook-fixtures`
  · `webhook-events` (50-event union) · `composed-fetch` ·
  `with-response` · `errors` (Connection/Abort/code-extract) ·
  `scoped-client` (Workspace Proxy) · `otel-hooks` · `health` ·
  `rate-limit` · `axioms-checklist` (regression gate) ·
  `deprecation` · `dual-build` (ESM+CJS surface) · `sandbox` (7
  live; skip without `CLOCKIFY_API_KEY` /
  `CLOCKIFY_WORKSPACE_ID`). Don't collapse files.
- **v0.8.0 → v0.9.0 additions** (released; both branches merged
  to main): `ClockifyConnectionError`, `ClockifyAbortError`,
  `getErrorCode`, `PaginatedList<T>`, `client.workspace(id)` scoped
  sub-client, `otelHooks()`, `client.health()`, `debug: true`
  factory option, `getRateLimit` / `getRateLimitFromError`,
  `ClockifyWebhookEvent` discriminated union (50 events).
  release-please + hosted TypeDoc CI workflows are live; CHANGELOG
  + version bumps happen via release-please merges, not manual.
- **`cli/` package** (`@clockify115/cli`, v0.1.0 unpublished). ESM-only
  tsc build; two bin names `clockify115` + `clk115`. Twelve commands:
  status, start, stop, log, entries {list,delete}, projects
  {list,create}, clients {list,create}, tasks list, tags
  {list,create}. Reads `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID`
  from env, flags, or `~/.clockifyrc.json` (highest precedence
  first). 25 unit tests (vitest). No CI workflow yet. Lives off
  `clockify-sdk-ts-115` as a `file:../wrapper` dev dep + peer dep.
- **`mcp/` package** (`@clockify115/mcp-server`, v0.1.0 unpublished).
  ESM-only tsc build; one bin `clockify115-mcp`. Stdio Model Context
  Protocol server on top of `@modelcontextprotocol/sdk@1.29.0`.
  Thirteen tools — `clockify_status`, `clockify_projects_{list,
  create}`, `clockify_clients_{list,create}`, `clockify_tasks_list`,
  `clockify_tags_{list,create}`, `clockify_entries_{list,log,
  delete}`, `clockify_timer_{start,stop}`. Uniform `{ok, action,
  data, meta?}` envelope on success; `{ok:false, action, error,
  recovery?}` on error with stable codes (`not_found`,
  `auth_or_permission`, `rate_limited`, …). 12 tests (envelope +
  in-memory MCP transport). Sibling to GOCLMCP's 156-tool Go MCP;
  intentionally narrower scope. Same dep pattern as `cli/`.

## Tool defaults

- `Edit` for in-file changes; `Write` only for new files or full
  rewrites. `Read` before editing.
- Mark `TaskCreate` items completed as soon as they ship; don't
  batch.
- Use `--from-openapi` on every `fern check` invocation.

## Where to look first

| Goal                                          | Start at |
|-----------------------------------------------|----------|
| New annotation / param on a list endpoint     | `../GOCLMCP/scripts/gen-clockify-openapi` → `PAGINATED_LIST_OPS`, `LAST_PAGE_HEADER_OPS`, `ensure_pagination!`, `stamp_last_page_header!` |
| New tag rename                                | same file → `TAG_RENAMES` |
| New idiomatic CRUDL / action verb             | same file → `SDK_METHOD_NAMES` (paired `x-fern-sdk-group-name` + `x-fern-sdk-method-name`) |
| New ObjectId-pattern path param               | same file → `PATH_PARAM_PATTERNS` |
| Quarantine a phantom route                    | same file → `PHANTOM_PATHS`; live-probe must confirm 404/405 |
| Change SDK wrapper surface (auth, exports)    | `wrapper/package.json` + `wrapper/scripts/sync-sdk.sh` + a hand-written `.ts` at `wrapper/` root (outside `src/` so it survives sync) |
| Adjust the `paginate<T>` helper               | `wrapper/pagination.ts` + `wrapper/tests/pagination.test.ts` + `wrapper/tests/sandbox.test.ts` (live walk) |
| Add a new hand-written module                 | Drop `.ts` at `wrapper/` root; add to `tsconfig.{json,esm.json,cjs.json}` `include`; subpath entry in `package.json` `exports` (both `import` + `require` conditions, each with `types` + `default`); re-export from `wrapper/index.ts`; add the symbol to `scripts/verify-dual-build.sh`'s expected-names array |
| Add a CLI command                              | `cli/src/commands/<name>.ts` exporting `registerXxxCommand: Registrar`; wire it into `cli/src/index.ts` `buildProgram()`; use `resolveContext(this, services)` from `./helpers.js`; tests in `cli/tests/` |
| Add an MCP tool                                | `mcp/src/tools/<name>.ts` exporting `registerXxxTool(server, ctx)`; call `server.registerTool(name, {title, description, inputSchema, annotations}, async (args) => ...)`; return via `successResult` / `errorResult`; wire into `mcp/src/server.ts` `buildServer()`; update tool-list contract in `mcp/tests/server.test.ts` |
| User-facing changelog                          | `wrapper/CHANGELOG.md` — `[Unreleased]` for in-flight; rename to `[X.Y.Z] — YYYY-MM-DD` on tag day |
| Add a test                                    | `wrapper/tests/<module>.test.ts` (env-gated) or extend `wrapper/tests/sandbox.test.ts` (live) |
| Change CI                                     | `.github/workflows/{ci,release}.yml`. Both opt in to `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`. `cli/` and `mcp/` have no CI yet — add jobs that run `npm run type-check && npm test && npm run build` against each. |
| Document a Clockify-vs-spec divergence        | `spec/evidence/discrepancies.md` — five-question format |
| Refresh the corrected snapshot                | `(cd ../GOCLMCP && make gen-openapi) && cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml spec/corrected/clockify.corrected.openapi.yaml` |

## What NOT to do (the rules that bite)

Full list: `AGENTS.md §12`. Top-five for Claude Code:

1. **Never edit `spec/corrected/clockify.corrected.openapi.yaml`.**
   It's a snapshot. Edits land in `../GOCLMCP/docs/openapi/sources/**`
   or in the generator script.
2. **Never edit `output/ts-sdk/**` or `wrapper/src/**`.** Both wiped
   on next regen / sync.
3. **Never push to `apet97/clockify-ts-sdk` `main` without CI green
   on the PR head**, and never with `--force`.
4. **Never `npm publish` without `npm pack --dry-run` first**, and
   never without all 4 drift gates green upstream
   (`make {openapi,catalog,selfinspect,raw-allowlist}-drift` in
   GOCLMCP) and `go test ./internal/tools/...` green. For `cli/` and
   `mcp/`: also run `npm run type-check && npm test && npm run build`
   in their directory before pack/publish.
5. **Never run the live tests against a non-sandbox API key.** The
   CRUD round-trip creates and deletes real records.
6. **Never publish `@clockify115/cli` or `@clockify115/mcp-server` while
   they reference `clockify-sdk-ts-115` via `file:../wrapper`.** Switch
   the entry in their `dependencies` (or move to `peerDependencies`
   only) before tagging.

Everything else is in [`AGENTS.md`](./AGENTS.md).
