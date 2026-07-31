# Changelog

All notable changes to `@apet97/clockify-cli-115` are documented here.

## [Unreleased]

### Fixed

- `clk115 shared-reports view --export-type XLSX|PDF` no longer emits a
  corrupted blob. The response is binary, but every export type ran through
  `TextDecoder`, which replaces each invalid UTF-8 byte with U+FFFD — so
  `--export-type PDF > out.pdf` wrote irreversible mojibake, not a PDF. The two
  binary types now return `{ exportType, bytes, note }` pointing at the shared
  report's download `link`; `JSON_V1` / `JSON` / `CSV` keep the decode path
  unchanged. **Behavior change:** an empty-bodied XLSX/PDF response now yields
  that descriptor with `bytes: 0` instead of `{ body: "" }`.
- `clk115 --json stop` emits the same `timer.stop` receipt shape whether or not
  a timer was running. The no-op arm previously printed a bare
  `{ ok, message }` with no `action`, `entity`, `ids`, `changed`, `warnings`, or
  `next`, so a script switching on `payload.action === "timer.stop"` silently
  mishandled it. It was the CLI's only `printSuccess` call site; the MCP twin
  already returned the same shape on both arms.
- The legacy rc-file secret guard is no longer swallowed by the surrounding
  `catch`. A file containing `apiKey` read and parsed fine, yet its
  security-relevant message was rewrapped as `failed to read Clockify rc file
  <path>: …`, making it indistinguishable from genuinely malformed JSON. Only
  the read+parse is wrapped now. The malformed-JSON message is unchanged.
- Nine more local rejections classify as `invalid_request` instead of the
  maintainer-facing catch-all `error` code: the three `parseDuration` failures,
  the three `reports` group/subgroup validators the round-4 pass missed, and the
  two `buildRoutingOptions` routing-config errors. Message text only.
  **Behavior change:** the duration messages now read "could not parse …" /
  "duration is missing …", and the weekly group/subgroup messages read
  "Unknown --group/--subgroup for the weekly report. Provide one of: …".
- An invalid `--output <mode>` now exits **2**, the documented usage-error code
  in `docs/cli-contract.json`, instead of 1. The flag gained a commander
  parse-arg validator, so a bad value is rejected at parse time like every other
  bad flag value (`--limit 0` already exited 2). **Behavior change:** the exit
  code for `clk115 --output bogus …` moves 1 → 2, and the message is now
  commander's (`error: option '--output <mode>' argument 'bogus' is invalid.
  Provide one of: table, json, ndjson.`).
- `shared-reports create/update` gained `--no-public`, so a public link can be
  turned OFF. `--public` could only ever send `isPublic: true` or omit the field
  entirely, even though `update` is a documented full-replace PUT and the MCP
  twin has always been able to send `false`. Omitting both flags still omits
  `isPublic`, so no existing invocation changes its request body.
- `clk115 doctor` renders one table row per check instead of stringifying the
  whole nested `checks` object into a single ~560-character cell, which buried
  the per-check recovery hints the command exists to surface. `--json` /
  `--ndjson` payloads are byte-identical.
- A missing or unreadable `--body @file` in `clk115 api` now reports
  `invalid_request` with an actionable recovery and names the flag, instead of
  surfacing a bare `ENOENT` that matched no error-code token and landed in the
  maintainer-facing catch-all `error` code.
- `entries list --from/--to` help now says `(YYYY-MM-DD or RFC3339)`, matching
  what the handler actually accepts (it routes both through
  `promoteDateBoundary`) and what `docs/cli-commands.json` advertises.
  Conversely `scheduling create --start/--end` help drops the bare-date form it
  wrongly promised: those values are forwarded to the wire verbatim, and the
  endpoint requires `yyyy-MM-ddThh:mm:ssZ`.
- `docs/cli-commands.json` (and the generated README table) now show
  `scheduling list` with its `--from`/`--to` required options; the documented
  invocation could not be run as printed.
- `clk115 api --all` now warns on **stderr** when the walk stops because it hit
  `--max-pages`, instead of returning a truncated collection that looks exactly
  like a complete one. A script consuming the output previously had no way to
  tell a full walk from a cut-off one and would silently process partial data.
  stdout is unchanged — byte-identical, so `| jq` pipelines keep working — and
  no warning is emitted when the walk ends because the server said so (a short
  page or `Last-Page: true`), including when that happens to land exactly on
  `--max-pages`.
- `shared-reports list` now prints one row per report instead of dumping the raw
  `{count, reports}` envelope into a two-cell table whose `reports` cell was the
  whole array JSON-stringified into one column. **Output change:** `--json` now
  emits a row array (`id`, `name`, `type`, `isPublic`, `link`) like every other
  list command, so the envelope's `count` is no longer present.
- `audit-log search --actions` now accepts lowercase action names, matching every
  other closed-set enum flag in the CLI; the canonical uppercase form is what
  reaches the wire.
- `clk115 start` no longer makes an unused `GET /user` call before creating the
  timer. The fetched id was never sent — `timeEntries.create` is
  workspace-scoped — so the round-trip only added latency and a spurious failure
  mode when `/user` was slow or unreachable.
- `clk115 api --page-size` / `--max-pages` now use the shared `parseIntArg`
  commander parser, so a bad value fails at parse time with the documented usage
  exit code 2 and the `invalid_request` taxonomy instead of exiting 1 with the
  developer-facing `error` recovery — and is rejected even when `--all` is
  absent, the arm the action-time guard never reached. **Parse change:**
  `Number.parseInt` semantics now apply (`"5.5"` -> 5, `"0x10"` rejected),
  matching every other numeric flag.
- `tasks delete` no longer masks the delete failure with the rollback failure.
  The command flips the task to DONE first; if the DELETE threw and the rollback
  PUT then threw too, the rollback error propagated and the actionable delete
  error was never re-thrown. The rollback is now best-effort.
- `clk115 doctor` no longer reports a false green on Node 22.0–22.12. It checked
  only the major version while `engines.node` is `>=22.13.0` — and doctor's own
  recovery string, `nextSteps`, and the README all say 22.13. npm's engines check
  is a warning by default and the CLI also runs via npx or a bundled node, so the
  window was reachable.
- Roughly 30 local validation messages now classify as the stable
  `invalid_request` code instead of the catch-all `error`. Users who mistyped a
  flag were shown `error`'s developer-taxonomy recovery ("Preserve the message
  and request ID … then classify the failure into a stable code") rather than
  "Fix the request fields …". Affected: the six no-op/unchanged update guards,
  the closed-set enum rejections, the date/timestamp validators, and the two
  ambiguous-name resolution errors. Message text only — no thrown type, exit
  code, or control flow changed, and every existing message pin still matches.

### Internal

- `reports summary --client` gained the two tests its `--project` sibling
  already had (name resolution and 24-hex passthrough); the whole
  `req.clients = idFilter(ids)` branch was previously unexercised.
- Regional routing is now covered end-to-end in tests: `--region eu` is
  asserted to dispatch against `euc1.clockify.me`, and `buildRoutingOptions`
  has direct per-shape assertions. No behavior change.

### Added

- `invoices list` now supports `--limit` (default 25, clamped to the 200
  page-size ceiling) and `--page` — previously only the first default page
  was ever reachable, although the wire honors pagination.
- Local at-least-one-field guards for `projects update` and `tags update`:
  a zero-flag invocation now errors before issuing an empty replace-PUT,
  matching the existing `clients update` / `tasks update` behavior.

### Fixed

- `invoices create --time-view-mode` is now validated against the wire enum
  (`TIME_SENSITIVE_VIEW`, `AGGREGATED_TIME_VIEW`) and uppercased first. The
  option help previously recommended `DETAILED_TIME_VIEW`, which is not a
  member of that enum and produced an opaque upstream 400.
- The `projects update` / `tags update` at-least-one-field guards now use the
  same truthiness test as their body builds, so `--name ""` alone can no longer
  slip past the guard and still send the empty replace-PUT it exists to prevent
  (also closes `--client ""` / `--color ""` on `projects update`).
- `shared-reports view` no longer requires a configured workspace. The
  operation is keyed only by the shared-report id (reports host, not
  workspace-scoped), so it now resolves the base context like `api`, `status`,
  and `users me`.
- `users update-profile --week-start` / `--working-days` are now validated
  against the day-of-week enum (uppercased first) instead of forwarding raw
  strings to the wire, matching the MCP twin. The option help lists the set.
- `audit-log search --start/--end` now accept a bare `YYYY-MM-DD` and are
  promoted to the two RFC3339 window edges via the shared `promoteDateBoundary`
  helper, matching every other range filter in the CLI; an unparseable value
  fails locally instead of round-tripping to a 400.
- `api ... --all --include-headers` now fails with an explicit message instead
  of silently dropping `--include-headers`: each page's status and headers are
  consumed by the pagination walk.
- `timeoff list --status` help now names the accepted set
  (PENDING, APPROVED, REJECTED, ALL) — WITHDRAWN was documented but has
  always been rejected by both the CLI validator and the live wire; the
  accepted-but-undocumented ALL is now listed. Status values are also
  uppercased before validation (`--status pending` now works).
- `audit-log search --limit` help no longer promises "max 200": the value
  is clamped to 50 because the audit-log server caps page size.
- `audit-log search --authors-mode` now validates its value (uppercasing
  first) instead of silently coercing any non-`DOES_NOT_CONTAIN` string —
  including typos like `DOESNT_CONTAIN` — to `CONTAINS`.
- `invoices create --issued/--due` now validate calendar dates locally via
  the shared `promoteDateBoundary` helper: impossible dates
  (`2026-13-45`) and non-dates reject with a clear `--flag`-prefixed error
  instead of 400ing opaquely upstream.
- `shared-reports view --export-type` validates against the known set
  (JSON_V1, JSON, CSV, XLSX, PDF) before the wire call.
- `timeoff submit --half-day-period` validates against
  FIRST_HALF/SECOND_HALF/NOT_DEFINED (uppercasing first) instead of
  forwarding arbitrary strings to the wire.
- `users invite` no longer presents the workspace id as the created
  member's id in `changed.created[0].id` — `workspaces.addUser` returns
  the workspace DTO, so the id is left empty and the email remains the
  identifying `name`.

### Changed

- Dev-dependency refresh: `eslint` `^10.5.0` -> `^10.8.0`, `typescript-eslint`
  `^8.64.0` -> `^8.65.0`, and `tsx` `^4.19.2`/`^4.22.3` -> `^4.23.1`. Build-time
  only; no published runtime or type surface change. All three packages now
  declare one `tsx` range, and `tsx` is additionally declared at the workspace
  root -- root-level gates run `node --import tsx` with the repo root as cwd,
  so they need it resolvable there rather than relying on npm hoisting a
  workspace copy.
- Narrowed seven module-local types to module scope (`CliEntityRef`,
  `CliChangeSet`, `CliNextAction`, `BaseContext`, `ClassifiedLeafCommand`,
  `CompletionShell`, `ResolvedFlags`). Each was `export`ed but imported by
  nothing outside its defining file. The CLI ships no public type surface, so
  this is internal hygiene with no consumer impact.

### Fixed

- Documentation only: `README.md` stated a `clockify-sdk-ts-115 >=0.12.0 <1`
  peer range in two places after the published manifest had moved to
  `>=0.13.0 <1`. The new derived `versionProse` gate checks every occurrence,
  not just the first, which is what let the second mention stay stale. No
  command, flag, or output change.

## [0.4.0](https://github.com/apet97/clockify-ts-sdk/compare/cli-v0.3.3...cli-v0.4.0) - 2026-07-27

### Added

- `--region` and `--subdomain` global flags (and `CLOCKIFY_REGION`/
  `CLOCKIFY_SUBDOMAIN` env vars, plus rc-file `region`/`subdomain` fields)
  select a Clockify routing profile, following the same flag > env > rc
  precedence as `--workspace`/`--base-url`. Mutually exclusive with
  `--base-url`/`CLOCKIFY_BASE_URL`. `clk115 doctor` reports region/subdomain
  source attribution, redacting the subdomain value.

## [0.3.3](https://github.com/apet97/clockify-ts-sdk/compare/cli-v0.3.2...cli-v0.3.3) - 2026-07-24

### Changed

- Bump the `commander` runtime dependency `^12.1.0` -> `^15.0.0`. Command,
  option, and help-text surfaces are unchanged; the full CLI suite (395 tests)
  plus manual `--help`, `--version`, unknown-option, and missing-credential
  smokes were re-verified against the new major.

## [0.3.2](https://github.com/apet97/clockify-ts-sdk/compare/cli-v0.3.1...cli-v0.3.2) - 2026-07-23

### Added

- Add the GitHub-only CLI mutation target for command-risk, reference-resolution,
  and receipt behavior; its initial zero floors are calibration-only and not a
  measured quality claim.
- Exact-artifact release proof: `prepublishOnly` now ends with the shared
  pack-consumer-smoke engine in `--package=cli` mode, which packs the wrapper
  and CLI tarballs, prints their names and sha512 integrity digests, installs
  them into a temporary consumer, and runs the installed binary
  (`dist/index.js --version`) before any publish.

### Changed

- Narrowed `defaultServices` to a module-local binding; `buildProgram` still
  accepts an injected `Services` seam for tests.
- Project/client delete commands now adapt their exact generated request types
  to the SDK's generic archive-then-delete callback contract; command behavior
  and archive-before-delete ordering are unchanged.

### Fixed

- Expense updates now use the corrected generated request type directly instead
  of casting scalar requests around a stale required `file` field.
- `expenses list --limit` now caps total returned records instead of wire page
  size; `--page-size` and `--max-pages` control the shared bounded client-side
  date-filter scan and the command emits the live-contract warning. Explicitly
  empty bounds now fail before a request, and help names the accepted
  date-only/RFC3339-with-zone forms.
## [0.3.1](https://github.com/apet97/clockify-ts-sdk/compare/cli-v0.3.0...cli-v0.3.1) - 2026-07-14

### Fixed

- Aligned the root coverage provider with Vitest 4.1.10 so clean-workspace coverage proof
  resolves the matching provider
  ([52ed3bb](https://github.com/apet97/clockify-ts-sdk/commit/52ed3bb7dd3bca0f032f00f6641a30e2e2f01793)).

### Changed

- Refreshed compatible test and lint tooling (`@vitest/coverage-v8` and Vitest 4.1.10,
  `eslint-plugin-import-x` 4.17.1, and `typescript-eslint` 8.64), including a
  root-aligned coverage provider for reproducible clean-workspace proof, without changing
  runtime behavior.

## [0.3.0] - 2026-07-12

### Breaking

- Require Node.js 22.13 or newer.
- Require `clockify-sdk-ts-115 >=0.12.0 <1`.
- Removed `--api-key` and rc-file `apiKey`; credentials are accepted only from
  `CLOCKIFY_API_KEY`, and legacy rc secrets fail with migration guidance.

### Fixed

- Runtime version output is generated from the package manifest.
- Task replacement writes accept Clockify's live `null` value for the deprecated optional
  `assigneeId` field as absent while continuing to reject malformed non-string values.
- Audit actions validate locally against the SDK enum and page size is capped at 50.
- Full type checking now includes CLI tests; builds use a source-only build config.
- The tag release workflow builds the SDK workspace dependency before checking the CLI
  in its clean checkout and pins the release runtime to Node.js 22.13.0.
- Replace-style client and task writes reconstruct current state before mutation;
  reports, shared reports, expenses, and webhooks now use typed operation requests
  with local validation instead of request-body type escapes.

### Changed

- Classify all 57 executable command leaves as read, write, or destructive.
  The classification is internal and keeps writes deterministic and scriptable;
  behavioral tests now prove success and structured failure for all 30 mutating
  leaves.
- Live sandbox proof now covers timer, tag, client/project/task, invoice, and audit flows with
  prefixed resources and SDK cleanup in `finally`.

## [0.1.1] - 2026-06-29

### Changed

- Renamed the package to `@apet97/clockify-cli-115` (was `@clockify115/cli`) and
  enabled tag-triggered npm publish on a pushed `cli-v*` tag. Unofficial,
  community-built; the `clockify115` / `clk115` binaries are unchanged.

### Added

- The shared error registry (`error-codes.ts`) gained the `setup_required` code
  (regenerated copy) for the MCP graceful no-credential startup path; no CLI
  behavior changed.

### Fixed

- Dropped the stale `dist/sdk-narrow.js` entry from the committed `cli/.packsnapshot`
  (there is no `cli/src/sdk-narrow.ts`, so a clean build never produces it); the
  published tarball contents are unchanged.
- Adversarial-review pass (plan 011):
  - `expenses list --start/--end` now apply a client-side date-range filter on the
    fetched page (they were silent no-ops).
  - `clk115 status` reports a running timer's `elapsed` from wall-clock instead of
    always `0s`.
  - `--select` with a missing path now emits `null` instead of literal `undefined`
    (which produced invalid JSON) in `--output json`/`ndjson`.
  - Corrected the inverted `--archived` help text on `projects`/`clients`/`tags list`.
  - `log --end` is canonicalized to full RFC3339 before the wire (no more
    start-canonical/end-raw asymmetry).
  - `shared-reports --type` allowlist synced to the 19-member generated wire union.
  - The "workspace ID not set" setup error now classifies as `auth_or_permission`.
- `clk115 api --all` now honors Clockify's `Last-Page` response header when it
  is present, so a full final page stops cleanly and a short non-final page
  continues instead of truncating scripted reads.
- Name-based `start`/`log` resolution now walks bounded pages for projects,
  clients, tasks, and tags. Large workspaces no longer miss an exact name match
  beyond the first 200 rows, while ambiguous exact matches still fail before a
  write.
- `clk115 shared-reports create`/`update --public` now sends `isPublic` on the wire. It
  previously sent `public`, which the live API silently ignores, so `--public` was a
  no-op (the report stayed private). The flag name is unchanged.

### Changed

- Repointed `clk115 scheduling create` to the live recurring endpoint
  (`scheduling.createRecurring`): the bare `POST /scheduling/assignments` 404s on live
  Clockify and was removed from the 2026-06-23 corrected spec. Flags are unchanged (a
  one-off assignment when no recurrence is given); `--publish` now maps to the separate
  range-based publish op. `createRecurring` returns an array (one entry per occurrence) —
  the command reads the first occurrence for the receipt id — and `--publish` narrows the
  publish range to the just-assigned user via `userFilter`. `users member-profile update`
  retypes its body to `UpdateMemberProfilesRequest` (the dead `PUT /member-profile`
  request type was removed).

### Added

- `clk115 expenses create` — closes the CLI/MCP parity gap (the MCP
  `clockify_expenses_create` tool and the SDK `expenses.create` already created
  expenses). Posts a scalar body (`--amount`, `--category`, `--date`, optional
  `--user`/`--project`/`--task`/`--notes`/`--billable`); `--user` defaults to the
  API-key owner via `getCurrentUser`, and `--category` takes a raw id (the CLI does
  not resolve category names, matching `expenses update`). The CLI now ships **59
  commands** (was 58).

### Fixed

- `clk115 entries` / `scheduling` date-range flags now reject an impossible or
  silently-rolled-over `--from`/`--to` value. `promoteDateBoundary` matched a bare
  `YYYY-MM-DD` by regex alone, so `2026-13-45` (impossible) and `2026-02-30` (rolls
  over to 2026-03-02) reached the wire as a real timestamp; they now raise a clear
  local "not a valid calendar date" error before the request is built.
  `promote-date-boundary.test.ts` covers the valid, impossible, rollover,
  RFC3339-passthrough, and non-date cases.
- `clk115 expenses create`/`update` now promote a date-only `--date`
  (`YYYY-MM-DD`) to RFC3339 (`…T00:00:00Z`). The expense endpoint requires
  `yyyy-MM-ddThh:mm:ssZ` and 400s on a bare date (live-verified), so the
  `--date YYYY-MM-DD` the help text advertises previously failed on the wire
  (a pre-existing bug in `update`, and would have shipped in the new `create`).
- `clk115 reports attendance` now sends the required `attendanceFilter` (empty
  object). The attendance report 400s "Please provide filters." without it
  (live-verified), so the command was broken on every invocation and diverged
  from the MCP attendance tool.
- `--amount` (expenses update), `--hours-per-day` (scheduling create) and
  `--days` (timeoff submit) now parse through the shared `parseFloatArg` /
  `parseIntArg` guards, so a non-numeric or non-positive value raises a clean
  commander usage error (exit 2) at parse time instead of serializing `NaN`/
  `null` to the wire. `--days abc` no longer trips the misleading
  "provide --end or --days" message for a value the user did supply.

### Changed

- Corrected the `expenses` command header comment: it claimed `expenses create`
  was omitted because the endpoint "expects a multipart upload (a receipt file)",
  but the create endpoint accepts a scalar body (`ExpenseCreateRequestFlattened.
  file` is optional) and both the MCP tool and the SDK create expenses without a
  file. The CLI `expenses create` is now framed as a deliberate (unshipped)
  surface expansion, not a wire limitation.
- `cli/tsconfig.json` now sets `removeComments: true`, so the
  `cli/dist/index.js` byte budget measures emitted code rather than JSDoc prose
  (adding a doc comment no longer reds `make performance-budgets`). The build
  emits no declarations or sourcemaps and tsc preserves the shebang.
- Internal refactor (no behavior change): list commands clamp `--limit` /
  `--page-size` through a shared `clampPageSize(value, max)` helper. The former
  per-command `Math.max(1, …)` lower-clamp was dead (`parseIntArg` already rejects
  `<= 0` at parse time), so only the upper `Math.min(…, max)` survives (200 for
  list ops, 1000 for the detailed report).
- Internal refactor (no behavior change): `splitList` (comma-split → trimmed,
  non-empty) and `rootProgram` (commander root walk) now live once in
  `commands/helpers.ts`; `timeoff`/`auditlog`/`webhooks` and `doctor` reuse them
  instead of redefining byte-identical copies.
- Internal refactor (no behavior change): the `reports`
  summary/detailed/weekly/attendance handlers bind the generated union request
  types directly and drop the `wireBody<…>()` typed-escape cast — the emitted
  request bodies are byte-for-byte identical.

### Tests

- Added `cli/tests/crud-create-get.test.ts` covering the tags/tasks/clients
  create/get/update subcommands (including the tags `--no-archived` boolean
  branch) that previously had thin coverage.
- Raised the cli branch-coverage floor 79->80 (`vitest.config.ts` +
  `docs/coverage-contract.json`) after this session's new behavior tests.

### Fixed

- Subcommand usage errors now honor the documented exit-2 contract and the JSON
  error envelope. `main()` applied `exitOverride()` only to the root program after
  the subcommands were already built, so commander's children kept
  `_exitCallback=null` and called `process.exit(1)` directly on a usage error
  (e.g. `tags list --limit 0`, a missing required `scheduling list --from/--to`),
  bypassing both the exit-2 mapping and `--output json` envelope. `exitOverride()`
  is now applied recursively across the whole command tree.
- `clk115 scheduling list` now requires `--from`/`--to` and sends them as the
  `start`/`end` query range. The underlying `GET .../scheduling/assignments/all`
  400s (code 3001) without `start` (live-verified), so the command was previously
  non-functional; a bare `YYYY-MM-DD` is promoted to the day's start/end edge. The
  `promoteDateBoundary` helper moved to `commands/helpers.js`, shared with `entries`.
- An invalid `--output` value no longer crashes the CLI's own error path: the
  happy-path `resolveMode` throw is reported as before, but `main()`'s catch
  block now resolves output flags through a non-throwing fallback
  (`{ mode: "table", color }`) so formatting that error can't re-throw and
  escape as an uncaught exception. The CLI exits with a clean non-zero code.
- Non-numeric or non-positive `--limit` / `--page` on `projects`/`users`/
  `expenses`/`entries list` (and the inline callbacks they shared) now raise a commander
  usage error instead of forwarding `NaN`/`<=0` to the wire
  (`page-size: Math.max(1, NaN) === NaN`). A new shared `parseIntArg` option
  parser (in `commands/helpers.js`) mirrors `api`'s `parsePositiveInteger`.
  The same `parseIntArg` guard now also covers the seven list commands that
  still used the raw `(v) => Number.parseInt(v, 10)` parser:
  `scheduling`/`auditlog`/`clients`/`tags`/`tasks`/`timeoff list` and the
  `reports detailed --page`/`--page-size` path.
- `clk115 expenses list` now shows the expense **total** (`total ?? amount ??
  quantity`) in the amount column instead of the per-unit quantity, so the
  figure reflects what the expense actually costs.
- `clk115 entries list --from/--to` now promotes a bare `YYYY-MM-DD` to the
  day's RFC3339 edges (`T00:00:00Z` / `T23:59:59Z`) instead of forwarding a
  date-only value the endpoint rejects; a full RFC3339 value still passes
  through unchanged, and an unparseable value fails locally with a clear error
  (mirroring `log`'s `--end` guard).
- `clk115 completion` now offers the `reports`, `shared-reports`, and `users`
  command groups, which the shell-completion list previously omitted. A new
  contract test asserts every top-level group in `docs/cli-commands.json`
  appears in the completion `COMMANDS` list.
- `printError` classifies a `400` "X doesn't belong to Workspace/Project" body
  as `not_found` (the id is wrong) instead of `invalid_request`, and the
  status/message classification is now computed once.
- `timeoff submit` makes `--end` optional and requires one of `--end` / `--days`:
  DAYS-unit policies want `--days` (a `{start,end}` submit 400s "number of days is
  not allowed"); HOURS-unit policies want `--end`.

### Changed

- Dev-dependency bump: `vitest` and `@vitest/coverage-v8` `2.x` -> `4.x`
  (`^4.1.4` / `^4.1.9`), unifying the vitest major across all three workspace
  packages (wrapper was already on 4.x). No CLI source or behavior change. The
  vitest 4 v8 (AST-aware) coverage provider counts functions/branches more
  granularly than v2; rather than rebaseline down, new behavior tests for the
  `timeoff`, `entries`, and `invoices` commands lifted the honest v4 coverage
  (functions 79->88, branches 70->80), so the `cli` floors in `vitest.config.ts`
  and `docs/coverage-contract.json` are pinned to the new measured baseline
  (lines 90, functions 87, branches 79, statements 88 — lines and statements now
  exceed the old v2 floors).
- `clk115 projects delete` and `clk115 clients delete` now call the SDK helpers
  `archiveThenDeleteProject` / `archiveThenDeleteClient`
  (`clockify-sdk-ts-115/ensure`) for the live-allowed GET-name → archive → DELETE
  sequence, instead of hand-copying the steps (incl. the clients body-envelope
  archive quirk and empty-name guard). Behavior is unchanged.
- Reduced the consumer `as never` cast residue after the corrected-OpenAPI
  re-snapshot. The `users invite` (`workspaces.addUser`) cast is gone — the
  regenerated `AddUserWorkspacesRequestFlattened` now matches the literal exactly.
  The `expenses`, `webhooks`, and `timeoff` list commands now bind their request
  through the sanctioned typed `wireBody<T>` escape instead of bare `as never`
  (the generated list request still drops `--start`/`--end` or narrows
  `--type`/`--status` to a literal union the CLI surfaces as free-form). No
  command surface or behavior change.

### Added

- Measured code coverage: `@vitest/coverage-v8` (v2, version-matched) wired
  into `vitest.config.ts` over `src/**`. New `npm run test:coverage` script;
  floors pinned in `docs/coverage-contract.json` and enforced by
  `make coverage`.
- Commands now use the SDK's `entityId()` helper (from the
  `clockify-sdk-ts-115/operation-receipt` subpath) for safe single-id
  extraction instead of inline `as { id?: string }` response casts. CLI source
  also enables `exactOptionalPropertyTypes`, and clean list requests use
  generated `ClockifyApi.List*Request` types instead of bare `as never` casts.
- Expanded shared error-code registry coverage for CLI JSON output and generated
  troubleshooting docs: rate-limit headers, add-on-token scope, host routing,
  active-delete, dead-route, and delete-name-reservation failures now have
  stable vocabulary.
- Enforced `cli/.packsnapshot` tarball-content drift in CI, replacing the old
  print-only pack file list.

### Fixed

- `clk115 webhooks create` now rejects unsafe callback URLs (non-HTTPS,
  loopback, private/link-local, metadata, and embedded-credential hosts) before
  making a Clockify API call.
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

- `clk115 users list` renamed its `--page-size <n>` flag to `--limit <n>`
  (default 25, max 200), matching the page-size vocabulary used by the other
  read commands. The underlying `page-size` request field is unchanged.
- Internal id extraction now imports `entityId()` from
  `clockify-sdk-ts-115/operation-receipt`, keeping CLI receipt narrowing on the
  same public SDK helper used by MCP. The one-line `cli/src/sdk-narrow.ts`
  re-export shim was removed and its four command importers now import the
  helper from the SDK subpath directly.
- CLI object output now accepts concrete generated DTOs directly, so `get`
  commands no longer need display-boundary casts after the GOCLMCP required-field
  schema sync.
- The CLI now lazy-loads the SDK root only when a command actually builds a
  Clockify client, keeping cold paths like `--version` lighter.
- Test coverage: added focused reports, read-command, resolver, and status
  suites that exercise real request shapes, row mapping, and branch behavior;
  CLI coverage now measures above 80% for both branches and statements, and
  `vitest.config.ts` thresholds now mirror the raised floor in
  `docs/coverage-contract.json`.
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
- Corrected the `eslint.config.mjs` header comment to describe the actual
  type-aware setup (`project: ["./tsconfig.lint.json"]`) instead of the stale
  `projectService: true` note.

## [0.1.0] - 2026-05-26

### Added

- Initial `@apet97/clockify-cli-115` package with `clockify115` and `clk115` binaries.
- Added Clockify status, list, create/update/delete, reporting-adjacent, and admin command groups on top of `clockify-sdk-ts-115`.
- Added JSON output mode for automation and human-readable table output for terminal use.
