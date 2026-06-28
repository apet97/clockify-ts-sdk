# Agent task: add a CLI command

**When to use:** you are adding a command to the `@apet97/clockify-cli-115` package
(bins `clockify115` / `clk115`).

## Files to read first

- `AGENTS.md`, `CLAUDE.md`, `cli/README.md`.
- `cli/src/index.ts` — where commands are wired.
- `cli/src/commands/*.ts` — copy the closest existing command.
- `docs/cli-commands.json` — the documented command catalog (drives the README
  table) and `docs/cli-contract.json`.
- `docs/cli-write-safety-policy.md` if the command mutates data.
- `scripts/update-readme-tables.mjs` — how the CLI README table is generated.

## Files you may edit

- `cli/src/commands/<command>.ts` (new command).
- `cli/src/index.ts` (register it).
- `cli/tests/**` (add tests).
- `docs/cli-commands.json` (add the command entry).
- `cli/CHANGELOG.md` (`## [Unreleased]`).

## Files you must NOT edit

- `cli/README.md` command table region — it is generated; run `make readme-tables`.
- `wrapper/src/**`, `output/ts-sdk/**`, `spec/corrected/**`, `spec/official/**`.

## Required tests / gates

```bash
npm run type-check -w @apet97/clockify-cli-115
npm test -w @apet97/clockify-cli-115
make readme-tables          # regenerate the CLI README command table
make cli-contract cli-write-safety readme-tables-drift changelog-drift
make perfect-fast
```

## Required docs / changelog updates

- `docs/cli-commands.json` entry for the new command.
- `cli/CHANGELOG.md` `## [Unreleased]`.
- Run `make readme-tables` so `cli/README.md` reflects the new command; if the
  command count changes, update the headline count and run `make docs-counts`.

## Completion checklist

- [ ] Command registered in `cli/src/index.ts` and implemented in `cli/src/commands/`.
- [ ] `docs/cli-commands.json` entry added; `make readme-tables` regenerated the table.
- [ ] Mutating commands honor the write-safety policy (`make cli-write-safety`).
- [ ] `cli/CHANGELOG.md` `## [Unreleased]` updated.
- [ ] `npm run type-check -w @apet97/clockify-cli-115` and `npm test -w @apet97/clockify-cli-115` pass.
- [ ] `make perfect-fast` passes; output cited.
