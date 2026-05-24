# CLAUDE.md

Pointer file for Claude Code. The canonical 12-section contributor
+ agent contract lives in [`AGENTS.md`](./AGENTS.md). Read it before
touching the repo — every rule there applies to Claude Code work,
not just to humans.

## Quick orientation for Claude Code specifically

- **Working directory:** `/Users/15x/Downloads/WORKING/addons-me/fern/`.
  Every `npm` script in `wrapper/` resolves paths relative to
  `wrapper/`; the sync script reaches one level up to `../output/ts-sdk/`.
- **Sister repo (separate git tree):**
  `/Users/15x/Downloads/WORKING/addons-me/GOCLMCP/` is
  `apet97/go-clockify`. The canonical Clockify OpenAPI generator
  (`scripts/gen-clockify-openapi`) lives there. Any spec-shape change
  starts there, not in this workspace.
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

## Where to look first

| Goal                                                  | Start at                                                                 |
|-------------------------------------------------------|--------------------------------------------------------------------------|
| Add a new annotation / param to a list endpoint       | `addons-me/GOCLMCP/scripts/gen-clockify-openapi` (`PAGINATED_LIST_OPS`, `ensure_pagination!`) |
| Add a new tag rename                                  | same file, `TAG_RENAMES`                                                 |
| Add an ObjectId-pattern path param                    | same file, `PATH_PARAM_PATTERNS`                                         |
| Change the SDK wrapper surface (auth, defaults, exports) | `wrapper/package.json` + `wrapper/scripts/sync-sdk.sh` + maybe a hand-written re-export under `wrapper/` (anything you add survives sync as long as it's outside `src/`) |
| Add a test                                            | `wrapper/tests/sandbox.test.ts` (live) or a new `tests/*.test.ts` (env-gated)                                  |
| Change CI                                             | `.github/workflows/{ci,release}.yml` — heads up on the workflow hook above |
| Document a Clockify-vs-spec divergence                | `spec/evidence/discrepancies.md` — use the five-question format already in the file |
| Refresh the corrected snapshot                        | `(cd ../GOCLMCP && make gen-openapi) && cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml spec/corrected/clockify.corrected.openapi.yaml` |

## What NOT to do (the rules that bite)

The full list lives in `AGENTS.md §12`. The top-five for Claude
Code specifically:

1. **Do not edit `spec/corrected/clockify.corrected.openapi.yaml`.**
   It is a snapshot. Edits land in
   `addons-me/GOCLMCP/docs/openapi/sources/**` or in the generator
   script. The next `make gen-openapi` will overwrite a snapshot
   edit silently.
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
