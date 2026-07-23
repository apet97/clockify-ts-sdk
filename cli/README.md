# @apet97/clockify-cli-115

Command-line interface for [Clockify](https://clockify.me/), built on
top of `clockify-sdk-ts-115`.

Current release: `0.3.2`. Requires Node.js `>=22.13.0` and
`clockify-sdk-ts-115 >=0.12.0 <1`.

Two binaries, identical behavior:

- `clockify115` — full name
- `clk115` — short alias

```sh
cd cli
npm install
npm run build
npm link
export CLOCKIFY_API_KEY=...      # from Clockify > Profile > API Keys
export CLOCKIFY_WORKSPACE_ID=... # from a workspace URL

clk115 status
clk115 projects list --limit 5
clk115 start "WIP refactor" -p "Acme Corp"
clk115 stop
```

## Configuration

In precedence order (highest wins):

1. **Command-line flags:** `--workspace`, `--base-url` (credentials are never accepted on argv)
2. **Environment variables:** `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`,
   optional `CLOCKIFY_BASE_URL` for mock/replay or private gateway tests
3. **Rc file:** `~/.clockifyrc.json` (or `clockifyrc.json` in
   `$CLOCKIFY_HOME`)

Rc file shape:

```json
{
    "workspaceId": "65b382b6…",
    "baseUrl": "https://api.clockify.me/api/v1"
}
```

Legacy rc files containing `apiKey` are rejected with migration guidance. Remove the secret and
set `CLOCKIFY_API_KEY` in the process environment instead.

Do not set `baseUrl` for normal Clockify use. It exists so tests can
point the CLI at `make mock-clockify` or a replay gateway without
touching production credentials.

## Output modes

- **Default:** human-friendly tables via `cli-table3`.
- **`--output <mode>`:** `table`, `json`, or `ndjson`. `--json` is a
  shortcut for `--output json`.
- **`--compact`:** single-line JSON without indentation.
- **`--select <path>`:** print a dot-path (e.g. `--select data.id` or
  `--select 0.name`) before emitting JSON or NDJSON.

Errors go to stderr as `{"ok": false, "error": "..."}`; success-only
commands emit `{"ok": true, "message": "..."}`. `--no-color` disables ANSI
codes, and the CLI also auto-disables color when stdout is not a TTY.
Successful write commands in JSON and NDJSON include receipt fields:
`ok`, `action`, `entity`, `ids`, `changed`, `warnings`, and `next`.
Legacy top-level fields such as `id` remain for simple shell scripts.

## Commands

<!-- BEGIN generated:cli-commands -->
| Command | What it does |
|---|---|
| `clk115 status` | Print workspace, current user, and running timer. |
| `clk115 doctor` | Check local CLI configuration without contacting Clockify. |
| `clk115 start [description] [-p project] [-t task] [--tag tag…] [--billable]` | Start a timer. Resolves project, task, and tag names to IDs. |
| `clk115 stop` | Stop the running timer for the current user. |
| `clk115 log <duration> <description> [-p project] [-t task] [--tag tag…] [--billable] [--end iso]` | Log a finished entry. Resolves project, task, and tag names to IDs. Duration accepts `1h30m`, `90m`, or `PT1H30M`. |
| `clk115 entries list [--limit N] [--page N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--description text]` | List time entries for the current user. |
| `clk115 entries delete <id>` | Delete a time entry. |
| `clk115 projects list [--limit N] [--page N] [--name text] [--archived] [--client id]` | List projects. |
| `clk115 projects create <name> [--client id] [--color hex] [--billable]` | Create a project. |
| `clk115 projects get <id>` | Get one project by ID. |
| `clk115 projects update <id> [--name text] [--client id] [--color hex] [--note text] [--billable\|--no-billable] [--archived\|--no-archived]` | Update a project. |
| `clk115 projects delete <id>` | Delete a project (archives first; an active project cannot be deleted). |
| `clk115 clients list [--limit N] [--page N] [--name text] [--archived]` | List clients. |
| `clk115 clients create <name> [--note text]` | Create a client. |
| `clk115 clients get <id>` | Get one client by ID. |
| `clk115 clients update <id> [--name text] [--note text] [--address text] [--archived\|--no-archived]` | Update a client. |
| `clk115 clients delete <id>` | Delete a client (archives first; an active client cannot be deleted). |
| `clk115 tasks list <projectId> [--limit N] [--page N] [--name text]` | List tasks for a project. |
| `clk115 tasks create <projectId> <name> [--billable] [--estimate iso] [--assignee id…]` | Create a task under a project. |
| `clk115 tasks get <projectId> <id>` | Get one task by project ID and task ID. |
| `clk115 tasks update <projectId> <id> [--name text] [--status ACTIVE\|DONE] [--estimate iso] [--billable\|--no-billable] [--assignee id…]` | Update a task. |
| `clk115 tasks delete <projectId> <id>` | Delete a task (marks DONE first; an active task cannot be deleted). |
| `clk115 tags list [--limit N] [--page N] [--name text] [--archived]` | List tags. |
| `clk115 tags create <name>` | Create a tag. |
| `clk115 tags get <id>` | Get one tag by ID. |
| `clk115 tags update <id> [--name text] [--archived\|--no-archived]` | Update a tag. |
| `clk115 tags delete <id>` | Delete a tag. |
| `clk115 webhooks list [--type type]` | List outbound webhooks. |
| `clk115 webhooks create --name X --url U --event E [--trigger-source-type T --trigger-source ids]` | Create a webhook subscription. |
| `clk115 webhooks delete <id>` | Delete a webhook subscription. |
| `clk115 invoices list` | List invoices in the workspace. |
| `clk115 invoices create --client id --number N --currency USD --issued YYYY-MM-DD --due YYYY-MM-DD [--time-view-mode mode]` | Create an invoice draft. |
| `clk115 expenses list [--limit N] [--page-size N] [--max-pages N] [--page N] [--start date] [--end date]` | List workspace expenses; date bounds are applied client-side across bounded pages. |
| `clk115 expenses get <id>` | Get one expense by ID. |
| `clk115 expenses create --amount N --category id --date YYYY-MM-DD [--user id] [--project id] [--task id] [--notes text] [--billable\|--no-billable]` | Create an expense (scalar body; --user defaults to the API-key owner). |
| `clk115 expenses update <id> --amount N --category id --date YYYY-MM-DD --user id [--project id] [--task id] [--notes text] [--billable\|--no-billable]` | Update an expense (full replace of amount, category, date). |
| `clk115 expenses delete <id>` | Delete an expense. |
| `clk115 timeoff list [--page N] [--limit N] [--start date] [--end date] [--status APPROVED,PENDING,…] [--user ids]` | List time-off requests. |
| `clk115 timeoff submit --policy id --start date (--end date \| --days N) [--note text] [--half-day --half-day-period FIRST_HALF\|SECOND_HALF]` | Submit a time-off request against a policy. Provide --end (HOURS-unit policies) or --days (DAYS-unit policies). |
| `clk115 scheduling list [--limit N] [--page N] [--name text]` | List scheduling assignments. |
| `clk115 scheduling create --user id --project id --start date --end date --hours-per-day N [--task id --note text --billable --include-non-working-days --publish]` | Create a scheduling assignment. Drafts by default; pass `--publish` to publish. |
| `clk115 audit-log search --start RFC3339 --end RFC3339 --actions A,B,… [--authors ids --authors-mode CONTAINS\|DOES_NOT_CONTAIN --page N --limit N]` | Search the workspace audit log. Window must be ≤ 31 days. |
| `clk115 reports summary [--period p] [--from date] [--to date] [--groups PROJECT,TASK] [--billable] [--project name\|id…] [--client name\|id…]` | Summary report totals over a date range, grouped per --groups. Read-only. |
| `clk115 reports detailed [--period p] [--from date] [--to date] [--page N] [--page-size N]` | Detailed report listing individual time entries over a date range. Read-only. |
| `clk115 reports weekly [--period p] [--from date] [--to date] [--group USER\|PROJECT] [--subgroup TIME]` | Weekly report aggregating tracked time per week over a date range. Read-only. |
| `clk115 reports attendance [--period p] [--from date] [--to date]` | Attendance report of clock-in/out activity over a date range. Read-only. |
| `clk115 shared-reports list` | List the workspace's shared (public-link) reports. Read-only. |
| `clk115 shared-reports view <id> [--export-type JSON_V1\|JSON\|CSV\|XLSX\|PDF]` | View a shared report's rendered data by ID (not workspace-scoped). Read-only. |
| `clk115 shared-reports create --name X --type T --filter json [--public]` | Create a shared (public-link) report. |
| `clk115 shared-reports update <id> --name X --type T --filter json [--public]` | Replace a shared report by ID (full replace of name, type, and filter). |
| `clk115 shared-reports delete <id>` | Delete a shared report. |
| `clk115 users me` | Show the current authenticated user (the API-key owner). Read-only. |
| `clk115 users list [--limit N] [--page N] [--name text]` | List members of the workspace. Read-only. |
| `clk115 users invite <email> [--no-send-email]` | Invite (add) a user to the workspace by email. |
| `clk115 users update-profile <userId> [--name text] [--image-url url] [--remove-image] [--week-start day] [--work-capacity iso] [--working-days days…]` | Update one user's member profile. |
| `clk115 api <method> <path> [-q key=value…] [-H key=value…] [--body json\|@file\|-] [--all] [--page-size N] [--max-pages N] [--include-headers]` | Call a Clockify API path directly through the SDK client. Fills {workspaceId} from --workspace or CLOCKIFY_WORKSPACE_ID. |
| `clk115 completion [zsh\|bash\|fish]` | Print a shell completion script for zsh, bash, or fish. |
| `clk115 help [command]` | Print per-command help. |
| `clk115 --version` | Print CLI version. |
<!-- END generated:cli-commands -->

## Examples

Start a timer with project / task by name:

```sh
clk115 start "fix flaky test" -p "ACME Backend" -t "QA" --tag urgent
```

Log a 90-minute entry that ended now:

```sh
clk115 log 1h30m "RFC review"
```

Log a 30-minute entry that ended yesterday at 17:00 UTC, in JSON for
piping into `jq`:

```sh
clk115 --json log 30m "Daily standup" --end 2026-05-25T17:00:00Z | jq .id
```

List the 50 most recent entries, filtered by description:

```sh
clk115 entries list --limit 50 --description deploy
```

Call a long-tail endpoint directly through the SDK client when no curated
command exists yet:

```sh
clk115 api GET '/workspaces/{workspaceId}/tags' --query page-size=20 --output json
clk115 api GET '/workspaces/{workspaceId}/projects' --all --page-size 50 --output ndjson
clk115 api POST '/workspaces/{workspaceId}/tags' --body '{"name":"billable"}' --include-headers
```

`{workspaceId}` is filled from `--workspace` or `CLOCKIFY_WORKSPACE_ID`.
`--all` walks `page`/`page-size` until a short or empty page (bounded by
`--max-pages`), and `--body` also accepts `@file` or `-` for stdin.

## Shell completion

`clk115 completion <shell>` prints a completion script for `bash`, `zsh`, or
`fish` to stdout (it contacts nothing). Install it once into your shell's
completion location:

```sh
# bash (Linux)
clk115 completion bash > ~/.local/share/bash-completion/completions/clk115

# zsh — write into a directory on your $fpath, then restart the shell
clk115 completion zsh > "${fpath[1]}/_clk115"

# fish
clk115 completion fish > ~/.config/fish/completions/clk115.fish
```

For a one-off in the current shell: `source <(clk115 completion bash)`. The
`clockify115` binary accepts the same subcommand. See `examples/` for runnable
scripts.

## Exit codes

- `0` — success
- `1` — any error (API failure, validation, missing config)
- `2` — commander argument error (unknown flag, missing required arg)

## Development

```sh
git clone https://github.com/apet97/clockify-ts-sdk
cd clockify-ts-sdk/cli
npm install
npm run dev -- status        # via tsx, no build needed
npm test                     # unit tests across duration / config / output / CLI contract / mock server
npm run build                # tsc → dist/
node dist/index.js status    # smoke test (or invoke installed clk115/clockify115)
```

`clockify-sdk-ts-115` is workspace-linked for local development and is a
`>=0.12.0 <1` peer dependency for published consumers.

## License

MIT
