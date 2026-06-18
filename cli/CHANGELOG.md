# Changelog

All notable changes to `@clockify115/cli` are documented here.

## [Unreleased]

### Added

- Measured code coverage: `@vitest/coverage-v8` (v2, version-matched) wired
  into `vitest.config.ts` over `src/**`. New `npm run test:coverage` script;
  floors pinned in `docs/coverage-contract.json` and enforced by
  `make coverage`.
- New `cli/src/sdk-narrow.ts` `entityId()` helper replacing the inline
  single-id `as { id?: string }` response casts across commands. CLI source now
  enables `exactOptionalPropertyTypes`, and clean list requests use generated
  `ClockifyApi.List*Request` types instead of bare `as never` casts.
- Expanded shared error-code registry coverage for CLI JSON output and generated
  troubleshooting docs: rate-limit headers, add-on-token scope, host routing,
  active-delete, dead-route, and delete-name-reservation failures now have
  stable vocabulary.
- Enforced `cli/.packsnapshot` tarball-content drift in CI, replacing the old
  print-only pack file list.

### Fixed

- `clk115 stop` now stops the running timer through the live, bound route: it detects a
  running timer via `timeEntries.listInProgress` and stops it via
  `timeEntries.updateForUser` (`{ end }`, live-verified 2026-06-17) instead of the dead
  `/stop` suffix route (`stopTimer`, 404 code 3000). "No timer was running" now comes
  from an empty in-progress list, so a real running timer is never silently left ticking.
- `parseDuration` no longer silently drops trailing/interior garbage when a space
  precedes the unit (e.g. `"2 h x"` used to parse as `2h`); such input now throws.
  Whitespace-tolerant forms like `"2 h"` and `"1h 30m"` still parse.
- `clk115 api` no longer emits a malformed double-`?` when the path already carries a
  query: an existing path query and `--query` flags are now merged into one search string.
- `loadConfig` treats a blank/whitespace env var as absent, so `CLOCKIFY_API_KEY=''` (the
  deterministic-gate convention) no longer shadows a real `~/.clockifyrc.json` value.
- Name→id resolution (`start` / `log`) now requests `page-size: 200` when listing
  projects/tasks/tags by name, matching the MCP resolver, so a name lookup in a large
  workspace is no longer capped at the first page.

### Documentation

- `clk115 log`'s usage string and `examples/log-time.sh` now state that it resolves
  project/task/tag **names** (not just IDs), matching the shipped behavior — the docs
  previously steered users away from the feature by claiming `log` "takes IDs".

### Changed

- Internal type-safety: create/update/delete/report/audit call sites now bind
  SDK requests through generated `ClockifyApi.*Request` types and the new
  `clockify-sdk-ts-115/requests` seam, cutting the remaining `as never`
  surface while preserving the existing wire shapes.
- Internal type-safety: dropped gratuitous `as unknown[]` result casts in name
  resolution and the `projects` command (the typed path yields the generated array),
  and removed an invented `clientId: string | null` that had drifted from the
  generated `Project` type (`clientId?: string`). No behavior change.

### Removed

- Two unreferenced internal helpers (`formatSeconds`, `completionShells`) with no call
  sites. The supported completion shells are still enforced by `parseCompletionShell`.

### Added

- CRUD round-out + P1-7 CLI mirror — the CLI grows 35 → 58 commands:
  - `clk115 projects {get,update,delete}`, `clk115 clients {get,update,delete}`,
    `clk115 tags {get,update,delete}`, `clk115 tasks {create,get,update,delete}`
    (project-scoped: `delete <projectId> <id>`), and `clk115 expenses {get,update,delete}`
    (no `create` — the live route is a multipart upload, intentionally omitted).
    `projects`/`clients` delete archive first (an active record cannot be deleted —
    400 live-verified; clients via the body-envelope replace-PUT), and `tasks` delete
    marks the task DONE first, mirroring the MCP domain tools byte-for-byte.
  - New `clk115 shared-reports {list,view,create,update,delete}` group — `view <id>` is
    keyed only by the shared-report id (reports host, not workspace-scoped).
  - `clk115 users invite <email> [--no-send-email]` and
    `clk115 users update-profile <userId> …` — mirror the P1-7 MCP tools
    (`clockify_users_invite`, `clockify_member_profile_update`); the member-profile
    write stays under the `users` group (no new top-level group).
- `clk115 reports {summary,detailed,weekly,attendance}` — read-only Clockify reports
  over a date range. The range comes from a named `--period` (default `this_month`)
  with `--from`/`--to` overrides (day, ISO, or period keyword), and `reports summary`
  resolves `--project` / `--client` names to ids. Built on the new
  `clockify-sdk-ts-115/reports` filter builders and `clockify-sdk-ts-115/dates`.
- `clk115 users me` (the API-key owner) and `clk115 users list [--page N]
  [--page-size N] [--name text]` — read-only user inspection. (CLI grows 29 → 35
  commands.)
- `clk115 log` now accepts project/task/tag NAMES, not just ids — resolving them the
  same way `clk115 start` does (a 24-hex id still passes straight through). The two
  sibling write commands now share one `resolve-refs` module so they can't drift apart.
- `clk115 doctor` now classifies a `CLOCKIFY_BASE_URL` override against the Clockify
  host allowlist (the same check the client enforces), so a host the client would
  reject is flagged at `doctor` time instead of failing on the next real command.
- `clk115 status` now degrades gracefully when `CLOCKIFY_WORKSPACE_ID` is unset: with
  just an API key it lists the workspaces you can reach (id + name) and how to set one,
  removing the only hard dead-end in the new-user journey.
- `clk115 completion` now includes the `api` command, and `--limit` help text across all
  list commands now states each command's default page size and the 200-item maximum.
- Added `cli/examples/daily-timesheet.sh` and `cli/examples/export-json.sh` —
  copy-paste recipes for a one-day review and a JSON/NDJSON export (read-only,
  sandbox/mock-safe).

- Added `clk115 api <method> <path>` for scriptable direct API calls through the
  generated SDK client's fetch layer, with `--query`, `--header`, `--body`
  (inline/`@file`/stdin), `--all` page/page-size walking, and `--include-headers`.
- Added `--output table|json|ndjson`, `--compact`, and `--select <dot-path>`
  output controls for automation. `--json` remains a shortcut for `--output json`.
- Added `CLOCKIFY_BASE_URL` and `--base-url` for deterministic mock/replay testing.
- Added `clk115 completion [zsh|bash|fish]` shell completion generation.
- Added `clk115 doctor` local diagnostics for config, runtime, base URL, and next-step readiness without contacting Clockify.
- Added generated CLI command table metadata.
- Added JSON error payloads with stable code, recovery, and retryability fields.
- Added exit-code contract tests for success, runtime errors, and commander usage errors.
- Added focused unit tests for the `audit-log search`, `start`, and `log` commands
  (required-field rejection, list splitting, authors-mode toggle, page bounds,
  name→ID resolution, and duration/end derivation).
- Return additive receipt fields for successful write commands in JSON and NDJSON output.

### Fixed

- `clk115 start --project/--task/--tag <name>` now matches names
  **case-insensitively** via the SDK's shared `matchByName` (previously a
  case-sensitive `===` missed `acme` for a project named `Acme`), and reports an
  ambiguous-name error instead of silently resolving the first duplicate. Drops
  the CLI's private id/name matchers in favour of `clockify-sdk-ts-115/resolve`.
- `clk115 api` now attaches the HTTP status to the error it throws on a non-2xx
  response, so the status-based classifier wins. A 404 whose body mentions a
  trigger word (e.g. "workspace") is no longer misclassified as
  `auth_or_permission`.
- `clk115 start --task <name>` without `--project` now throws a clear error
  (`--task requires --project`) instead of silently dropping the task. A task only
  exists within a project, so the name cannot be resolved without one; the previous
  behaviour started the timer with no task attached and no warning.
- `clk115 log --task <id>` without `--project` now throws the same
  `--task requires --project` error instead of sending an unscoped task entry that
  Clockify rejects with a 400. Mirrors the `start` guard so the invalid combination
  fails locally rather than as a server 4xx.

### Changed

- Human (table) mode errors now print the stable error code's recovery hint on a
  second `→` line, so the default output points at a next step instead of showing
  only the raw message. JSON/ndjson modes already carried `recovery`.
- Documented shell-completion install in the README (`clk115 completion bash|zsh|fish`
  into the shell's completion location, or `source <(...)` for the current shell).
- `--base-url` / `CLOCKIFY_BASE_URL` is now validated against the SDK Clockify host allowlist: only an official Clockify API host or a loopback host is accepted, arbitrary hosts are rejected with a clear message (strict by default — the CLI never opts in to insecure hosts). Help text updated.
- Commander usage errors now return exit code `2`, matching the documented CLI contract.
- Added `exports` field to the package manifest so consumers can use the package self-reference; only `./dist/index.js` is exposed.
- Migrated the SDK dev dependency from `file:../wrapper` to a workspace link (`"*"`). The peer dependency `clockify-sdk-ts-115 >=0.9.0` is unchanged for published consumers.
- Regenerated the shared error-code module to drop an unnecessary non-null assertion flagged by `typescript-eslint/no-unnecessary-type-assertion`.

### Internal

- Updated the CLI write-safety checker and receipt tests for receipt-shaped
  destructive delete output.
- Added an ESLint flat config (`eslint.config.mjs` + `tsconfig.lint.json`) and a
  `lint` script for the hand-written CLI surface, wired into `make lint`, CI, and
  `make perfect-fast`. Fixed what it surfaced: the table-cell formatter no longer
  risks `[object Object]` for unserializable values, and `start.ts` uses the
  exported `ClockifyClient` type directly instead of a type-only helper shim.
  The ESLint toolchain (`eslint`, `typescript-eslint`, `eslint-plugin-import-x`)
  is declared as explicit devDependencies rather than relying on workspace hoisting.

## [0.1.0] - 2026-05-26

### Added

- Initial `@clockify115/cli` package with `clockify115` and `clk115` binaries.
- Added Clockify status, list, create/update/delete, reporting-adjacent, and admin command groups on top of `clockify-sdk-ts-115`.
- Added JSON output mode for automation and human-readable table output for terminal use.
