# @clockify115/cli

Command-line interface for [Clockify](https://clockify.me/), built on
top of `clockify-sdk-ts-115`.

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

1. **Command-line flags:** `--api-key`, `--workspace`, `--base-url`
2. **Environment variables:** `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`,
   optional `CLOCKIFY_BASE_URL` for mock/replay or private gateway tests
3. **Rc file:** `~/.clockifyrc.json` (or `clockifyrc.json` in
   `$CLOCKIFY_HOME`)

Rc file shape:

```json
{
    "apiKey": "abcd1234…",
    "workspaceId": "65b382b6…",
    "baseUrl": "https://api.clockify.me/api/v1"
}
```

Do not set `baseUrl` for normal Clockify use. It exists so tests can
point the CLI at `make mock-clockify` or a replay gateway without
touching production credentials.

## Output modes

- **Default:** human-friendly tables via `cli-table3`.
- **`--json`:** raw JSON to stdout. Errors go to stderr as
  `{"ok": false, "error": "..."}`. Success-only commands emit
  `{"ok": true, "message": "..."}`.

`--no-color` disables ANSI codes, and the CLI also auto-disables color
when stdout is not a TTY (e.g. piped to a file).

## Commands

<!-- BEGIN generated:cli-commands -->
| Command | What it does |
|---|---|
| `clk115 status` | Print workspace, current user, and running timer. |
| `clk115 doctor` | Check local CLI configuration without contacting Clockify. |
| `clk115 start [description] [-p project] [-t task] [--tag tag…] [--billable]` | Start a timer. Resolves project, task, and tag names to IDs. |
| `clk115 stop` | Stop the running timer for the current user. |
| `clk115 log <duration> <description> [-p projectId] [-t taskId] [--tag tagId…] [--billable] [--end iso]` | Log a finished entry. Duration accepts `1h30m`, `90m`, or `PT1H30M`. |
| `clk115 entries list [--limit N] [--page N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--description text]` | List time entries for the current user. |
| `clk115 entries delete <id>` | Delete a time entry. |
| `clk115 projects list [--limit N] [--page N] [--name text] [--archived] [--client id]` | List projects. |
| `clk115 projects create <name> [--client id] [--color hex] [--billable]` | Create a project. |
| `clk115 clients list [--limit N] [--page N] [--name text] [--archived]` | List clients. |
| `clk115 clients create <name> [--note text]` | Create a client. |
| `clk115 tasks list <projectId> [--limit N] [--page N] [--name text]` | List tasks for a project. |
| `clk115 tags list [--limit N] [--page N] [--name text] [--archived]` | List tags. |
| `clk115 tags create <name>` | Create a tag. |
| `clk115 webhooks list [--type type]` | List outbound webhooks. |
| `clk115 webhooks create --name X --url U --event E [--trigger-source-type T --trigger-source ids]` | Create a webhook subscription. |
| `clk115 webhooks delete <id>` | Delete a webhook subscription. |
| `clk115 invoices list` | List invoices in the workspace. |
| `clk115 invoices create --client id --number N --currency USD --issued YYYY-MM-DD --due YYYY-MM-DD [--time-view-mode mode]` | Create an invoice draft. |
| `clk115 expenses list [--limit N] [--page N] [--start YYYY-MM-DD] [--end YYYY-MM-DD]` | List workspace expenses. |
| `clk115 timeoff list [--page N] [--limit N] [--start date] [--end date] [--status APPROVED,PENDING,…] [--user ids]` | List time-off requests. |
| `clk115 timeoff submit --policy id --start YYYY-MM-DD --end YYYY-MM-DD [--days N] [--note text] [--half-day --half-day-period FIRST_HALF\|SECOND_HALF]` | Submit a time-off request against a policy. |
| `clk115 scheduling list [--limit N] [--page N] [--name text]` | List scheduling assignments. |
| `clk115 scheduling create --user id --project id --start date --end date --hours-per-day N [--task id --note text --billable --include-non-working-days --publish]` | Create a scheduling assignment. Drafts by default; pass `--publish` to publish. |
| `clk115 audit-log search --start RFC3339 --end RFC3339 --actions A,B,… [--authors ids --authors-mode CONTAINS\|DOES_NOT_CONTAIN --page N --limit N]` | Search the workspace audit log. Window must be ≤ 31 days. |
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

`clockify-sdk-ts-115` is referenced as a `file:../wrapper` dev
dependency during local development and as a peer dependency for any
future published package.

## License

MIT
