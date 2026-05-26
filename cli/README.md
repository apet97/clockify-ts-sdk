# @clockify/cli

Command-line interface for [Clockify](https://clockify.me/), built on
top of [`clockify-sdk-ts`](https://www.npmjs.com/package/clockify-sdk-ts).

Two binaries, identical behavior:

- `clockify` — full name
- `clk` — short alias

```sh
npm install -g @clockify/cli
export CLOCKIFY_API_KEY=...      # from Clockify > Profile > API Keys
export CLOCKIFY_WORKSPACE_ID=... # from a workspace URL

clk status
clk projects list --limit 5
clk start "WIP refactor" -p "Acme Corp"
clk stop
```

## Configuration

In precedence order (highest wins):

1. **Command-line flags:** `--api-key`, `--workspace`
2. **Environment variables:** `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`
3. **Rc file:** `~/.clockifyrc.json` (or `clockifyrc.json` in
   `$CLOCKIFY_HOME`)

Rc file shape:

```json
{
    "apiKey": "abcd1234…",
    "workspaceId": "65b382b6…"
}
```

## Output modes

- **Default:** human-friendly tables via `cli-table3`.
- **`--json`:** raw JSON to stdout. Errors go to stderr as
  `{"ok": false, "error": "..."}`. Success-only commands emit
  `{"ok": true, "message": "..."}`.

`--no-color` disables ANSI codes, and the CLI also auto-disables color
when stdout is not a TTY (e.g. piped to a file).

## Commands

| Command | What it does |
|---|---|
| `clk status` | Print workspace + user + running timer. |
| `clk start [description] [-p project] [-t task] [--tag tag…] [--billable]` | Start a timer. Resolves project/task/tag names to IDs. |
| `clk stop` | Stop the running timer for the current user. |
| `clk log <duration> <description> [-p projectId] [-t taskId] [--tag tagId…] [--billable] [--end iso]` | Log a finished entry. Duration accepts `1h30m`, `90m`, `PT1H30M`. |
| `clk entries list [--limit N] [--page N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--description text]` | List time entries for the current user. |
| `clk entries delete <id>` | Delete a time entry. |
| `clk projects list [--limit N] [--page N] [--name text] [--archived] [--client id]` | List projects. |
| `clk projects create <name> [--client id] [--color hex] [--billable]` | Create a project. |
| `clk clients list [--limit N] [--page N] [--name text] [--archived]` | List clients. |
| `clk clients create <name> [--note text]` | Create a client. |
| `clk tasks list <projectId> [--limit N] [--page N] [--name text]` | List tasks for a project. |
| `clk tags list [--limit N] [--page N] [--name text] [--archived]` | List tags. |
| `clk tags create <name>` | Create a tag. |
| `clk help [command]` | Per-command help. |
| `clk --version` | Print CLI version. |

## Examples

Start a timer with project / task by name:

```sh
clk start "fix flaky test" -p "ACME Backend" -t "QA" --tag urgent
```

Log a 90-minute entry that ended now:

```sh
clk log 1h30m "RFC review"
```

Log a 30-minute entry that ended yesterday at 17:00 UTC, in JSON for
piping into `jq`:

```sh
clk --json log 30m "Daily standup" --end 2026-05-25T17:00:00Z | jq .id
```

List the 50 most recent entries, filtered by description:

```sh
clk entries list --limit 50 --description deploy
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
npm test                     # 25 unit tests across duration / config / output
npm run build                # tsc → dist/
node dist/index.js status    # smoke test
```

`clockify-sdk-ts` is referenced as a `file:../wrapper` dev dependency
during local development; the published `@clockify/cli` declares it as
a peer dependency.

## License

MIT
