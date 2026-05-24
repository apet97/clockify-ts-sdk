# CLAUDE.md

Pointer file for Claude Code. The canonical 12-section contributor
+ agent contract lives in [`AGENTS.md`](./AGENTS.md). Read it before
touching the repo — every rule there applies to Claude Code work,
not just to humans.

## Quick orientation for Claude Code specifically

- **This is a standalone repo** (`apet97/clockify-ts-sdk`). It has
  no parent project; `addons-me/` in some absolute paths is just
  one contributor's local workspace folder where multiple unrelated
  repos sit side-by-side. Treat the repo root as the contract.
- **Working directory:** the repo root. Every `npm` script in
  `wrapper/` resolves paths relative to `wrapper/`; the sync script
  reaches one level up to `../output/ts-sdk/` (still inside this
  repo).
- **Sister repo (separate git tree, separate GitHub project):**
  `apet97/go-clockify`, conventionally cloned next to this repo as
  `../GOCLMCP/`. The canonical Clockify OpenAPI generator
  (`scripts/gen-clockify-openapi`) lives there. Any spec-shape
  change starts there, not in this repo. If your local layout
  differs, adjust the `../GOCLMCP/...` paths below to match.
- **PATH gotcha:** Bash tool calls land in a sandbox where `python3`
  / `node` / `curl` / `bash` / `npm` are reachable only via explicit
  `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` or absolute
  paths (`/usr/bin/curl`, `/opt/homebrew/bin/npm`). Use absolute paths
  in scripts that run in CI.
- **System Python lacks `yaml`:** `/usr/bin/python3 -c "import yaml"`
  fails. Use `/usr/bin/ruby -ryaml` for spec inspection, or invoke
  Python from a virtualenv. The generator itself is Ruby.
- **Tool defaults:** prefer `Edit` for in-file changes, `Write` only
  for new files or complete rewrites. `Read` before edits. Mark
  TaskCreate items completed as soon as they ship; don't batch.
- **Per-event hook on workflows:** the security-guidance plugin's
  `security_reminder_hook.py` prints an injection advisory and
  **blocks the first `Write` of any `.github/workflows/*.yml`** per
  session. **Retry the same Write once** — the hook's state file
  remembers the pair for the session and the second attempt succeeds.
- **LSP available:** `ENABLE_LSP_TOOL=1` is set globally; the `LSP`
  tool is faster than grep for definitions / references / type
  hover inside `wrapper/src/**` (after `npm run sync`). The
  generated SDK has many `index.ts` re-exports — `goToDefinition`
  is essential for navigating them.
- **Live API env vars:** `CLOCKIFY_API_KEY` and
  `CLOCKIFY_WORKSPACE_ID` are already set in the shell. Use
  `[ -n "$CLOCKIFY_API_KEY" ] && echo present || echo absent` to
  check without echoing values.
- **fern check posture:** always invoke with `--from-openapi`. The
  legacy parser fires 8 well-documented warnings for literal-vs-{id}
  route conflicts that are conformant per OpenAPI 3.0.3 §4.8.5.4.
  Quick reference and full evidence live in
  `spec/evidence/discrepancies.md` →
  `fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings`.
- **`npm run build` runs `tsc` twice** — once for ESM
  (`tsconfig.esm.json` → `dist/esm/`) and once for CJS
  (`tsconfig.cjs.json` → `dist/cjs/`), then
  `scripts/finalize-cjs.sh` writes `dist/cjs/package.json` with
  `{ "type": "commonjs" }` so the subtree's `.js` files resolve
  as CJS regardless of the parent's `"type": "module"`. Hand-written
  entrypoints (`index.ts`, `create-client.ts`, `composed-fetch.ts`,
  `iter.ts`, `webhooks.ts`, `pagination.ts`) emit at
  `dist/{esm,cjs}/<name>.js`; the synced SDK at
  `dist/{esm,cjs}/src/**`. `package.json` `exports` uses the
  modern triple-tier shape (`{ import: { types, default },
  require: { types, default } }`) per subpath so TypeScript
  resolves the right `.d.ts` per consumer's module system.
  `npm run build:smoke` (wired into `prepublishOnly`) verifies
  both ESM and CJS resolve the public surface from `dist/`.
- **Six test files now:** `tests/pagination.test.ts` (8 unit
  cases), `tests/create-client.test.ts` (8 unit cases),
  `tests/iter.test.ts` (30 cases — 9 iterAll + 2 iterPages + 19
  drift assertions + 1 entry-count),
  `tests/webhooks.test.ts` (16 cases for the
  Clockify-Signature-Token verifier across all header shapes),
  `tests/composed-fetch.test.ts` (26 cases — UA + req-id
  injection, lifecycle hooks, retry policy with mocked fetch
  + 1ms-clamped sleeps so the test suite stays fast),
  and `tests/sandbox.test.ts` (5 live flows, skip when
  `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID` absent). Don't
  collapse them; the unit cases run in CI without creds.

## Where to look first

| Goal                                                  | Start at                                                                 |
|-------------------------------------------------------|--------------------------------------------------------------------------|
| Add a new annotation / param to a list endpoint       | `../GOCLMCP/scripts/gen-clockify-openapi` (sister repo; `PAGINATED_LIST_OPS`, `ensure_pagination!`) |
| Add a new tag rename                                  | same file, `TAG_RENAMES`                                                 |
| Add an ObjectId-pattern path param                    | same file, `PATH_PARAM_PATTERNS`                                         |
| Change the SDK wrapper surface (auth, defaults, exports) | `wrapper/package.json` + `wrapper/scripts/sync-sdk.sh` + maybe a hand-written re-export under `wrapper/` (anything you add survives sync as long as it's outside `src/`) |
| Adjust the hand-written `paginate<T>` helper           | `wrapper/pagination.ts` (canonical source) + `wrapper/tests/pagination.test.ts` (8 unit cases) + `wrapper/tests/sandbox.test.ts` (live cross-page walk) |
| Add a new hand-written module to the npm surface       | drop the `.ts` at `wrapper/` root (outside `src/`); add it to `tsconfig.json` `include` AND `tsconfig.esm.json` `include` AND `tsconfig.cjs.json` `include`; add a subpath entry under `package.json` `exports` (with both `import` and `require` conditions, each having `types` + `default`); re-export from `wrapper/index.ts` for the one-import-fits-all DX; add the symbol name to `scripts/verify-dual-build.sh`'s expected-names array so the CI smoke catches missing exports. The twin `tsc` build picks up the new file from the include lists automatically. |
| Update the user-facing changelog                      | `wrapper/CHANGELOG.md` — append under `[Unreleased]` for in-flight work; rename `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD` on tag day |
| Add a test                                            | `wrapper/tests/sandbox.test.ts` (live) or a new `tests/*.test.ts` (env-gated)                                  |
| Change CI                                             | `.github/workflows/{ci,release}.yml` — heads up on the workflow hook above; both workflows already opt in to `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` |
| Document a Clockify-vs-spec divergence                | `spec/evidence/discrepancies.md` — use the five-question format already in the file |
| Refresh the corrected snapshot                        | `(cd ../GOCLMCP && make gen-openapi) && cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml spec/corrected/clockify.corrected.openapi.yaml` |

## What NOT to do (the rules that bite)

The full list lives in `AGENTS.md §12`. The top-five for Claude
Code specifically:

1. **Do not edit `spec/corrected/clockify.corrected.openapi.yaml`.**
   It is a snapshot. Edits land in
   `../GOCLMCP/docs/openapi/sources/**` (sister repo) or in the
   generator script. The next `make gen-openapi` will overwrite a
   snapshot edit silently.
2. **Do not edit `output/ts-sdk/**` or `wrapper/src/**`.** Both are
   wiped on the next regen / sync.
3. **Do not push to `apet97/clockify-ts-sdk` `main` without CI
   green on the PR head**, and never with `--force`.
4. **Do not run `npm publish` without `npm pack --dry-run` first,**
   and never without all four drift gates green upstream
   (`make {openapi,catalog,selfinspect,raw-allowlist}-drift` in
   GOCLMCP) and `go test ./internal/tools/...` green.
5. **Do not run the live tests against a non-sandbox API key.** The
   CRUD round-trip creates and deletes real Clockify records.

Everything else is in [`AGENTS.md`](./AGENTS.md).
