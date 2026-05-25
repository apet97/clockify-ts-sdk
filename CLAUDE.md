# CLAUDE.md

Pointer for Claude Code. The canonical 12-section contributor +
agent contract is [`AGENTS.md`](./AGENTS.md) — read it first.
Every rule there applies to Claude Code work.

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
  `{ "type": "commonjs" }`. Hand-written entrypoints
  (`index.ts`, `create-client.ts`, `composed-fetch.ts`, `iter.ts`,
  `webhooks.ts`, `pagination.ts`, `with-response.ts`) emit flat
  at `dist/{esm,cjs}/<name>.js`; the synced SDK at
  `dist/{esm,cjs}/src/**`. `npm run build:smoke` (wired into
  `prepublishOnly`) verifies both formats resolve the public
  surface from `dist/`.
- **Test files (9 total, 126 unit + 7 live sandbox):**
  `pagination` (8) · `create-client` (14, incl. env-var
  fallback) · `iter` (36, incl. 6 `Last-Page` header cases + 19
  drift assertions) · `webhooks` (16) · `webhook-fixtures` (13) ·
  `composed-fetch` (26) · `with-response` (3) · `dual-build` (3) ·
  `sandbox` (7 live; skip without `CLOCKIFY_API_KEY` /
  `CLOCKIFY_WORKSPACE_ID`). Don't collapse files.

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
| User-facing changelog                          | `wrapper/CHANGELOG.md` — `[Unreleased]` for in-flight; rename to `[X.Y.Z] — YYYY-MM-DD` on tag day |
| Add a test                                    | `wrapper/tests/<module>.test.ts` (env-gated) or extend `wrapper/tests/sandbox.test.ts` (live) |
| Change CI                                     | `.github/workflows/{ci,release}.yml`. Both opt in to `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` |
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
   GOCLMCP) and `go test ./internal/tools/...` green.
5. **Never run the live tests against a non-sandbox API key.** The
   CRUD round-trip creates and deletes real records.

Everything else is in [`AGENTS.md`](./AGENTS.md).
